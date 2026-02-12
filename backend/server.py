
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
from pydantic import BaseModel
import logging
import requests
from pathlib import Path
import json
import faiss

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("server.py")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins = ["*"],
    allow_methods = ["*"],
    allow_headers = ["*"]
)

class IndexRequest(BaseModel):
    title: str
    url: str
    text: str

class SearchRequest(BaseModel):
    query: str 

SIZE = 512
CHUNK_OVERLAP = 40
EMBED_URL = "http://localhost:11434/api/embeddings"
EMBED_MODEL = "nomic-embed-text"
INDEX_DIR = Path(__file__).parent / "faiss_index"
INDEX_DIR.mkdir(exist_ok=True)
INDEX_FILE = INDEX_DIR / "index.bin"
METADATA_FILE = INDEX_DIR / "metadata.json"
ROOT = Path(__file__).parent.resolve()
@app.post("/index")


def index_page(body: IndexRequest):
    if INDEX_FILE.exists():
        index = faiss.read_index(str(INDEX_FILE))
        metadata = json.loads(METADATA_FILE.read_text())
    else:
        index = None
        metadata = []

    if (body.url in [m['url'] for m in metadata]):
        return {"status":"already indexed","chunk":0}

    
    chunks = list(chunk_text(body.text, SIZE, CHUNK_OVERLAP))
    
    embeddings = []
    for chunk in chunks:
        emb = get_embeddings(chunk)
        embeddings.append(emb)

    if embeddings:
        stacked = np.stack(embeddings)
        if index is None:
            index = faiss.IndexFlatL2(stacked.shape[1])
        index.add(stacked)

    for i, chunk in enumerate(chunks):
        metadata.append({
            "chunk": chunk,
            "url": body.url,
            "title": body.title,
            "chunk_id": f"{body.title}_{i}"
        })

    # 7. Save to disk
    faiss.write_index(index, str(INDEX_FILE))
    METADATA_FILE.write_text(json.dumps(metadata, indent=2))

    log.info(f"Indexed {len(chunks)} chunks from {body.title}")
    return {"status": "ok", "chunks": len(chunks)}

   

@app.post("/search")
def search(body: SearchRequest):
    try:
        
        index = faiss.read_index(str(ROOT / "faiss_index" / "index.bin"))
        metadata = json.loads((ROOT / "faiss_index" / "metadata.json").read_text())
        query_vec = get_embeddings(body.query).reshape(1, -1)
        
        D, I = index.search(query_vec, k=3)
        results = []
        for idx in I[0]:
            data = metadata[idx]
            results.append({
                "title": data["title"],
                "url": data["url"],
                "snippet": data["chunk"],
                "chunk_id": data["chunk_id"]
            })
        
        return {"results":results}

        
    except Exception as e:

        log.error(f"Error in search: {e}")
        return {"results":[]}

def chunk_text(text,size = 254, overlap = 40):    
    words = text.split()
    for i in range(0, len(words), size - overlap):
        yield " ".join(words[i:i+size]) 

def get_embeddings(text: str) -> np.ndarray:
    response = requests.post(EMBED_URL, json={"model": EMBED_MODEL, "prompt": text})
    
    return np.array(response.json()["embedding"], dtype=np.float32)


# i=0: words[0:5] → "the cat sat on the"
# i=3: words[3:8] → "on the mat in the"      ← overlaps "on the" from previous
# i=6: words[6:11] → "in the sun"  