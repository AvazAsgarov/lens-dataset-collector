/**
 * Guidance & Lighting Analysis Module
 * Analyzes video stream luminance and renders framing guidelines & scenario wizard.
 */
class GuidanceSystem {
  constructor(canvasElement, videoElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext("2d");
    this.video = videoElement;
    this.sampleCanvas = document.createElement("canvas");
    this.sampleCtx = this.sampleCanvas.getContext("2d", { willReadFrequently: true });

    this.sampleCanvas.width = 64;
    this.sampleCanvas.height = 36;

    this.lightingState = {
      level: 128,
      status: "good",
      message: "İşıq analizi aparılır...",
    };

    this.scenarios = [
      {
        id: 1,
        title: "Ssenari 1: Ekrana Paralel və Düz",
        desc: "Telefonu göz səviyyəsində, ekrana və veb-kameraya düz paralel tutun.",
        tip: "Telefonun ön və arxa üzünü növbə ilə sınayın.",
        target: 10,
      },
      {
        id: 2,
        title: "Ssenari 2: Müxtəlif Bucaqlar və Maililik",
        desc: "Telefonu 30-45 dərəcə sağa, sola, yuxarı və ya aşağı maili tutun.",
        tip: "Model üçün bucaq altında telefonun görünüşü çox vacibdir.",
        target: 10,
      },
      {
        id: 3,
        title: "Ssenari 3: Yaxın və Uzaq Məsafələr",
        desc: "Məsafəni dəyişin: gah 20-30 sm çox yaxınlaşdırın, gah 1 metr uzaqlaşdırın.",
        tip: "Ekranın fərqli hissələrindən çəkirmiş kimi tutun.",
        target: 10,
      },
      {
        id: 4,
        title: "Ssenari 4: Fərqli Tutuş və Əllər",
        desc: "Telefonu gah sol, gah sağ, gah da hər iki əllə tutun.",
        tip: "Barmaqlarınızla kameranı və ya çərçivəni qismən örtə bilərsiniz.",
        target: 10,
      },
      {
        id: 5,
        title: "Ssenari 5: Qarışıq və Əşyalı Mühit",
        desc: "Telefonla yanaşı masada fincan, qələm, qulaqlıq tutaraq sınayın.",
        tip: "Həmçinin telefonu masaya qoyub ekranını göstərə bilərsiniz.",
        target: 15,
      },
    ];

    this.currentScenarioIndex = 0;
    this.scenarioCounts = [0, 0, 0, 0, 0];
    this.isWizardMode = true;
  }

  getCurrentScenario() {
    return this.scenarios[this.currentScenarioIndex];
  }

  getCurrentStepCount() {
    return this.scenarioCounts[this.currentScenarioIndex] || 0;
  }

  recordCapture() {
    this.scenarioCounts[this.currentScenarioIndex] =
      (this.scenarioCounts[this.currentScenarioIndex] || 0) + 1;

    const current = this.getCurrentScenario();
    if (this.isWizardMode && this.scenarioCounts[this.currentScenarioIndex] >= current.target) {
      if (this.currentScenarioIndex < this.scenarios.length - 1) {
        this.currentScenarioIndex++;
      }
    }
  }

  nextScenario() {
    if (this.currentScenarioIndex < this.scenarios.length - 1) {
      this.currentScenarioIndex++;
    }
  }

  prevScenario() {
    if (this.currentScenarioIndex > 0) {
      this.currentScenarioIndex--;
    }
  }

  analyzeLighting() {
    if (!this.video || this.video.readyState < 2) return this.lightingState;

    this.sampleCtx.drawImage(this.video, 0, 0, 64, 36);
    const imgData = this.sampleCtx.getImageData(16, 9, 32, 18);
    const data = imgData.data;

    let totalLum = 0;
    const pixelCount = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      totalLum += 0.299 * r + 0.587 * g + 0.114 * b;
    }

    const avgLum = Math.round(totalLum / pixelCount);
    let status = "good";
    let message = "İşıqlandırma idealdır";

    if (avgLum < 55) {
      status = "too_dark";
      message = "İşıq zəifdir - Otaq işığını yandırın";
    } else if (avgLum > 215) {
      status = "too_bright";
      message = "Çox parlaqdır - Parıltı yaranır";
    }

    this.lightingState = { level: avgLum, status, message };
    return this.lightingState;
  }

  renderOverlay() {
    if (!this.canvas || !this.video) return;

    const w = this.canvas.width = this.video.clientWidth || 960;
    const h = this.canvas.height = this.video.clientHeight || 540;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, w, h);

    // Bounding Box Viewfinder in center
    const boxW = Math.round(w * 0.45);
    const boxH = Math.round(h * 0.65);
    const boxX = Math.round((w - boxW) / 2);
    const boxY = Math.round((h - boxH) / 2);

    // Corner guides
    const cornerSize = 24;
    const cornerThickness = 3;

    ctx.strokeStyle = "rgba(59, 130, 246, 0.7)";
    ctx.lineWidth = cornerThickness;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(boxX, boxY + cornerSize);
    ctx.lineTo(boxX, boxY);
    ctx.lineTo(boxX + cornerSize, boxY);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(boxX + boxW - cornerSize, boxY);
    ctx.lineTo(boxX + boxW, boxY);
    ctx.lineTo(boxX + boxW, boxY + cornerSize);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(boxX, boxY + boxH - cornerSize);
    ctx.lineTo(boxX, boxY + boxH);
    ctx.lineTo(boxX + cornerSize, boxY + boxH);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(boxX + boxW - cornerSize, boxY + boxH);
    ctx.lineTo(boxX + boxW, boxY + boxH);
    ctx.lineTo(boxX + boxW, boxY + boxH - cornerSize);
    ctx.stroke();

    // Center subtle crosshair
    const midX = w / 2;
    const midY = h / 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(midX - 15, midY);
    ctx.lineTo(midX + 15, midY);
    ctx.moveTo(midX, midY - 15);
    ctx.lineTo(midX, midY + 15);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

window.GuidanceSystem = GuidanceSystem;
