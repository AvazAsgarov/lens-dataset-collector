# Deployment & Local Development Guide

This guide covers all deployment options (Cloud & Local) and network requirements for running the Lens Detection Dataset Collection platform.

---

## 1. Cloud Deployment (24/7 Serverless)

### 1.1. GitHub Pages (Production Active)
The application is currently live at:  
👉 **[https://avazasgarov.github.io/lens-dataset-collector/](https://avazasgarov.github.io/lens-dataset-collector/)**

**How it works:**
1. A GitHub Actions workflow (`.github/workflows/deploy.yml`) triggers on every push to the `main` branch.
2. The workflow uploads the repository root and deploys directly to GitHub Pages.
3. **HTTPS Enforcement:** GitHub Pages automatically provides an SSL certificate. This satisfies modern browser security policies that require HTTPS for camera (`navigator.mediaDevices.getUserMedia`) access.

### 1.2. Vercel Deployment
The repository includes a root `vercel.json` configuration:
```json
{
  "version": 2,
  "name": "lens-dataset-collector",
  "builds": [
    {
      "src": "*",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/$1"
    }
  ]
}
```
To deploy to Vercel:
1. Import the repository `https://github.com/AvazAsgarov/lens-dataset-collector` into Vercel.
2. Click **Deploy**. Vercel will serve all static files instantly with automatic edge SSL.

---

## 2. Local Development & Offline Running

If the platform needs to run locally on an air-gapped or internal network:

### 2.1. One-Click Batch Launcher (`RUN_Web_App.bat`)
Double-click `RUN_Web_App.bat` in the project root:
1. Verifies Python 3.9+ availability.
2. Installs dependencies from `requirements.txt` (`fastapi`, `uvicorn`).
3. Launches `server.py` on `http://127.0.0.1:8000`.
4. Automatically opens default browser to the web app.

### 2.2. Manual Python Execution
```powershell
pip install -r requirements.txt
python server.py
```

---

## 3. WebRTC Security & Camera Permissions

> [!IMPORTANT]
> **Browser HTTPS Security Policy:**  
> Modern browsers (Chrome, Edge, Safari, Firefox) restrict `navigator.mediaDevices.getUserMedia` exclusively to **Secure Contexts**:
> - `http://localhost` or `http://127.0.0.1` (Permitted)
> - Any valid `https://` origin (Permitted)
> - Any raw LAN IP (e.g. `http://192.168.1.50:8000`) is **blocked by browser security**.

If hosting the local server on an office LAN for other colleagues to connect to:
- **Solution A (Recommended):** Use the public GitHub Pages URL: [https://avazasgarov.github.io/lens-dataset-collector/](https://avazasgarov.github.io/lens-dataset-collector/).
- **Solution B (Cloudflare Tunnel):** Run `cloudflared tunnel --url http://localhost:8000` to get a free temporary HTTPS link.
