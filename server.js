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

// Sessions
app.use(
  session({
    secret: 'somesecret',
    resave: false,
    saveUninitialized: false,
  })
);

// ===== Database =====
mongoose
  .connect('mongodb+srv://aashirthegreat716_db_user:nAbANK8E0WjHMR5t@cluster0.mxi7aat.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// ===== Auth Middleware =====
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/auth.html');
  }
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

  if (!email || !email.includes('@')) {
    return res.redirect('/auth.html?form=signup&error=Invalid email');
  }
  if (!password || password.length < 8) {
    return res.redirect('/auth.html?form=signup&error=Password must be at least 8 characters');
  }

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      return res.redirect('/auth.html?form=signup&error=User already exists');
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashed });
    await user.save();

    req.session.userId = user._id;
    console.log('✅ User signed up successfully:', email);
    return res.redirect('/index.html');
  } catch (err) {
    console.error('Signup error:', err);
    return res.redirect('/auth.html?form=signup&error=Server error occurred');
  }
});

// --- Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !email.includes('@')) {
    return res.redirect('/auth.html?form=login&error=Invalid email');
  }
  if (!password || password.length < 8) {
    return res.redirect('/auth.html?form=login&error=Password must be at least 8 characters');
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.redirect('/auth.html?form=login&error=User not found');
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.redirect('/auth.html?form=login&error=Incorrect password');
    }

    req.session.userId = user._id;
    console.log('User logged in successfully:', email);
    return res.redirect('/index.html');
  } catch (err) {
    console.error('Login error:', err);
    return res.redirect('/auth.html?form=login&error=Server error occurred');
  }
});

// --- Logout
app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/auth.html');
  });
});

// --- Session check route
app.get('/check-session', async (req, res) => {
  try {
    if (req.session.userId) {
      const user = await User.findById(req.session.userId).select("email");
      if (user) {
        return res.json({ loggedIn: true, email: user.email });
      }
    }
    return res.json({ loggedIn: false });
  } catch (err) {
    console.error('Session check error:', err);
    return res.json({ loggedIn: false });
  }
});

// --- Protect index.html
app.get('/index.html', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// --- Favorites page (protected)
app.get('/favorites.html', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'favorites.html'));
});

// --- Save favorite
app.post('/favorites', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "You must be logged in to save favorites." });
  }

  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: "Title and content are required." });
  }

  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    
    user.favorites.push({ title, content });
    await user.save();
    console.log('✅ Recipe saved to favorites for user:', user.email);
    res.json({ success: true, message: "Recipe added to favorites!" });
  } catch (err) {
    console.error("Error saving favorite:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// --- Delete a favorite recipe
app.delete("/favorites/:id", async (req, res) => {
  try {
    const recipeId = req.params.id;
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // remove from embedded array
    user.favorites = user.favorites.filter(fav => fav._id.toString() !== recipeId);
    await user.save();

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting favorite:", err);
    res.status(500).json({ error: "Failed to delete recipe" });
  }
});

// --- Get favorites
app.get('/favorites', requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).select("favorites");
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    res.json(user.favorites);
  } catch (err) {
    console.error("Error fetching favorites:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===== Gemini API Integration =====
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Keep API key here (no env file needed)
const GEMINI_API_KEY = "AIzaSyAly2iFMjCzzmy2HujX8UUlrvkA9hC9YQ4";

app.post('/generate-recipe', async (req, res) => {
  try {
    const { ingredients } = req.body;
    
    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return res.status(400).json({ error: 'ingredients array is required and must not be empty' });
    }

    const ingredientList = ingredients.map(i => `- ${i.trim()}`).join("\n");

    const prompt = `Create a recipe using these ingredients:

${ingredientList}

Please provide a complete recipe with the following format:
### Recipe Name
[Suggested name for the dish]

### Ingredients
[List all ingredients with quantities]

### Instructions
[Step-by-step cooking instructions]

### Cooking Time
[Estimated preparation and cooking time]`;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
      ]
    };

    console.log('Sending request to Gemini API...');
    console.log('Ingredients:', ingredients);

    const apiResp = await fetch(apiUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "User-Agent": "Recipe-Generator/1.0"
      },
      body: JSON.stringify(payload)
    });

    const responseText = await apiResp.text();
    console.log('API Status:', apiResp.status);
    console.log('API Response Length:', responseText.length);

    if (!apiResp.ok) {
      console.error("Gemini API Error Status:", apiResp.status);
      console.error("Gemini API Error Response:", responseText);
      
      let errorMessage = "Error from Gemini API";
      try {
        const errorData = JSON.parse(responseText);
        if (errorData.error) {
          errorMessage = errorData.error.message || errorData.error.code || errorMessage;
        }
      } catch (parseErr) {
        console.error("Could not parse error response:", parseErr);
      }
      
      return res.status(apiResp.status).json({ 
        error: errorMessage,
        status: apiResp.status,
        details: responseText 
      });
    }

    let apiData;
    try {
      apiData = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("Failed to parse API response:", parseErr);
      return res.status(500).json({ 
        error: "Invalid response format from Gemini API",
        details: responseText 
      });
    }

    if (!apiData.candidates || apiData.candidates.length === 0) {
      return res.status(500).json({ error: "No content generated by Gemini API" });
    }

    const candidate = apiData.candidates[0];
    
    if (candidate.finishReason === 'SAFETY') {
      return res.status(400).json({ 
        error: "Content was blocked due to safety filters. Please try with different ingredients.",
        finishReason: candidate.finishReason,
        safetyRatings: candidate.safetyRatings 
      });
    }

    const textResponse = candidate.content?.parts?.map(part => part.text).join("\n") || "No recipe generated.";

    console.log('Successfully generated recipe');
    return res.json({ text: textResponse.trim(), finishReason: candidate.finishReason });

  } catch (err) {
    console.error(" Internal error in /generate-recipe:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
});

// Test endpoint to list available models
app.get('/test-models', async (req, res) => {
  try {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    const generateContentModels = data.models?.filter(model => 
      model.supportedGenerationMethods?.includes('generateContent')
    ) || [];
    
    res.json({ 
      allModels: data.models,
      generateContentModels: generateContentModels.map(m => m.name),
      count: generateContentModels.length
    });
  } catch (err) {
    console.error('Error fetching models:', err);
    res.json({ error: err.message });
  }
});

// ===== Start Server =====
const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));