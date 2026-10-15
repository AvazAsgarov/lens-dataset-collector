"""
Lens Detection Dataset Collector - Local Web Server
Runs a local FastAPI server to host the static dataset collector application.
"""

import os
import sys
import webbrowser
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="Lens Detection Dataset Collector", version="1.0.0")

# Enable CORS for local testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static subdirectories
if (BASE_DIR / "css").is_dir():
    app.mount("/css", StaticFiles(directory=str(BASE_DIR / "css")), name="css")
if (BASE_DIR / "js").is_dir():
    app.mount("/js", StaticFiles(directory=str(BASE_DIR / "js")), name="js")
if (BASE_DIR / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=str(BASE_DIR / "assets")), name="assets")


@app.get("/")
async def serve_index():
    return FileResponse(str(BASE_DIR / "index.html"))


@app.get("/health")
async def health_check():
    return {"status": "ok", "app": "Lens Detection Dataset Collector"}


def main():
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "127.0.0.1")
    url = f"http://{host}:{port}"

    print("=" * 60)
    print("  LENS DETECTION - DATASET COLLECTOR WEB SERVER")
    print("=" * 60)
    print(f"  Veb sayt hazırdır: {url}")
    print("  Brauzer avtomatik açılır...")
    print("=" * 60)

    try:
        webbrowser.open(url)
    except Exception:
        pass

    uvicorn.run("server:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
