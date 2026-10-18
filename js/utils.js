/**
 * Shared helpers: name normalisation (must match google_drive_script.js), storage, formatting.
 */
(function () {
  "use strict";

  const MAX_NAME_LENGTH = 60;

  // Same rules as cleanName_() in google_drive_script.js.
  function normalizeName(value) {
    return String(value == null ? "" : value)
      .replace(/[\u0000-\u001f\u007f/\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_NAME_LENGTH)
      .trim();
  }

  // Same rules as cleanClass_(): class folders are lowercase with underscores.
  function normalizeClass(value) {
    return normalizeName(value).toLowerCase().replace(/ /g, "_");
  }

  function sameName(a, b) {
    return String(a).toLowerCase() === String(b).toLowerCase();
  }

  function fileSafe(value) {
    return String(value == null ? "" : value)
      .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, "")
      .replace(/\s+/g, "_");
  }

  function compareNames(a, b) {
    return a.localeCompare(b, "az", { sensitivity: "base" });
  }

  function pad(value, width = 2) {
    return String(value).padStart(width, "0");
  }

  function fileStamp(date) {
    return (
      `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
      `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}` +
      `-${pad(date.getMilliseconds(), 3)}`
    );
  }

  function clockTime(date) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function randomId(length = 4) {
    let out = "";
    while (out.length < length) out += Math.random().toString(36).slice(2);
    return out.slice(0, length);
  }

  // localStorage can throw (private mode, blocked storage) — never let that break the app.
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (err) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (err) {
        /* storage unavailable */
      }
    },
    raw(key) {
      try {
        return localStorage.getItem(key);
      } catch (err) {
        return null;
      }
    },
  };

  window.LensUtils = {
    normalizeName,
    normalizeClass,
    sameName,
    fileSafe,
    compareNames,
    fileStamp,
    clockTime,
    randomId,
    store,
  };
})();
