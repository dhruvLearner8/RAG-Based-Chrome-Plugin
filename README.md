# Page Memory Search — Chrome Extension

A Chrome extension that lets you **index any webpage** you visit and later **search across all indexed pages** using semantic search. Click a result to open the original page with the matching text **highlighted**.

Built with **FAISS** for vector similarity search, **Ollama** for local embeddings, and **FastAPI** as the backend server.

---

## What Can You Do With This?

- **Index any webpage** — Click "Index This Page" on any tab. The extension extracts visible text, chunks it, generates embeddings via Ollama, and stores them in a local FAISS index.
- **Semantic search** — Type a natural language query (e.g., "how does photosynthesis work") and get the most relevant chunks from all your indexed pages.
- **Navigate & highlight** — Click any search result to open the original URL in a new tab, where the matching paragraph is automatically highlighted and scrolled into view.
- **Duplicate detection** — Pages that are already indexed are skipped to avoid redundant storage.
- **Fully local** — All embeddings are generated locally via Ollama. No data leaves your machine.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Chrome Extension                       │
│                                                          │
│   popup.html / popup.js / popup.css                      │
│   ┌──────────────┐    ┌──────────────┐                   │
│   │ Search Input  │    │ Index Button │                   │
│   └──────┬───────┘    └──────┬───────┘                   │
│          │                   │                            │
│          │  POST /search     │  POST /index               │
│          ▼                   ▼                            │
│   ┌─────────────────────────────────┐                    │
│   │     background.js               │                    │
│   │  (open tab + highlight text)    │                    │
│   └─────────────────────────────────┘                    │
└──────────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│               FastAPI Backend (Python)                    │
│                    server.py                              │
│                                                          │
│   POST /index                    POST /search            │
│   ┌────────────────────┐        ┌────────────────────┐   │
│   │ 1. Chunk text       │        │ 1. Embed query      │   │
│   │ 2. Embed via Ollama │        │ 2. FAISS search     │   │
│   │ 3. Add to FAISS     │        │ 3. Return top-k     │   │
│   │ 4. Save metadata    │        │    results           │   │
│   └────────────────────┘        └────────────────────┘   │
│                                                          │
│   ┌──────────────────────────────────┐                   │
│   │         Ollama (local)           │                   │
│   │    nomic-embed-text model        │                   │
│   │    http://localhost:11434        │                   │
│   └──────────────────────────────────┘                   │
│                                                          │
│   ┌──────────────────────────────────┐                   │
│   │     faiss_index/                 │                   │
│   │       index.bin  (vector index)  │                   │
│   │       metadata.json (chunks+URL) │                   │
│   └──────────────────────────────────┘                   │
└──────────────────────────────────────────────────────────┘
```

### Data Flow

**Indexing a page:**
1. User clicks **"Index This Page"** in the popup.
2. `popup.js` uses `chrome.scripting.executeScript` to extract `document.body.innerText`, URL, and title from the active tab.
3. Extracted text is sent via `POST /index` to the FastAPI backend.
4. Backend splits text into overlapping chunks (512 words, 40-word overlap).
5. Each chunk is embedded using Ollama's `nomic-embed-text` model.
6. Embeddings are added to the FAISS index; chunk text, URL, and title are saved to `metadata.json`.

**Searching:**
1. User types a query and clicks **Search**.
2. `popup.js` sends the query via `POST /search` to the backend.
3. Backend embeds the query using Ollama, runs FAISS similarity search, and returns the top 3 matching chunks with their source URL and title.
4. Results are displayed as clickable cards in the popup.

**Highlighting:**
1. User clicks a search result card.
2. `popup.js` sends an `open_and_highlight` message to `background.js`.
3. `background.js` opens the URL in a new tab, waits for the page to load, then injects a script that uses `window.find()` to locate the matching text.
4. The nearest block-level parent element (paragraph, list item, heading, etc.) is highlighted with a yellow background and scrolled into view.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Extension | Chrome Manifest V3, Vanilla JS |
| Backend | Python, FastAPI, uvicorn |
| Embeddings | Ollama (`nomic-embed-text`) |
| Vector DB | FAISS (`faiss-cpu`) |
| Package Manager | uv |

---

## Project Structure

```
Chrome-Plugin/
├── .gitignore
├── .python-version
├── pyproject.toml                  # uv workspace config
│
├── backend/
│   ├── pyproject.toml              # Python dependencies
│   ├── server.py                   # FastAPI server (index + search endpoints)
│   └── faiss_index/
│       ├── index.bin               # FAISS vector index (auto-generated)
│       └── metadata.json           # Chunk text + URL metadata (auto-generated)
│
└── extension/
    ├── manifest.json               # Chrome extension config (Manifest V3)
    ├── background.js               # Service worker — opens tabs & highlights text
    ├── popup.html                  # Extension popup UI
    ├── popup.css                   # Popup styling (dark theme)
    └── popup.js                    # UI logic — search, index, display results
