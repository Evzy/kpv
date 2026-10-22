/* global document, TvNav */
const CatalogNav = (() => {
  const EDGE = 20;

  function catalogRoot() {
    return document.getElementById("catalog");
  }

  function cardsInRow(card) {
    const row = card.closest(".row");
    return row ? [...row.querySelectorAll(".card")] : [];
  }

  function allRows() {
    const root = catalogRoot();
    return root ? [...root.querySelectorAll(".row")] : [];
  }

  function rowOf(card) {
    return card.closest(".row");
  }

  function rowIndex(card) {
    const row = rowOf(card);
    if (!row) return -1;
    return allRows().indexOf(row);
  }

  function scrollRowToCard(card) {
    const row = rowOf(card);
    if (!row || !card) return;
    const rowRect = row.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    if (cardRect.right > rowRect.right - EDGE) {
      row.scrollLeft += cardRect.right - rowRect.right + EDGE;
    } else if (cardRect.left < rowRect.left + EDGE) {
      row.scrollLeft -= rowRect.left - cardRect.left + EDGE;
    }
  }

  function focusCard(card) {
    if (!card) return;
    card.focus();
    scrollRowToCard(card);
    const section = card.closest(".category");
    if (section) {
      section.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  }

  function markFocus(card) {
    const root = catalogRoot();
    if (!root) return;
    for (const el of root.querySelectorAll(".card--active")) {
      el.classList.remove("card--active");
    }
    if (card) card.classList.add("card--active");
  }

  function handleKeyDown(e) {
    const active = document.activeElement;
    if (!active || !active.classList.contains("card")) return false;

    const code = e.keyCode;
    const cards = cardsInRow(active);
    const idx = cards.indexOf(active);
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
      const rows = allRows();
      const ri = rowIndex(active);
      if (ri > 0) {
        const prev = [...rows[ri - 1].querySelectorAll(".card")];
        focusCard(prev[Math.min(idx, prev.length - 1)]);
        e.preventDefault();
        return true;
      }
      return false;
    }

    if (code === TvNav.KEY.DOWN) {
      const rows = allRows();
      const ri = rowIndex(active);
      if (ri >= 0 && ri < rows.length - 1) {
        const next = [...rows[ri + 1].querySelectorAll(".card")];
        focusCard(next[Math.min(idx, next.length - 1)]);
        e.preventDefault();
        return true;
      }
    }

    return false;
  }

  function wire() {
    const root = catalogRoot();
    if (!root) return;
    root.addEventListener("focusin", (ev) => {
      const card = ev.target.closest(".card");
      if (card) {
        markFocus(card);
        scrollRowToCard(card);
      }
    });
  }

  return { handleKeyDown, wire, focusCard, markFocus };
})();
