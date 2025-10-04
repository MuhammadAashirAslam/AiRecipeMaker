// 🔹 Check session for navbar
async function checkSession() {
  try {
    const res = await fetch('/check-session', { credentials: 'include' });
    const data = await res.json();
    const authLink = document.getElementById("authLink");
    if (data.loggedIn) {
      authLink.innerHTML = `
        <span>👤 ${data.email}</span>
        <a href="/favorites.html">Favorites</a>
        <form action="/logout" method="POST" style="display:inline;">
          <button type="submit" class="logout-btn">Logout</button>
        </form>
      `;
    } else {
      authLink.innerHTML = `<a href="/auth.html">Login / Signup</a>`;
    }
  } catch (err) {
    console.error("Error checking session:", err);
  }
}
document.addEventListener("DOMContentLoaded", checkSession);

// 🔹 Handle Recipe Form
document.getElementById("recipeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ingString = document.getElementById("ingredients").value.trim();
  const box = document.getElementById("recipeResult");

  if (!ingString) {
    box.innerHTML = "<p style='color:red;'>Please enter some ingredients.</p>";
    return;
  }

  const ingredientsArr = ingString.split(',').map(s => s.trim()).filter(Boolean);

  const button = e.target.querySelector('button');
  const originalText = button.textContent;
  button.textContent = 'Generating...';
  button.disabled = true;

  // 🔹 Show animated loading message
  box.innerHTML = `
    <div class="recipe-box loading">
      <p id="loadingText">Let me cook, so you can cook<span class="dots"></span></p>
    </div>
  `;

  try {
    const resp = await fetch('/generate-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredients: ingredientsArr })
    });

    const data = await resp.json();

    if (!resp.ok) {
      box.innerHTML = `<p style='color:red;'>${data.error || 'Failed to generate recipe'}</p>`;
    } else {
      // ✅ Use marked.js to render markdown as proper HTML
      const htmlRecipe = marked.parse(data.text);

      box.innerHTML = `
        <div class="recipe-box">
          ${htmlRecipe}
          <button class="favorite-btn">⭐ Add to Favorites</button>
        </div>
      `;

      // 🔹 Handle Favorite button
      const favBtn = box.querySelector(".favorite-btn");
      favBtn.addEventListener("click", async () => {
        try {
          const titleMatch = data.text.match(/### (.*)/); // first markdown header
          const title = titleMatch ? titleMatch[1].trim() : "Untitled Recipe";

          const resp = await fetch("/favorites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, content: data.text })
          });

          const resData = await resp.json();
          if (resp.ok) {
            alert("✅ Added to favorites!");
          } else {
            alert(resData.error || "❌ Failed to add favorite.");
          }
        } catch (err) {
          console.error("Error saving favorite:", err);
          alert("⚠️ You need to log in first!");
        }
      });
    }
  } catch (err) {
    console.error("Error:", err);
    box.innerHTML = "<p style='color:red;'>Server error, try again later.</p>";
  } finally {
    button.textContent = originalText;
    button.disabled = false;
  }
});

// 🔹 Typewriter Effect with Emoji
const typewriterTexts = [
  "Turn your ingredients into tasty recipes ",
  "AI-powered cooking made simple ",
  "Discover new dishes with what you already have ",
  "No more boring meals, get creative! "
];

let twIndex = 0;
let charIndex = 0;
let isDeleting = false;
const twElement = document.getElementById("typewriter");

function typeWriterEffect() {
  if (!twElement) return;

  const currentText = typewriterTexts[twIndex];
  let displayed = currentText.substring(0, charIndex);

  twElement.textContent = displayed;

  if (!isDeleting && charIndex < currentText.length) {
    charIndex++;
    setTimeout(typeWriterEffect, 100);
  } else if (isDeleting && charIndex > 0) {
    charIndex--;
    setTimeout(typeWriterEffect, 50);
  } else {
    if (!isDeleting) {
      isDeleting = true;
      setTimeout(typeWriterEffect, 1500);
    } else {
      isDeleting = false;
      twIndex = (twIndex + 1) % typewriterTexts.length;
      setTimeout(typeWriterEffect, 200);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (twElement) typeWriterEffect();
});
