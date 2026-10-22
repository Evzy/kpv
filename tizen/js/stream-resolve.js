/* global Site, GasmResolve */
/**
 * Resolve a playable HLS URL: playback cache, then site API, then the embed site's decoder
 * run on the TV (GasmResolve), then the paired phone companion.
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

  function companionReady() {
    return typeof Companion !== "undefined" && Companion.isActive();
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

  const RESOLVE_TIMEOUT_MS = 48_000;

  function streamApiPath(uri) {
    const segments = String(uri || "")
      .split("/")
      .filter(Boolean)
      .map((s) => encodeURIComponent(s));
    return `/api/streams/${segments.join("/")}`;
  }

  /** Paired companion: ask phone for this uri only (API → cache → embed sniff). */
  async function fetchFromCompanion(uri, embedUrl, refresh) {
    if (!companionReady() || !uri) return { hls: "", note: "" };
    const q = new URLSearchParams();
    q.set("uri", uri);
    if (embedUrl.startsWith("http")) q.set("embed", embedUrl);
    if (refresh) q.set("refresh", "1");

    try {
      const apiQ = refresh ? "?resolve=1&refresh=1" : "?resolve=1";
      const detail = await Companion.fetchJson(
        `${streamApiPath(uri)}${apiQ}`,
        undefined,
        RESOLVE_TIMEOUT_MS,
      );
      const fromApi = pickHlsFromPayload(detail);
      if (fromApi.startsWith("http") && isHls(fromApi)) {
        return { hls: fromApi, note: "" };
      }
    } catch (e) {
      const apiMsg = (e && e.message) || "";
      if (apiMsg.includes("not paired")) {
        return { hls: "", note: apiMsg };
      }
      /* fall through to /resolve */
    }

    try {
      const body = await Companion.fetchJson(
        `/resolve?${q.toString()}`,
        undefined,
        RESOLVE_TIMEOUT_MS,
      );
      const raw = (body.m3u8 || body.url || body.hls || "").trim();
      if (raw.startsWith("http") && isHls(raw)) {
        return { hls: raw, note: "" };
      }
      return {
        hls: "",
        note: body.error || "Phone answered but sent no .m3u8 playlist URL.",
      };
    } catch (e) {
      const msg = (e && e.message) || "Companion request failed";
      return { hls: "", note: msg };
    }
  }

  /** Fire-and-forget: phone starts resolving this channel before watch.html loads. */
  function prepareOnPhone(uri, embedUrl) {
    if (!companionReady() || !uri) return;
    const q = new URLSearchParams();
    q.set("uri", uri);
    if (embedUrl && embedUrl.startsWith("http")) q.set("embed", embedUrl);
    Companion.fetchJson(`/prepare?${q.toString()}`, undefined, 4_000).catch(() => {});
  }

  /**
   * @returns {Promise<{ hls: string, embed: string, referer: string, streamData: object|null, usedResolver: boolean }>}
   */
  async function resolveForWatch(opts, resolveOpts) {
    const ro = resolveOpts || {};
    const forcePhone = ro.forcePhone === true;
    const skipCache = ro.skipCache === true || forcePhone;
    const uri = (opts.uri || "").trim();
    let hls = forcePhone ? "" : (opts.hlsUrl || "").trim();
    let embed = (opts.embedUrl || "").trim();
    let streamData = null;
    let usedResolver = false;
    let usedTvResolver = false;
    let fromCache = false;
    let companionNote = "";
    let tvNote = "";

    if (!forcePhone && !skipCache && uri && typeof PlaybackCache !== "undefined") {
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
        usedResolver: false,
        fromCache: true,
        companionNote: "",
        embedSniffEnabled: embedSniffEnabled(),
      };
    }

    if (!forcePhone && (!hls || !embed)) {
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

    if (!hls && uri && companionReady()) {
      const fromPhone = await fetchFromCompanion(uri, embed, forcePhone);
      hls = fromPhone.hls;
      companionNote = fromPhone.note || "";
      usedResolver = Boolean(hls);
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
      usedResolver,
      usedTvResolver,
      fromCache,
      companionNote,
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
    fetchFromCompanion,
    prepareOnPhone,
    companionReady,
    tvResolveAvailable,
    resolveForWatch,
    embedSniffEnabled,
  };
})();
