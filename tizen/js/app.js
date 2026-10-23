/* global Site, Catalog, Player, TvNav, SettingsPanel, CatalogNav, FixtureLine, LiveScores, CategoryPrefs,
   CategoryEditor, KPV_APP_VERSION */
(function init() {
  const verEl = document.getElementById("app-version");
  if (verEl && typeof KPV_APP_VERSION === "string" && KPV_APP_VERSION) {
    verEl.textContent = "v" + KPV_APP_VERSION;
  }
  if (typeof TvUpdate !== "undefined") {
    TvUpdate.fetchStatus({ useSession: true }).then(function (s) {
      TvUpdate.applyVersionLine(s);
    });
  }
  if (!document.getElementById("kpv-tizen-catalog-fix")) {
    const fix = document.createElement("style");
    fix.id = "kpv-tizen-catalog-fix";
    fix.textContent =
      "button.card{color:#e5e7eb!important;margin-right:12px!important;-webkit-appearance:none}" +
      "button.card .title{color:#e5e7eb!important}" +
      "button.card .tag{color:#9ca3af!important}" +
      "button.card .fixture{color:#5eead4!important}" +
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
    onCustomize() {
      CategoryEditor.open({ onClose: rerenderCatalog });
    },
  });

  function setStatus(msg) {
    status.textContent = msg;
    status.classList.remove("hidden");
    catalogEl.classList.add("hidden");
    TvNav.focusRefresh();
  }

  function makeHead(className, level, name, collapsed, onToggle) {
    const head = document.createElement("button");
    head.type = "button";
    head.className = className;
    head.innerHTML = `<${level}>${escapeHtml(name)}</${level}><span class="category-chevron" aria-hidden="true"></span>`;
    head.setAttribute("aria-expanded", collapsed ? "false" : "true");
    head.addEventListener("click", onToggle);
    head.addEventListener("keydown", (e) => {
      if (e.keyCode === TvNav.KEY.ENTER) {
        e.preventDefault();
        onToggle();
      }
    });
    return head;
  }

  let lastCategories = null;

  /** Re-applies saved order / hidden items to the last loaded catalog (after Customize). */
  function rerenderCatalog() {
    if (lastCategories) renderCatalog(lastCategories);
  }

  function renderCatalog(categories) {
    lastCategories = categories;
    const sports = CategoryPrefs.group(categories);
    CategoryPrefs.rememberKnown(sports);
    const layout = CategoryPrefs.arrange(sports, CategoryPrefs.load());
    if (!layout.length) {
      setStatus("All categories are hidden. Settings → Customize categories to show them.");
      return;
    }
    status.classList.add("hidden");
    catalogEl.classList.remove("hidden");
    catalogEl.innerHTML = "";
    const collapsed = CatalogNav.loadCollapsed();
    const nowSec = Math.floor(Date.now() / 1000);
    const fixtureEls = new Map();
    for (const sport of layout) {
      const section = document.createElement("section");
      section.className = "category";
      section.classList.toggle("category--collapsed", collapsed.has(sport.name));
      section.appendChild(
        makeHead("category-head", "h2", sport.name, collapsed.has(sport.name), () =>
          CatalogNav.toggleSection(section, sport.name),
        ),
      );
      for (const league of sport.leagues) {
        let container = section;
        if (sport.showLeagues) {
          const key = CategoryPrefs.leagueKey(sport.name, league.name);
          const block = document.createElement("div");
          block.className = "league";
          block.classList.toggle("league--collapsed", collapsed.has(key));
          block.appendChild(
            makeHead("league-head", "h3", league.name, collapsed.has(key), () => CatalogNav.toggleLeague(block, key)),
          );
          section.appendChild(block);
          container = block;
        }
        container.appendChild(renderRow(league.channels, nowSec, fixtureEls));
      }
      catalogEl.appendChild(section);
    }
    CatalogNav.focusFirst();
    LiveScores.lookup([...fixtureEls.keys()], nowSec).then((lines) => {
      lines.forEach((text, ch) => {
        fixtureEls.get(ch).textContent = text;
      });
    });
    if (typeof RemoteGuide !== "undefined") {
      RemoteGuide.say("↑ top bar (Refresh / Settings) · OK on a heading to hide/show · OK on a channel to play");
    }
  }

  function renderRow(channels, nowSec, fixtureEls) {
    const row = document.createElement("div");
    row.className = "row";
    for (const ch of channels) {
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
        <div class="fixture">${escapeHtml(FixtureLine.timeLine(ch, nowSec) || "")}</div>
        <div class="tag">${escapeHtml(ch.tag || "Live")}</div>`;
      fixtureEls.set(ch, btn.querySelector(".fixture"));
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
    return row;
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
    if (CategoryEditor.isOpen()) {
      CategoryEditor.close();
      e.preventDefault();
      return true;
    }
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
    if (CategoryEditor.isOpen()) {
      if (!CategoryEditor.handleKeyDown(e)) handleBrowseBack(e);
      return;
    }
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
