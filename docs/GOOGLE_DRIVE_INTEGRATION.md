# Google Drive Integration (Apps Script backend, API v2)

The backend is a Google Apps Script web app that runs **as the owner of the `Lens_Dataset` folder**. Collectors do not sign in to Google; the browser posts frames to the web app and the script writes them to Drive.

The source of truth is [`google_drive_script.js`](../google_drive_script.js) in this repository. The deployed copy lives in the Apps Script project "Untitled project" in the AI Factory Google account.

---

## 1. Why Apps Script

- No server or GCP project to maintain. Google hosts and runs it for free.
- No end-user OAuth. The deployment uses *Execute as: Me* and *Who has access: Anyone*.
- Native `DriveApp`, `LockService` and `CacheService`.

Trade-off: the `/exec` URL is public. The script therefore validates everything it receives (see §4).

---

## 2. Drive layout

```
Lens_Dataset/                         (ROOT_FOLDER_ID = 1PIz4lSXEC4cz7PRve9MRHmyTAh8n4wVR)
└── <Name>/                           e.g. Leyla
    ├── <class>/                      e.g. mouse  (lowercase, spaces → _)
    │   └── <class>_<Name>_<YYYYMMDD-HHMMSS-mmm>_<rand4>.jpg
    └── <older v1 files>.jpg          (v1 uploads had no class folder)
```

Each file's **description** holds JSON metadata:

```json
{"user":"Leyla","class":"mouse","uploadedAt":"2026-10-18T12:48:04.010Z","capturedAt":"2026-10-18T12:48:03.123Z","scenario":2,"mode":"wizard","mirror":true,"width":1280,"height":720,"camera":"Integrated Webcam","luminance":132,"app":"web-2.0"}
```

---

## 3. Endpoints

| Request | Response |
|---|---|
| `GET /exec?action=ping` | `{"status":"ok","version":2}` |
| `GET /exec?action=tree` | Person and class folder tree, cached for 60 s (add `&fresh=1` to bypass the cache) |
| `POST /exec` with a `text/plain` JSON body | Saves the image. See the payload in [ARCHITECTURE.md](ARCHITECTURE.md#4-data-schemas) |

The client must send `Content-Type: text/plain;charset=utf-8`. Apps Script does not answer CORS preflight requests, so `application/json` would be blocked by the browser.

---

## 4. Safety rules enforced by the script

| Rule | Where |
|---|---|
| Only JPEG data (`FF D8 FF` signature), max 10 MB | `decodeJpeg_` |
| Names: no `/`, `\` or control characters, collapsed whitespace, max 60 characters | `cleanName_`, `cleanClass_` |
| File names: unsafe characters replaced, `.jpg` enforced, max 150 characters | `cleanFileName_` |
| Case-insensitive find-or-create; trashed folders ignored; oldest duplicate wins | `findOrCreateFolder_`, `findChildFolder_` |
| Concurrent first uploads cannot create duplicate folders | `LockService.getScriptLock()` |
| A retried upload with the same file name does not create a duplicate | `getFilesByName` check in `doPost` |
| At most 200 new folders per hour | `countFolderCreation_` |
| Only whitelisted metadata keys are stored | `buildMeta_` |

---

## 5. Updating the deployment

1. Open the Apps Script project. In the owner's Chrome profile the AI Factory account is `authuser=2`: <https://script.google.com/u/2/home>.
2. Replace the contents of `Code.gs` with `google_drive_script.js` from this repository and save (Ctrl+S).
3. **Deploy → Manage deployments → ✏️ Edit**.
4. **Version → New version**, and add a short description.
5. Keep **Execute as: Me** and **Who has access: Anyone**.
6. **Deploy**. The deployment ID and the `/exec` URL do not change, so the website needs no update.

Rolling back: in the same dialog, pick an earlier version and deploy it.

If a future change adds a new Google service (for example `SpreadsheetApp`), Apps Script will ask the owner to authorise the new scope during deployment.

---

## 6. Testing

Read-only checks, safe to run any time:

```bash
curl -sL "https://script.google.com/macros/s/AKfycbyFU3KixOVpS9I3Iz1w_PiV47tRwiernHbNyOuYSBSo_yILrw_ce6YmDssAfGUlhUak/exec?action=ping"
curl -sL "https://script.google.com/macros/s/AKfycbyFU3KixOVpS9I3Iz1w_PiV47tRwiernHbNyOuYSBSo_yILrw_ce6YmDssAfGUlhUak/exec?action=tree&fresh=1"
```

A write test creates real files. Always use a throw-away name such as `_test` and move that folder to the Drive trash afterwards, so no test images end up in a real person's dataset:

```powershell
$body = @{
  userName  = "_test"
  className = "_e2e"
  fileName  = "_e2e_test.jpg"
  image     = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="
} | ConvertTo-Json
Invoke-RestMethod -Method Post -ContentType "text/plain;charset=utf-8" -Body $body `
  -Uri "https://script.google.com/macros/s/AKfycbyFU3KixOVpS9I3Iz1w_PiV47tRwiernHbNyOuYSBSo_yILrw_ce6YmDssAfGUlhUak/exec"
```

Expected: `status: success`, `path: _test/_e2e`.

The backend logic can also be unit-tested offline by loading the script into Node with mocked `DriveApp`, `CacheService`, `LockService`, `Utilities`, `Session` and `ContentService` objects. That is how v2 was verified before deployment.

---

## 7. Known gotcha — multiple Google accounts

Opening the `/exec` URL directly in a Chrome window signed in to several Google accounts can show *"Sorry, unable to open the file at this time"*. This is a Google session-cookie issue. `fetch()` and `curl` requests are not affected.
