/* global document, CategoryPrefs, TvNav, TvKeys */
/**
 * Settings → Customize categories: reorder sports/leagues and hide them with the remote.
 * Builds its own DOM so TVs updated by a hot bundle (older index.html) still get it.
 */
const CategoryEditor = (() => {
  let panel = null;
  let list = null;
  let hint = null;
  let rows = [];
  let rowIdx = 0;
  let wantCol = 0;
  let known = [];
  let prefs = null;
  let onClose = () => {};

  function isOpen() {
    return Boolean(panel) && !panel.classList.contains("hidden");
  }

  function mount() {
    if (panel) return;
    panel = document.createElement("section");
    panel.className = "settings cat-editor hidden";
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML =
      '<header class="settings-header"><h2>Customize categories</h2>' +
      '<p class="settings-subtitle">↑ ↓ choose · ← → Hide / ▲ / ▼ · OK apply · Back done</p></header>' +
      '<div class="cat-edit-list"></div><p class="settings-hint-bar cat-edit-hint"></p>';
    list = panel.querySelector(".cat-edit-list");
    hint = panel.querySelector(".cat-edit-hint");
    document.body.appendChild(panel);
  }

  /** Adds the "Customize categories" row to the Settings panel; returns its button. */
  function mountSettingsButton(settingsPanel) {
    if (!settingsPanel) return null;
    const block = document.createElement("div");
    block.className = "settings-block settings-block--optional";
    block.innerHTML =
      '<h3 class="settings-block-title">Categories</h3>' +
      '<button type="button" class="settings-secondary-btn">Customize categories</button>';
    const after = settingsPanel.querySelector(".settings-block--save");
    const before = (after && after.nextSibling) || settingsPanel.querySelector(".settings-hint-bar");
    settingsPanel.insertBefore(block, before);
    return block.querySelector("button");
  }

  function buildRows() {
    rows = [{ kind: "reset", key: "", label: "Reset to default" }].concat(CategoryPrefs.editorRows(known, prefs));
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function render() {
    list.innerHTML = "";
    rows.forEach((r, i) => {
      const el = document.createElement("div");
      el.className = `cat-edit-row cat-edit-row--${r.kind}${r.hidden ? " cat-edit-row--hidden" : ""}`;
      if (r.kind === "reset") {
        el.innerHTML = '<button type="button" class="cat-edit-btn">Reset to default</button>';
      } else {
        el.innerHTML =
          `<span class="cat-edit-label">${escapeHtml(r.label)}</span>` +
          `<span class="cat-edit-state">${r.hidden ? "Hidden" : ""}</span>` +
          `<button type="button" class="cat-edit-btn">${r.hidden ? "Show" : "Hide"}</button>` +
          '<button type="button" class="cat-edit-btn" aria-label="Move up">▲</button>' +
          '<button type="button" class="cat-edit-btn" aria-label="Move down">▼</button>';
      }
      Array.prototype.forEach.call(el.querySelectorAll("button"), (b, col) => {
        b.addEventListener("click", () => {
          rowIdx = i;
          wantCol = col;
          activate();
        });
      });
      list.appendChild(el);
    });
    applyFocus();
  }

  function applyFocus() {
    rowIdx = Math.max(0, Math.min(rowIdx, rows.length - 1));
    const rowEl = list.children[rowIdx];
    const buttons = rowEl ? rowEl.querySelectorAll("button") : [];
    const col = Math.min(wantCol, buttons.length - 1);
    for (const b of list.querySelectorAll(".is-focused")) b.classList.remove("is-focused");
    const b = buttons[col];
    if (!b) return;
    b.classList.add("is-focused");
    b.focus();
    b.scrollIntoView({ block: "nearest", behavior: "auto" });
    const overlap = rowEl.getBoundingClientRect().bottom - hint.getBoundingClientRect().top + 12;
    if (overlap > 0) panel.scrollTop += overlap;
    const r = rows[rowIdx];
    if (r.kind === "reset") hint.textContent = "OK — back to the automatic order and show everything.";
    else if (col === 0) hint.textContent = `OK — ${r.hidden ? "show" : "hide"} ${r.label}.`;
    else hint.textContent = `OK — move ${r.label} ${col === 1 ? "up" : "down"}.`;
  }

  function refresh(key) {
    buildRows();
    const i = rows.findIndex((x) => x.key === key);
    if (i >= 0) rowIdx = i;
    render();
  }

  function activate() {
    const r = rows[rowIdx];
    if (!r) return;
    if (r.kind === "reset") {
      CategoryPrefs.reset();
      prefs = CategoryPrefs.load();
      refresh(r.key);
      return;
    }
    const col = Math.min(wantCol, 2);
    if (col === 0) {
      prefs = CategoryPrefs.toggleHidden(prefs, r.key);
    } else {
      const dir = col === 1 ? -1 : 1;
      prefs =
        r.kind === "sport"
          ? CategoryPrefs.moveSport(known, prefs, r.sport, dir)
          : CategoryPrefs.moveLeague(known, prefs, r.sport, r.league, dir);
    }
    CategoryPrefs.save(prefs);
    refresh(r.key);
  }

  function open(options) {
    mount();
    onClose = (options && options.onClose) || onClose;
    known = CategoryPrefs.loadKnown();
    prefs = CategoryPrefs.load();
    buildRows();
    rowIdx = rows.length > 1 ? 1 : 0;
    wantCol = 0;
    const browse = document.getElementById("browse");
    if (browse) browse.classList.add("hidden");
    document.body.classList.add("settings-open");
    panel.classList.remove("hidden");
    panel.setAttribute("aria-hidden", "false");
    render();
    if (rows.length === 1) hint.textContent = "Load channels first, then come back here.";
  }

  function close() {
    if (!isOpen()) return;
    panel.classList.add("hidden");
    panel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("settings-open");
    const browse = document.getElementById("browse");
    if (browse) browse.classList.remove("hidden");
    onClose();
  }

  function handleKeyDown(e) {
    if (!isOpen()) return false;
    const code = e.keyCode;
    if (code === TvNav.KEY.UP) rowIdx -= 1;
    else if (code === TvNav.KEY.DOWN) rowIdx += 1;
    else if (code === TvNav.KEY.LEFT) wantCol = Math.max(0, Math.min(wantCol, 2) - 1);
    else if (code === TvNav.KEY.RIGHT) wantCol = Math.min(2, wantCol + 1);
    else if (TvKeys.isSelect(e)) activate();
    else return false;
    if (code !== TvNav.KEY.ENTER) applyFocus();
    e.preventDefault();
    return true;
  }

  return { open, close, isOpen, handleKeyDown, mountSettingsButton };
})();
