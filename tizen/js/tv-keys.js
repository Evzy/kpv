/* global window */
/** Samsung / Tizen remote OK and arrows (keyCodes vary by model). */
const TvKeys = (() => {
  const SELECT = new Set([13, 415, 65376, 65385, 29443, 10252]);

  function isSelect(e) {
    if (!e) return false;
    if (SELECT.has(e.keyCode)) return true;
    const k = e.key || "";
    return k === "Enter" || k === "Select" || k === "MediaSelect";
  }

  function isBack(e) {
    if (!e) return false;
    return (
      e.keyCode === 10009 ||
      e.keyCode === 461 ||
      e.keyCode === 27 ||
      e.key === "Back" ||
      e.key === "XF86Back" ||
      e.key === "Escape"
    );
  }

  const PLAY_PAUSE = new Set([19, 415, 417, 463, 10252, 65307]);

  function isPlayPause(e) {
    if (!e) return false;
    if (PLAY_PAUSE.has(e.keyCode)) return true;
    const k = e.key || "";
    return (
      k === "MediaPlayPause" ||
      k === "Pause" ||
      k === "Play" ||
      k === "MediaPause" ||
      k === "MediaPlay"
    );
  }

  return { isSelect, isBack, isPlayPause };
})();