```

### File Reference

| File | Purpose |
|------|---------|
| `extension/manifest.json` | Declares permissions (`activeTab`, `scripting`, `tabs`), popup entry point, and background service worker |
| `extension/popup.html` | Popup UI with search input, results area, and index button |
| `extension/popup.js` | Handles search requests, page indexing (text extraction via `executeScript`), and result rendering |
| `extension/popup.css` | Dark-themed styling for the popup |
| `extension/background.js` | Listens for `open_and_highlight` messages — opens a new tab, waits for load, injects highlighting script |
| `backend/server.py` | FastAPI server with `POST /index` and `POST /search` endpoints, chunking logic, Ollama embedding calls, FAISS read/write |
| `backend/faiss_index/` | Auto-generated directory storing the FAISS binary index and JSON metadata |

---

## Prerequisites

### 1. Ollama (Required for Embeddings)

This project uses [Ollama](https://ollama.com/) to generate embeddings locally. You **must** install it before running the backend.

**Install Ollama:**
- **Windows / macOS:** Download from [https://ollama.com/download](https://ollama.com/download)
- **Linux:**
  ```bash
  curl -fsSL https://ollama.com/install.sh | sh
  ```

**Pull the embedding model:**
```bash
ollama pull nomic-embed-text
```

**Verify it's running:**
```bash
ollama list
```
You should see `nomic-embed-text` in the output. Ollama runs a local server on `http://localhost:11434` by default.

### 2. Python 3.10+

### 3. uv (Python Package Manager)

Install uv if you don't have it:
```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows (PowerShell)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

### 4. Google Chrome

---

## Setup & Installation

### Backend

```bash
# Navigate to the project root
cd Chrome-Plugin

# Install Python dependencies using uv
uv sync

# Start the FastAPI server
uv run fastapi dev backend/server.py --port 8001
```

The backend will be running at `http://localhost:8001`.

> **Note:** Make sure Ollama is running in the background before starting the server. If you just installed it, open a terminal and run `ollama serve` (on some systems it auto-starts).

### Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **"Load unpacked"**
4. Select the `extension/` folder inside `Chrome-Plugin/`
5. The "Page Memory Search" extension should appear in your extensions bar

---

## Usage

### Index a Page
1. Navigate to any webpage (e.g., a Wikipedia article)
2. Click the **Page Memory Search** extension icon in the toolbar
3. Click **"Index This Page"**
4. Wait for the status message to confirm indexing (e.g., "Indexed 24 chunks from Tesla - Wikipedia")

### Search Across Indexed Pages
1. Open the extension popup
2. Type a query in the search box (e.g., "electric vehicle battery technology")
3. Click **Search** or press **Enter**
4. Browse the result cards showing title, snippet preview, and source URL

### Navigate & Highlight
1. Click any result card
2. A new tab opens with the original page
3. The matching paragraph is highlighted in yellow and scrolled into view

---

## Key Implementation Details

### Text Chunking
Text is split into overlapping chunks of **512 words** with a **40-word overlap**. This ensures that context is not lost at chunk boundaries and improves retrieval accuracy.

### Embedding Model
Uses Ollama's `nomic-embed-text` model — a lightweight, high-quality embedding model that runs entirely on your local machine. No API keys needed, no data sent to external servers.

### FAISS Index
- Uses `IndexFlatL2` (exact L2 distance search) for simplicity and accuracy.
- Index and metadata are persisted to disk (`index.bin` + `metadata.json`) so your indexed pages survive server restarts.

### Highlighting Strategy
- Extracts the first 6 words from the matched chunk to create a search phrase.
- Uses the browser's native `window.find()` API for text matching.
- Walks up the DOM tree to find the nearest block-level element (`<p>`, `<li>`, `<h1>`–`<h4>`, `<td>`, `<blockquote>`).
- Applies a yellow background highlight and smooth-scrolls to the element.

### Duplicate Detection
Before indexing, the backend checks if the URL already exists in metadata. If it does, the request is skipped with `"status": "already indexed"`.

---

## API Endpoints

### `POST /index`
Index a webpage's text content.

**Request:**
```json
{
  "title": "Tesla - Wikipedia",
  "url": "https://en.wikipedia.org/wiki/Tesla",
  "text": "Tesla, Inc. is an American multinational automotive..."
}
```

**Response:**
```json
{
  "status": "ok",
  "chunks": 24
}
```

### `POST /search`
Semantic search across all indexed pages.

**Request:**
```json
{
  "query": "electric vehicle battery"
}
```

**Response:**
```json
{
  "results": [
    {
      "title": "Tesla - Wikipedia",
      "url": "https://en.wikipedia.org/wiki/Tesla",
      "snippet": "Tesla manufactures electric vehicles, battery energy storage...",
      "chunk_id": "Tesla - Wikipedia_3"
    }
  ]
}
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Search failed" or no results | Make sure the backend is running on `http://localhost:8001` and Ollama is serving on `http://localhost:11434` |
| Extension not working after install | Ensure you loaded the `extension/` folder (not the root `Chrome-Plugin/` folder) in `chrome://extensions/` |
| "Cannot access contents of url" | The page might be a Chrome internal page (`chrome://`, `chrome-extension://`). These are restricted and cannot be indexed. |
| Indexing takes a long time | Large pages generate many chunks. The `nomic-embed-text` model runs locally, so speed depends on your hardware. |
| Highlighting not working | Some pages with complex DOM structures may not highlight perfectly. The extension uses `window.find()` which works best on standard HTML content. |

---

## Future Improvements

- Auto-index pages as you browse (background indexing)
- Show total indexed page count in the popup
- Delete / re-index individual pages
- Support for PDF content extraction
- Add a settings page to configure chunk size, top-k results, and embedding model
- Export/import FAISS index for backup

---

## License

MIT
