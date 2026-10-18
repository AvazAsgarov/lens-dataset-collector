/**
 * Main application coordinator.
 */
(function () {
  "use strict";

  const ENDPOINT =
    "https://script.google.com/macros/s/AKfycbyFU3KixOVpS9I3Iz1w_PiV47tRwiernHbNyOuYSBSo_yILrw_ce6YmDssAfGUlhUak/exec";
  const DRIVE_FILE_URL = "https://drive.google.com/file/d/";
  const MAX_BACKLOG = 40; // frames held in memory before auto-capture pauses
  const INTERVAL_MIN = 0.5;
  const INTERVAL_MAX = 10;
  const INTERVAL_STEP = 0.5;
  const LIGHT_CHECK_MS = 300;

  const U = window.LensUtils;
  const $ = (id) => document.getElementById(id);

  const el = {
    viewport: $("viewport"),
    video: $("webcam-video"),
    overlay: $("overlay-canvas"),
    flash: $("flash-effect"),
    statusBadge: $("status-badge"),
    statusText: $("status-text"),
    lightingBadge: $("lighting-badge"),
    lightingText: $("lighting-text"),
    hudPath: $("hud-path"),
    resolution: $("resolution-label"),
    countdownBar: $("countdown-bar"),
    camMessageIcon: $("camera-message-icon"),
    camMessageTitle: $("camera-message-title"),
    camMessageText: $("camera-message-text"),
    btnCameraRetry: $("btn-camera-retry"),

    btnToggle: $("btn-toggle-auto"),
    btnToggleLabel: $("btn-toggle-label"),
    btnSnap: $("btn-snap"),
    btnIntervalDown: $("btn-interval-down"),
    btnIntervalUp: $("btn-interval-up"),
    intervalVal: $("interval-val"),
    mirrorToggle: $("mirror-toggle"),
    cameraSelect: $("camera-select"),

    driveStatus: $("drive-status"),
    driveStatusLabel: $("drive-status-label"),

    userInput: $("user-input"),
    userList: $("user-list"),
    userHint: $("user-hint"),
    classInput: $("class-input"),
    classList: $("class-list"),
    classHint: $("class-hint"),
    classChips: $("class-chips"),
    destPath: $("dest-path"),

    modeWizard: $("mode-wizard"),
    modeFree: $("mode-free"),
    wizardBody: $("wizard-body"),
    freeNote: $("free-note"),
    steps: $("scenario-steps"),
    scenarioStep: $("scenario-step"),
    scenarioTotal: $("scenario-total"),
    scenarioTitle: $("scenario-title"),
    scenarioDesc: $("scenario-desc"),
    scenarioTip: $("scenario-tip"),
    scenarioProgress: $("scenario-progress"),
    scenarioDone: $("scenario-done"),
    btnPrevScenario: $("btn-prev-scenario"),
    btnNextScenario: $("btn-next-scenario"),
    btnResetProgress: $("btn-reset-progress"),

    statCaptured: $("stat-captured"),
    statUploaded: $("stat-uploaded"),
    statQueue: $("stat-queue"),
    statFailed: $("stat-failed"),
    uploadsList: $("uploads-list"),
    uploadsEmpty: $("uploads-empty"),
    btnRetryAll: $("btn-retry-all"),

    toasts: $("toast-region"),
  };

  const camera = new CameraController(el.video);
  const guidance = new GuidanceSystem(el.video, el.overlay);
  const uploader = new DriveUploader(ENDPOINT, { concurrency: 3 });

  const state = {
    user: "",
    cls: "",
    running: false,
    cycleStart: 0,
    nextAt: 0,
    interval: clampInterval(Number(U.store.get("lens.interval", 3))),
    captured: 0,
    tree: { users: [] },
    uploadedPairs: [], // [userName, className] uploaded in this session
    driveState: "loading",
    lastLightStatus: "",
    lastLightCheck: 0,
  };

  /* ======================================================================
     Icons & toasts
     ====================================================================== */

  function icon(name, extraClass = "") {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", `icon ${extraClass}`.trim());
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(ns, "use");
    use.setAttribute("href", `#i-${name}`);
    svg.append(use);
    return svg;
  }

  const TOAST_ICONS = { info: "info", success: "check", warn: "alert", error: "alert" };

  function toast(message, tone = "info", timeout = 4200) {
    const existing = Array.from(el.toasts.children).find((t) => t.dataset.message === message);
    if (existing) {
      clearTimeout(existing._timer);
      existing._timer = setTimeout(() => dismissToast(existing), timeout);
      return;
    }

    const node = document.createElement("div");
    node.className = "toast";
    node.dataset.tone = tone;
    node.dataset.message = message;
    node.setAttribute("role", tone === "error" ? "alert" : "status");
    const text = document.createElement("span");
    text.textContent = message;
    node.append(icon(TOAST_ICONS[tone] || "info", "icon--sm"), text);
    el.toasts.append(node);

    while (el.toasts.children.length > 3) el.toasts.firstElementChild.remove();
    node._timer = setTimeout(() => dismissToast(node), timeout);
  }

  function dismissToast(node) {
    if (!node.isConnected) return;
    node.classList.add("is-leaving");
    node.addEventListener("animationend", () => node.remove(), { once: true });
    setTimeout(() => node.remove(), 400);
  }

  /* ======================================================================
     Drive tree (people → classes)
     ====================================================================== */

  function findUser(name) {
    return name ? state.tree.users.find((u) => U.sameName(u.name, name)) : null;
  }

  function userNames() {
    return state.tree.users.map((u) => u.name).sort(U.compareNames);
  }

  function classesOf(name) {
    const user = findUser(name);
    return user ? user.classes.slice().sort(U.compareNames) : [];
  }

  function allClasses() {
    const seen = new Map();
    state.tree.users.forEach((u) =>
      u.classes.forEach((c) => {
        const key = c.toLowerCase();
        seen.set(key, (seen.get(key) || { name: c, count: 0 }));
        seen.get(key).count++;
      })
    );
    return Array.from(seen.values());
  }

  // Classes for suggestions: this person's first, then everyone else's by popularity.
  function classSuggestions() {
    const mine = classesOf(state.user);
    const mineKeys = new Set(mine.map((c) => c.toLowerCase()));
    const others = allClasses()
      .filter((c) => !mineKeys.has(c.name.toLowerCase()))
      .sort((a, b) => b.count - a.count || U.compareNames(a.name, b.name))
      .map((c) => c.name);
    return mine.concat(others);
  }

  // Reflect a successful upload locally so suggestions update without a refetch.
  function rememberInTree(userName, className) {
    if (!state.uploadedPairs.some(([u, c]) => U.sameName(u, userName) && U.sameName(c, className))) {
      state.uploadedPairs.push([userName, className]);
    }
    addToTree(userName, className);
  }

  function addToTree(userName, className) {
    let user = findUser(userName);
    if (!user) {
      user = { name: userName, classes: [] };
      state.tree.users.push(user);
    }
    if (className && !user.classes.some((c) => U.sameName(c, className))) {
      user.classes.push(className);
    }
  }

  async function loadTree({ fresh = false, silent = false } = {}) {
    setDriveState("loading");
    try {
      const tree = await uploader.fetchTree({ fresh });
      if (tree.version < 2) {
        console.warn("[app] Drive backend is API v1 — class sub-folders will not be created. Redeploy google_drive_script.js.");
      }
      state.tree = tree;
      // The backend caches the tree briefly — re-apply folders this session has just uploaded into.
      state.uploadedPairs.forEach(([userName, className]) => addToTree(userName, className));
      setDriveState("online");
    } catch (err) {
      console.warn("[app] folder tree failed:", err);
      setDriveState("offline");
      if (!silent) {
        toast("Google Drive ilə əlaqə qurulmadı. Şəkillər növbədə saxlanılır və bağlantı bərpa olunanda yüklənəcək.", "error", 6500);
      }
    }
    syncTarget();
    // Show the canonical spelling of an existing folder (e.g. "leyla" → "Leyla").
    if (document.activeElement !== el.userInput) userCombo.setValue(state.user);
    if (document.activeElement !== el.classInput) classCombo.setValue(state.cls);
    userCombo.refresh();
    classCombo.refresh();
  }

  function setDriveState(next) {
    state.driveState = next;
    el.driveStatus.dataset.state = next;
    const labels = {
      loading: "Drive yoxlanılır",
      online: "Drive qoşulub",
      offline: "Drive əlçatan deyil",
    };
    el.driveStatusLabel.textContent = labels[next];
    el.driveStatus.title =
      next === "offline" ? "Bağlantını yenidən yoxla" : "Qovluq siyahısını Drive-dan yenilə";
    el.driveStatus.setAttribute("aria-label", `${labels[next]}. Yeniləmək üçün klikləyin.`);
  }

  /* ======================================================================
     Name + class inputs
     ====================================================================== */

  const userCombo = new Combobox({
    input: el.userInput,
    list: el.userList,
    source: userNames,
    describe: (name) => {
      const n = classesOf(name).length;
      return n ? `${n} sinif` : "";
    },
    onInput: () => syncTarget(),
    onCommit: () => commitUser(),
    onEnter: () => {
      if (!state.cls) el.classInput.focus();
      else el.userInput.blur();
    },
  });

  const classCombo = new Combobox({
    input: el.classInput,
    list: el.classList,
    source: classSuggestions,
    describe: (cls) => (classesOf(state.user).some((c) => U.sameName(c, cls)) ? "sizdə var" : ""),
    onInput: () => syncTarget(),
    onCommit: () => commitClass(),
    onEnter: () => el.classInput.blur(),
  });

  function commitUser() {
    syncTarget();
    userCombo.setValue(state.user);
    U.store.set("lens.user", state.user);
    clearFieldError(el.userInput);
    renderSetup();
  }

  function commitClass() {
    syncTarget();
    classCombo.setValue(state.cls);
    U.store.set("lens.class", state.cls);
    clearFieldError(el.classInput);
    renderSetup();
  }

  // Derives the normalised person/class from the inputs (live, while typing).
  function syncTarget() {
    const rawUser = U.normalizeName(el.userInput.value);
    const existing = findUser(rawUser);
    state.user = existing ? existing.name : rawUser;

    const rawClass = U.normalizeClass(el.classInput.value);
    const existingClass = classSuggestions().find((c) => U.sameName(c, rawClass));
    state.cls = existingClass || rawClass;

    if (state.user) clearFieldError(el.userInput);
    if (state.cls) clearFieldError(el.classInput);

    guidance.setKey(state.user && state.cls ? `${state.user.toLowerCase()}|${state.cls.toLowerCase()}` : "");

    if (state.running && (!state.user || !state.cls)) {
      stopAuto("Ad və ya sinif silindiyi üçün avtomatik çəkiliş dayandırıldı.");
    }
    renderSetup();
    renderScenario();
  }

  function setHint(node, parts, tone) {
    node.replaceChildren(...parts);
    if (tone) node.dataset.tone = tone;
    else delete node.dataset.tone;
  }

  function tag(text, variant) {
    const span = document.createElement("span");
    span.className = `tag tag--${variant}`;
    span.textContent = text;
    return span;
  }

  function code(text) {
    const c = document.createElement("code");
    c.textContent = text;
    return c;
  }

  function renderSetup() {
    // Person hint
    if (el.userInput.getAttribute("aria-invalid") !== "true") {
      if (!state.user) {
        setHint(el.userHint, ["Siyahıdan adınızı seçin və ya yenisini yazın."]);
      } else if (findUser(state.user)) {
        setHint(el.userHint, [tag("Mövcud qovluq", "green"), `${classesOf(state.user).length} sinif qovluğu var`]);
      } else {
        setHint(el.userHint, [tag("Yeni", "blue"), "İlk şəkillə yeni qovluq yaradılacaq"]);
      }
    }

    // Class hint
    if (el.classInput.getAttribute("aria-invalid") !== "true") {
      const typed = el.classInput.value.trim();
      if (!state.cls) {
        setHint(el.classHint, ["Şəkildə nə olduğunu yazın: mouse, notebook, phone…"]);
      } else {
        const parts = [];
        if (classesOf(state.user).some((c) => U.sameName(c, state.cls))) parts.push(tag("Mövcud alt qovluq", "green"));
        else parts.push(tag("Yeni", "blue"), "alt qovluq yaradılacaq");
        if (typed && typed !== state.cls) parts.push("·", code(state.cls), "kimi saxlanacaq");
        setHint(el.classHint, parts);
      }
    }

    renderChips();
    renderDestination();
    renderControls();
  }

  function renderChips() {
    const mine = classesOf(state.user);
    const list = (mine.length ? mine : classSuggestions()).slice(0, 10);
    if (!list.length) {
      el.classChips.hidden = true;
      el.classChips.replaceChildren();
      return;
    }
    el.classChips.hidden = false;
    el.classChips.setAttribute("aria-label", mine.length ? "Sizin siniflər" : "Komandanın sinifləri");
    el.classChips.replaceChildren(
      ...list.map((cls) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chip";
        b.textContent = cls;
        b.title = `Sinif: ${cls}`;
        b.setAttribute("aria-pressed", String(U.sameName(cls, state.cls)));
        b.addEventListener("click", () => {
          classCombo.setValue(cls);
          syncTarget();
          commitClass();
        });
        return b;
      })
    );
  }

  function renderDestination() {
    const sep = () => {
      const s = document.createElement("span");
      s.className = "dest__sep";
      s.textContent = "/";
      return s;
    };
    const seg = (value, placeholder) => {
      const s = document.createElement("span");
      if (value) s.textContent = value;
      else {
        s.className = "dest__empty";
        s.textContent = placeholder;
      }
      return s;
    };
    el.destPath.replaceChildren(
      document.createTextNode("Drive"),
      sep(),
      seg(state.user, "ad"),
      sep(),
      seg(state.cls, "sinif"),
      sep()
    );
    el.hudPath.textContent = state.user && state.cls ? `${state.user} / ${state.cls}` : "Ad və sinif seçilməyib";
  }

  function showFieldError(input, message) {
    const hint = input === el.userInput ? el.userHint : el.classHint;
    input.setAttribute("aria-invalid", "true");
    setHint(hint, [message], "error");
    input.focus();
  }

  function clearFieldError(input) {
    if (input.getAttribute("aria-invalid") !== "true") return;
    input.removeAttribute("aria-invalid");
    renderSetup();
  }

  function validateTarget() {
    if (!state.user) {
      showFieldError(el.userInput, "Əvvəlcə adınızı daxil edin.");
      toast("Əvvəlcə adınızı daxil edin.", "warn");
      return false;
    }
    if (!state.cls) {
      showFieldError(el.classInput, "Obyektin sinfini daxil edin, məsələn mouse.");
      toast("Obyektin sinfini daxil edin (məs. mouse, notebook).", "warn");
      return false;
    }
    return true;
  }

  /* ======================================================================
     Capture
     ====================================================================== */

  let audioCtx = null;
  function playShutter() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(900, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.07);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.09);
    } catch (err) {
      /* audio not available */
    }
  }

  function flash() {
    el.flash.classList.remove("is-active");
    void el.flash.offsetWidth; // restart the animation
    el.flash.classList.add("is-active");
  }

  function currentCameraLabel() {
    const opt = el.cameraSelect.selectedOptions[0];
    return opt ? opt.textContent : "";
  }

  function capture() {
    if (!camera.ready) {
      toast("Kamera hazır deyil.", "error");
      return false;
    }
    if (!validateTarget()) return false;
    if (uploader.backlog >= MAX_BACKLOG) {
      toast(`Yüklənməmiş ${uploader.backlog} kadr var. İnterneti yoxlayın — növbə boşalanda davam edin.`, "error", 6500);
      return false;
    }

    const shot = camera.capture();
    if (!shot) {
      toast("Kadr alınmadı — kamera hələ hazır deyil.", "error");
      return false;
    }

    const now = new Date();
    const fileName = `${U.fileSafe(state.cls)}_${U.fileSafe(state.user)}_${U.fileStamp(now)}_${U.randomId(4)}.jpg`;
    uploader.enqueue({
      userName: state.user,
      className: state.cls,
      fileName,
      image: shot.image,
      thumb: shot.thumb,
      meta: {
        capturedAt: now.toISOString(),
        scenario: guidance.mode === "wizard" ? guidance.current.id : null,
        mode: guidance.mode,
        mirror: camera.mirror,
        width: shot.width,
        height: shot.height,
        camera: currentCameraLabel(),
        luminance: guidance.lighting.level,
        app: "web-2.0",
      },
    });

    state.captured++;
    flash();
    playShutter();

    const result = guidance.record();
    if (result === "advanced") {
      toast(`Növbəti addım: ${guidance.current.title}`, "success");
    } else if (result === "finished") {
      toast(`“${state.cls}” üçün bütün addımlar tamamlandı. Başqa obyektə keçə bilərsiniz.`, "success", 6000);
    }
    renderScenario();
    renderStats();
    return true;
  }

  /* ---------- Auto capture ---------- */

  function startAuto() {
    if (state.running) return;
    if (!camera.ready) {
      toast("Kamera hazır deyil.", "error");
      return;
    }
    if (!validateTarget()) return;
    state.running = true;
    state.cycleStart = performance.now();
    state.nextAt = state.cycleStart + state.interval * 1000;
    renderRunState();
  }

  function stopAuto(message) {
    if (!state.running) return;
    state.running = false;
    renderRunState();
    if (message) toast(message, "warn");
  }

  function toggleAuto() {
    if (state.running) stopAuto();
    else startAuto();
  }

  function renderRunState() {
    el.viewport.dataset.running = String(state.running);
    el.btnToggle.dataset.running = String(state.running);
    el.btnToggle.querySelector("use").setAttribute("href", state.running ? "#i-stop" : "#i-play");
    el.btnToggleLabel.textContent = state.running ? "Dayandır" : "Avtomatik çəkiliş";
    if (!state.running) {
      el.statusBadge.dataset.tone = "idle";
      el.statusText.textContent = "Gözləmədə";
      el.countdownBar.style.transform = "scaleX(0)";
    }
  }

  /* ---------- Interval & mirror ---------- */

  function clampInterval(v) {
    if (!Number.isFinite(v)) return 3;
    const stepped = Math.round(v / INTERVAL_STEP) * INTERVAL_STEP;
    return Math.min(INTERVAL_MAX, Math.max(INTERVAL_MIN, stepped));
  }

  function setInterval_(v) {
    state.interval = clampInterval(v);
    el.intervalVal.textContent = `${state.interval.toFixed(1)} s`;
    el.btnIntervalDown.disabled = state.interval <= INTERVAL_MIN;
    el.btnIntervalUp.disabled = state.interval >= INTERVAL_MAX;
    if (state.running) state.nextAt = state.cycleStart + state.interval * 1000;
    U.store.set("lens.interval", state.interval);
  }

  function setMirror(on) {
    camera.setMirror(on);
    el.mirrorToggle.checked = camera.mirror;
    U.store.set("lens.mirror", camera.mirror);
  }

  /* ======================================================================
     Camera
     ====================================================================== */

  function cameraErrorText(err) {
    switch (err && err.name) {
      case "InsecureContextError":
        return ["Təhlükəsiz bağlantı tələb olunur", "Kamera yalnız HTTPS və ya localhost ünvanında işləyir."];
      case "NotSupportedError":
        return ["Brauzer dəstəkləmir", "Bu brauzer kameraya çıxışı dəstəkləmir. Chrome, Edge və ya Firefox-un son versiyasından istifadə edin."];
      case "NotAllowedError":
      case "SecurityError":
        return ["Kamera icazəsi verilməyib", "Ünvan sətrindəki kamera ikonuna klikləyib icazə verin, sonra yenidən cəhd edin."];
      case "NotFoundError":
      case "OverconstrainedError":
        return ["Kamera tapılmadı", "Veb-kameranın qoşulu olduğunu yoxlayın və yenidən cəhd edin."];
      case "NotReadableError":
      case "AbortError":
        return ["Kamera məşğuldur", "Kamera başqa proqramda (Zoom, Teams və s.) açıq ola bilər. Onu bağlayıb yenidən cəhd edin."];
      default:
        return ["Kamera açılmadı", (err && err.message) || "Naməlum xəta. Yenidən cəhd edin."];
    }
  }

  function setViewportState(next, err) {
    el.viewport.dataset.state = next;
    if (next === "loading") {
      el.camMessageIcon.replaceChildren(Object.assign(document.createElement("span"), { className: "spinner spinner--light" }));
      el.camMessageTitle.textContent = "Kamera açılır";
      el.camMessageText.textContent = "Brauzer kamera icazəsi istəsə, “İcazə ver” seçin.";
      el.btnCameraRetry.hidden = true;
    } else if (next === "error") {
      const [title, text] = cameraErrorText(err);
      el.camMessageIcon.replaceChildren(icon("camera-off"));
      el.camMessageTitle.textContent = title;
      el.camMessageText.textContent = text;
      el.btnCameraRetry.hidden = false;
    }
    renderControls();
  }

  async function startCamera(deviceId = null) {
    const switching = deviceId && camera.ready;
    if (!switching) setViewportState("loading");
    stopAuto();
    try {
      await camera.start(deviceId);
      onCameraReady();
    } catch (err) {
      if (err && err.name === "SupersededError") return; // a newer request owns the camera now
      console.warn("[app] camera start failed:", err);
      if (camera.ready) {
        // Switching failed but the previous camera was restored.
        const [title] = cameraErrorText(err);
        toast(`${title}. Əvvəlki kamera saxlanıldı.`, "error");
        onCameraReady();
      } else {
        setViewportState("error", err);
        populateCameras();
      }
    }
  }

  function onCameraReady() {
    el.viewport.style.setProperty("--ar", camera.aspect.toFixed(4));
    el.resolution.textContent = `${camera.width}×${camera.height}`;
    guidance.invalidateOverlay();
    setViewportState("ready");
    populateCameras();
  }

  async function populateCameras() {
    const devices = await camera.listDevices();
    if (!devices.length) {
      el.cameraSelect.replaceChildren(new Option("Kamera tapılmadı", ""));
      el.cameraSelect.disabled = true;
      return;
    }
    el.cameraSelect.replaceChildren(
      ...devices.map((d, i) => new Option(d.label || `Kamera ${i + 1}`, d.deviceId))
    );
    if (camera.deviceId && devices.some((d) => d.deviceId === camera.deviceId)) {
      el.cameraSelect.value = camera.deviceId;
    }
    el.cameraSelect.disabled = devices.length < 2 && camera.ready;
    el.cameraSelect.title = currentCameraLabel();
  }

  camera.onEnded = () => {
    stopAuto();
    setViewportState("error", Object.assign(new Error("Kamera bağlantısı kəsildi."), { name: "NotFoundError" }));
    el.camMessageTitle.textContent = "Kamera bağlantısı kəsildi";
  };

  /* ======================================================================
     Rendering — controls, scenario, stats, recent list
     ====================================================================== */

  function renderControls() {
    const ready = camera.ready && el.viewport.dataset.state === "ready";
    el.btnToggle.disabled = !ready;
    el.btnSnap.disabled = !ready;
  }

  function buildSteps() {
    el.steps.replaceChildren(
      ...guidance.scenarios.map((s, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "steps__seg";
        b.addEventListener("click", () => {
          guidance.go(i);
          renderScenario();
        });
        return b;
      })
    );
  }

  function renderScenario() {
    const g = guidance;
    const cur = g.current;
    const count = g.currentCount;

    Array.from(el.steps.children).forEach((b, i) => {
      const s = g.scenarios[i];
      const c = g.counts[i] || 0;
      b.style.setProperty("--p", Math.min(1, c / s.target).toFixed(3));
      b.dataset.done = String(g.isComplete(i));
      if (i === g.index) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
      b.setAttribute("aria-label", `Addım ${i + 1}: ${s.title} — ${Math.min(c, s.target)} / ${s.target}`);
      b.title = `${i + 1}. ${s.title}`;
    });

    el.scenarioStep.textContent = `Addım ${g.index + 1} / ${g.scenarios.length}`;
    el.scenarioTotal.textContent = `Cəmi ${g.totalDone} / ${g.totalTarget}`;
    el.scenarioTitle.textContent = cur.title;
    el.scenarioDesc.textContent = cur.desc;
    el.scenarioTip.textContent = cur.tip;
    el.scenarioProgress.textContent = `${count} / ${cur.target} kadr`;
    el.scenarioDone.hidden = !g.isComplete(g.index);
    el.btnPrevScenario.disabled = g.index === 0;
    el.btnNextScenario.disabled = g.index === g.scenarios.length - 1;
    el.btnResetProgress.hidden = !g.key || g.counts.every((c) => !c);
  }

  function setMode(mode) {
    guidance.mode = mode === "free" ? "free" : "wizard";
    el.modeWizard.checked = guidance.mode === "wizard";
    el.modeFree.checked = guidance.mode === "free";
    el.wizardBody.hidden = guidance.mode !== "wizard";
    el.freeNote.hidden = guidance.mode === "wizard";
    U.store.set("lens.mode", guidance.mode);
    renderScenario();
  }

  function setStat(node, value) {
    node.textContent = String(value);
    node.dataset.zero = String(value === 0);
  }

  function renderStats() {
    setStat(el.statCaptured, state.captured);
    setStat(el.statUploaded, uploader.uploaded);
    setStat(el.statQueue, uploader.pendingCount);
    setStat(el.statFailed, uploader.failedCount);
    el.btnRetryAll.hidden = uploader.failedCount < 2;
  }

  const rows = new Map(); // upload id → <li>

  function statusNode(item) {
    let node;
    if (item.status === "success" && item.fileId) {
      node = document.createElement("a");
      node.href = DRIVE_FILE_URL + encodeURIComponent(item.fileId) + "/view";
      node.target = "_blank";
      node.rel = "noopener noreferrer";
      node.title = "Drive-da aç";
    } else if (item.status === "failed") {
      node = document.createElement("button");
      node.type = "button";
      node.title = `${item.error || "Xəta"} — yenidən yükləmək üçün klikləyin`;
      node.addEventListener("click", () => uploader.retry(item.id));
    } else {
      node = document.createElement("span");
    }
    node.className = "status";
    node.dataset.status = item.status;

    const label = document.createElement("span");
    if (item.status === "success") {
      node.append(icon("check"));
      label.textContent = "Drive-da";
    } else if (item.status === "uploading") {
      node.append(Object.assign(document.createElement("span"), { className: "spinner" }));
      label.textContent = "Yüklənir";
    } else if (item.status === "failed") {
      node.append(icon("refresh"));
      label.textContent = "Yenidən";
    } else {
      node.append(icon("clock"));
      label.textContent = item.attempts > 0 ? "Təkrar" : "Növbədə";
      if (item.error) node.title = item.error;
    }
    node.append(label);
    return node;
  }

  function renderRecent() {
    const items = uploader.recent;
    el.uploadsEmpty.hidden = items.length > 0;

    const keep = new Set(items.map((i) => i.id));
    rows.forEach((row, id) => {
      if (!keep.has(id)) {
        row.remove();
        rows.delete(id);
      }
    });

    items.forEach((item, index) => {
      let row = rows.get(item.id);
      if (!row) {
        row = document.createElement("li");
        row.className = "recent__item";

        const img = document.createElement("img");
        img.className = "recent__thumb";
        img.src = item.thumb;
        img.alt = "";
        img.decoding = "async";

        const body = document.createElement("div");
        body.className = "recent__body";
        const name = document.createElement("p");
        name.className = "recent__name";
        name.textContent = item.fileName;
        name.title = item.fileName;
        const meta = document.createElement("p");
        meta.className = "recent__meta";
        meta.textContent = `${item.userName} / ${item.className} · ${U.clockTime(item.createdAt)}`;
        body.append(name, meta);

        row.append(img, body, document.createElement("span"));
        rows.set(item.id, row);
      }

      const signature = `${item.status}:${item.attempts}:${item.fileId || ""}`;
      if (row.dataset.signature !== signature) {
        row.dataset.signature = signature;
        row.lastElementChild.replaceWith(statusNode(item));
      }

      if (el.uploadsList.children[index] !== row) {
        el.uploadsList.insertBefore(row, el.uploadsList.children[index] || null);
      }
    });
  }

  uploader.onChange = (u) => {
    renderStats();
    renderRecent();
    // Keep suggestions in sync with what is now on Drive.
    let changed = false;
    u.recent.forEach((item) => {
      if (item.status === "success" && !item._remembered) {
        item._remembered = true;
        rememberInTree(item.userName, item.className);
        changed = true;
      }
    });
    if (changed) {
      if (state.driveState !== "online") setDriveState("online");
      renderSetup();
    }
  };

  /* ======================================================================
     Main loop — lighting badge + auto-capture timer
     ====================================================================== */

  const LIGHT = {
    good: { tone: "good", text: "İşıq yaxşıdır" },
    too_dark: { tone: "warn", text: "İşıq zəifdir — otaq işığını artırın" },
    too_bright: { tone: "bad", text: "Kadr çox işıqlıdır — işığı azaldın" },
  };

  function loop(now) {
    if (camera.ready) {
      guidance.renderOverlay();

      if (now - state.lastLightCheck > LIGHT_CHECK_MS) {
        state.lastLightCheck = now;
        const { status } = guidance.analyzeLighting();
        if (status !== state.lastLightStatus && LIGHT[status]) {
          state.lastLightStatus = status;
          el.lightingBadge.dataset.tone = LIGHT[status].tone;
          el.lightingText.textContent = LIGHT[status].text;
        }
      }
    }

    if (state.running) {
      const total = state.interval * 1000;
      const remaining = Math.max(0, state.nextAt - now);
      el.statusBadge.dataset.tone = "rec";
      el.statusText.textContent = `REC ${(remaining / 1000).toFixed(1)} s`;
      el.countdownBar.style.transform = `scaleX(${(1 - remaining / total).toFixed(4)})`;

      if (remaining <= 0) {
        if (capture()) {
          state.cycleStart = now;
          state.nextAt = now + total;
        } else {
          stopAuto();
        }
      }
    }

    requestAnimationFrame(loop);
  }

  /* ======================================================================
     Events
     ====================================================================== */

  el.btnToggle.addEventListener("click", toggleAuto);
  el.btnSnap.addEventListener("click", () => capture());
  el.btnIntervalDown.addEventListener("click", () => setInterval_(state.interval - INTERVAL_STEP));
  el.btnIntervalUp.addEventListener("click", () => setInterval_(state.interval + INTERVAL_STEP));
  el.mirrorToggle.addEventListener("change", () => setMirror(el.mirrorToggle.checked));
  el.cameraSelect.addEventListener("change", () => {
    el.cameraSelect.blur(); // give keyboard shortcuts back to the page
    if (el.cameraSelect.value && el.cameraSelect.value !== camera.deviceId) startCamera(el.cameraSelect.value);
  });
  el.btnCameraRetry.addEventListener("click", () => startCamera(el.cameraSelect.value || null));
  el.driveStatus.addEventListener("click", () => loadTree({ fresh: true }));
  el.btnRetryAll.addEventListener("click", () => uploader.retryAllFailed());

  el.modeWizard.addEventListener("change", () => setMode("wizard"));
  el.modeFree.addEventListener("change", () => setMode("free"));
  el.btnPrevScenario.addEventListener("click", () => {
    guidance.go(guidance.index - 1);
    renderScenario();
  });
  el.btnNextScenario.addEventListener("click", () => {
    guidance.go(guidance.index + 1);
    renderScenario();
  });
  el.btnResetProgress.addEventListener("click", () => {
    guidance.reset();
    renderScenario();
    toast(`“${state.cls}” üçün addım irəliləyişi sıfırlandı.`);
  });

  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", () => {
      if (camera.ready) populateCameras();
    });
  }

  window.addEventListener("resize", () => guidance.invalidateOverlay());

  window.addEventListener("online", () => {
    if (state.driveState === "offline") loadTree({ silent: true });
  });
  window.addEventListener("offline", () => toast("İnternet bağlantısı kəsildi. Kadrlar növbədə gözləyəcək.", "warn"));

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAuto("Səhifə arxa plana keçdiyi üçün avtomatik çəkiliş dayandırıldı.");
  });

  window.addEventListener("beforeunload", (e) => {
    if (uploader.backlog > 0) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  // Keyboard shortcuts — ignored while typing and with modifier keys (Ctrl+C etc.).
  window.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target && target.closest('input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]')) return;
    const onControl = target && target.closest("button, a, input, label");

    switch (e.code) {
      case "Space":
        e.preventDefault(); // also stops a focused button from being "clicked" by Space
        if (!e.repeat) toggleAuto();
        break;
      case "KeyC":
        e.preventDefault();
        if (!e.repeat) capture();
        break;
      case "Enter":
        if (onControl) return; // let Enter activate the focused button/link
        e.preventDefault();
        if (!e.repeat) capture();
        break;
      case "KeyW":
        e.preventDefault();
        setInterval_(state.interval + INTERVAL_STEP);
        break;
      case "KeyS":
        e.preventDefault();
        setInterval_(state.interval - INTERVAL_STEP);
        break;
      case "KeyM":
        e.preventDefault();
        if (!e.repeat) setMirror(!camera.mirror);
        break;
      default:
        break;
    }
  });

  /* ======================================================================
     Init
     ====================================================================== */

  function init() {
    // Restore preferences (and migrate the v1 storage key).
    const savedUser = U.store.get("lens.user", null) ?? U.store.raw("lens_collector_name") ?? "";
    userCombo.setValue(U.normalizeName(savedUser));
    classCombo.setValue(U.normalizeClass(U.store.get("lens.class", "")));
    setMirror(U.store.get("lens.mirror", true) !== false);
    setInterval_(state.interval);
    buildSteps();
    setMode(U.store.get("lens.mode", "wizard"));
    syncTarget();
    renderRunState();
    renderStats();
    renderRecent();

    loadTree();
    startCamera();
    requestAnimationFrame(loop);
  }

  init();
})();
