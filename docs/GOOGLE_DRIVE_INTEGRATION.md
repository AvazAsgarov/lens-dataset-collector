# Google Drive Integration & Google Apps Script Backend

This guide details the serverless Google Drive integration powering the Lens Detection Dataset Collection platform.

---

## 1. Why Google Apps Script (GAS)?

Traditional Google Drive integrations for web applications require one of two complex architectures:
1. **Google Cloud Service Account:** Requires GCP Console project creation, OAuth credentials, service account key rotation, and an active backend server (Node.js/Python) to proxy uploads.
2. **Client-Side OAuth 2.0:** Requires every employee to authenticate with their own Google account, grant Drive permissions, and handle token refreshes.

**The Google Apps Script Solution:**
By deploying a Google Apps Script as an authenticated Web App:
- **Zero Server Costs:** Google's infrastructure hosts and runs the backend 24/7 for free.
- **Zero Friction:** End users do **not** log into Google; the script executes under the project owner's authorization (`Execute as: Me`).
- **Direct Drive API Access:** Native `DriveApp` classes interact directly with Google Drive without external API keys or rate-limit tokens.

---

## 2. Complete Script Code (`google_drive_script.js`)

```javascript
/**
 * Google Apps Script - Lens Detection Drive Backend
 * Target Folder: https://drive.google.com/drive/folders/1PIz4lSXEC4cz7PRve9MRHmyTAh8n4wVR
 */

function doGet(e) {
  try {
    var parentFolderId = "1PIz4lSXEC4cz7PRve9MRHmyTAh8n4wVR";
    var parentFolder = DriveApp.getFolderById(parentFolderId);
    
    // Fetch existing employee subfolders
    var folders = [];
    var folderIterator = parentFolder.getFolders();
    while (folderIterator.hasNext()) {
      var f = folderIterator.next();
      folders.push({
        id: f.getId(),
        name: f.getName()
      });
    }
    
    // Sort alphabetically
    folders.sort(function(a, b) {
      return a.name.localeCompare(b.name);
    });
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "ok",
      folders: folders
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var parentFolderId = "1PIz4lSXEC4cz7PRve9MRHmyTAh8n4wVR";
    var parentFolder = DriveApp.getFolderById(parentFolderId);
    
    var rawName = (data.userName || "anonymous").trim();
    var targetLower = rawName.toLowerCase();
    
    // Case-insensitive search to prevent duplicate folders
    var userFolder = null;
    var folderIterator = parentFolder.getFolders();
    while (folderIterator.hasNext()) {
      var f = folderIterator.next();
      if (f.getName().toLowerCase() === targetLower) {
        userFolder = f;
        break;
      }
    }
    
    // Create new folder only if it doesn't already exist
    if (!userFolder) {
      userFolder = parentFolder.createFolder(rawName);
    }
    
    // Convert base64 data to JPEG blob
    var imageBase64 = data.image;
    if (imageBase64.indexOf(",") > -1) {
      imageBase64 = imageBase64.split(",")[1];
    }
    
    var decoded = Utilities.base64Decode(imageBase64);
    var fileName = data.fileName || (userFolder.getName() + "_" + new Date().getTime() + ".jpg");
    var blob = Utilities.newBlob(decoded, "image/jpeg", fileName);
    
    var file = userFolder.createFile(blob);
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      fileId: file.getId(),
      fileName: fileName,
      folderId: userFolder.getId(),
      folderName: userFolder.getName()
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
```

---

## 3. How to Deploy or Update the Script

If you ever need to update the logic or change the root folder ID:

1. Open [script.google.com](https://script.google.com) and open the project.
2. Paste the updated code into the editor.
3. Click the blue **Deploy** button (top right) ➔ **Manage deployments**.
4. Click the **Edit (pencil ✏️)** icon.
5. In the **Version** dropdown, select **"New version"**.
6. Ensure settings are:
   - **Execute as:** `Me (your-email@gmail.com)`
   - **Who has access:** `Anyone` *(Crucial: allows anonymous upload without requiring end-user login)*
7. Click **Deploy**.

---

## 4. Testing & Verification

### Test 1: Fetch Existing Folders (GET)
```bash
curl -s -L "https://script.google.com/macros/s/AKfycbyFU3KixOVpS9I3Iz1w_PiV47tRwiernHbNyOuYSBSo_yILrw_ce6YmDssAfGUlhUak/exec"
```
**Expected Response:**
```json
{
  "status": "ok",
  "folders": [
    { "id": "1CEyHPv63I9wl_g8dYnv1bGunE2SMx2XC", "name": "Avaz" },
    { "id": "1pqGsL_BtUl1XvscG5AgVldmvdogNQUQ_", "name": "Mahammad" }
  ]
}
```

### Test 2: Upload Image (POST)
```powershell
$body = @{
    userName = "Mahammad"
    fileName = "test_image.jpg"
    image = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://script.google.com/macros/s/AKfycbyFU3KixOVpS9I3Iz1w_PiV47tRwiernHbNyOuYSBSo_yILrw_ce6YmDssAfGUlhUak/exec" -Method Post -Body $body -ContentType "text/plain;charset=utf-8"
```
**Expected Response:**
```json
{
  "status": "success",
  "fileId": "1z73PgSD3OT75bvbShseMvKZFZKaQ7C0D",
  "fileName": "test_image.jpg",
  "folderId": "1pqGsL_BtUl1XvscG5AgVldmvdogNQUQ_",
  "folderName": "Mahammad"
}
```
