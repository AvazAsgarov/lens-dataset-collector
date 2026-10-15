/**
 * Google Apps Script - Lens Detection Drive Backend
 * Bu skript Google Apps Script layihəsinə yapışdırılır.
 * 
 * Yeniliklər:
 * 1. Mövcud qovluqların siyahısını qaytarır (doGet).
 * 2. Böyük/kiçik hərf fərqini (Case-insensitive) aradan qaldırır və heç vaxt dublikat qovluq yaratmır.
 */

function doGet(e) {
  try {
    var parentFolderId = "1PIz4lSXEC4cz7PRve9MRHmyTAh8n4wVR";
    var parentFolder = DriveApp.getFolderById(parentFolderId);
    
    // Mövcud qovluqları çək
    var folders = [];
    var folderIterator = parentFolder.getFolders();
    while (folderIterator.hasNext()) {
      var f = folderIterator.next();
      folders.push({
        id: f.getId(),
        name: f.getName()
      });
    }
    
    // Əlifba sırası ilə düz
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
    
    // Mövcud qovluqlar arasında case-insensitive axtarış (Dublikatın qarşısını alır)
    var userFolder = null;
    var folderIterator = parentFolder.getFolders();
    while (folderIterator.hasNext()) {
      var f = folderIterator.next();
      if (f.getName().toLowerCase() === targetLower) {
        userFolder = f;
        break;
      }
    }
    
    // Əgər həqiqətən yoxdursa, yeni qovluq yarat
    if (!userFolder) {
      userFolder = parentFolder.createFolder(rawName);
    }
    
    // Şəkli Base64-dən fayla çevir
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
