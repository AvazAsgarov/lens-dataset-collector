/**
 * Main Application Coordinator
 */
document.addEventListener("DOMContentLoaded", async () => {
  // DOM Elements
  const videoEl = document.getElementById("webcam-video");
  const canvasEl = document.getElementById("overlay-canvas");
  const flashEl = document.getElementById("flash-effect");
  const cameraSelect = document.getElementById("camera-select");

  const folderSelect = document.getElementById("user-folder-select");
  const btnRefreshFolders = document.getElementById("btn-refresh-folders");
  const newNameInput = document.getElementById("new-collector-name");

  const intervalSlider = document.getElementById("interval-slider");
  const intervalVal = document.getElementById("interval-val");
  const mirrorToggle = document.getElementById("mirror-toggle");
  const modeWizardRadio = document.getElementById("mode-wizard");
  const modeFreeRadio = document.getElementById("mode-free");

  const btnToggleAuto = document.getElementById("btn-toggle-auto");
  const btnSnap = document.getElementById("btn-snap");
  const statusBadge = document.getElementById("status-badge");
  const lightingBadge = document.getElementById("lighting-badge");

  const statCaptured = document.getElementById("stat-captured");
  const statUploaded = document.getElementById("stat-uploaded");
  const statQueue = document.getElementById("stat-queue");
  const uploadsList = document.getElementById("uploads-list");

  const wizardPanel = document.getElementById("wizard-panel");
  const scenarioTitle = document.getElementById("scenario-title");
  const scenarioDesc = document.getElementById("scenario-desc");
  const scenarioTip = document.getElementById("scenario-tip");
  const scenarioProgress = document.getElementById("scenario-progress");
  const scenarioProgressBar = document.getElementById("scenario-progress-bar");
  const btnPrevScenario = document.getElementById("btn-prev-scenario");
  const btnNextScenario = document.getElementById("btn-next-scenario");

  // State
  let isAutoRunning = false;
  let intervalSeconds = parseFloat(intervalSlider.value) || 3.0;
  let nextCaptureTime = 0;
  let totalCaptured = 0;

  // Instantiate Modules
  const camera = new CameraController(videoEl, canvasEl);
  const guidance = new GuidanceSystem(canvasEl, videoEl);
  const uploader = new DriveUploader();

  // Helper: Get currently active user / folder name
  function getActiveUserName() {
    if (folderSelect.value === "__NEW__") {
      return newNameInput.value.trim();
    }
    return folderSelect.value ? folderSelect.value.trim() : "";
  }

  // Load and populate Google Drive folders
  async function loadFolders() {
    btnRefreshFolders.classList.add("animate-spin");
    folderSelect.innerHTML = `<option value="" disabled selected>Qovluqlar yoxlanılır...</option>`;

    const savedName = localStorage.getItem("lens_collector_name") || "";
    const folders = await uploader.fetchFolders();

    folderSelect.innerHTML = "";

    // Default placeholder
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.disabled = true;
    defaultOpt.textContent = "-- Adınızı / Qovluğu seçin --";
    folderSelect.appendChild(defaultOpt);

    let matchFound = false;

    // Add existing folders from Drive
    folders.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f.name;
      opt.textContent = `📁 ${f.name}`;
      if (savedName && f.name.toLowerCase() === savedName.toLowerCase()) {
        opt.selected = true;
        matchFound = true;
      }
      folderSelect.appendChild(opt);
    });

    // Add "New user" option at bottom
    const newOpt = document.createElement("option");
    newOpt.value = "__NEW__";
    newOpt.textContent = "➕ Yeni əməkdaş əlavə et...";
    folderSelect.appendChild(newOpt);

    if (matchFound) {
      newNameInput.classList.add("hidden");
    } else if (savedName) {
      // Saved name exists locally but not in Drive yet
      folderSelect.value = "__NEW__";
      newNameInput.value = savedName;
      newNameInput.classList.remove("hidden");
    } else {
      defaultOpt.selected = true;
      newNameInput.classList.add("hidden");
    }

    btnRefreshFolders.classList.remove("animate-spin");
  }

  // Folder dropdown change handler
  folderSelect.addEventListener("change", () => {
    if (folderSelect.value === "__NEW__") {
      newNameInput.classList.remove("hidden");
      newNameInput.focus();
    } else {
      newNameInput.classList.add("hidden");
      localStorage.setItem("lens_collector_name", folderSelect.value);
    }
  });

  newNameInput.addEventListener("input", () => {
    localStorage.setItem("lens_collector_name", newNameInput.value.trim());
  });

  btnRefreshFolders.addEventListener("click", loadFolders);

  // Sound Synthesizer (Shutter Click) via Web Audio API
  let audioCtx = null;
  function playShutterSound() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(800, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, audioCtx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.09);
    } catch (e) {
      // Audio not permitted or supported; silent fallback
    }
  }

  // Trigger Flash Effect
  function triggerFlash() {
    flashEl.classList.add("active");
    setTimeout(() => flashEl.classList.remove("active"), 120);
  }

  // Capture Single Frame
  function captureFrame() {
    const userName = getActiveUserName();
    if (!userName) {
      alert("Zəhmət olmasa əvvəlcə adınızı və ya qovluğu seçin!");
      if (folderSelect.value === "__NEW__") {
        newNameInput.focus();
      } else {
        folderSelect.focus();
      }
      return;
    }

    const imageBase64 = camera.captureCleanFrame();
    if (!imageBase64) return;

    totalCaptured++;
    statCaptured.textContent = totalCaptured;

    triggerFlash();
    playShutterSound();

    guidance.recordCapture();
    updateScenarioUI();

    uploader.enqueue(userName, imageBase64);
  }

  // Uploader Progress Callback
  uploader.onProgress = (stats, recent) => {
    statUploaded.textContent = stats.uploaded;
    statQueue.textContent = stats.queueLength;

    uploadsList.innerHTML = recent
      .map(
        (item) => `
        <div class="flex items-center gap-3 p-2 bg-slate-800/60 rounded-lg border border-slate-700/50 text-xs">
          <img src="${item.thumb}" class="w-10 h-10 object-cover rounded border border-slate-600" />
          <div class="flex-1 truncate">
            <div class="font-medium text-slate-200 truncate">${item.fileName}</div>
            <div class="text-slate-400">${item.time}</div>
          </div>
          <div>
            ${
              item.status === "success"
                ? '<span class="text-emerald-400 font-bold">Drive-da ✓</span>'
                : item.status === "uploading"
                ? '<span class="text-blue-400 animate-pulse">Yüklənir...</span>'
                : item.status === "failed"
                ? '<span class="text-rose-400">Xəta ✗</span>'
                : '<span class="text-amber-400">Növbədə</span>'
            }
          </div>
        </div>
      `
      )
      .join("");
  };

  // Auto-capture Loop
  function startAutoCapture() {
    const userName = getActiveUserName();
    if (!userName) {
      alert("Zəhmət olmasa əvvəlcə adınızı və ya qovluğu seçin!");
      if (folderSelect.value === "__NEW__") {
        newNameInput.focus();
      } else {
        folderSelect.focus();
      }
      return;
    }
    isAutoRunning = true;
    nextCaptureTime = performance.now() + intervalSeconds * 1000;
    updateStatusUI();
  }

  function stopAutoCapture() {
    isAutoRunning = false;
    updateStatusUI();
  }

  function toggleAutoCapture() {
    if (isAutoRunning) {
      stopAutoCapture();
    } else {
      startAutoCapture();
    }
  }

  function updateStatusUI() {
    if (isAutoRunning) {
      btnToggleAuto.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        Fasilə (Pause)
      `;
      btnToggleAuto.className = "btn btn-danger";
      statusBadge.className = "badge badge-rec";
      statusBadge.textContent = "REC: Avtomatik Aktiv";
    } else {
      btnToggleAuto.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        Başlat (Start)
      `;
      btnToggleAuto.className = "btn btn-primary";
      statusBadge.className = "badge badge-paused";
      statusBadge.textContent = "Gözləmədə (PAUSED)";
    }
  }

  // Scenario UI Update
  function updateScenarioUI() {
    const cur = guidance.getCurrentScenario();
    const count = guidance.getCurrentStepCount();
    const percent = Math.min(100, Math.round((count / cur.target) * 100));

    scenarioTitle.textContent = cur.title;
    scenarioDesc.textContent = cur.desc;
    scenarioTip.textContent = cur.tip;
    scenarioProgress.textContent = `${count} / ${cur.target}`;
    scenarioProgressBar.style.width = `${percent}%`;

    btnPrevScenario.disabled = guidance.currentScenarioIndex === 0;
    btnNextScenario.disabled =
      guidance.currentScenarioIndex === guidance.scenarios.length - 1;
  }

  btnPrevScenario.addEventListener("click", () => {
    guidance.prevScenario();
    updateScenarioUI();
  });

  btnNextScenario.addEventListener("click", () => {
    guidance.nextScenario();
    updateScenarioUI();
  });

  modeWizardRadio.addEventListener("change", () => {
    guidance.isWizardMode = true;
    wizardPanel.classList.remove("hidden");
    updateScenarioUI();
  });

  modeFreeRadio.addEventListener("change", () => {
    guidance.isWizardMode = false;
    wizardPanel.classList.add("hidden");
  });

  // Interval Slider
  intervalSlider.addEventListener("input", (e) => {
    intervalSeconds = parseFloat(e.target.value);
    intervalVal.textContent = intervalSeconds.toFixed(1) + "s";
  });

  // Mirror Toggle
  mirrorToggle.addEventListener("change", (e) => {
    camera.setMirror(e.target.checked);
  });

  // Camera Selector
  cameraSelect.addEventListener("change", async (e) => {
    await camera.startCamera(e.target.value);
  });

  // Controls click
  btnToggleAuto.addEventListener("click", toggleAutoCapture);
  btnSnap.addEventListener("click", () => {
    captureFrame();
  });

  // Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;

    if (e.code === "Space") {
      e.preventDefault();
      toggleAutoCapture();
    } else if (e.code === "KeyC" || e.code === "Enter") {
      e.preventDefault();
      captureFrame();
    } else if (e.code === "KeyW" || e.code === "ArrowUp") {
      e.preventDefault();
      intervalSeconds = Math.min(10.0, intervalSeconds + 0.5);
      intervalSlider.value = intervalSeconds;
      intervalVal.textContent = intervalSeconds.toFixed(1) + "s";
    } else if (e.code === "KeyS" || e.code === "ArrowDown") {
      e.preventDefault();
      intervalSeconds = Math.max(0.5, intervalSeconds - 0.5);
      intervalSlider.value = intervalSeconds;
      intervalVal.textContent = intervalSeconds.toFixed(1) + "s";
    } else if (e.code === "KeyM") {
      e.preventDefault();
      mirrorToggle.checked = !mirrorToggle.checked;
      camera.setMirror(mirrorToggle.checked);
    }
  });

  // Animation & Analysis Loop
  let lastLightCheck = 0;
  function animationLoop(timestamp) {
    guidance.renderOverlay();

    // Check lighting every 250ms
    if (timestamp - lastLightCheck > 250) {
      lastLightCheck = timestamp;
      const light = guidance.analyzeLighting();
      if (light.status === "good") {
        lightingBadge.className = "badge badge-good";
        lightingBadge.innerHTML = `✓ ${light.message}`;
      } else if (light.status === "too_dark") {
        lightingBadge.className = "badge badge-warning";
        lightingBadge.innerHTML = `⚠️ ${light.message}`;
      } else {
        lightingBadge.className = "badge badge-danger";
        lightingBadge.innerHTML = `⚠️ ${light.message}`;
      }
    }

    // Auto-capture timer
    if (isAutoRunning) {
      const remainingMs = Math.max(0, nextCaptureTime - timestamp);
      statusBadge.textContent = `REC: ${(remainingMs / 1000).toFixed(1)}s`;

      if (remainingMs <= 0) {
        captureFrame();
        nextCaptureTime = timestamp + intervalSeconds * 1000;
      }
    }

    requestAnimationFrame(animationLoop);
  }

  // Start Camera, Folder List, and UI
  try {
    await camera.startCamera();
    const devices = await camera.getDevices();
    cameraSelect.innerHTML = devices
      .map(
        (d, idx) =>
          `<option value="${d.deviceId}">${d.label || "Kamera " + (idx + 1)}</option>`
      )
      .join("");

    updateScenarioUI();
    updateStatusUI();
    loadFolders(); // Fetch existing Drive folders
    requestAnimationFrame(animationLoop);
  } catch (err) {
    alert("Kameraya çıxış əldə olunmadı. Zəhmət olmasa brauzerdə kamera icazəsi verin!");
  }
});
