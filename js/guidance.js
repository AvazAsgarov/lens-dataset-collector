/**
 * Guidance module — capture scenarios (progress kept per person + class),
 * lighting analysis and the viewfinder overlay.
 */
class GuidanceSystem {
  constructor(videoElement, canvasElement) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext("2d");

    this.sampleCanvas = document.createElement("canvas");
    this.sampleCanvas.width = 64;
    this.sampleCanvas.height = 36;
    this.sampleCtx = this.sampleCanvas.getContext("2d", { willReadFrequently: true });

    this.lighting = { level: null, status: "unknown" };

    this.scenarios = [
      {
        id: 1,
        title: "Düz və paralel",
        desc: "Obyekti kameraya qarşı düz, paralel tutun. Kadrın mərkəzindən başlayın.",
        tip: "Obyektin ön və arxa tərəfini növbə ilə göstərin.",
        target: 10,
      },
      {
        id: 2,
        title: "Müxtəlif bucaqlar",
        desc: "Obyekti 30–45° sağa, sola, yuxarı və aşağı əyərək tutun.",
        tip: "Real şəraitdə obyektlər nadir hallarda tam düz görünür — bucaqlar model üçün vacibdir.",
        target: 10,
      },
      {
        id: 3,
        title: "Yaxın və uzaq",
        desc: "Məsafəni dəyişin: 20–30 sm-dən başlayıb təxminən 1 metrə qədər uzaqlaşın.",
        tip: "Obyekti kadrın künclərinə və kənarlarına da yerləşdirin.",
        target: 10,
      },
      {
        id: 4,
        title: "Fərqli tutuş",
        desc: "Obyekti sol əllə, sağ əllə və iki əllə tutun.",
        tip: "Barmaqların obyektin bir hissəsini örtməsi normaldır və model üçün faydalıdır.",
        target: 10,
      },
      {
        id: 5,
        title: "Qarışıq mühit",
        desc: "Masada başqa əşyalar (fincan, qələm, qulaqlıq) olarkən çəkin.",
        tip: "Obyekti masaya da qoyun və fonu dəyişərək çəkin.",
        target: 15,
      },
    ];

    this.storageKey = "lens.progress.v2";
    this.progress = LensUtils.store.get(this.storageKey, {}) || {};
    this.key = "";
    this.index = 0;
    this.counts = this.scenarios.map(() => 0);
    this.mode = "wizard"; // "wizard" | "free"

    this.overlaySize = "";
  }

  /* ---------- Scenario progress ---------- */

  setKey(key) {
    if (key === this.key) return;
    this.key = key;
    const saved = key ? this.progress[key] : null;
    this.counts = this.scenarios.map((_, i) => (saved && Number(saved.counts && saved.counts[i])) || 0);
    this.index = saved ? Math.min(Math.max(0, Number(saved.index) || 0), this.scenarios.length - 1) : 0;
  }

  save() {
    if (!this.key) return;
    this.progress[this.key] = { counts: this.counts.slice(), index: this.index, updatedAt: Date.now() };
    LensUtils.store.set(this.storageKey, this.progress);
  }

  get current() {
    return this.scenarios[this.index];
  }

  get currentCount() {
    return this.counts[this.index] || 0;
  }

  isComplete(i) {
    return (this.counts[i] || 0) >= this.scenarios[i].target;
  }

  get allComplete() {
    return this.scenarios.every((_, i) => this.isComplete(i));
  }

  get totalDone() {
    return this.scenarios.reduce((sum, s, i) => sum + Math.min(this.counts[i] || 0, s.target), 0);
  }

  get totalTarget() {
    return this.scenarios.reduce((sum, s) => sum + s.target, 0);
  }

  /**
   * Counts a capture for the active scenario (wizard mode only).
   * Returns "advanced" | "finished" | null.
   */
  record() {
    if (this.mode !== "wizard") return null;
    const wasComplete = this.allComplete;
    const stepWasComplete = this.isComplete(this.index);
    this.counts[this.index] = (this.counts[this.index] || 0) + 1;

    // Advance only on the capture that completes the step — a user who went back to a
    // finished step to add more frames stays there.
    let result = null;
    if (!stepWasComplete && this.isComplete(this.index)) {
      const next = this.nextIncomplete();
      if (next !== -1 && next !== this.index) {
        this.index = next;
        result = "advanced";
      } else if (!wasComplete && this.allComplete) {
        result = "finished";
      }
    }
    this.save();
    return result;
  }

  nextIncomplete() {
    const n = this.scenarios.length;
    for (let step = 1; step <= n; step++) {
      const i = (this.index + step) % n;
      if (!this.isComplete(i)) return i;
    }
    return -1;
  }

  go(i) {
    this.index = Math.min(Math.max(0, i), this.scenarios.length - 1);
    this.save();
  }

  reset() {
    this.counts = this.scenarios.map(() => 0);
    this.index = 0;
    this.save();
  }

  /* ---------- Lighting ---------- */

  analyzeLighting() {
    if (!this.video || this.video.readyState < 2) return this.lighting;

    this.sampleCtx.drawImage(this.video, 0, 0, 64, 36);
    // Centre region, where the object usually is.
    const data = this.sampleCtx.getImageData(16, 9, 32, 18).data;
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    const level = Math.round(total / (data.length / 4));

    let status = "good";
    if (level < 55) status = "too_dark";
    else if (level > 215) status = "too_bright";

    this.lighting = { level, status };
    return this.lighting;
  }

  /* ---------- Overlay (rule-of-thirds + corner marks) ---------- */

  renderOverlay() {
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (!cssW || !cssH || !vw || !vh) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = `${cssW}x${cssH}@${dpr}:${vw}x${vh}`;
    if (size === this.overlaySize) return; // static overlay — redraw only when geometry changes
    this.overlaySize = size;

    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    // Area actually covered by the video (object-fit: contain).
    const scale = Math.min(cssW / vw, cssH / vh);
    const w = vw * scale;
    const h = vh * scale;
    const x = (cssW - w) / 2;
    const y = (cssH - h) / 2;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 3; i++) {
      const gx = Math.round(x + (w * i) / 3) + 0.5;
      const gy = Math.round(y + (h * i) / 3) + 0.5;
      ctx.moveTo(gx, y);
      ctx.lineTo(gx, y + h);
      ctx.moveTo(x, gy);
      ctx.lineTo(x + w, gy);
    }
    ctx.stroke();

    const inset = Math.max(12, Math.round(Math.min(w, h) * 0.04));
    const len = Math.max(14, Math.round(Math.min(w, h) * 0.05));
    const l = x + inset;
    const r = x + w - inset;
    const t = y + inset;
    const b = y + h - inset;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(l, t + len); ctx.lineTo(l, t); ctx.lineTo(l + len, t);
    ctx.moveTo(r - len, t); ctx.lineTo(r, t); ctx.lineTo(r, t + len);
    ctx.moveTo(l, b - len); ctx.lineTo(l, b); ctx.lineTo(l + len, b);
    ctx.moveTo(r - len, b); ctx.lineTo(r, b); ctx.lineTo(r, b - len);
    ctx.stroke();

    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy);
    ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8);
    ctx.stroke();
  }

  invalidateOverlay() {
    this.overlaySize = "";
  }
}

window.GuidanceSystem = GuidanceSystem;
