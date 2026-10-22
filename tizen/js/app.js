/* global Site, Catalog, Player, TvNav, SettingsPanel, CatalogNav */
(function init() {
  TvNav.registerKeys();
  TvNav.wireTopBarFocusRing();
  CatalogNav.wire();
  const status = document.getElementById("status");
  const catalogEl = document.getElementById("catalog");
  const btnRefresh = document.getElementById("btn-refresh");
  let catalogBusy = false;

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
        btn.className = "card";
        btn.innerHTML = `
          <img src="${escapeAttr(ch.poster)}" alt="" loading="lazy" />
          <div class="title">${escapeHtml(ch.title)}</div>
          <div class="tag">${escapeHtml(ch.tag || "Live")}</div>`;
        btn.addEventListener("click", () => Player.play(ch));
        btn.addEventListener("keydown", (e) => {
          if (e.keyCode === TvNav.KEY.ENTER) {
            e.preventDefault();
            Player.play(ch);
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
    const categories = await Catalog.load();
    setRefreshBusy(false);
    if (!categories) {
      setStatus("Couldn't load catalog. Check the site URL and try Refresh.");
      TvNav.focusRefresh();
      return;
    }
    renderCatalog(categories);
  }

  function openSettings() {
    SettingsPanel.open();
  }

  TvNav.wireSettingsButton(openSettings);
  btnRefresh.addEventListener("click", () => reloadCatalog());
  TvNav.wireRefreshButton(() => reloadCatalog());

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

    if (e.keyCode === 10009 || e.key === "Back" || e.key === "Escape") {
      if (!document.getElementById("player").classList.contains("hidden")) {
        Player.hideScreen();
        e.preventDefault();
        return;
      }
      if (SettingsPanel.handleBack(e)) return;
    }
  });

  reloadCatalog();
})();
