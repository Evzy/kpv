/* global Site, GasmResolve */
/**
 * Resolve a playable HLS URL: playback cache, then site API, then the embed site's decoder
 * run on the TV (GasmResolve).
 */
const StreamResolve = (() => {
  const STORAGE_SNIFF = "kpv_use_embed_sniff";

  function isHls(url) {
    return /\.m3u8(\?|$)/i.test(url || "");
  }

  function pickHlsFromPayload(data) {
    const d = data && (data.data || data);
    if (!d) return "";
    const top = Site.toAbsoluteUrl(d.m3u8 || "");
    if (top.startsWith("http") && isHls(top)) return top;
    for (const src of d.sources || []) {
      const url = Site.toAbsoluteUrl(src.data || src.url || "");
      if (url.startsWith("http") && isHls(url)) return url;
    }
    return "";
  }

  function pickEmbedFromPayload(data) {
    const d = data && (data.data || data);
    if (!d) return "";
    let iframePick = "";
    let defaultPick = "";
    for (const src of d.sources || []) {
      const url = Site.toAbsoluteUrl(src.data || src.url || "");
      if (!url.startsWith("http")) continue;
      const type = String(src.type || "").toLowerCase();
      if (type.includes("iframe") || type.includes("embed") || url.includes("/embed/")) {
        if (!iframePick) iframePick = url;
        if (src.default) defaultPick = url;
      }
    }
    return defaultPick || iframePick;
  }

  function refererForPlay(embedUrl) {
    if (embedUrl && embedUrl.startsWith("http")) return embedUrl;
    return Site.siteOrigin() || "";
  }

  function tvResolveAvailable(embedUrl) {
    return typeof GasmResolve !== "undefined" && GasmResolve.canResolve(embedUrl);
  }

  async function resolveOnTv(embedUrl) {
    if (!tvResolveAvailable(embedUrl)) return { hls: "", note: "" };
    try {
      const url = (await GasmResolve.resolve(embedUrl)).trim();
      if (url.startsWith("http") && isHls(url)) return { hls: url, note: "" };
      return { hls: "", note: "TV decoder returned no playlist." };
    } catch (e) {
      return { hls: "", note: `TV decoder: ${(e && e.message) || e}` };
    }
  }

  function embedSniffEnabled() {
    try {
      return localStorage.getItem(STORAGE_SNIFF) === "1";
    } catch (_) {
      return false;
    }
  }

  async function fetchStreamPayload(uri) {
    if (!uri) return null;
    for (const api of Site.apiCandidates()) {
      try {
        const data = await Site.fetchJson(Site.streamUrl(uri, api));
        Site.rememberApi(api);
        return data;
      } catch (_) {
        /* next */
      }
    }
    return null;
  }

  /**
   * @param {{ uri?: string, hlsUrl?: string, embedUrl?: string }} opts
   * @param {{ skipCache?: boolean, onStep?: (msg: string) => void }} [resolveOpts]
   * @returns {Promise<{ hls: string, embed: string, referer: string, streamData: object|null, usedTvResolver: boolean, fromCache: boolean, tvNote: string, embedSniffEnabled: boolean }>}
   */
  async function resolveForWatch(opts, resolveOpts) {
    const ro = resolveOpts || {};
    const skipCache = ro.skipCache === true;
    const uri = (opts.uri || "").trim();
    let hls = (opts.hlsUrl || "").trim();
    let embed = (opts.embedUrl || "").trim();
    let streamData = null;
    let usedTvResolver = false;
    let fromCache = false;
    let tvNote = "";

    if (!skipCache && uri && typeof PlaybackCache !== "undefined") {
      const cached = PlaybackCache.get(uri);
      if (cached && cached.hls) {
        hls = cached.hls;
        embed = embed || cached.embed || "";
        fromCache = true;
      }
    }

    if (fromCache && hls.startsWith("http")) {
      if (!embed && uri) embed = Site.embedFallback(uri);
      const refererCached = refererForPlay(embed);
      hls = await Site.resolveMediaUrl(hls);
      return {
        hls,
        embed,
        referer: refererCached,
        streamData: null,
        usedTvResolver: false,
        fromCache: true,
        tvNote: "",
        embedSniffEnabled: embedSniffEnabled(),
      };
    }

    if (!hls || !embed) {
      streamData = await fetchStreamPayload(uri);
      if (!hls) hls = pickHlsFromPayload(streamData);
      if (!embed) {
        embed = pickEmbedFromPayload(streamData);
        if (embed) Site.noteEmbedFromUrl(embed);
      }
    }

    if (!embed && uri) embed = Site.embedFallback(uri);

    if (!hls && embed) {
      if (ro.onStep) ro.onStep("Resolving stream on TV…");
      const fromTv = await resolveOnTv(embed);
      hls = fromTv.hls;
      tvNote = fromTv.note;
      usedTvResolver = Boolean(hls);
    }

    if (hls.startsWith("http")) {
      hls = await Site.resolveMediaUrl(hls);
    }

    const referer = refererForPlay(embed);
    if (hls.startsWith("http") && uri && typeof PlaybackCache !== "undefined") {
      PlaybackCache.put(uri, { hls, embed, referer });
    }

    return {
      hls,
      embed,
      referer,
      streamData,
      usedTvResolver,
      fromCache,
      tvNote,
      embedSniffEnabled: embedSniffEnabled(),
    };
  }

  return {
    isHls,
    pickHlsFromPayload,
    pickEmbedFromPayload,
    refererForPlay,
    fetchStreamPayload,
    tvResolveAvailable,
    resolveForWatch,
    embedSniffEnabled,
  };
})();
