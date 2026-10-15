/**
 * Camera module - WebRTC webcam capture, device switching, and clean frame extraction.
 */
class CameraController {
  constructor(videoElement, canvasElement) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.stream = null;
    this.isMirror = true;
    this.currentDeviceId = null;
    this.offscreenCanvas = document.createElement("canvas");
    this.offscreenCtx = this.offscreenCanvas.getContext("2d");
  }

  async getDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === "videoinput");
    } catch (err) {
      console.error("Kamera siyahısı alına bilmədi:", err);
      return [];
    }
  }

  async startCamera(deviceId = null) {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
    }

    const constraints = {
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30 },
      },
      audio: false,
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;
      await this.video.play();
      this.currentDeviceId = deviceId;
      this.updateMirrorClass();
      return true;
    } catch (err) {
      console.error("Kamera açıla bilmədi:", err);
      throw err;
    }
  }

  setMirror(mirror) {
    this.isMirror = mirror;
    this.updateMirrorClass();
  }

  updateMirrorClass() {
    if (this.isMirror) {
      this.video.classList.add("mirror");
    } else {
      this.video.classList.remove("mirror");
    }
  }

  /**
   * Captures a clean, unannotated JPEG image frame from the video stream.
   * If mirror is true, horizontal flip is applied to match training domain (cv2.flip(frame, 1)).
   */
  captureCleanFrame(quality = 0.92) {
    if (!this.video || this.video.readyState < 2) {
      return null;
    }

    const w = this.video.videoWidth || 1280;
    const h = this.video.videoHeight || 720;

    this.offscreenCanvas.width = w;
    this.offscreenCanvas.height = h;

    this.offscreenCtx.save();
    if (this.isMirror) {
      this.offscreenCtx.translate(w, 0);
      this.offscreenCtx.scale(-1, 1);
    }
    this.offscreenCtx.drawImage(this.video, 0, 0, w, h);
    this.offscreenCtx.restore();

    return this.offscreenCanvas.toDataURL("image/jpeg", quality);
  }
}

window.CameraController = CameraController;
