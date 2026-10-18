"""
Lens Dataset Collector - local web server.

Serves the static app on http://localhost:8000 (browsers allow camera access only on
localhost or HTTPS). Only index.html, css/ and js/ are exposed; the repository root is
never served because it contains .git/ (and with it the remote URL / credentials).
"""

import os
import sys
import threading
import time
import webbrowser
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent
VERSION = "2.0.0"

app = FastAPI(
    title="Lens Dataset Collector",
    version=VERSION,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

for folder in ("css", "js"):
    if (BASE_DIR / folder).is_dir():
        app.mount(f"/{folder}", StaticFiles(directory=BASE_DIR / folder), name=folder)


@app.get("/", include_in_schema=False)
async def serve_index():
    return FileResponse(BASE_DIR / "index.html", headers={"Cache-Control": "no-cache"})


@app.get("/health", include_in_schema=False)
async def health_check():
    return {"status": "ok", "app": "Lens Dataset Collector", "version": VERSION}


def _use_utf8_console():
    # A non-UTF-8 Windows console must not crash the server on Azerbaijani text.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def main():
    _use_utf8_console()

    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    browser_host = "localhost" if host in ("127.0.0.1", "0.0.0.0", "::") else host
    url = f"http://{browser_host}:{port}"

    server = uvicorn.Server(uvicorn.Config(app, host=host, port=port, log_level="info"))

    def open_browser_when_ready():
        for _ in range(150):
            if server.started:
                try:
                    webbrowser.open(url)
                except Exception:
                    pass
                return
            if server.should_exit:
                return
            time.sleep(0.1)

    print("=" * 60)
    print("  LENS DATASET COLLECTOR - lokal veb server")
    print("=" * 60)
    print(f"  Ünvan: {url}")
    print("  Server hazır olanda brauzer avtomatik açılacaq.")
    print("  Dayandırmaq üçün: Ctrl+C")
    print("=" * 60)

    if os.environ.get("NO_BROWSER") != "1":
        threading.Thread(target=open_browser_when_ready, daemon=True).start()
    server.run()


if __name__ == "__main__":
    main()
