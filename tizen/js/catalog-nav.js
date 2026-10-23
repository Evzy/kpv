/* global document, localStorage, TvNav */
const CatalogNav = (() => {
  const EDGE = 20;
  const LS_COLLAPSED = "kpv_collapsed_categories";

  function catalogRoot() {
    return document.getElementById("catalog");
  }

  function sections() {
    const root = catalogRoot();
    return root ? [...root.querySelectorAll(".category")] : [];
  }

  function isCollapsed(section) {
    return section.classList.contains("category--collapsed");
  }

  function headOf(section) {
    return section.querySelector(".category-head");
  }

  function cardsOf(section) {
    return [...section.querySelectorAll(".row .card")];
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
    for (const node of root.querySelectorAll(".card--active, .category-head.is-focused")) {
      node.classList.remove("card--active", "is-focused");
    }
    if (!el) return;
    TvNav.markTopBarFocus(null);
    el.classList.add(el.classList.contains("card") ? "card--active" : "is-focused");
  }

  function rememberColumn(card) {
    const section = card.closest(".category");
    if (section) section.dataset.lastIdx = String(cardsOf(section).indexOf(card));
  }

  function focusCard(card) {
    if (!card) return;
    card.focus();
    markFocus(card);
    rememberColumn(card);
    scrollRowToCard(card);
    const section = card.closest(".category");
    if (section) {
      section.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  }

  function focusHead(head) {
    if (!head) return;
    head.focus();
    markFocus(head);
    head.scrollIntoView({ block: "nearest", behavior: "auto" });
  }

  /** Enter a category's row at the column last used there. */
  function focusSectionRow(section) {
    const cards = cardsOf(section);
    if (!cards.length) return false;
    const idx = Math.min(Number(section.dataset.lastIdx) || 0, cards.length - 1);
    focusCard(cards[idx]);
    return true;
  }

  function focusFirst() {
    const all = sections();
    const open = all.find((s) => !isCollapsed(s) && cardsOf(s).length);
    if (open && all.indexOf(open) === 0) {
      focusSectionRow(open);
    } else if (all.length) {
      focusHead(headOf(all[0]));
    }
  }

  function toggleSection(section, name) {
    const collapsed = loadCollapsed();
    const nowCollapsed = !isCollapsed(section);
    section.classList.toggle("category--collapsed", nowCollapsed);
    if (nowCollapsed) collapsed.add(name);
    else collapsed.delete(name);
    saveCollapsed(collapsed);
    const head = headOf(section);
    if (head) {
      head.setAttribute("aria-expanded", nowCollapsed ? "false" : "true");
      focusHead(head);
    }
  }

  function handleHeadKey(head, code, e) {
    const all = sections();
    const section = head.closest(".category");
    const si = all.indexOf(section);
    if (code === TvNav.KEY.LEFT || code === TvNav.KEY.RIGHT) {
      e.preventDefault();
      return true;
    }
    if (code === TvNav.KEY.DOWN) {
      if (!isCollapsed(section) && focusSectionRow(section)) {
        e.preventDefault();
        return true;
      }
      if (si >= 0 && si < all.length - 1) focusHead(headOf(all[si + 1]));
      e.preventDefault();
      return true;
    }
    if (code === TvNav.KEY.UP) {
      if (si > 0) {
        const prev = all[si - 1];
        if (isCollapsed(prev) || !focusSectionRow(prev)) focusHead(headOf(prev));
      } else {
        TvNav.focusRefresh();
      }
      e.preventDefault();
      return true;
    }
    return false;
  }

  function handleCardKey(card, code, e) {
    const section = card.closest(".category");
    const cards = section ? cardsOf(section) : [];
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
    if (code === TvNav.KEY.UP) {
      focusHead(headOf(section));
      e.preventDefault();
      return true;
    }
    if (code === TvNav.KEY.DOWN) {
      const all = sections();
      const si = all.indexOf(section);
      if (si >= 0 && si < all.length - 1) {
        focusHead(headOf(all[si + 1]));
        e.preventDefault();
        return true;
      }
    }
    return false;
  }

  function handleKeyDown(e) {
    const active = document.activeElement;
    if (!active) return false;
    if (active.classList.contains("category-head")) return handleHeadKey(active, e.keyCode, e);
    if (active.classList.contains("card")) return handleCardKey(active, e.keyCode, e);
    return false;
  }

  function wire() {
    const root = catalogRoot();
    if (!root) return;
    root.addEventListener("focusin", (ev) => {
      const el = ev.target.closest(".card, .category-head");
      if (!el) return;
      markFocus(el);
      if (el.classList.contains("card")) {
        scrollRowToCard(el);
        rememberColumn(el);
      }
    });
  }

  return { handleKeyDown, wire, focusCard, focusFirst, markFocus, toggleSection, loadCollapsed };
})();
