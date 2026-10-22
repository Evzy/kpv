/* global Site, StreamLive */
const Catalog = (() => {
  async function load() {
    if (typeof Companion !== "undefined" && Companion.isActive()) {
      try {
        const data = await Companion.fetchJson("/catalog/playback", undefined, 8_000);
        const categories = parse(data);
        if (categories.length) return categories;
      } catch (_) {
        /* fall back to site API */
      }
    }
    for (const api of Site.apiCandidates()) {
      try {
        const data = await Site.fetchJson(Site.streamsUrl(api));
        const categories = parse(data);
        if (categories.length) {
          Site.rememberApi(api);
          return categories;
        }
      } catch (_) {
        /* try next */
      }
    }
    return null;
  }

  function parse(data) {
    const nowSec = Number(data.timestamp) || Math.floor(Date.now() / 1000);
    const blocks = data.streams || [];
    const out = [];
    for (const block of blocks) {
      const name = block.category || "";
      const streams = block.streams || [];
      const channels = [];
      for (const s of streams) {
        const uri = s.uri_name;
        if (!uri) continue;
        if (s.iframe && s.iframe.startsWith("http")) {
          Site.noteEmbedFromUrl(s.iframe);
        }
        const hls = (s.m3u8 || "").trim();
        channels.push({
          title: s.name || uri,
          tag: s.tag || "",
          uri,
          poster: s.poster || "",
          iframe: s.iframe || "",
          hlsUrl: hls.startsWith("http") ? hls : "",
          referer: (s.referer || "").trim(),
          isLive: StreamLive.isStreamLive(s, nowSec),
        });
      }
      if (channels.length) {
        out.push({ name, channels: StreamLive.sortChannelsLiveFirst(channels) });
      }
    }
    return StreamLive.sortCategoriesLiveFirst(out);
  }

  return { load, parse };
})();
