/**
 * Camera module — WebRTC stream, device switching and clean frame capture.
 */
class CameraController {
  constructor(videoElement) {
    this.video = videoElement;
    this.stream = null;
    this.deviceId = null;
    this.mirror = true;
    this.seq = 0;
    this.requestedId = null; // last device asked for (may still be opening)
    this.onEnded = null; // () => void — camera unplugged or stopped by the OS

    this.frameCanvas = document.createElement("canvas");
    this.frameCtx = this.frameCanvas.getContext("2d");
    this.thumbCanvas = document.createElement("canvas");
    this.thumbCtx = this.thumbCanvas.getContext("2d");
  }

  static isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  get ready() {
    return !!this.stream && this.video.readyState >= 2 && this.video.videoWidth > 0;
  }

  get width() {
    return this.video.videoWidth || 0;
  }

  get height() {
    return this.video.videoHeight || 0;
  }

  get aspect() {
    return this.width && this.height ? this.width / this.height : 16 / 9;
  }

  async listDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === "videoinput");
    } catch (err) {
      console.warn("[camera] enumerateDevices failed:", err);
      return [];
    }
  }

  /**
   * Starts the given device (or the default one). If switching fails, the previous
   * device is restored so the preview never ends up black.
   */
  async start(deviceId = null) {
    if (!CameraController.isSupported()) {
      const err = new Error("Camera API unavailable");
      err.name = window.isSecureContext ? "NotSupportedError" : "InsecureContextError";
      throw err;
    }

    // A newer start() call supersedes this one (rapid camera switching, double retry).
    const seq = ++this.seq;
    const previous = this.deviceId;
    this.requestedId = deviceId;
    this.stop();
    try {
      await this.open(deviceId, seq);
    } catch (err) {
      if (err.name !== "SupersededError" && seq === this.seq && deviceId && previous && previous !== deviceId) {
        try {
          await this.open(previous, seq);
          this.requestedId = previous;
        } catch (restoreErr) {
          console.warn("[camera] could not restore previous device:", restoreErr);
        }
      }
      // A newer request owns the camera now — its outcome decides the UI, not this error.
      this.assertCurrent(seq, null);
      throw err;
    }
  }

  assertCurrent(seq, stream) {
    if (seq === this.seq) return;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    const err = new Error("Superseded by a newer camera request");
    err.name = "SupersededError";
    throw err;
  }

  async open(deviceId, seq) {
    const video = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    };
    if (deviceId) video.deviceId = { exact: deviceId };

    const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    this.assertCurrent(seq, stream);
    const track = stream.getVideoTracks()[0];

    this.stream = stream;
    this.deviceId = (track && track.getSettings && track.getSettings().deviceId) || deviceId || null;

    if (track) {
      track.addEventListener("ended", () => {
        if (this.stream !== stream) return;
        this.stream = null;
        if (typeof this.onEnded === "function") this.onEnded();
      });
    }

    this.video.srcObject = stream;
    if (this.video.readyState < 1) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const err = new Error("Camera produced no frames");
          err.name = "NotReadableError";
          reject(err);
        }, 10000);
        this.video.addEventListener(
          "loadedmetadata",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true }
        );
      }).catch((err) => {
        this.assertCurrent(seq, null);
        this.stop();
        throw err;
      });
      this.assertCurrent(seq, null);
    }
    try {
      await this.video.play();
    } catch (err) {
      // Muted inline video normally autoplays; if not, the next user gesture resumes it.
      console.warn("[camera] video.play() was blocked:", err);
    }
    this.assertCurrent(seq, null);
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
  }

  setMirror(on) {
    this.mirror = !!on;
    this.video.classList.toggle("is-mirrored", this.mirror);
  }

  /**
   * Captures a clean (overlay-free) JPEG frame at the camera's native resolution.
   * When mirror is on the saved frame is flipped too, matching cv2.flip(frame, 1)
   * used by the inference pipeline.
   */
  capture(quality = 0.92) {
    if (!this.ready) return null;

    const w = this.width;
    const h = this.height;
    this.frameCanvas.width = w;
    this.frameCanvas.height = h;

    const ctx = this.frameCtx;
    ctx.save();
    if (this.mirror) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(this.video, 0, 0, w, h);
    ctx.restore();

    const image = this.frameCanvas.toDataURL("image/jpeg", quality);

    const tw = 160;
    const th = Math.max(1, Math.round((tw * h) / w));
    this.thumbCanvas.width = tw;
    this.thumbCanvas.height = th;
    this.thumbCtx.drawImage(this.frameCanvas, 0, 0, tw, th);
    const thumb = this.thumbCanvas.toDataURL("image/jpeg", 0.7);

    return { image, thumb, width: w, height: h };
  }
}

window.CameraController = CameraController;
