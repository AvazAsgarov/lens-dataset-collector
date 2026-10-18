/**
 * Drive uploader — background upload queue to the Google Apps Script web app,
 * plus the Drive folder tree (people → classes) used for suggestions.
 *
 * Requests use Content-Type text/plain so the browser skips the CORS preflight,
 * which Apps Script web apps do not answer.
 */
class DriveUploader {
  constructor(endpoint, options = {}) {
    this.endpoint = endpoint;
    this.concurrency = options.concurrency || 2;
    this.maxAttempts = options.maxAttempts || 5;
    this.maxRecent = options.maxRecent || 12;
    this.timeoutMs = options.timeoutMs || 60000;

    this.queue = []; // items not yet uploaded (pending, uploading, failed)
    this.recent = []; // newest first, for the UI
    this.active = 0;
    this.uploaded = 0;
    this.timer = null;
    this.onChange = null; // (uploader) => void

    window.addEventListener("online", () => this.pump());
  }

  /* ---------- Folder tree ---------- */

  async fetchTree({ fresh = false } = {}) {
    const url = new URL(this.endpoint);
    url.searchParams.set("action", "tree");
    if (fresh) url.searchParams.set("fresh", "1");

    const data = await this.request(url.toString(), { method: "GET" }, 25000);
    if (data.status !== "ok") throw new Error(data.message || "Drive cavabı uğursuzdur");

    if (Array.isArray(data.users)) {
      return {
        version: Number(data.version) || 2,
        users: data.users.map((u) => ({
          name: String(u.name),
          classes: Array.isArray(u.classes) ? u.classes.map((c) => String(c.name)) : [],
        })),
      };
    }
    // API v1 backend: only top-level folders.
    if (Array.isArray(data.folders)) {
      return {
        version: 1,
        users: data.folders.map((f) => ({ name: String(f.name), classes: [] })),
      };
    }
    throw new Error("Drive cavabının formatı tanınmadı");
  }

  /* ---------- Queue ---------- */

  get pendingCount() {
    return this.queue.filter((i) => i.status === "pending" || i.status === "uploading").length;
  }

  get failedCount() {
    return this.queue.filter((i) => i.status === "failed").length;
  }

  // Everything still held in memory that is not on Drive yet.
  get backlog() {
    return this.queue.length;
  }

  enqueue({ userName, className, fileName, image, thumb, meta }) {
    const item = {
      id: `upl_${Date.now().toString(36)}_${LensUtils.randomId(6)}`,
      fileName,
      userName,
      className,
      thumb,
      createdAt: new Date(),
      status: "pending", // pending | uploading | success | failed
      attempts: 0,
      retryAt: 0,
      error: "",
      fileId: null,
      payload: { v: 2, userName, className, fileName, image, meta },
    };

    this.queue.push(item);
    this.recent.unshift(item);
    if (this.recent.length > this.maxRecent) this.recent.length = this.maxRecent;

    this.emit();
    this.pump();
    return item;
  }

  retry(id) {
    const item = this.queue.find((i) => i.id === id && i.status === "failed");
    if (!item) return;
    item.status = "pending";
    item.attempts = 0;
    item.retryAt = 0;
    item.error = "";
    this.emit();
    this.pump();
  }

  retryAllFailed() {
    this.queue.forEach((item) => {
      if (item.status !== "failed") return;
      item.status = "pending";
      item.attempts = 0;
      item.retryAt = 0;
      item.error = "";
    });
    this.emit();
    this.pump();
  }

  pump() {
    clearTimeout(this.timer);
    this.timer = null;
    if (navigator.onLine === false) {
      this.emit();
      return;
    }

    const now = Date.now();
    let nextDue = Infinity;
    for (const item of this.queue) {
      if (this.active >= this.concurrency) break;
      if (item.status !== "pending") continue;
      if (item.retryAt > now) {
        nextDue = Math.min(nextDue, item.retryAt);
        continue;
      }
      this.upload(item);
    }
    if (nextDue !== Infinity) {
      this.timer = setTimeout(() => this.pump(), Math.max(50, nextDue - now + 20));
    }
  }

  async upload(item) {
    this.active++;
    item.status = "uploading";
    item.attempts++;
    this.emit();

    try {
      const res = await this.request(
        this.endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(item.payload),
        },
        this.timeoutMs
      );
      if (res.status !== "success") throw new Error(res.message || "Drive xətası");

      item.status = "success";
      item.fileId = res.fileId || null;
      item.error = "";
      item.payload = null; // free the full-size image
      this.queue = this.queue.filter((q) => q !== item);
      this.uploaded++;
    } catch (err) {
      item.error = err && err.message ? err.message : String(err);
      if (navigator.onLine === false) {
        // Offline is not the server's fault — wait for the "online" event without burning attempts.
        item.attempts = Math.max(0, item.attempts - 1);
        item.status = "pending";
        item.retryAt = 0;
      } else if (item.attempts >= this.maxAttempts) {
        item.status = "failed";
        console.warn(`[uploader] ${item.fileName} failed after ${item.attempts} attempts:`, item.error);
      } else {
        item.status = "pending";
        item.retryAt = Date.now() + Math.min(30000, 2000 * 2 ** (item.attempts - 1));
      }
    } finally {
      this.active--;
      this.emit();
      this.pump();
    }
  }

  async request(url, init, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, redirect: "follow", signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch (err) {
        throw new Error("Serverdən gözlənilməz cavab gəldi");
      }
    } catch (err) {
      if (err && err.name === "AbortError") throw new Error("Server vaxtında cavab vermədi");
      if (err instanceof TypeError) throw new Error("Şəbəkə xətası");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  emit() {
    if (typeof this.onChange === "function") this.onChange(this);
  }
}

window.DriveUploader = DriveUploader;
