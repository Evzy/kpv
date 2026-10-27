/**
 * Playback runs in the full-page Hls.js player (hls-shell.html).
 */
const TizenPlay = (() => {
  function openHlsShell(hls, meta) {
    const q = new URLSearchParams();
    q.set("url", hls);
    q.set("t", meta.title || "Stream");
    if (meta.referer) q.set("ref", meta.referer);
    if (meta.embed && meta.embed.startsWith("http")) q.set("embed", meta.embed);
    window.location.replace(`hls-shell.html?${q.toString()}`);
  }

  return { openHlsShell };
})();
