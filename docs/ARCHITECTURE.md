# System Architecture & Technical Specifications

This document outlines the detailed system architecture, component breakdown, and runtime data flows for the Lens Detection Dataset Collection platform.

---

## 1. Architectural Overview

The application is structured as a decoupled, serverless client-cloud system with an optional local Python fallback:

```mermaid
graph TB
    subgraph ClientLayer ["Frontend / Client Layer (Browser)"]
        HTML["index.html (Semantic SPA)"]
        CSS["css/style.css (Dark Glassmorphism)"]
        
        subgraph JSModules ["JavaScript Architecture"]
            APP["app.js<br/>(Coordinator & State Loop)"]
            CAM["camera.js<br/>(WebRTC & Canvas)"]
            GUIDE["guidance.js<br/>(Luminance & Wizard)"]
            UPL["uploader.js<br/>(Queue & GAS Client)"]
        end
    end

    subgraph HostingLayer ["Cloud Hosting Options"]
        GHP["GitHub Pages (Active: avazasgarov.github.io)"]
        VCL["Vercel (vercel.json)"]
        LCL["Local FastAPI (server.py)"]
    end

    subgraph BackendLayer ["Google Apps Script (GAS) Execution"]
        ENDPOINT["script.google.com/macros/s/.../exec"]
        DOGET["doGet(): List folders"]
        DOPOST["doPost(): Decode & Store"]
    end

    subgraph CloudStorage ["Google Drive Infrastructure"]
        ROOT["Root Shared Folder<br/>(1PIz4lSXEC4cz7PRve9MRHmyTAh8n4wVR)"]
        U1["/Avaz/"]
        U2["/Mahammad/"]
        U3["/Leyla/"]
        UX["/<Employee>/"]
    end

    HTML --> APP
    APP --> CAM
    APP --> GUIDE
    APP --> UPL

    HostingLayer -.->|Serves static files| ClientLayer
    UPL -->|HTTPS GET (Fetch folders)| ENDPOINT
    UPL -->|HTTPS POST (Upload base64)| ENDPOINT

    ENDPOINT --> DOGET
    ENDPOINT --> DOPOST
    DOGET --> ROOT
    DOPOST --> ROOT
    ROOT --> U1
    ROOT --> U2
    ROOT --> U3
    ROOT --> UX
```

---

## 2. Component Breakdown

### 2.1. Client-Side Modules

#### 1. `camera.js` (`CameraController`)
- **WebRTC Stream Acquisition:** Calls `navigator.mediaDevices.getUserMedia` with ideal constraints `1280x720@30fps`.
- **Multi-device enumeration:** Uses `navigator.mediaDevices.enumerateDevices` to populate the camera selection dropdown.
- **Mirroring:** Toggles `.mirror` CSS class on video element and tracks `isMirror` state.
- **Clean Frame Extraction:**
  - Uses an offscreen `<canvas>` with dimensions set to `video.videoWidth` and `video.videoHeight`.
  - When `isMirror` is true, executes `ctx.translate(w, 0); ctx.scale(-1, 1);` before `drawImage`.
  - Exports clean JPEG blob via `canvas.toDataURL("image/jpeg", 0.92)`.

#### 2. `guidance.js` (`GuidanceSystem`)
- **Luminance Calculation:**
  Samples a 32x18 pixel region from the center of the video feed every 250ms onto a lightweight offscreen canvas (`willReadFrequently: true`).
  $$\text{Luminance} = 0.299R + 0.587G + 0.114B$$
  - Thresholds:
    - $\text{Avg} < 55$: Warning - "İşıq zəifdir - Otaq işığını yandırın"
    - $\text{Avg} > 215$: Warning - "Çox parlaqdır - Parıltı yaranır"
    - $55 \le \text{Avg} \le 215$: Success - "İşıqlandırma idealdır"
- **Viewfinder Guidelines:**
  Renders interactive brackets and crosshairs on the transparent overlay canvas positioned over the video stream.
- **Scenario Wizard Engine:**
  Maintains step progress and target counts across 5 training poses. Automatically advances to next scenario upon reaching target.

#### 3. `uploader.js` (`DriveUploader`)
- **Queue Management:**
  In-memory FIFO queue with upload status (`pending` -> `uploading` -> `success` / `failed`).
- **Retries & Error Handling:**
  Attempts upload up to 3 times with a 2-second backoff before marking as failed.
- **CORS Bypass:**
  Sends payload using `Content-Type: text/plain;charset=utf-8` to Google Apps Script.
- **Folder List Fetching:**
  Issues `GET` requests to retrieve existing subfolders for the selector dropdown.

#### 4. `app.js` (Main Coordinator)
- **Animation Loop:** Synchronizes `requestAnimationFrame` for HUD overlays and countdown timer.
- **Keyboard Shortcuts:**
  - `Space`: Start / Pause auto-capture loop.
  - `C` / `Enter`: Instant manual capture.
  - `W` / `ArrowUp`: Increase interval by 0.5s.
  - `S` / `ArrowDown`: Decrease interval by 0.5s.
  - `M`: Toggle mirror mode.
- **Audio Feedback:** Synthesizes shutter click via Web Audio API (`AudioContext`) with an exponential frequency ramp from 800Hz to 120Hz over 80ms.
- **Visual Feedback:** Triggers green perimeter flash (`.flash-effect.active`) for 120ms.

---

### 2.2. Serverless Backend (`google_drive_script.js`)

Executed directly on Google Cloud's serverless Apps Script engine under the owner's authorization:

- **`doGet(e)`**:
  - Traverses `DriveApp.getFolderById("1PIz4lSXEC4cz7PRve9MRHmyTAh8n4wVR")`.
  - Collects all immediate subfolders, sorts them alphabetically by name.
  - Returns JSON: `{"status": "ok", "folders": [{"id": "...", "name": "..."}]}`.
- **`doPost(e)`**:
  - Parses JSON payload (`userName`, `fileName`, `image`).
  - Performs case-insensitive comparison against existing subfolder names.
  - Reuses existing folder if match found; otherwise creates a new folder.
  - Decodes base64 string using `Utilities.base64Decode()`.
  - Creates the JPEG file in the targeted folder via `userFolder.createFile()`.
  - Returns JSON: `{"status": "success", "fileId": "...", "folderId": "..."}`.

---

## 3. Data Schema

### 3.1. LocalStorage Schema
| Key | Type | Description |
|---|---|---|
| `lens_collector_name` | `string` | The last selected or created user/folder name |

### 3.2. Upload Payload Schema (`POST /exec`)
```json
{
  "userName": "Mahammad",
  "fileName": "Mahammad_1792070000000_123.jpg",
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/..."
}
```

### 3.3. Response Schemas
**GET (Folder Listing):**
```json
{
  "status": "ok",
  "folders": [
    { "id": "1CEyHPv63I9wl_g8dYnv1bGunE2SMx2XC", "name": "Avaz" },
    { "id": "1pqGsL_BtUl1XvscG5AgVldmvdogNQUQ_", "name": "Mahammad" }
  ]
}
```

**POST (Upload Response):**
```json
{
  "status": "success",
  "fileId": "1z73PgSD3OT75bvbShseMvKZFZKaQ7C0D",
  "fileName": "Mahammad_1792070000000_123.jpg",
  "folderId": "1pqGsL_BtUl1XvscG5AgVldmvdogNQUQ_",
  "folderName": "Mahammad"
}
```
