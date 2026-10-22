/* global document */
const RemoteGuide = (() => {
  const el = () => document.getElementById("remote-guide-msg");

  function say(msg) {
    const node = el();
    if (node) node.textContent = msg;
  }

  function hide() {
    const bar = document.getElementById("remote-guide");
    if (bar) bar.classList.add("hidden");
  }

  function show() {
    const bar = document.getElementById("remote-guide");
    if (bar) bar.classList.remove("hidden");
  }

  return { say, hide, show };
})();
