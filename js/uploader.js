/**
 * Drive Uploader Module
 * Manages asynchronous upload queue to Google Drive via Google Apps Script Web App.
 * Also fetches existing folders so users can pick without creating duplicates.
 */
class DriveUploader {
  constructor(endpointUrl) {
    this.endpoint =
      endpointUrl ||
      "https://script.google.com/macros/s/AKfycbyFU3KixOVpS9I3Iz1w_PiV47tRwiernHbNyOuYSBSo_yILrw_ce6YmDssAfGUlhUak/exec";

    this.queue = [];
    this.isUploading = false;
    this.uploadedCount = 0;
    this.failedCount = 0;
    this.recentUploads = [];
    this.existingFolders = [];

    this.onProgress = null; // Callback: (stats, recent) => {}
  }

  async fetchFolders() {
    try {
      const response = await fetch(this.endpoint);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const data = await response.json();
      if (data.status === "ok" && Array.isArray(data.folders)) {
        this.existingFolders = data.folders;
        return this.existingFolders;
      }
      return [];
    } catch (err) {
      console.warn("[Drive Uploader] Qovluqlar çəkilə bilmədi:", err);
      return [];
    }
  }

  enqueue(userName, imageBase64, customFileName = null) {
    const timestamp = Date.now();
    const safeName = (userName || "User").trim().replace(/[^a-zA-Z0-9_\-]/g, "_");
    const fileName =
      customFileName || `${safeName}_${timestamp}_${Math.floor(Math.random() * 1000)}.jpg`;

    const item = {
      id: "upl_" + timestamp + "_" + Math.random().toString(36).substr(2, 6),
      userName: safeName,
      fileName,
      image: imageBase64,
      timestamp,
      status: "pending", // 'pending' | 'uploading' | 'success' | 'failed'
      retries: 0,
    };

    this.queue.push(item);
    this.recentUploads.unshift({
      id: item.id,
      fileName: item.fileName,
      thumb: item.image,
      status: "pending",
      time: new Date(timestamp).toLocaleTimeString(),
    });

    if (this.recentUploads.length > 8) {
      this.recentUploads.pop();
    }

    this.notifyProgress();
    this.processQueue();
    return item;
  }

  async processQueue() {
    if (this.isUploading || this.queue.length === 0) return;

    this.isUploading = true;
    const item = this.queue[0];
    item.status = "uploading";
    this.updateRecentStatus(item.id, "uploading");
    this.notifyProgress();

    try {
      const payload = JSON.stringify({
        userName: item.userName,
        fileName: item.fileName,
        image: item.image,
      });

      // text/plain prevents CORS preflight OPTIONS which Google Apps Script rejects
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: payload,
      });

      if (!response.ok) {
        throw new Error(`HTTP xətası: ${response.status}`);
      }

      const resData = await response.json();
      if (resData.status === "success") {
        item.status = "success";
        this.uploadedCount++;
        this.updateRecentStatus(item.id, "success", resData.fileId);
        this.queue.shift(); // Remove from queue
      } else {
        throw new Error(resData.message || "Bilinməyən Drive xətası");
      }
    } catch (err) {
      console.warn(`[Drive Uploader] Yükləmə xətası (${item.fileName}):`, err);
      item.retries++;
      if (item.retries >= 3) {
        item.status = "failed";
        this.failedCount++;
        this.updateRecentStatus(item.id, "failed");
        this.queue.shift(); // Drop after 3 attempts
      } else {
        item.status = "pending";
        await new Promise((r) => setTimeout(r, 2000));
      }
    } finally {
      this.isUploading = false;
      this.notifyProgress();

      if (this.queue.length > 0) {
        setTimeout(() => this.processQueue(), 200);
      }
    }
  }

  updateRecentStatus(id, status, fileId = null) {
    const found = this.recentUploads.find((r) => r.id === id);
    if (found) {
      found.status = status;
      if (fileId) found.fileId = fileId;
    }
  }

  notifyProgress() {
    if (typeof this.onProgress === "function") {
      this.onProgress(
        {
          queueLength: this.queue.length,
          uploaded: this.uploadedCount,
          failed: this.failedCount,
          isUploading: this.isUploading,
        },
        this.recentUploads
      );
    }
  }
}

window.DriveUploader = DriveUploader;
