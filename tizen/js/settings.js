/* global document, Site, TvNav, TvKeys */
const SettingsPanel = (() => {
  let panel;
  let browse;
  let input;
  let btnSave;
  let btnCancel;
  let btnTestPlay;
  let btnCheckUpdate;
  let checkingUpdate = false;
  let hint;
  let siteUrlCurrent;
  let rowIndex = 0;
  /** @type {HTMLInputElement|null} */
  let editingTextField = null;
  /** @type {(url: string) => void} */
  let onSaved = () => {};

  function isBackKey(e) {
    if (!e) return false;
    if (typeof TvKeys !== "undefined" && TvKeys.isBack(e)) return true;
    return (
      e.keyCode === 10009 ||
      e.keyCode === 461 ||
      e.keyCode === 27 ||
      e.key === "Back" ||
      e.key === "XF86Back" ||
      e.key === "Escape"
    );
  }

  function textFields() {
    return [input].filter(Boolean);
  }

  /** TV browsers jump into the first <input>; keep fields inert until user presses OK. */
  function lockTextFields() {
    for (const el of textFields()) {
      el.readOnly = true;
      el.tabIndex = -1;
    }
  }

  function unlockTextField(el) {
    editingTextField = el;
    lockTextFields();
    el.readOnly = false;
    el.tabIndex = 0;
  }

  function blurTextFields() {
    for (const el of textFields()) {
      try {
        el.blur();
      } catch (_) {
        /* ignore */
      }
    }
  }

  function focusedSettingsField() {
    if (!panel) return null;
    const ae = document.activeElement;
    if (!ae || !panel.contains(ae)) return null;
    return textFields().includes(ae) ? ae : null;
  }

  /** Samsung often opens the keyboard without our OK/unlock flag still set. */
  function isTextEntryActive() {
    if (editingTextField !== null) return true;
    return focusedSettingsField() !== null;
  }

  function syncEditingFieldFromFocus() {
    const focused = focusedSettingsField();
    if (focused && !focused.readOnly) {
      editingTextField = focused;
    }
  }

  function dismissTextEntry() {
    editingTextField = null;
    blurTextFields();
    lockTextFields();
    applyRowFocus();
    try {
      if (panel) panel.focus();
    } catch (_) {
      /* ignore */
    }
    showHint("↑ ↓ move · OK on a row · Back again closes Settings");
  }

  function captureTextFieldKeys(e) {
    if (!isOpen() || !isTextEntryActive()) return;
    syncEditingFieldFromFocus();
    const code = e.keyCode;
    if (isBackKey(e)) {
      dismissTextEntry();
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      return;
    }
    if (code === TvNav.KEY.DOWN || code === TvNav.KEY.UP) {
      if (code === TvNav.KEY.DOWN) rowIndex += 1;
      else rowIndex -= 1;
      dismissTextEntry();
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      return;
    }
    if (typeof TvKeys !== "undefined" && TvKeys.isSelect(e)) {
      dismissTextEntry();
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    }
  }

  function captureTizenBack(e) {
    if (!isOpen() || !isTextEntryActive()) return;
    if (e && e.keyName === "back") {
      dismissTextEntry();
      e.preventDefault();
    }
  }

  function isOpen() {
    return panel && !panel.classList.contains("hidden");
  }

  function showHint(msg) {
    if (hint) hint.textContent = msg;
  }

  function focusables() {
    return [input, btnSave, btnCancel, btnTestPlay, btnCheckUpdate].filter(Boolean);
  }

  function updateSiteUrlDisplay() {
    if (!siteUrlCurrent || !input) return;
    const v = (input.value || "").trim();
    siteUrlCurrent.textContent = v ? `Current: ${v}` : "Not set yet — press OK on Address to type";
  }

  function rowWrap(el) {
    if (!el) return null;
    if (el === btnSave || el === btnCancel || el === btnTestPlay || el === btnCheckUpdate) return el;
    return el.closest(".field") || el;
  }

  function applyRowFocus() {
    if (!editingTextField) {
      blurTextFields();
      lockTextFields();
    }
    const list = focusables();
    if (!list.length) return;
    if (rowIndex < 0) rowIndex = 0;
    if (rowIndex >= list.length) rowIndex = list.length - 1;
    for (let i = 0; i < list.length; i++) {
      const wrap = rowWrap(list[i]);
      if (wrap) wrap.classList.toggle("settings-row--active", i === rowIndex);
    }
    const cur = list[rowIndex];
    let msg = "";
    if (cur === btnSave) {
      msg = "OK — saves site URL and reloads channels.";
    } else if (cur === btnCancel) {
      msg = "OK here — close Settings without saving changes.";
    } else if (cur === btnTestPlay) {
      msg = "OK — test stream (optional).";
    } else if (cur === btnCheckUpdate) {
      msg = "OK — check GitHub for a newer KPV and install it.";
    } else if (cur === input) {
      msg = "OK — open keyboard and type your site (e.g. https://example.com). Back closes keyboard.";
    }
    showHint(msg);
    updateSiteUrlDisplay();
    const wrap = rowWrap(cur);
    if (wrap && typeof wrap.scrollIntoView === "function") {
      try {
        wrap.scrollIntoView({ block: "nearest", behavior: "auto" });
      } catch (_) {
        wrap.scrollIntoView(false);
      }
    }
  }

  function normalizeUrl(raw) {
    let s = (raw || "").trim().replace(/\/+$/, "");
    if (!s) return "";
    if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
    try {
      new URL(s);
      return s;
    } catch (_) {
      return "";
    }
  }

  async function saveAndClose() {
    const url = normalizeUrl(input.value);
    if (!url) {
      rowIndex = focusables().indexOf(input);
      applyRowFocus();
      showHint("Enter a site URL, then select Save.");
      return;
    }
    Site.saveSite(url);
    input.value = url;
    close();
    onSaved(url);
  }

  function openTestPlayback() {
    Site.load();
    const testUrl = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
    try {
      sessionStorage.setItem(
        "kpv_watch",
        JSON.stringify({ hls: testUrl, t: "Test stream", mode: "hls" }),
      );
    } catch (_) {
      /* ignore */
    }
    window.location.href = `watch.html?hls=${encodeURIComponent(testUrl)}&t=${encodeURIComponent("Test stream")}`;
  }

  /** Installs and restarts when a newer bundle exists; otherwise reports status in the hint bar. */
  function checkForUpdates() {
    if (checkingUpdate || typeof TvUpdate === "undefined") return;
    checkingUpdate = true;
    showHint("Checking for updates…");
    TvUpdate.check({ toast: true })
      .then((s) => showHint(TvUpdate.settingsSummary(s)))
      .catch((e) => showHint(`Update check failed — ${(e && e.message) || e}`))
      .then(() => {
        checkingUpdate = false;
      });
  }

  function activateRow() {
    const list = focusables();
    const cur = list[rowIndex];
    if (!cur) return;
    if (cur === btnSave) {
      saveAndClose().catch((e) => showHint(e.message || "Save failed."));
      return;
    }
    if (cur === btnCancel) {
      close();
      return;
    }
    if (cur === btnTestPlay) {
      openTestPlayback();
      return;
    }
    if (cur === btnCheckUpdate) {
      checkForUpdates();
      return;
    }
    if (cur === input) {
      unlockTextField(cur);
      rowIndex = list.indexOf(cur);
      cur.focus();
      showHint("Keyboard open — Done or Back closes keyboard · ↓ next row · Save to apply.");
    }
  }

  function open() {
    Site.load();
    input.value = Site.siteOrigin();

    panel.classList.remove("hidden");
    panel.classList.add("settings--open");
    panel.setAttribute("aria-hidden", "false");
    if (browse) browse.classList.add("hidden");

    document.body.classList.add("settings-open");
    editingTextField = null;
    rowIndex = 0;
    lockTextFields();
    blurTextFields();
    document.addEventListener("keydown", captureTextFieldKeys, true);
    document.addEventListener("tizenhwkey", captureTizenBack, true);
    updateSiteUrlDisplay();
    applyRowFocus();
    if (typeof RemoteGuide !== "undefined") {
      RemoteGuide.say("Site URL at top · teal Save box below");
    }
    if (typeof TvUpdate !== "undefined") {
      TvUpdate.fetchStatus({ useSession: true }).then(function (s) {
        showHint(TvUpdate.settingsSummary(s));
      });
    }

    try {
      panel.tabIndex = 0;
      panel.focus();
    } catch (_) {
      /* ignore */
    }
  }

  function close() {
    document.removeEventListener("keydown", captureTextFieldKeys, true);
    document.removeEventListener("tizenhwkey", captureTizenBack, true);
    editingTextField = null;
    panel.classList.add("hidden");
    panel.classList.remove("settings--open");
    panel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("settings-open");
    if (browse) browse.classList.remove("hidden");
    if (typeof RemoteGuide !== "undefined") {
      RemoteGuide.say("Press ↑ for Refresh and Settings (gear)");
    }
    lockTextFields();
    blurTextFields();
    for (const el of focusables()) {
      const wrap = rowWrap(el);
      if (wrap) wrap.classList.remove("settings-row--active");
    }
    TvNav.focusSettings();
  }

  function handleKeyDown(e) {
    if (!isOpen()) return false;
    const code = e.keyCode;

    if (isTextEntryActive()) {
      syncEditingFieldFromFocus();
      if (isBackKey(e)) {
        dismissTextEntry();
        e.preventDefault();
        return true;
      }
      if (typeof TvKeys !== "undefined" && TvKeys.isSelect(e)) {
        dismissTextEntry();
        e.preventDefault();
        return true;
      }
      if (code === TvNav.KEY.DOWN || code === TvNav.KEY.UP) {
        if (code === TvNav.KEY.DOWN) rowIndex += 1;
        else rowIndex -= 1;
        dismissTextEntry();
        e.preventDefault();
        return true;
      }
      return false;
    }

    if (code === TvNav.KEY.DOWN) {
      rowIndex += 1;
      applyRowFocus();
      e.preventDefault();
      return true;
    }
    if (code === TvNav.KEY.UP) {
      rowIndex -= 1;
      applyRowFocus();
      e.preventDefault();
      return true;
    }
    if (TvKeys.isSelect(e)) {
      activateRow();
      e.preventDefault();
      return true;
    }
    return false;
  }

  function handleBack(e) {
    if (!isOpen()) return false;
    syncEditingFieldFromFocus();
    if (isTextEntryActive()) {
      dismissTextEntry();
      if (e.preventDefault) e.preventDefault();
      return true;
    }
    close();
    e.preventDefault();
    return true;
  }

  function init(options) {
    onSaved = options.onSaved || onSaved;
    panel = document.getElementById("settings");
    browse = document.getElementById("browse");
    input = document.getElementById("site-url");
    btnSave = document.getElementById("btn-save");
    btnCancel = document.getElementById("btn-cancel");
    btnTestPlay = document.getElementById("btn-test-play");
    btnCheckUpdate = document.getElementById("btn-check-update");
    const legacyTestHls = document.querySelector("#test-hls-url");
    if (legacyTestHls) (legacyTestHls.closest(".field") || legacyTestHls).remove();

    hint = document.getElementById("settings-hint");
    siteUrlCurrent = document.getElementById("site-url-current");

    btnSave.addEventListener("click", () => {
      saveAndClose().catch((err) => showHint(err.message || "Save failed."));
    });
    btnCancel.addEventListener("click", close);
    if (btnTestPlay) btnTestPlay.addEventListener("click", openTestPlayback);
    if (btnCheckUpdate) btnCheckUpdate.addEventListener("click", checkForUpdates);

    lockTextFields();
    for (const el of textFields()) {
      el.addEventListener("focusin", () => {
        if (!isOpen()) return;
        if (editingTextField === el) return;
        if (!el.readOnly) {
          editingTextField = el;
          lockTextFields();
          el.readOnly = false;
          el.tabIndex = 0;
          return;
        }
        el.blur();
        if (!editingTextField) applyRowFocus();
      });
      el.addEventListener("keydown", captureTextFieldKeys, true);
    }
  }

  return { init, open, close, isOpen, handleBack, handleKeyDown };
})();
