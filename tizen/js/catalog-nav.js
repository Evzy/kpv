/* global document, localStorage, TvNav */
const CatalogNav = (() => {
  const EDGE = 20;
  const LS_COLLAPSED = "kpv_collapsed_categories";

  function catalogRoot() {
    return document.getElementById("catalog");
  }

  function isHead(el) {
    return el.classList.contains("category-head") || el.classList.contains("league-head");
  }

  /** Sport headings, league headings and card rows in screen order, skipping collapsed content. */
  function stops() {
    const root = catalogRoot();
    if (!root) return [];
    return [...root.querySelectorAll(".category-head, .league-head, .row")].filter((el) => el.offsetParent !== null);
  }

  function cardsOf(row) {
    return [...row.querySelectorAll(".card")];
  }

  function loadCollapsed() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_COLLAPSED) || "[]");
      return new Set(Array.isArray(raw) ? raw : []);
    } catch (_) {
      return new Set();
    }
  }

  function saveCollapsed(set) {
    try {
      localStorage.setItem(LS_COLLAPSED, JSON.stringify([...set]));
    } catch (_) {
      /* storage unavailable */
    }
  }

  function scrollRowToCard(card) {
    const row = card && card.closest(".row");
    if (!row) return;
    const rowRect = row.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    if (cardRect.right > rowRect.right - EDGE) {
      row.scrollLeft += cardRect.right - rowRect.right + EDGE;
    } else if (cardRect.left < rowRect.left + EDGE) {
      row.scrollLeft -= rowRect.left - cardRect.left + EDGE;
    }
  }

  function markFocus(el) {
    const root = catalogRoot();
    if (!root) return;
    for (const node of root.querySelectorAll(".card--active, .is-focused")) {
      node.classList.remove("card--active", "is-focused");
    }
    if (!el) return;
    TvNav.markTopBarFocus(null);
    el.classList.add(el.classList.contains("card") ? "card--active" : "is-focused");
  }

  function rememberColumn(card) {
    const row = card.closest(".row");
    if (row) row.dataset.lastIdx = String(cardsOf(row).indexOf(card));
  }

  function focusCard(card) {
    if (!card) return;
    card.focus();
    markFocus(card);
    rememberColumn(card);
    scrollRowToCard(card);
    const block = card.closest(".league") || card.closest(".category");
    if (block) block.scrollIntoView({ block: "nearest", behavior: "auto" });
  }

  function focusHead(head) {
    if (!head) return;
    head.focus();
    markFocus(head);
    head.scrollIntoView({ block: "nearest", behavior: "auto" });
  }

  /** Enter a row at the column last used there. */
  function focusRow(row) {
    const cards = cardsOf(row);
    if (!cards.length) return;
    focusCard(cards[Math.min(Number(row.dataset.lastIdx) || 0, cards.length - 1)]);
  }

  function focusStop(stop) {
    if (isHead(stop)) focusHead(stop);
    else focusRow(stop);
  }

  function focusFirst() {
    const all = stops();
    const firstRow = all.filter((s) => !isHead(s))[0];
    if (firstRow && all.indexOf(firstRow) === 1) focusRow(firstRow);
    else if (all.length) focusHead(all[0]);
  }

  function step(from, dir, e) {
    const all = stops();
    const next = all[all.indexOf(from) + dir];
    if (next) focusStop(next);
    else if (dir < 0) TvNav.focusRefresh();
    e.preventDefault();
    return true;
  }

  function toggle(container, key, collapsedClass, headSelector) {
    const collapsed = loadCollapsed();
    const nowCollapsed = !container.classList.contains(collapsedClass);
    container.classList.toggle(collapsedClass, nowCollapsed);
    if (nowCollapsed) collapsed.add(key);
    else collapsed.delete(key);
    saveCollapsed(collapsed);
    const head = container.querySelector(headSelector);
    if (head) {
      head.setAttribute("aria-expanded", nowCollapsed ? "false" : "true");
      focusHead(head);
    }
  }

  function toggleSection(section, name) {
    toggle(section, name, "category--collapsed", ".category-head");
  }

  function toggleLeague(block, key) {
    toggle(block, key, "league--collapsed", ".league-head");
  }

  function handleHeadKey(head, code, e) {
    if (code === TvNav.KEY.LEFT || code === TvNav.KEY.RIGHT) {
      e.preventDefault();
      return true;
    }
    if (code === TvNav.KEY.DOWN) return step(head, 1, e);
    if (code === TvNav.KEY.UP) return step(head, -1, e);
    return false;
  }

  function handleCardKey(card, code, e) {
    const row = card.closest(".row");
    const cards = row ? cardsOf(row) : [];
    const idx = cards.indexOf(card);
    if (idx < 0) return false;
    if (code === TvNav.KEY.LEFT && idx > 0) {
      focusCard(cards[idx - 1]);
      e.preventDefault();
      return true;
    }
    if (code === TvNav.KEY.RIGHT && idx < cards.length - 1) {
      focusCard(cards[idx + 1]);
      e.preventDefault();
      return true;
    }
    if (code === TvNav.KEY.UP) return step(row, -1, e);
    if (code === TvNav.KEY.DOWN) return step(row, 1, e);
    return false;
  }

  function handleKeyDown(e) {
    const active = document.activeElement;
    if (!active || !active.classList) return false;
    if (isHead(active)) return handleHeadKey(active, e.keyCode, e);
    if (active.classList.contains("card")) return handleCardKey(active, e.keyCode, e);
    return false;
  }

  function wire() {
    const root = catalogRoot();
    if (!root) return;
    root.addEventListener("focusin", (ev) => {
      const el = ev.target.closest(".card, .category-head, .league-head");
      if (!el) return;
      markFocus(el);
      if (el.classList.contains("card")) {
        scrollRowToCard(el);
        rememberColumn(el);
      }
    });
  }

  return {
    handleKeyDown,
    wire,
    focusCard,
    focusFirst,
    markFocus,
    toggleSection,
    toggleLeague,
    loadCollapsed,
  };
})();
