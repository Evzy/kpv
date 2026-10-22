/* global Site, Catalog, Player, TvNav, SettingsPanel, CatalogNav, KPV_APP_VERSION */
(function init() {
  const verEl = document.getElementById("app-version");
  if (verEl && typeof KPV_APP_VERSION === "string" && KPV_APP_VERSION) {
    var shellHint = "";
    try {
      var cached = localStorage.getItem("kpv_bundle_version");
      if (cached && cached !== KPV_APP_VERSION) {
        shellHint = " · bundle " + cached;
      }
    } catch (_) {
      /* ignore */
    }
    verEl.textContent = "v" + KPV_APP_VERSION + shellHint;
  }
  if (!document.getElementById("kpv-tizen-catalog-fix")) {
    const fix = document.createElement("style");
    fix.id = "kpv-tizen-catalog-fix";
    fix.textContent =
      "button.card{color:#e5e7eb!important;margin-right:12px!important;-webkit-appearance:none}" +
      "button.card .title{color:#e5e7eb!important}" +
      "button.card .tag{color:#9ca3af!important}" +
      ".row .card:last-child{margin-right:0!important}" +
      ".category h2{color:#e5e7eb!important}";
    document.head.appendChild(fix);
  }
  TvNav.registerKeys();
  TvNav.wireTopBarFocusRing();
  CatalogNav.wire();
  const status = document.getElementById("status");
  const catalogEl = document.getElementById("catalog");
  const btnRefresh = document.getElementById("btn-refresh");
  let catalogBusy = false;
  let loadingCard = null;

  function setCardLoading(card, loading) {
    if (loadingCard && loadingCard !== card) {
      loadingCard.classList.remove("card--loading");
    }
    loadingCard = loading ? card : null;
    if (card) card.classList.toggle("card--loading", loading);
  }

  async function playFromCard(card, channel) {
    setCardLoading(card, true);
    try {
      await Player.play(channel);
    } catch (err) {
      setCardLoading(card, false);
      setStatus(`Couldn't start ${channel.title}. Try again.`);
      TvNav.focusRefresh();
    }
  }

  SettingsPanel.init({
    onSaved() {
      reloadCatalog();
    },
  });

  function setStatus(msg) {
    status.textContent = msg;
    status.classList.remove("hidden");
    catalogEl.classList.add("hidden");
    TvNav.focusRefresh();
  }

  function renderCatalog(categories) {
    status.classList.add("hidden");
    catalogEl.classList.remove("hidden");
    catalogEl.innerHTML = "";
    for (const cat of categories) {
      const section = document.createElement("section");
      section.className = "category";
      const h2 = document.createElement("h2");
      h2.textContent = cat.name;
      section.appendChild(h2);
      const row = document.createElement("div");
      row.className = "row";
      for (const ch of cat.channels) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = ch.isLive ? "card card--live" : "card";
        btn.innerHTML = `
          <span class="card-poster-wrap">
            <img src="${escapeAttr(ch.poster)}" alt="" loading="lazy" />
            <span class="live-dot" aria-hidden="true"></span>
            <span class="card-tile-spinner" aria-hidden="true"></span>
          </span>
          <div class="title">${escapeHtml(ch.title)}</div>
          <div class="tag">${escapeHtml(ch.tag || "Live")}</div>`;
        const img = btn.querySelector("img");
        if (img) {
          img.addEventListener("error", () => {
            img.removeAttribute("src");
            img.classList.add("poster-missing");
          });
        }
        btn.addEventListener("click", () => playFromCard(btn, ch));
        btn.addEventListener("keydown", (e) => {
          if (e.keyCode === TvNav.KEY.ENTER) {
            e.preventDefault();
            playFromCard(btn, ch);
          }
        });
        row.appendChild(btn);
      }
      section.appendChild(row);
      catalogEl.appendChild(section);
    }
    const first = catalogEl.querySelector(".card");
    if (first) CatalogNav.focusCard(first);
    if (typeof RemoteGuide !== "undefined") {
      RemoteGuide.say("↑ top bar (Refresh / Settings) · OK on a channel to play");
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  function setRefreshBusy(busy) {
    catalogBusy = busy;
    btnRefresh.disabled = busy;
    btnRefresh.classList.toggle("is-busy", busy);
    btnRefresh.setAttribute("aria-busy", busy ? "true" : "false");
  }

  async function reloadCatalog() {
    if (catalogBusy) return;
    Site.load();
    if (!Site.siteOrigin()) {
      setStatus("Set your site URL first: press ↑, then → to the gear, OK for Settings.");
      if (typeof RemoteGuide !== "undefined") {
        RemoteGuide.say("↑ then → to gear · OK opens Settings · Site URL is the first box");
      }
      return;
    }
    setRefreshBusy(true);
    const hadCatalog = !catalogEl.classList.contains("hidden");
    if (!hadCatalog) {
      setStatus("Loading channels…");
    }
    try {
      const categories = await Catalog.load();
      if (!categories) {
        setStatus("Couldn't load catalog. Check the site URL and try Refresh.");
        TvNav.focusRefresh();
        return;
      }
      renderCatalog(categories);
    } catch (err) {
      setStatus(`Couldn't load catalog. ${err && err.message ? err.message : "Try Refresh."}`);
      TvNav.focusRefresh();
    } finally {
      setRefreshBusy(false);
    }
  }

  function openSettings() {
    SettingsPanel.open();
  }

  TvNav.wireSettingsButton(openSettings);
  btnRefresh.addEventListener("click", () => reloadCatalog());
  TvNav.wireRefreshButton(() => reloadCatalog());

  function isBackEvent(e) {
    if (typeof TvKeys !== "undefined" && TvKeys.isBack(e)) return true;
    return e.keyCode === 10009 || e.keyCode === 461 || e.key === "Back" || e.key === "Escape";
  }

  function handleBrowseBack(e) {
    if (!isBackEvent(e)) return false;
    const player = document.getElementById("player");
    if (player && !player.classList.contains("hidden")) {
      Player.hideScreen();
      e.preventDefault();
      return true;
    }
    if (SettingsPanel.isOpen() && SettingsPanel.handleBack(e)) return true;
    if (
      !SettingsPanel.isOpen() &&
      !status.classList.contains("hidden") &&
      catalogEl.classList.contains("hidden")
    ) {
      openSettings();
      e.preventDefault();
      return true;
    }
    return false;
  }

  document.addEventListener("keydown", (e) => {
    const gear = document.getElementById("btn-settings");
    if (
      !SettingsPanel.isOpen() &&
      gear &&
      (document.activeElement === gear || gear.classList.contains("is-focused")) &&
      typeof TvKeys !== "undefined" &&
      TvKeys.isSelect(e)
    ) {
      openSettings();
      e.preventDefault();
      return;
    }
    if (SettingsPanel.isOpen() && SettingsPanel.handleKeyDown(e)) return;
    if (!SettingsPanel.isOpen() && CatalogNav.handleKeyDown(e)) return;
    TvNav.onKeyDown(e, { openSettings });
    handleBrowseBack(e);
  });

  document.addEventListener("tizenhwkey", (e) => {
    if (!e || e.keyName !== "back") return;
    handleBrowseBack({
      keyCode: 10009,
      key: "Back",
      preventDefault: () => e.preventDefault(),
      stopPropagation: () => {},
    });
  });

  reloadCatalog();
})();
