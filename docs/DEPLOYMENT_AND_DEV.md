# Deployment & Local Development

---

## 1. Production: GitHub Pages

Live at <https://avazasgarov.github.io/lens-dataset-collector/>.

- Pages is configured as **Deploy from a branch → `main` / root** (the "legacy" build type). Every push to `main` triggers GitHub's built-in *pages build and deployment* run, and the site updates within about a minute.
- `.nojekyll` turns off Jekyll processing, so files are served exactly as committed.
- There is **no custom GitHub Actions workflow**. The previous `deploy.yml` failed on every push: Actions jobs cannot start while the account is locked by a billing issue, and the Pages source was never switched to "GitHub Actions" anyway. If Actions becomes available and you want a workflow-based deployment, switch *Settings → Pages → Source* to **GitHub Actions** first.
- **Cache busting:** GitHub Pages caches files for about 10 minutes. On every release, bump the `?v=` query on the `<link>` and `<script>` tags in `index.html` so users never get a mix of old and new files.
- HTTPS is enforced, which the camera API requires.

### Release checklist
1. `node --check js/*.js google_drive_script.js` (syntax).
2. Test locally (see §3) with a real webcam: name + class, single capture, auto capture, camera switching.
3. Bump `?v=` in `index.html`.
4. If `google_drive_script.js` changed, redeploy it as a new version (see [GOOGLE_DRIVE_INTEGRATION.md](GOOGLE_DRIVE_INTEGRATION.md#5-updating-the-deployment)).
5. Push to `main`, then check the site and `…/exec?action=ping`.

---

## 2. Optional: Vercel

`vercel.json` adds `Permissions-Policy: camera=(self)` and `nosniff` headers. `.vercelignore` keeps `server.py`, `requirements.txt` and other non-site files out of the deployment, so Vercel serves the repository as a plain static site. Import the repository in Vercel and deploy; no build command is needed.

---

## 3. Local run

The local server is meant for development and for testing on one machine. The app still needs the internet to reach Google Apps Script and Google Fonts.

### One click (Windows)
Double-click `RUN_Web_App.bat`. It:
1. Finds a working Python 3.9+ (`python`, then `py -3`). The Microsoft Store alias is not treated as Python.
2. Installs `fastapi` and `uvicorn` from `requirements.txt`, and stops with a clear message if that fails.
3. Starts `server.py` and opens `http://localhost:8000` once the server is ready.

### Manual
```bash
pip install -r requirements.txt
python server.py
```

Environment variables: `PORT` (default `8000`), `HOST` (default `127.0.0.1`), and `NO_BROWSER=1` to skip opening the browser.

`server.py` serves only `index.html`, `css/` and `js/`. The repository root, including `.git/`, is never exposed. `GET /health` returns `{"status":"ok"}`.

Any static server works too, for example `python -m http.server 8000 --bind 127.0.0.1`. Do not expose a server like that on a network, because it serves the whole folder, including `.git/`.

---

## 4. Camera and secure contexts

Browsers allow `getUserMedia` only on secure origins:

| Origin | Camera |
|---|---|
| `https://…` | Allowed |
| `http://localhost`, `http://127.0.0.1` | Allowed |
| `http://192.168.x.x` (LAN IP) | Blocked |

For colleagues on other machines, share the GitHub Pages URL. If a temporary HTTPS tunnel to a local build is needed: `cloudflared tunnel --url http://localhost:8000`.
