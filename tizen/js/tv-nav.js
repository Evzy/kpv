/* global document, tizen */
const TvNav = (() => {
  const KEY = {
    UP: 38,
    DOWN: 40,
    LEFT: 37,
    RIGHT: 39,
    ENTER: 13,
    BACK: 10009,
    MENU: 18,
    MENU_ALT: 457,
    MENU_ALT2: 10182,
  };

  function registerKeys() {
    try {
      if (typeof tizen === "undefined" || !tizen.tvinputdevice) return;
      const names = [
        "Menu",
        "Enter",
        "MediaEnter",
        "ColorF0Red",
        "ColorF1Green",
        "ColorF2Yellow",
        "ColorF3Blue",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
      ];
      for (const name of names) {
        try {
          tizen.tvinputdevice.registerKey(name);
        } catch (_) {
          /* key not on this model */
        }
      }
    } catch (_) {
      /* not on TV */
    }
  }

  function settingsBtn() {
    return document.getElementById("btn-settings");
  }

  function refreshBtn() {
    return document.getElementById("btn-refresh");
  }

  function markTopBarFocus(el) {
    for (const node of [refreshBtn(), settingsBtn()]) {
      if (node) node.classList.remove("is-focused");
    }
    if (!el) return;
    el.classList.add("is-focused");
    try {
      el.focus({ preventScroll: true });
    } catch (_) {
      el.focus();
    }
    if (typeof RemoteGuide !== "undefined") {
      if (el === refreshBtn()) {
        RemoteGuide.say("OK — refresh channel list");
      } else if (el === settingsBtn()) {
        RemoteGuide.say("OK — open Settings (Site URL is at the top)");
      }
    }
  }

  function focusSettings() {
    markTopBarFocus(settingsBtn());
  }

  function focusRefresh() {
    markTopBarFocus(refreshBtn());
  }

  function wireTopBarFocusRing() {
    for (const node of [refreshBtn(), settingsBtn()]) {
      if (!node) continue;
      node.addEventListener("focusin", () => markTopBarFocus(node));
      node.addEventListener("click", () => markTopBarFocus(node));
    }
  }

  function isTopBarControl(el) {
    return el === settingsBtn() || el === refreshBtn();
  }

  function isFirstRowCard(el) {
    if (!el || !el.classList.contains("card")) return false;
    const row = el.closest(".row");
    return Boolean(row && row.querySelector(".card") === el);
  }

  function statusVisible() {
    const status = document.getElementById("status");
    return status && !status.classList.contains("hidden");
  }

  function browseBlocked() {
    const player = document.getElementById("player");
    const settings = document.getElementById("settings");
    const settingsOpen = settings && !settings.classList.contains("hidden");
    return (player && !player.classList.contains("hidden")) || settingsOpen;
  }

  function focusTopBarFromAnywhere() {
    const active = document.activeElement;
    if (isTopBarControl(active)) return;
    focusRefresh();
  }

  function onKeyDown(e, handlers) {
    if (browseBlocked()) return;

    const code = e.keyCode;
    const active = document.activeElement;

    if (code === KEY.MENU || code === KEY.MENU_ALT || code === KEY.MENU_ALT2) {
      handlers.openSettings();
      e.preventDefault();
      return;
    }

    if (code === KEY.UP) {
      if (
        statusVisible() ||
        active === document.getElementById("browse") ||
        active === document.body ||
        !active ||
        isFirstRowCard(active)
      ) {
        focusRefresh();
        e.preventDefault();
      }
      return;
    }

    if (code === KEY.DOWN && isTopBarControl(active)) {
      const first = document.querySelector("#catalog .card");
      if (first) {
        first.focus();
        e.preventDefault();
      }
      return;
    }

    if (code === KEY.LEFT) {
      if (active === settingsBtn()) {
        focusRefresh();
        e.preventDefault();
        return;
      }
      if (!isTopBarControl(active) && (statusVisible() || !document.querySelector("#catalog .card"))) {
        focusRefresh();
        e.preventDefault();
      }
      return;
    }

    if (code === KEY.RIGHT) {
      if (active === refreshBtn()) {
        focusSettings();
        e.preventDefault();
        return;
      }
      if (active === settingsBtn()) {
        e.preventDefault();
      }
    }
  }

  function wireSettingsButton(openSettings) {
    const btn = settingsBtn();
    if (!btn) return;
    btn.addEventListener("keydown", (e) => {
      if (typeof TvKeys !== "undefined" ? TvKeys.isSelect(e) : e.keyCode === KEY.ENTER) {
        openSettings();
        e.preventDefault();
      }
    });
    btn.addEventListener("click", () => openSettings());
  }

  function wireRefreshButton(onRefresh) {
    const btn = refreshBtn();
    if (!btn) return;
    btn.addEventListener("keydown", (e) => {
      if (typeof TvKeys !== "undefined" ? TvKeys.isSelect(e) : e.keyCode === KEY.ENTER) {
        onRefresh();
        e.preventDefault();
      }
    });
  }

  return {
    registerKeys,
    focusSettings,
    focusRefresh,
    onKeyDown,
    wireSettingsButton,
    wireRefreshButton,
    wireTopBarFocusRing,
    markTopBarFocus,
    focusTopBarFromAnywhere,
    KEY,
  };
})();
