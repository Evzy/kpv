/* global document, Site, TvNav, Companion, TvKeys */
const SettingsPanel = (() => {
  let panel;
  let browse;
  let input;
  let companionMode;
  let companionPhone;
  let companionPin;
  let companionStatus;
  let testHlsInput;
  let btnSave;
  let btnCancel;
  let btnTestPlay;
  let hint;
  let siteUrlCurrent;
  let rowIndex = 0;
  /** @type {(url: string) => void} */
  let onSaved = () => {};

  function textFields() {
    return [input, companionPhone, companionPin, testHlsInput].filter(Boolean);
  }

  /** TV browsers jump into the first <input>; keep fields inert until user presses OK. */
  function lockTextFields() {
    for (const el of textFields()) {
      el.readOnly = true;
      el.tabIndex = -1;
    }
  }

  function unlockTextField(el) {
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

  function isTextEntryActive() {
    const active = document.activeElement;
    if (textFields().includes(active)) return true;
    return textFields().some((el) => !el.readOnly);
  }

  function dismissTextEntry() {
    blurTextFields();
    lockTextFields();
    applyRowFocus();
  }

  function isOpen() {
    return panel && !panel.classList.contains("hidden");
  }

  function showHint(msg) {
    if (hint) hint.textContent = msg;
  }

  function showCompanionStatus(msg) {
    if (companionStatus) companionStatus.textContent = msg;
  }

  function focusables() {
    return [
      input,
      companionMode,
      companionPhone,
      companionPin,
      btnSave,
      btnCancel,
      testHlsInput,
      btnTestPlay,
    ].filter(Boolean);
  }

  function updateSiteUrlDisplay() {
    if (!siteUrlCurrent || !input) return;
    const v = (input.value || "").trim();
    siteUrlCurrent.textContent = v ? `Current: ${v}` : "Not set yet — press OK on Address to type";
  }

  function rowWrap(el) {
    if (!el) return null;
    if (el === btnSave || el === btnCancel || el === btnTestPlay) return el;
    return el.closest(".field") || el;
  }

  function applyRowFocus() {
    blurTextFields();
    lockTextFields();
    const list = focusables();
    if (!list.length) return;
    if (rowIndex < 0) rowIndex = 0;
    if (rowIndex >= list.length) rowIndex = list.length - 1;
    for (let i = 0; i < list.length; i++) {
      const wrap = rowWrap(list[i]);
      if (wrap) wrap.classList.toggle("settings-row--active", i === rowIndex);
    }
    const cur = list[rowIndex];
    const labels = {
      [companionMode && companionMode.id]: "Phone companion — OK toggles on/off",
      [input && input.id]: "Site URL — OK to type",
      [companionPhone && companionPhone.id]: "Phone URL — OK to type",
      [companionPin && companionPin.id]: "Pairing PIN — OK to type",
      [testHlsInput && testHlsInput.id]: "Test stream URL — OK to type",
    };
    let msg = "";
    if (cur === btnSave) {
      msg = "OK — saves site URL, pairs phone (if PIN entered), reloads channels.";
    } else if (cur === btnCancel) {
      msg = "OK here — close Settings without saving changes.";
    } else if (cur === btnTestPlay) {
      msg = "OK — test stream (optional).";
    } else if (cur === input) {
      msg = "OK — open keyboard and type your site (e.g. https://example.com). Back closes keyboard.";
    } else if (cur === companionPin) {
      msg = "OK — type 6-digit PIN from phone. Then ↓ to green Save box and OK.";
    } else if (cur && cur.id && labels[cur.id]) {
      msg = labels[cur.id];
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
    Site.saveTestHls(normalizeUrl(testHlsInput.value));
    input.value = url;

    const modeOn = companionMode && companionMode.checked;
    const phoneBase = normalizeUrl(companionPhone ? companionPhone.value : "");

    if (modeOn && typeof Companion !== "undefined") {
      if (!phoneBase.startsWith("http")) {
        rowIndex = focusables().indexOf(companionPhone);
        applyRowFocus();
        showHint("Companion on: enter the phone URL.");
        return;
      }
      Companion.saveSettings(true, phoneBase, Companion.token());
      const pin = (companionPin && companionPin.value) || "";
      if (!Companion.isActive() && pin.length < 6) {
        rowIndex = focusables().indexOf(companionPin);
        applyRowFocus();
        showHint("Enter the 6-digit PIN from Android KPV.");
        return;
      }
      if (pin.length >= 6) {
        try {
          showCompanionStatus("Pairing…");
          await Companion.pair(pin, "Samsung TV");
          Companion.saveSettings(true, phoneBase, Companion.token());
          companionPin.value = "";
          showCompanionStatus("Paired with phone.");
        } catch (e) {
          showCompanionStatus("");
          showHint(e.message || "Pairing failed.");
          return;
        }
      }
    } else if (typeof Companion !== "undefined") {
      Companion.saveSettings(false, "", "");
      Companion.clearToken();
      showCompanionStatus("");
    }

    close();
    onSaved(url);
  }

  function openTestPlayback() {
    Site.load();
    const testUrl =
      normalizeUrl(testHlsInput.value) ||
      Site.testHlsUrl() ||
      "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
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
    if (cur === companionMode) {
      companionMode.checked = !companionMode.checked;
      return;
    }
    if (cur === input || cur === companionPhone || cur === companionPin || cur === testHlsInput) {
      unlockTextField(cur);
      cur.focus();
      showHint("Keyboard open — Back closes keyboard, then ↑↓ to move.");
    }
  }

  function open() {
    Site.load();
    if (typeof Companion !== "undefined") {
      Companion.load();
      input.value = Site.siteOrigin();
      testHlsInput.value = Site.testHlsUrl();
      if (companionMode) companionMode.checked = Companion.isModeOn();
      if (companionPhone) companionPhone.value = Companion.baseUrl();
      if (companionPin) companionPin.value = "";
      if (Companion.isActive()) {
        showCompanionStatus("Paired — streams come from the phone when needed.");
      } else if (Companion.isModeOn()) {
        showCompanionStatus("Companion on — enter PIN and Save to pair.");
      } else {
        showCompanionStatus("Companion off — TV uses the site API only.");
      }
    } else {
      input.value = Site.siteOrigin();
      testHlsInput.value = Site.testHlsUrl();
      showCompanionStatus("");
    }

    panel.classList.remove("hidden");
    panel.classList.add("settings--open");
    panel.setAttribute("aria-hidden", "false");
    if (browse) browse.classList.add("hidden");

    document.body.classList.add("settings-open");
    rowIndex = 0;
    lockTextFields();
    blurTextFields();
    updateSiteUrlDisplay();
    applyRowFocus();
    if (typeof RemoteGuide !== "undefined") {
      RemoteGuide.say("Site URL at top · companion in middle · teal Save box below PIN");
    }

    try {
      panel.tabIndex = 0;
      panel.focus();
    } catch (_) {
      /* ignore */
    }
  }

  function close() {
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
      if (TvKeys.isBack(e)) {
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
    if (isTextEntryActive()) {
      dismissTextEntry();
      e.preventDefault();
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
    companionMode = document.getElementById("companion-mode");
    companionPhone = document.getElementById("companion-phone-url");
    companionPin = document.getElementById("companion-pin");
    companionStatus = document.getElementById("companion-status");
    testHlsInput = document.getElementById("test-hls-url");
    btnSave = document.getElementById("btn-save");
    btnCancel = document.getElementById("btn-cancel");
    btnTestPlay = document.getElementById("btn-test-play");

    hint = document.getElementById("settings-hint");
    siteUrlCurrent = document.getElementById("site-url-current");

    btnSave.addEventListener("click", () => {
      saveAndClose().catch((err) => showHint(err.message || "Save failed."));
    });
    btnCancel.addEventListener("click", close);
    if (btnTestPlay) btnTestPlay.addEventListener("click", openTestPlayback);

    lockTextFields();
    for (const el of textFields()) {
      el.addEventListener("focusin", () => {
        if (!isOpen() || el.readOnly) {
          el.blur();
          if (isOpen()) applyRowFocus();
        }
      });
    }
  }

  return { init, open, close, isOpen, handleBack, handleKeyDown };
})();
