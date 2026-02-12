// popup.js — UI logic

const searchInput = document.getElementById("search-input");
const searchBtn = document.getElementById("search-btn");
const resultsDiv = document.getElementById("results");
const statusDiv = document.getElementById("status");
const indexBtn = document.getElementById("index-btn");
const indexCount = document.getElementById("index-count");

// Function that gets injected into the target page to highlight text
function highlightText(searchText) {
  // Take a few words from the middle of the snippet (more unique than the start)
  const words = searchText.split(/\s+/).filter(w => w.length > 3);
  // Try progressively shorter phrases until we find a match
  const phrases = [
    words.slice(0, 8).join(" "),
    words.slice(0, 5).join(" "),
    words.slice(2, 7).join(" "),
    words.slice(0, 3).join(" ")
  ];

  for (const phrase of phrases) {
    if (!phrase) continue;
    // Use browser's built-in find — selects the text
    if (window.find(phrase, false, false, true)) {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const mark = document.createElement("mark");
        mark.style.backgroundColor = "#faec5a";
        mark.style.padding = "2px 4px";
        mark.style.borderRadius = "3px";
        try {
          range.surroundContents(mark);
        } catch (e) {
          // If surroundContents fails (spans multiple nodes), just scroll
        }
        mark.scrollIntoView({ behavior: "smooth", block: "center" });
        selection.removeAllRanges();
        return;
      }
    }
  }
}

// Search handler
searchBtn.addEventListener("click", async () => {
  const query = searchInput.value.trim();
  if (!query) return;

  statusDiv.textContent = "Searching...";
  statusDiv.className = "status";
  resultsDiv.innerHTML = "";

  try {
    const res = await fetch("http://localhost:8001/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: query })
    });
    const data = await res.json();

    if (data.results.length === 0) {
      statusDiv.textContent = "No results found.";
      statusDiv.className = "status";
      return;
    }

    statusDiv.textContent = `Found ${data.results.length} results`;
    statusDiv.className = "status success";

    // Render result cards
    data.results.forEach(result => {
      const card = document.createElement("div");
      card.className = "result-card";
      card.innerHTML = `
        <div class="result-title">${result.title}</div>
        <div class="result-snippet">${result.snippet}</div>
        <div class="result-url">${result.url}</div>
      `;

      // Click to open URL and highlight matching text (via background.js)
      card.addEventListener("click", () => {
        chrome.runtime.sendMessage({
          action: "open_and_highlight",
          url: result.url,
          snippet: result.snippet
        });
      });

      resultsDiv.appendChild(card);
    });

  } catch (err) {
    console.error("Search error:", err);
    statusDiv.textContent = "Search failed: " + err.message;
    statusDiv.className = "status error";
  }
});

// Enter key triggers search
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchBtn.click();
});

// Index current page handler
indexBtn.addEventListener("click", async () => {
  statusDiv.textContent = "Extracting text...";
  statusDiv.className = "status";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        text: document.body.innerText,
        url: window.location.href,
        title: document.title
      })
    });

    const response = result?.result;

    if (response) {
      console.log("Extracted:", response.title, response.url, response.text.length, "chars");

      const res = await fetch("http://localhost:8001/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: response.text,
          url: response.url,
          title: response.title
        })
      });

      const data = await res.json();
      console.log("Backend response:", data);
      statusDiv.textContent = `Indexed ${data.chunks} chunks from "${response.title}"`;
      statusDiv.className = "status success";
    } else {
      statusDiv.textContent = "Failed to extract text.";
      statusDiv.className = "status error";
    }
  } catch (err) {
    console.error("Error:", err);
    statusDiv.textContent = "Error: " + err.message;
    statusDiv.className = "status error";
  }
});
