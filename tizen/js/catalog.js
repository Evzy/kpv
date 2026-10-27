/* global Site, StreamLive, StreamSources */
const Catalog = (() => {
  async function load() {
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
          startsAt: Number(s.starts_at) || 0,
          endsAt: Number(s.ends_at) || 0,
          alwaysLive: s.always_live === 1 || s.always_live === true,
          id: Number(s.id) || 0,
          sources: StreamSources.fromStream(s),
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
