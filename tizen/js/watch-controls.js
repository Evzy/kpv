/* global document, window, TvKeys */
/** On-screen player controls for the remote: a button bar, a source list and short toasts. */
const WatchControls = (() => {
  const KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40 };
  const HIDE_MS = 4000;
  const TOAST_MS = 3500;

  function isSelect(e) {
    if (typeof TvKeys !== "undefined") return TvKeys.isSelect(e);
    return e.keyCode === 13 || e.key === "Enter";
  }

  function isArrow(e) {
    return e.keyCode >= KEY.LEFT && e.keyCode <= KEY.DOWN;
  }

  /** `buttons`: `[{ id, label, onSelect }]` in bar order. */
  function create(buttons) {
    const bar = document.createElement("div");
    bar.className = "watch-bar hidden";
    const toastEl = document.createElement("div");
    toastEl.className = "watch-toast hidden";
    const picker = document.createElement("div");
    picker.className = "watch-picker hidden";
    document.body.appendChild(bar);
    document.body.appendChild(toastEl);
    document.body.appendChild(picker);

    const els = buttons.map((b) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "watch-bar-btn";
      el.textContent = b.label;
      bar.appendChild(el);
      return el;
    });
    let focus = 0;
    let sticky = false;
    let hideTimer = 0;
    let toastTimer = 0;
    let pick = null;

    function paintFocus() {
      els.forEach((el, i) => el.classList.toggle("is-focused", i === focus));
    }

    function armHide() {
      window.clearTimeout(hideTimer);
      if (!sticky) hideTimer = window.setTimeout(hide, HIDE_MS);
    }

    function show() {
      bar.classList.remove("hidden");
      paintFocus();
      armHide();
    }

    function hide() {
      window.clearTimeout(hideTimer);
      bar.classList.add("hidden");
    }

    function isVisible() {
      return !bar.classList.contains("hidden");
    }

    function setLabel(id, label) {
      const i = buttons.findIndex((b) => b.id === id);
      if (i >= 0) els[i].textContent = label;
    }

    /** Keeps the bar up (e.g. while paused) until cleared. */
    function setSticky(on) {
      sticky = Boolean(on);
      if (isVisible()) armHide();
    }

    function toast(msg) {
      toastEl.textContent = msg;
      toastEl.classList.remove("hidden");
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toastEl.classList.add("hidden"), TOAST_MS);
    }

    function paintPicker() {
      Array.prototype.forEach.call(picker.querySelectorAll(".watch-picker-item"), (el, i) => {
        el.classList.toggle("is-focused", i === pick.index);
      });
    }

    /** Shows a list; `onPick(index)` runs on OK. Back is handled by the caller via `closePicker`. */
    function choose(title, labels, current, onPick) {
      hide();
      picker.innerHTML = "";
      const head = document.createElement("div");
      head.className = "watch-picker-title";
      head.textContent = title;
      picker.appendChild(head);
      labels.forEach((label, i) => {
        const el = document.createElement("div");
        el.className = "watch-picker-item";
        el.textContent = (i === current ? "● " : "○ ") + label;
        picker.appendChild(el);
      });
      pick = { index: current, size: labels.length, onPick };
      picker.classList.remove("hidden");
      paintPicker();
    }

    function closePicker() {
      if (!pick) return false;
      pick = null;
      picker.classList.add("hidden");
      return true;
    }

    /** Returns true when the key was used by the bar or the list. */
    function handleKey(e) {
      if (pick) {
        if (e.keyCode === KEY.UP) pick.index = (pick.index + pick.size - 1) % pick.size;
        else if (e.keyCode === KEY.DOWN) pick.index = (pick.index + 1) % pick.size;
        else if (isSelect(e)) {
          const { index, onPick } = pick;
          closePicker();
          onPick(index);
          return true;
        } else return false;
        paintPicker();
        return true;
      }
      if (!isArrow(e) && !isSelect(e)) return false;
      if (!isVisible()) {
        show();
        return true;
      }
      if (e.keyCode === KEY.LEFT) focus = Math.max(0, focus - 1);
      else if (e.keyCode === KEY.RIGHT) focus = Math.min(els.length - 1, focus + 1);
      else if (isSelect(e)) buttons[focus].onSelect();
      paintFocus();
      armHide();
      return true;
    }

    return { show, hide, isVisible, setLabel, setSticky, toast, choose, closePicker, handleKey };
  }

  return { create };
})();
