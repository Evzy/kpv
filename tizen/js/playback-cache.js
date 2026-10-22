/* global localStorage */
/** Per-channel HLS cache on the TV (replay + retry before hitting the phone). */
const PlaybackCache = (() => {
  const KEY = "kpv_channel_playback_v1";
  const TTL_MS = 45 * 60 * 1000;
  const MAX = 40;

  function readAll() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "{}");
    } catch (_) {
      return {};
    }
  }

  function writeAll(map) {
    try {
      localStorage.setItem(KEY, JSON.stringify(map));
    } catch (_) {
      /* ignore */
    }
  }

  function get(uri) {
    const id = (uri || "").trim();
    if (!id) return null;
    const row = readAll()[id];
    if (!row || !row.hls) return null;
    if (Date.now() - (row.at || 0) > TTL_MS) {
      clear(id);
      return null;
    }
    return row;
  }

  function put(uri, row) {
    const id = (uri || "").trim();
    const hls = (row.hls || "").trim();
    if (!id || !hls.startsWith("http")) return;
    const map = readAll();
    map[id] = {
      hls,
      embed: (row.embed || "").trim(),
      referer: (row.referer || "").trim(),
      at: Date.now(),
    };
    const keys = Object.keys(map);
    while (keys.length > MAX) {
      const oldest = keys.sort((a, b) => (map[a].at || 0) - (map[b].at || 0))[0];
      delete map[oldest];
    }
    writeAll(map);
  }

  function clear(uri) {
    const id = (uri || "").trim();
    if (!id) return;
    const map = readAll();
    delete map[id];
    writeAll(map);
  }

  return { get, put, clear };
})();
