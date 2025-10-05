const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const User = require('./models/User');
const app = express();

// ===== Middleware =====
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Disable caching globally
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// ===== Sessions =====
app.use(
  session({
    secret: '/* YOUR_SESSION_SECRET */',
    resave: false,
    saveUninitialized: false,
  })
);

// ===== Database Connection =====
mongoose
  .connect('/* YOUR_MONGODB_ATLAS_CONNECTION_STRING */')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// ===== Auth Middleware =====
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect('/auth.html');
  next();
}

// ===== Static Files =====
app.use(express.static(path.join(__dirname, 'views'), { index: false }));

// ===== Routes =====
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// --- Signup
app.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !email.includes('@'))
    return res.redirect('/auth.html?form=signup&error=Invalid email');

  if (!password || password.length < 8)
    return res.redirect('/auth.html?form=signup&error=Password must be at least 8 characters');

  try {
    const existing = await User.findOne({ email });
    if (existing)
      return res.redirect('/auth.html?form=signup&error=User already exists');

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashed });
    await user.save();

    req.session.userId = user._id;
    console.log('✅ User signed up:', email);
    res.redirect('/index.html');
  } catch (err) {
    console.error('Signup error:', err);
    res.redirect('/auth.html?form=signup&error=Server error occurred');
  }
});

// --- Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !email.includes('@'))
    return res.redirect('/auth.html?form=login&error=Invalid email');

  if (!password || password.length < 8)
    return res.redirect('/auth.html?form=login&error=Password must be at least 8 characters');

  try {
    const user = await User.findOne({ email });
    if (!user)
      return res.redirect('/auth.html?form=login&error=User not found');

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.redirect('/auth.html?form=login&error=Incorrect password');

    req.session.userId = user._id;
    console.log('User logged in:', email);
    res.redirect('/index.html');
  } catch (err) {
    console.error('Login error:', err);
    res.redirect('/auth.html?form=login&error=Server error occurred');
  }
});

// --- Logout
app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/auth.html'));
});

// --- Session Check
app.get('/check-session', async (req, res) => {
  try {
    if (req.session.userId) {
      const user = await User.findById(req.session.userId).select("email");
      if (user) return res.json({ loggedIn: true, email: user.email });
    }
    res.json({ loggedIn: false });
  } catch {
    res.json({ loggedIn: false });
  }
});

// --- Protected Pages
app.get('/index.html', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/favorites.html', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'favorites.html'));
});

// --- Save Favorite
app.post('/favorites', async (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: "You must be logged in." });

  const { title, content } = req.body;
  if (!title || !content)
    return res.status(400).json({ error: "Title and content required." });

  try {
    const user = await User.findById(req.session.userId);
    user.favorites.push({ title, content });
    await user.save();
    console.log('✅ Favorite saved for:', user.email);
    res.json({ success: true });
  } catch (err) {
    console.error("Save favorite error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// --- Delete Favorite
app.delete("/favorites/:id", async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const user = await User.findById(userId);
    user.favorites = user.favorites.filter(f => f._id.toString() !== req.params.id);
    await user.save();

    res.json({ success: true });
  } catch (err) {
    console.error("Delete favorite error:", err);
    res.status(500).json({ error: "Failed to delete" });
  }
});

// --- Get Favorites
app.get('/favorites', requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).select("favorites");
    res.json(user?.favorites || []);
  } catch (err) {
    console.error("Fetch favorites error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===== Gemini API Integration =====
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Replace with your actual Gemini API key or use environment variable
const GEMINI_API_KEY = "/* YOUR_GEMINI_API_KEY */";

app.post('/generate-recipe', async (req, res) => {
  try {
    const { ingredients } = req.body;
    if (!ingredients || !Array.isArray(ingredients) || !ingredients.length)
      return res.status(400).json({ error: 'Invalid ingredients array' });

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const payload = {
      contents: [{ parts: [{ text: `Recipe prompt with ${ingredients.join(', ')}` }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    };

    const apiResp = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await apiResp.json();
    res.json(data);
  } catch (err) {
    console.error("Generate recipe error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ===== Server Start =====
const PORT = 3000; // or process.env.PORT
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
