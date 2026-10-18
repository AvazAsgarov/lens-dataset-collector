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
    cameraLive: $("camera-live"),
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
    // Committed target — the only values capture() uses. Updated on blur / Enter / pick.
    user: "",
    cls: "",
    // Draft — what is currently typed (normalised); drives hints and the preview only.
    draft: { user: "", cls: "" },

    running: false,
    cycleStart: 0,
    nextAt: 0,
    interval: clampInterval(Number(U.store.get("lens.interval", 3))),
    captured: 0,

    tree: { users: [] },
    treeLoaded: false,
    treeSeq: 0,
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

  // The container is the live region; toasts themselves carry no role (no nested live regions).
  function toast(message, tone = "info", timeout = 4200) {
    const existing = Array.from(el.toasts.children).find(
      (t) => t.dataset.message === message && !t.classList.contains("is-leaving")
    );
    if (existing) {
      clearTimeout(existing._timer);
      existing._timer = setTimeout(() => dismissToast(existing), timeout);
      return;
    }

    const node = document.createElement("div");
    node.className = "toast";
    node.dataset.tone = tone;
    node.dataset.message = message;
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
    const key = U.nameKey(name);
    return key ? state.tree.users.find((u) => U.nameKey(u.name) === key) : null;
  }

  function userNames() {
    return state.tree.users.map((u) => u.name).sort(U.compareNames);
  }

  function classesOf(name) {
    const user = findUser(name);
    return user ? user.classes.slice().sort(U.compareNames) : [];
  }

  function hasClass(userName, cls) {
    const key = U.classKey(cls);
    return !!key && classesOf(userName).some((c) => U.classKey(c) === key);
  }

  function allClasses() {
    const seen = new Map();
    state.tree.users.forEach((u) =>
      u.classes.forEach((c) => {
        const key = U.classKey(c);
        if (!seen.has(key)) seen.set(key, { name: c, count: 0 });
        seen.get(key).count++;
      })
    );
    return Array.from(seen.values());
  }

  // Suggestions for a person: their own classes first, then the team's by popularity.
  function classSuggestions(userName) {
    const mine = classesOf(userName);
    const mineKeys = new Set(mine.map((c) => U.classKey(c)));
    const others = allClasses()
      .filter((c) => !mineKeys.has(U.classKey(c.name)))
      .sort((a, b) => b.count - a.count || U.compareNames(a.name, b.name))
      .map((c) => c.name);
    return mine.concat(others);
  }

  // Returns true when this added a person or class the local tree did not know yet.
  function rememberInTree(userName, className) {
    if (!state.uploadedPairs.some(([u, c]) => U.nameKey(u) === U.nameKey(userName) && U.classKey(c) === U.classKey(className))) {
      state.uploadedPairs.push([userName, className]);
    }
    return addToTree(userName, className);
  }

  function addToTree(userName, className) {
    let changed = false;
    let user = findUser(userName);
    if (!user) {
      user = { name: userName, classes: [] };
      state.tree.users.push(user);
      changed = true;
    }
    if (className && !user.classes.some((c) => U.classKey(c) === U.classKey(className))) {
      user.classes.push(className);
      changed = true;
    }
    return changed;
  }

  async function loadTree({ fresh = false, silent = false } = {}) {
    const seq = ++state.treeSeq;
    setDriveState("loading");
    try {
      const tree = await uploader.fetchTree({ fresh });
      if (seq !== state.treeSeq) return; // a newer request owns the result
      if (tree.version < 2) {
        console.warn("[app] Drive backend is API v1 — class sub-folders will not be created. Redeploy google_drive_script.js.");
      }
      state.tree = tree;
      state.treeLoaded = true;
      // The backend caches the tree briefly — re-apply folders this session has just uploaded into.
      state.uploadedPairs.forEach(([userName, className]) => addToTree(userName, className));
      setDriveState("online");
    } catch (err) {
      if (seq !== state.treeSeq) return;
      console.warn("[app] folder tree failed:", err);
      setDriveState("offline");
      if (!silent) {
        toast("Google Drive ilə əlaqə qurulmadı. Kadrlar növbədə saxlanılır və bağlantı bərpa olunanda yüklənəcək.", "error", 6500);
      }
    }
    recommit();
    userCombo.refresh();
    classCombo.refresh();
  }

  function setDriveState(next) {
    state.driveState = next;
    el.driveStatus.dataset.state = next;
    el.driveStatus.setAttribute("aria-busy", String(next === "loading"));
    const labels = {
      loading: "Drive yoxlanılır",
      online: "Drive qoşulub",
      offline: "Drive əlçatan deyil",
    };
    el.driveStatusLabel.textContent = labels[next];
    el.driveStatus.title = next === "offline" ? "Bağlantını yenidən yoxla" : "Qovluq siyahısını Drive-dan yenilə";
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
    onInput: () => readDraft(),
    onCommit: () => commitUser(),
    onEnter: () => {
      if (!state.cls) el.classInput.focus();
      else el.userInput.blur();
    },
  });

  const classCombo = new Combobox({
    input: el.classInput,
    list: el.classList,
    source: () => classSuggestions(state.draft.user || state.user),
    describe: (cls) => (hasClass(state.draft.user || state.user, cls) ? "sizdə var" : ""),
    onInput: () => readDraft(),
    onCommit: () => commitClass(),
    onEnter: () => el.classInput.blur(),
  });

  // Normalised person name, using the existing folder's spelling when there is one.
  function resolveUser(raw) {
    const name = U.normalizeName(raw);
    const existing = findUser(name);
    return existing ? existing.name : name;
  }

  // Normalised class; snaps only to this person's own folders (the server matches the
  // same way), otherwise stays lowercase.
  function resolveClass(raw, userName) {
    const cls = U.normalizeClass(raw);
    const own = classesOf(userName).find((c) => U.classKey(c) === cls);
    return own || cls;
  }

  // Live typing: update the draft and the preview, never the capture target.
  function readDraft() {
    const user = resolveUser(el.userInput.value);
    const cls = resolveClass(el.classInput.value, user);
    state.draft = { user, cls };

    if (user) clearFieldError(el.userInput, false);
    if (cls) clearFieldError(el.classInput, false);

    // Only real edits stop auto-capture — not a re-resolution after the folder tree changed.
    const edited = el.userInput.value !== userCombo.committed || el.classInput.value !== classCombo.committed;
    if (state.running && edited) {
      stopAuto("Ad və ya sinif dəyişdirilir — avtomatik çəkiliş dayandırıldı. Yeni dəyəri təsdiqləyib yenidən başladın.");
    }
    renderSetup();
  }

  // The folder tree changed: re-resolve the committed values (e.g. "leyla" → "Leyla")
  // without touching a field the user is typing in.
  function recommit() {
    if (document.activeElement !== el.userInput) commitUser({ silent: true });
    else commitClass({ silent: true });
  }

  function commitUser({ silent = false } = {}) {
    state.user = resolveUser(el.userInput.value);
    userCombo.setValue(state.user);
    U.store.set("lens.user", state.user);
    // The class may snap differently for the new person — but never rewrite a field
    // the user is typing in; it is committed on its own blur.
    if (document.activeElement !== el.classInput) commitClass({ silent: true });
    else applyTarget();
    if (!silent) clearFieldError(el.userInput);
  }

  function commitClass({ silent = false } = {}) {
    state.cls = resolveClass(el.classInput.value, state.user);
    classCombo.setValue(state.cls);
    U.store.set("lens.class", state.cls);
    applyTarget();
    if (!silent) clearFieldError(el.classInput);
  }

  // After the committed target changed: switch scenario progress and refresh the UI.
  function applyTarget() {
    guidance.setKey(state.user && state.cls ? `${U.nameKey(state.user)}|${U.classKey(state.cls)}` : "");
    if (state.running && (!state.user || !state.cls)) {
      stopAuto("Ad və ya sinif silindiyi üçün avtomatik çəkiliş dayandırıldı.");
    }
    readDraft();
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
    const { user, cls } = state.draft;

    if (el.userInput.getAttribute("aria-invalid") !== "true") {
      if (!user) {
        setHint(el.userHint, ["Siyahıdan adınızı seçin və ya yenisini yazın."]);
      } else if (findUser(user)) {
        setHint(el.userHint, [tag("Mövcud qovluq", "green"), `${classesOf(user).length} sinif qovluğu var`]);
      } else {
        setHint(el.userHint, [tag("Yeni", "blue"), "İlk şəkillə yeni qovluq yaradılacaq"]);
      }
    }

    if (el.classInput.getAttribute("aria-invalid") !== "true") {
      const typed = el.classInput.value.trim();
      if (!cls) {
        setHint(el.classHint, ["Şəkildə nə olduğunu yazın: mouse, notebook, phone…"]);
      } else {
        const parts = hasClass(user, cls)
          ? [tag("Mövcud alt qovluq", "green")]
          : [tag("Yeni", "blue"), "alt qovluq yaradılacaq"];
        if (typed && typed !== cls) parts.push("·", code(cls), "kimi saxlanacaq");
        setHint(el.classHint, parts);
      }
    }

    renderChips();
    renderDestination();
    renderControls();
  }

  function renderChips() {
    const user = state.draft.user;
    const mine = classesOf(user);
    const list = (mine.length ? mine : classSuggestions(user)).slice(0, 10);
    if (!list.length) {
      el.classChips.hidden = true;
      el.classChips.replaceChildren();
      el.classChips.dataset.signature = "";
      return;
    }
    el.classChips.hidden = false;
    el.classChips.setAttribute("aria-label", mine.length ? "Sizin siniflər" : "Komandanın sinifləri");

    // Rebuild only when the list changes, so a focused chip keeps keyboard focus.
    const signature = list.join("\u0000");
    if (el.classChips.dataset.signature !== signature) {
      const focusedValue = el.classChips.contains(document.activeElement) ? document.activeElement.dataset.value : null;
      el.classChips.dataset.signature = signature;
      el.classChips.replaceChildren(
        ...list.map((cls) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "chip";
          b.textContent = cls;
          b.title = `Sinif: ${cls}`;
          b.dataset.value = cls;
          b.addEventListener("click", () => {
            classCombo.setValue(cls);
            commitClass();
          });
          return b;
        })
      );
      if (focusedValue) {
        const again = Array.from(el.classChips.children).find((b) => b.dataset.value === focusedValue);
        if (again) again.focus();
      }
    }
    const current = U.classKey(state.draft.cls);
    Array.from(el.classChips.children).forEach((b) => {
      b.setAttribute("aria-pressed", String(!!current && U.classKey(b.dataset.value) === current));
    });
  }

  function renderDestination() {
    const { user, cls } = state.draft;
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
    el.destPath.replaceChildren(document.createTextNode("Drive"), sep(), seg(user, "ad"), sep(), seg(cls, "sinif"), sep());
    // The HUD shows where frames actually go (the committed target).
    el.hudPath.textContent = state.user && state.cls ? `${state.user} / ${state.cls}` : "Ad və sinif seçilməyib";
  }

  function showFieldError(input, message) {
    const hint = input === el.userInput ? el.userHint : el.classHint;
    input.setAttribute("aria-invalid", "true");
    setHint(hint, [message], "error");
    input.focus();
  }

  function clearFieldError(input, rerender = true) {
    if (input.getAttribute("aria-invalid") !== "true") return;
    input.removeAttribute("aria-invalid");
    if (rerender) renderSetup();
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

  // Disables a control; if it had focus, focus moves to `fallback` instead of <body>.
  function setDisabled(control, disabled, fallback) {
    if (disabled) releaseFocus(control, fallback);
    control.disabled = disabled;
  }

  // Before a focused control is disabled or hidden: keyboard users continue on `fallback`,
  // mouse users get focus back on the page (so Space / C keep working as shortcuts).
  function releaseFocus(control, fallback) {
    if (document.activeElement !== control) return;
    let keyboard = false;
    try {
      keyboard = control.matches(":focus-visible");
    } catch (err) {
      keyboard = true; // very old browsers: keep the previous, keyboard-friendly behaviour
    }
    if (keyboard && fallback && !fallback.disabled && !fallback.hidden) fallback.focus();
    else control.blur();
  }

  function setInterval_(v) {
    state.interval = clampInterval(v);
    el.intervalVal.textContent = `${state.interval.toFixed(1)} s`;
    setDisabled(el.btnIntervalDown, state.interval <= INTERVAL_MIN, el.btnIntervalUp);
    setDisabled(el.btnIntervalUp, state.interval >= INTERVAL_MAX, el.btnIntervalDown);
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

  function announceCamera(text) {
    // Written on the next frame so screen readers notice the change in an already-rendered region.
    requestAnimationFrame(() => (el.cameraLive.textContent = text));
  }

  function setViewportState(next, err) {
    el.viewport.dataset.state = next;
    if (next === "ready") announceCamera("Kamera hazırdır.");
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
      announceCamera(`${title}. ${text}`);
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

  function syncVideoGeometry() {
    if (!camera.ready) return;
    el.viewport.style.setProperty("--ar", camera.aspect.toFixed(4));
    el.resolution.textContent = `${camera.width}×${camera.height}`;
    guidance.invalidateOverlay();
  }

  function onCameraReady() {
    syncVideoGeometry();
    setViewportState("ready");
    populateCameras();
  }

  async function populateCameras() {
    const devices = await camera.listDevices();
    if (!devices.length) {
      el.cameraSelect.replaceChildren(new Option("Kamera tapılmadı", ""));
      el.cameraSelect.disabled = true;
      return devices;
    }
    el.cameraSelect.replaceChildren(...devices.map((d, i) => new Option(d.label || `Kamera ${i + 1}`, d.deviceId)));
    const active = camera.ready ? camera.deviceId : camera.requestedId;
    if (active && devices.some((d) => d.deviceId === active)) el.cameraSelect.value = active;
    el.cameraSelect.disabled = devices.length < 2 && camera.ready;
    el.cameraSelect.title = currentCameraLabel();
    return devices;
  }

  camera.onEnded = () => {
    stopAuto();
    setViewportState("error", Object.assign(new Error("Kamera bağlantısı kəsildi."), { name: "NotFoundError" }));
    el.camMessageTitle.textContent = "Kamera bağlantısı kəsildi";
    announceCamera("Kamera bağlantısı kəsildi. Veb-kameranı yenidən qoşub “Yenidən cəhd et” düyməsini basın.");
    populateCameras();
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
    setDisabled(el.btnPrevScenario, g.index === 0, el.btnNextScenario);
    setDisabled(el.btnNextScenario, g.index === g.scenarios.length - 1, el.btnPrevScenario);
    const hideReset = !g.key || g.counts.every((c) => !c);
    if (hideReset) releaseFocus(el.btnResetProgress, el.scenarioTitle);
    el.btnResetProgress.hidden = hideReset;
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
    el.btnRetryAll.hidden = uploader.failedCount < 1;
    el.btnRetryAll.textContent = uploader.failedCount > 1 ? "Hamısını yenidən yüklə" : "Yenidən yüklə";
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
      node.title = `${item.error || "Xəta"} — avtomatik təkrar cəhd ediləcək; indi yükləmək üçün klikləyin`;
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
        body.append(name, meta);

        row.append(img, body, document.createElement("span"));
        rows.set(item.id, row);
      }

      row.querySelector(".recent__meta").textContent = `${item.userName} / ${item.className} · ${U.clockTime(item.createdAt)}`;

      const signature = `${item.status}:${item.attempts}:${item.fileId || ""}`;
      if (row.dataset.signature !== signature) {
        row.dataset.signature = signature;
        const hadFocus = row.contains(document.activeElement);
        const next = statusNode(item);
        row.lastElementChild.replaceWith(next);
        if (hadFocus) {
          if (!next.matches("a, button")) next.tabIndex = -1;
          next.focus({ preventScroll: true });
        }
      }

      if (el.uploadsList.children[index] !== row) {
        el.uploadsList.insertBefore(row, el.uploadsList.children[index] || null);
      }
    });
  }

  uploader.onChange = () => {
    renderStats();
    renderRecent();
  };

  // Every successful upload, even one that already scrolled out of the recent list.
  uploader.onUploaded = (item) => {
    const added = rememberInTree(item.userName, item.className);
    if (!state.treeLoaded) {
      if (state.driveState !== "loading") loadTree({ silent: true });
    } else if (state.driveState !== "online") {
      setDriveState("online");
    }
    if (added) {
      recommit();
      userCombo.refresh();
      classCombo.refresh();
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

  // Arrow keys on a closed <select> fire "change" on every press (Windows) — debounce so
  // stepping through cameras does not restart the stream each time.
  let cameraChangeTimer = null;
  let cameraPickedWithPointer = false;
  el.cameraSelect.addEventListener("pointerdown", () => (cameraPickedWithPointer = true));
  el.cameraSelect.addEventListener("keydown", () => (cameraPickedWithPointer = false));
  el.cameraSelect.addEventListener("change", () => {
    if (cameraPickedWithPointer) el.cameraSelect.blur();
    clearTimeout(cameraChangeTimer);
    cameraChangeTimer = setTimeout(() => {
      const value = el.cameraSelect.value;
      const current = camera.ready ? camera.deviceId : camera.requestedId;
      if (value && value !== current) startCamera(value);
    }, 350);
  });

  el.btnCameraRetry.addEventListener("click", async () => {
    // The selected camera may have been unplugged — fall back to the default one.
    const devices = await camera.listDevices();
    const value = el.cameraSelect.value;
    startCamera(value && devices.some((d) => d.deviceId === value) ? value : null);
  });

  el.driveStatus.addEventListener("click", () => {
    if (state.driveState !== "loading") loadTree({ fresh: true });
  });
  el.btnRetryAll.addEventListener("click", () => {
    uploader.retryAllFailed();
    el.uploadsList.closest("section").querySelector("h2").focus();
  });

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

  el.video.addEventListener("resize", syncVideoGeometry); // e.g. a phone rotated mid-session

  // Combobox skips onCommit when the text is unchanged; the tree may still have changed how it resolves.
  el.userInput.addEventListener("blur", () => {
    if (resolveUser(el.userInput.value) !== state.user) commitUser({ silent: true });
  });
  el.classInput.addEventListener("blur", () => {
    if (resolveClass(el.classInput.value, state.user) !== state.cls) commitClass({ silent: true });
  });

  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", () => populateCameras());
  }

  window.addEventListener("resize", () => guidance.invalidateOverlay());

  window.addEventListener("online", () => {
    if (!state.treeLoaded || state.driveState === "offline") loadTree({ silent: true });
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

  // After a mouse click, give focus back to the page so Space / C keep working as
  // shortcuts. Keyboard activation (click.detail === 0) keeps focus where it is.
  document.addEventListener("click", (e) => {
    if (e.detail === 0) return;
    const control = e.target instanceof Element && e.target.closest("button, a, label, input[type='checkbox'], input[type='radio']");
    if (!control || control.closest(".combo")) return;
    setTimeout(() => {
      const active = document.activeElement;
      if (active && (active === control || control.contains(active)) && !active.matches("input[type='text'], select")) {
        active.blur();
      }
    }, 0);
  });

  // Keyboard shortcuts. Never while typing, never with modifier keys (Ctrl+C etc.) and
  // never for Space on a focused control — Space must still press buttons / toggle switches.
  const INTERACTIVE = "button, a[href], input, select, textarea, label, summary, [role='option'], [contenteditable='true']";
  const TYPING = "input:not([type='checkbox']):not([type='radio']), textarea, select, [contenteditable='true']";

  window.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target && target.closest(TYPING)) return;

    switch (e.code) {
      case "Space":
        if (target && target.closest(INTERACTIVE)) return;
        e.preventDefault();
        if (!e.repeat) toggleAuto();
        break;
      case "KeyC":
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
    commitUser({ silent: true });
    renderRunState();
    renderStats();
    renderRecent();

    loadTree();
    startCamera();
    requestAnimationFrame(loop);
  }

  init();
})();
