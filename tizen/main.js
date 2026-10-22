/* global window */
const Site = (() => {
  const STORAGE_KEY = "kpv_site_url";
  const STORAGE_API = "kpv_resolved_api";
  const STORAGE_RESOLVER = "kpv_resolver_url";
  const STORAGE_TEST_HLS = "kpv_test_hls_url";
  let site = "";
  let resolvedApi = "";
  let resolvedEmbed = "";

  function normalize(url) {
    return (url || "").trim().replace(/\/+$/, "");
  }

  let resolver = "";
  let testHls = "";

  function load() {
    site = normalize(localStorage.getItem(STORAGE_KEY) || "");
    resolvedApi = normalize(localStorage.getItem(STORAGE_API) || "");
    resolver = normalize(localStorage.getItem(STORAGE_RESOLVER) || "");
    testHls = normalize(localStorage.getItem(STORAGE_TEST_HLS) || "");
    resolvedEmbed = "";
  }

  function saveSite(url) {
    site = normalize(url);
    localStorage.setItem(STORAGE_KEY, site);
    localStorage.removeItem(STORAGE_API);
    resolvedApi = "";
    resolvedEmbed = "";
  }

  function rememberApi(api) {
    resolvedApi = normalize(api);
    localStorage.setItem(STORAGE_API, resolvedApi);
  }

  function noteEmbedFromUrl(playerUrl) {
    if (!playerUrl || !playerUrl.startsWith("http")) return;
    try {
      resolvedEmbed = normalize(new URL(playerUrl).origin);
    } catch (_) {
      /* ignore */
    }
  }

  function apiCandidates() {
    if (!site) return [];
    const out = [];
    if (resolvedApi) out.push(resolvedApi);
    try {
      const u = new URL(site);
      const host = u.hostname;
      if (!host.startsWith("api.")) {
        out.push(`${u.protocol}//api.${host}`);
      }
      out.push(site);
    } catch (_) {
      out.push(site);
    }
    return [...new Set(out.map(normalize))];
  }

  function saveResolver(url) {
    resolver = normalize(url);
    if (resolver) localStorage.setItem(STORAGE_RESOLVER, resolver);
    else localStorage.removeItem(STORAGE_RESOLVER);
  }

  function saveTestHls(url) {
    testHls = normalize(url);
    if (testHls) localStorage.setItem(STORAGE_TEST_HLS, testHls);
    else localStorage.removeItem(STORAGE_TEST_HLS);
  }

  function resolverOrigin() {
    return resolver;
  }

  function testHlsUrl() {
    return testHls;
  }

  function siteOrigin() {
    return site;
  }

  function apiOrigin() {
    return resolvedApi || site;
  }

  function embedOrigin() {
    return resolvedEmbed || apiOrigin();
  }

  function streamsUrl(apiBase) {
    return `${normalize(apiBase)}/api/streams`;
  }

  function streamUrl(uri, apiBase) {
    const enc = uri.split("/").map(encodeURIComponent).join("/");
    return `${normalize(apiBase)}/api/streams/${enc}`;
  }

  function livePageUrl(uri) {
    return `${site}/live/${uri}`;
  }

  function embedFallback(uri) {
    const base = embedOrigin() || siteOrigin() || apiOrigin();
    if (!base || !uri) return "";
    return `${normalize(base)}/embed/${uri}`;
  }

  function toAbsoluteUrl(url) {
    const raw = (url || "").trim();
    if (!raw) return "";
    if (raw.startsWith("http")) return raw;
    if (!site) return "";
    try {
      return new URL(raw, `${site}/`).href.replace(/\/+$/, "");
    } catch (_) {
      return "";
    }
  }

  async function fetchJson(url) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Referer: `${site}/`,
        Origin: site,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /** Follow redirects so AVPlay gets a final HTTPS playlist URL when possible. */
  async function resolveMediaUrl(url) {
    const start = (url || "").trim();
    if (!start.startsWith("http")) return start;
    try {
      const res = await fetch(start, {
        method: "GET",
        redirect: "follow",
        headers: { Referer: `${site}/`, Origin: site },
      });
      return res.url || start;
    } catch (_) {
      return start;
    }
  }

  load();

  return {
    load,
    saveSite,
    saveResolver,
    saveTestHls,
    resolverOrigin,
    testHlsUrl,
    rememberApi,
    noteEmbedFromUrl,
    apiCandidates,
    siteOrigin,
    apiOrigin,
    embedOrigin,
    streamsUrl,
    streamUrl,
    livePageUrl,
    embedFallback,
    toAbsoluteUrl,
    fetchJson,
    resolveMediaUrl,
  };
})();


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
    return e.keyCode === 10009 || e.key === "Back" || e.key === "Escape";
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


/* global Site */
/** TV ↔ phone companion: streams only when mode on + paired token. */
const Companion = (() => {
  const MODE_KEY = "kpv_companion_mode";
  const BASE_KEY = "kpv_companion_base";
  const TOKEN_KEY = "kpv_companion_token";

  function load() {
    Site.load();
  }

  function isModeOn() {
    try {
      return localStorage.getItem(MODE_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function baseUrl() {
    return (localStorage.getItem(BASE_KEY) || "").trim().replace(/\/+$/, "");
  }

  function token() {
    return (localStorage.getItem(TOKEN_KEY) || "").trim();
  }

  function isActive() {
    return isModeOn() && baseUrl().startsWith("http") && token().length > 8;
  }

  function saveSettings(modeOn, base, tok) {
    const b = (base || "").trim().replace(/\/+$/, "");
    if (modeOn) localStorage.setItem(MODE_KEY, "1");
    else localStorage.removeItem(MODE_KEY);
    if (b.startsWith("http")) localStorage.setItem(BASE_KEY, b);
    else localStorage.removeItem(BASE_KEY);
    if (tok) localStorage.setItem(TOKEN_KEY, tok);
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  function authHeaders() {
    const h = { Accept: "application/json" };
    if (token()) h.Authorization = `Bearer ${token()}`;
    return h;
  }

  async function fetchJson(path, init, timeoutMs) {
    const base = baseUrl();
    if (!base.startsWith("http")) throw new Error("no companion base");
    const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
    const ms = timeoutMs || 8_000;
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? window.setTimeout(() => ctrl.abort(), ms) : null;
    const res = await fetch(url, {
      ...init,
      signal: ctrl ? ctrl.signal : undefined,
      headers: { ...authHeaders(), ...(init && init.headers) },
    });
    if (timer) window.clearTimeout(timer);
    if (res.status === 401) {
      clearToken();
      throw new Error("not paired");
    }
    let body = {};
    try {
      body = await res.json();
    } catch (_) {
      body = {};
    }
    if (!res.ok) {
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return body;
  }

  async function pair(pin, deviceLabel) {
    const base = baseUrl();
    if (!base.startsWith("http")) throw new Error("Enter phone URL first");
    const res = await fetch(`${base}/pair`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ pin: String(pin || "").trim(), device: deviceLabel || "Samsung TV" }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || `Pair failed (${res.status})`);
    }
    const tok = (body.token || "").trim();
    if (!tok) throw new Error("No token returned");
    localStorage.setItem(TOKEN_KEY, tok);
    return tok;
  }

  async function verifyPaired() {
    if (!isActive()) return false;
    try {
      await fetchJson("/info");
      return true;
    } catch (_) {
      return false;
    }
  }

  return {
    load,
    isModeOn,
    baseUrl,
    token,
    isActive,
    saveSettings,
    clearToken,
    fetchJson,
    pair,
    verifyPaired,
  };
})();


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


/* global Site */
/**
 * Resolve a playable HLS URL the way IPTV Tizen apps do: API first, optional LAN resolver.
 * No in-widget JW/embed engine on the default path (testable without a TV).
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
    let fromCache = false;
    let companionNote = "";

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
      fromCache,
      companionNote,
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
    resolveForWatch,
    embedSniffEnabled,
  };
})();


/* global Site */
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
        });
      }
      if (channels.length) out.push({ name, channels });
    }
    return out;
  }

  return { load, parse };
})();


/* global Site, StreamResolve, Companion, PlaybackCache */
/**
 * TV playback: watch.html → direct .m3u8 → AVPlay → hls-shell (sky-iptv / TVapp style).
 */
const Player = (() => {
  function isHlsUrl(url) {
    return Boolean(url && /\.m3u8(\?|$)/i.test(url));
  }

  function pickSourceUrl(src) {
    const url = Site.toAbsoluteUrl(src.data || src.url || "");
    if (!url.startsWith("http")) return null;
    const type = String(src.type || "").toLowerCase();
    if (type.includes("iframe") || type.includes("embed")) {
      return { kind: "embed", url };
    }
    if (isHlsUrl(url) || type.includes("hls") || type.includes("mpegurl")) {
      return { kind: "hls", url };
    }
    return { kind: "embed", url };
  }

  async function resolvePlayTarget(channel) {
    if (channel.hlsUrl && channel.hlsUrl.startsWith("http")) {
      const embed =
        (channel.iframe && channel.iframe.startsWith("http") && channel.iframe) ||
        Site.embedFallback(channel.uri);
      if (embed) Site.noteEmbedFromUrl(embed);
      return { mode: "hls", url: embed || channel.hlsUrl, hlsUrl: channel.hlsUrl };
    }
    if (channel.iframe && channel.iframe.startsWith("http")) {
      Site.noteEmbedFromUrl(channel.iframe);
      if (isHlsUrl(channel.iframe)) {
        return { mode: "hls", url: channel.iframe, hlsUrl: channel.iframe };
      }
      return { mode: "embed", url: channel.iframe, hlsUrl: "" };
    }

    for (const api of Site.apiCandidates()) {
      try {
        const data = await Site.fetchJson(Site.streamUrl(channel.uri, api));
        const payload = data.data || {};
        const sources = payload.sources || [];
        let embedPick = null;
        let hlsPick = null;
        let defaultPick = null;

        for (const src of sources) {
          const raw = Site.toAbsoluteUrl(src.data || src.url || "");
          if (raw.startsWith("http") && isHlsUrl(raw) && !hlsPick) hlsPick = raw;
          const picked = pickSourceUrl(src);
          if (!picked) continue;
          if (picked.kind === "embed" && !embedPick) embedPick = picked.url;
          if (picked.kind === "hls" && !hlsPick) hlsPick = picked.url;
          if (src.default && !defaultPick) defaultPick = picked;
        }

        Site.rememberApi(api);

        const topM3u8 = (payload.m3u8 || "").trim();
        const apiHls =
          hlsPick || (topM3u8.startsWith("http") && isHlsUrl(topM3u8) ? topM3u8 : null);
        const apiEmbed =
          (defaultPick && defaultPick.kind === "embed" ? defaultPick.url : null) ||
          embedPick ||
          (defaultPick ? defaultPick.url : null);

        if (apiEmbed) Site.noteEmbedFromUrl(apiEmbed);
        if (apiHls) Site.noteEmbedFromUrl(apiHls);

        return {
          mode: apiHls ? "hls" : "embed",
          url: apiEmbed || apiHls || Site.embedFallback(channel.uri),
          hlsUrl: apiHls || "",
        };

      } catch (_) {
        /* try next */
      }
    }

    return {
      mode: "embed",
      url: Site.embedFallback(channel.uri),
      hlsUrl: "",
    };
  }

  function openWatchPage(channel, target) {
    const pack = {
      u: target.url,
      hls: target.hlsUrl || "",
      uri: channel.uri || "",
      t: channel.title || "Stream",
      mode: target.mode,
    };
    try {
      sessionStorage.setItem("kpv_watch", JSON.stringify(pack));
    } catch (_) {
      /* ignore */
    }
    const q = new URLSearchParams();
    q.set("u", pack.u);
    q.set("t", pack.t);
    q.set("mode", pack.mode);
    if (pack.uri) q.set("uri", pack.uri);
    if (pack.hls) q.set("hls", pack.hls);
    window.location.href = `watch.html?${q.toString()}`;
  }

  async function play(channel) {
    stepStatus(`Loading ${channel.title}…`);

    if (typeof PlaybackCache !== "undefined" && channel.uri) {
      const cached = PlaybackCache.get(channel.uri);
      if (cached && cached.hls) {
        openWatchPage(channel, {
          mode: "hls",
          url:
            (cached.embed && cached.embed.startsWith("http") && cached.embed) ||
            (channel.iframe && channel.iframe.startsWith("http") && channel.iframe) ||
            Site.embedFallback(channel.uri),
          hlsUrl: cached.hls,
        });
        return;
      }
    }

    if (
      typeof StreamResolve !== "undefined" &&
      StreamResolve.companionReady() &&
      channel.uri
    ) {
      const embed =
        (channel.iframe && channel.iframe.startsWith("http") && channel.iframe) ||
        "";
      StreamResolve.prepareOnPhone(channel.uri, embed);
    }
    const target = await resolvePlayTarget(channel);
    openWatchPage(channel, target);
  }

  function stepStatus(msg) {
    const el = document.getElementById("player-loading");
    const text =
      document.getElementById("loading-text") ||
      document.querySelector(".player-loading-text");
    if (text) text.textContent = msg;
    if (el) el.classList.remove("hidden");
  }

  function hideScreen() {
    window.location.href = "index.html";
  }

  return { play, hideScreen, stop: hideScreen };
})();


/* global document, tizen */
const TvNav = (() => {
  const KEY = {
    UP: 38,
    DOWN: 40,
    LEFT: 37,
    RIGHT: 39,
    ENTER: 13,
    BACK: 10009,
    MENU: 18,
    MENU_ALT: 457,
    MENU_ALT2: 10182,
  };

  function registerKeys() {
    try {
      if (typeof tizen === "undefined" || !tizen.tvinputdevice) return;
      const names = [
        "Menu",
        "Enter",
        "MediaEnter",
        "ColorF0Red",
        "ColorF1Green",
        "ColorF2Yellow",
        "ColorF3Blue",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
      ];
      for (const name of names) {
        try {
          tizen.tvinputdevice.registerKey(name);
        } catch (_) {
          /* key not on this model */
        }
      }
    } catch (_) {
      /* not on TV */
    }
  }

  function settingsBtn() {
    return document.getElementById("btn-settings");
  }

  function refreshBtn() {
    return document.getElementById("btn-refresh");
  }

  function markTopBarFocus(el) {
    for (const node of [refreshBtn(), settingsBtn()]) {
      if (node) node.classList.remove("is-focused");
    }
    if (!el) return;
    el.classList.add("is-focused");
    try {
      el.focus({ preventScroll: true });
    } catch (_) {
      el.focus();
    }
    if (typeof RemoteGuide !== "undefined") {
      if (el === refreshBtn()) {
        RemoteGuide.say("OK — refresh channel list");
      } else if (el === settingsBtn()) {
        RemoteGuide.say("OK — open Settings (Site URL is at the top)");
      }
    }
  }

  function focusSettings() {
    markTopBarFocus(settingsBtn());
  }

  function focusRefresh() {
    markTopBarFocus(refreshBtn());
  }

  function wireTopBarFocusRing() {
    for (const node of [refreshBtn(), settingsBtn()]) {
      if (!node) continue;
      node.addEventListener("focusin", () => markTopBarFocus(node));
      node.addEventListener("click", () => markTopBarFocus(node));
    }
  }

  function isTopBarControl(el) {
    return el === settingsBtn() || el === refreshBtn();
  }

  function isFirstRowCard(el) {
    if (!el || !el.classList.contains("card")) return false;
    const row = el.closest(".row");
    return Boolean(row && row.querySelector(".card") === el);
  }

  function statusVisible() {
    const status = document.getElementById("status");
    return status && !status.classList.contains("hidden");
  }

  function browseBlocked() {
    const player = document.getElementById("player");
    const settings = document.getElementById("settings");
    const settingsOpen = settings && !settings.classList.contains("hidden");
    return (player && !player.classList.contains("hidden")) || settingsOpen;
  }

  function focusTopBarFromAnywhere() {
    const active = document.activeElement;
    if (isTopBarControl(active)) return;
    focusRefresh();
  }

  function onKeyDown(e, handlers) {
    if (browseBlocked()) return;

    const code = e.keyCode;
    const active = document.activeElement;

    if (code === KEY.MENU || code === KEY.MENU_ALT || code === KEY.MENU_ALT2) {
      handlers.openSettings();
      e.preventDefault();
      return;
    }

    if (code === KEY.UP) {
      if (
        statusVisible() ||
        active === document.getElementById("browse") ||
        active === document.body ||
        !active ||
        isFirstRowCard(active)
      ) {
        focusRefresh();
        e.preventDefault();
      }
      return;
    }

    if (code === KEY.DOWN && isTopBarControl(active)) {
      const first = document.querySelector("#catalog .card");
      if (first) {
        first.focus();
        e.preventDefault();
      }
      return;
    }

    if (code === KEY.LEFT) {
      if (active === settingsBtn()) {
        focusRefresh();
        e.preventDefault();
        return;
      }
      if (!isTopBarControl(active) && (statusVisible() || !document.querySelector("#catalog .card"))) {
        focusRefresh();
        e.preventDefault();
      }
      return;
    }

    if (code === KEY.RIGHT) {
      if (active === refreshBtn()) {
        focusSettings();
        e.preventDefault();
        return;
      }
      if (active === settingsBtn()) {
        e.preventDefault();
      }
    }
  }

  function wireSettingsButton(openSettings) {
    const btn = settingsBtn();
    if (!btn) return;
    btn.addEventListener("keydown", (e) => {
      if (typeof TvKeys !== "undefined" ? TvKeys.isSelect(e) : e.keyCode === KEY.ENTER) {
        openSettings();
        e.preventDefault();
      }
    });
    btn.addEventListener("click", () => openSettings());
  }

  function wireRefreshButton(onRefresh) {
    const btn = refreshBtn();
    if (!btn) return;
    btn.addEventListener("keydown", (e) => {
      if (typeof TvKeys !== "undefined" ? TvKeys.isSelect(e) : e.keyCode === KEY.ENTER) {
        onRefresh();
        e.preventDefault();
      }
    });
  }

  return {
    registerKeys,
    focusSettings,
    focusRefresh,
    onKeyDown,
    wireSettingsButton,
    wireRefreshButton,
    wireTopBarFocusRing,
    markTopBarFocus,
    focusTopBarFromAnywhere,
    KEY,
  };
})();


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


/* global document, Site, TvNav, Companion, TvKeys */
const SettingsPanel = (() => {
  let panel;
  let browse;
  let input;
  let companionMode;
  let companionPhone;
  let companionPin;
  let companionStatus;
  let testHlsInput;
  let btnSave;
  let btnCancel;
  let btnTestPlay;
  let hint;
  let siteUrlCurrent;
  let rowIndex = 0;
  /** @type {(url: string) => void} */
  let onSaved = () => {};

  function isOpen() {
    return panel && !panel.classList.contains("hidden");
  }

  function showHint(msg) {
    if (hint) hint.textContent = msg;
  }

  function showCompanionStatus(msg) {
    if (companionStatus) companionStatus.textContent = msg;
  }

  function focusables() {
    return [
      input,
      companionMode,
      companionPhone,
      companionPin,
      btnSave,
      btnCancel,
      testHlsInput,
      btnTestPlay,
    ].filter(Boolean);
  }

  function updateSiteUrlDisplay() {
    if (!siteUrlCurrent || !input) return;
    const v = (input.value || "").trim();
    siteUrlCurrent.textContent = v ? `Current: ${v}` : "Not set yet — press OK on Address to type";
  }

  function rowWrap(el) {
    if (!el) return null;
    if (el === btnSave || el === btnCancel || el === btnTestPlay) return el;
    return el.closest(".field") || el;
  }

  function applyRowFocus() {
    const list = focusables();
    if (!list.length) return;
    if (rowIndex < 0) rowIndex = 0;
    if (rowIndex >= list.length) rowIndex = list.length - 1;
    for (let i = 0; i < list.length; i++) {
      const wrap = rowWrap(list[i]);
      if (wrap) wrap.classList.toggle("settings-row--active", i === rowIndex);
    }
    const cur = list[rowIndex];
    const labels = {
      [companionMode && companionMode.id]: "Phone companion — OK toggles on/off",
      [input && input.id]: "Site URL — OK to type",
      [companionPhone && companionPhone.id]: "Phone URL — OK to type",
      [companionPin && companionPin.id]: "Pairing PIN — OK to type",
      [testHlsInput && testHlsInput.id]: "Test stream URL — OK to type",
    };
    let msg = "";
    if (cur === btnSave) {
      msg = "OK — saves site URL, pairs phone (if PIN entered), reloads channels.";
    } else if (cur === btnCancel) {
      msg = "OK here — close Settings without saving changes.";
    } else if (cur === btnTestPlay) {
      msg = "OK — test stream (optional).";
    } else if (cur === input) {
      msg = "OK — open keyboard and type your site (e.g. https://example.com). Back closes keyboard.";
    } else if (cur === companionPin) {
      msg = "OK — type 6-digit PIN from phone. Then ↓ to green Save box and OK.";
    } else if (cur && cur.id && labels[cur.id]) {
      msg = labels[cur.id];
    }
    showHint(msg);
    updateSiteUrlDisplay();
    const wrap = rowWrap(cur);
    if (wrap && typeof wrap.scrollIntoView === "function") {
      try {
        wrap.scrollIntoView({ block: "nearest", behavior: "auto" });
      } catch (_) {
        wrap.scrollIntoView(false);
      }
    }
  }

  function normalizeUrl(raw) {
    let s = (raw || "").trim().replace(/\/+$/, "");
    if (!s) return "";
    if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
    try {
      new URL(s);
      return s;
    } catch (_) {
      return "";
    }
  }

  async function saveAndClose() {
    const url = normalizeUrl(input.value);
    if (!url) {
      rowIndex = focusables().indexOf(input);
      applyRowFocus();
      showHint("Enter a site URL, then select Save.");
      return;
    }
    Site.saveSite(url);
    Site.saveTestHls(normalizeUrl(testHlsInput.value));
    input.value = url;

    const modeOn = companionMode && companionMode.checked;
    const phoneBase = normalizeUrl(companionPhone ? companionPhone.value : "");

    if (modeOn && typeof Companion !== "undefined") {
      if (!phoneBase.startsWith("http")) {
        rowIndex = focusables().indexOf(companionPhone);
        applyRowFocus();
        showHint("Companion on: enter the phone URL.");
        return;
      }
      Companion.saveSettings(true, phoneBase, Companion.token());
      const pin = (companionPin && companionPin.value) || "";
      if (!Companion.isActive() && pin.length < 6) {
        rowIndex = focusables().indexOf(companionPin);
        applyRowFocus();
        showHint("Enter the 6-digit PIN from Android KPV.");
        return;
      }
      if (pin.length >= 6) {
        try {
          showCompanionStatus("Pairing…");
          await Companion.pair(pin, "Samsung TV");
          Companion.saveSettings(true, phoneBase, Companion.token());
          companionPin.value = "";
          showCompanionStatus("Paired with phone.");
        } catch (e) {
          showCompanionStatus("");
          showHint(e.message || "Pairing failed.");
          return;
        }
      }
    } else if (typeof Companion !== "undefined") {
      Companion.saveSettings(false, "", "");
      Companion.clearToken();
      showCompanionStatus("");
    }

    close();
    onSaved(url);
  }

  function openTestPlayback() {
    Site.load();
    const testUrl =
      normalizeUrl(testHlsInput.value) ||
      Site.testHlsUrl() ||
      "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
    try {
      sessionStorage.setItem(
        "kpv_watch",
        JSON.stringify({ hls: testUrl, t: "Test stream", mode: "hls" }),
      );
    } catch (_) {
      /* ignore */
    }
    window.location.href = `watch.html?hls=${encodeURIComponent(testUrl)}&t=${encodeURIComponent("Test stream")}`;
  }

  function activateRow() {
    const list = focusables();
    const cur = list[rowIndex];
    if (!cur) return;
    if (cur === btnSave) {
      saveAndClose().catch((e) => showHint(e.message || "Save failed."));
      return;
    }
    if (cur === btnCancel) {
      close();
      return;
    }
    if (cur === btnTestPlay) {
      openTestPlayback();
      return;
    }
    if (cur === companionMode) {
      companionMode.checked = !companionMode.checked;
      return;
    }
    if (cur === input || cur === companionPhone || cur === companionPin || cur === testHlsInput) {
      cur.focus();
      showHint("Keyboard open — Back closes keyboard, then ↑↓ to move.");
    }
  }

  function open() {
    Site.load();
    if (typeof Companion !== "undefined") {
      Companion.load();
      input.value = Site.siteOrigin();
      testHlsInput.value = Site.testHlsUrl();
      if (companionMode) companionMode.checked = Companion.isModeOn();
      if (companionPhone) companionPhone.value = Companion.baseUrl();
      if (companionPin) companionPin.value = "";
      if (Companion.isActive()) {
        showCompanionStatus("Paired — streams come from the phone when needed.");
      } else if (Companion.isModeOn()) {
        showCompanionStatus("Companion on — enter PIN and Save to pair.");
      } else {
        showCompanionStatus("Companion off — TV uses the site API only.");
      }
    } else {
      input.value = Site.siteOrigin();
      testHlsInput.value = Site.testHlsUrl();
      showCompanionStatus("");
    }

    panel.classList.remove("hidden");
    panel.classList.add("settings--open");
    panel.setAttribute("aria-hidden", "false");
    if (browse) browse.classList.add("hidden");

    document.body.classList.add("settings-open");
    rowIndex = 0;
    updateSiteUrlDisplay();
    applyRowFocus();
    if (typeof RemoteGuide !== "undefined") {
      RemoteGuide.say("Site URL at top · companion in middle · teal Save box below PIN");
    }

    try {
      panel.tabIndex = 0;
      panel.focus();
    } catch (_) {
      /* ignore */
    }
  }

  function close() {
    panel.classList.add("hidden");
    panel.classList.remove("settings--open");
    panel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("settings-open");
    if (browse) browse.classList.remove("hidden");
    if (typeof RemoteGuide !== "undefined") {
      RemoteGuide.say("Press ↑ for Refresh and Settings (gear)");
    }
    for (const el of focusables()) {
      const wrap = rowWrap(el);
      if (wrap) wrap.classList.remove("settings-row--active");
    }
    TvNav.focusSettings();
  }

  function handleKeyDown(e) {
    if (!isOpen()) return false;
    const code = e.keyCode;

    if (document.activeElement === input || document.activeElement === companionPhone ||
        document.activeElement === companionPin || document.activeElement === testHlsInput) {
      if (TvKeys.isBack(e)) {
        document.activeElement.blur();
        applyRowFocus();
        e.preventDefault();
        return true;
      }
      return false;
    }

    if (code === TvNav.KEY.DOWN) {
      rowIndex += 1;
      applyRowFocus();
      e.preventDefault();
      return true;
    }
    if (code === TvNav.KEY.UP) {
      rowIndex -= 1;
      applyRowFocus();
      e.preventDefault();
      return true;
    }
    if (TvKeys.isSelect(e)) {
      activateRow();
      e.preventDefault();
      return true;
    }
    return false;
  }

  function handleBack(e) {
    if (!isOpen()) return false;
    const active = document.activeElement;
    if (active === input || active === companionPhone || active === companionPin || active === testHlsInput) {
      active.blur();
      applyRowFocus();
      e.preventDefault();
      return true;
    }
    close();
    e.preventDefault();
    return true;
  }

  function init(options) {
    onSaved = options.onSaved || onSaved;
    panel = document.getElementById("settings");
    browse = document.getElementById("browse");
    input = document.getElementById("site-url");
    companionMode = document.getElementById("companion-mode");
    companionPhone = document.getElementById("companion-phone-url");
    companionPin = document.getElementById("companion-pin");
    companionStatus = document.getElementById("companion-status");
    testHlsInput = document.getElementById("test-hls-url");
    btnSave = document.getElementById("btn-save");
    btnCancel = document.getElementById("btn-cancel");
    btnTestPlay = document.getElementById("btn-test-play");

    hint = document.getElementById("settings-hint");
    siteUrlCurrent = document.getElementById("site-url-current");

    btnSave.addEventListener("click", () => {
      saveAndClose().catch((err) => showHint(err.message || "Save failed."));
    });
    btnCancel.addEventListener("click", close);
    if (btnTestPlay) btnTestPlay.addEventListener("click", openTestPlayback);
  }

  return { init, open, close, isOpen, handleBack, handleKeyDown };
})();


/* global Site, Catalog, Player, TvNav, SettingsPanel, CatalogNav */
(function init() {
  TvNav.registerKeys();
  TvNav.wireTopBarFocusRing();
  CatalogNav.wire();
  const status = document.getElementById("status");
  const catalogEl = document.getElementById("catalog");
  const btnRefresh = document.getElementById("btn-refresh");
  let catalogBusy = false;

  SettingsPanel.init({
    onSaved() {
      reloadCatalog();
    },
  });

  function setStatus(msg) {
    status.textContent = msg;
    status.classList.remove("hidden");
    catalogEl.classList.add("hidden");
    TvNav.focusRefresh();
  }

  function renderCatalog(categories) {
    status.classList.add("hidden");
    catalogEl.classList.remove("hidden");
    catalogEl.innerHTML = "";
    for (const cat of categories) {
      const section = document.createElement("section");
      section.className = "category";
      const h2 = document.createElement("h2");
      h2.textContent = cat.name;
      section.appendChild(h2);
      const row = document.createElement("div");
      row.className = "row";
      for (const ch of cat.channels) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "card";
        btn.innerHTML = `
          <img src="${escapeAttr(ch.poster)}" alt="" loading="lazy" />
          <div class="title">${escapeHtml(ch.title)}</div>
          <div class="tag">${escapeHtml(ch.tag || "Live")}</div>`;
        btn.addEventListener("click", () => Player.play(ch));
        btn.addEventListener("keydown", (e) => {
          if (e.keyCode === TvNav.KEY.ENTER) {
            e.preventDefault();
            Player.play(ch);
          }
        });
        row.appendChild(btn);
      }
      section.appendChild(row);
      catalogEl.appendChild(section);
    }
    const first = catalogEl.querySelector(".card");
    if (first) CatalogNav.focusCard(first);
    if (typeof RemoteGuide !== "undefined") {
      RemoteGuide.say("↑ top bar (Refresh / Settings) · OK on a channel to play");
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  function setRefreshBusy(busy) {
    catalogBusy = busy;
    btnRefresh.disabled = busy;
    btnRefresh.classList.toggle("is-busy", busy);
    btnRefresh.setAttribute("aria-busy", busy ? "true" : "false");
  }

  async function reloadCatalog() {
    if (catalogBusy) return;
    Site.load();
    if (!Site.siteOrigin()) {
      setStatus("Set your site URL first: press ↑, then → to the gear, OK for Settings.");
      if (typeof RemoteGuide !== "undefined") {
        RemoteGuide.say("↑ then → to gear · OK opens Settings · Site URL is the first box");
      }
      return;
    }
    setRefreshBusy(true);
    const hadCatalog = !catalogEl.classList.contains("hidden");
    if (!hadCatalog) {
      setStatus("Loading channels…");
    }
    const categories = await Catalog.load();
    setRefreshBusy(false);
    if (!categories) {
      setStatus("Couldn't load catalog. Check the site URL and try Refresh.");
      TvNav.focusRefresh();
      return;
    }
    renderCatalog(categories);
  }

  function openSettings() {
    SettingsPanel.open();
  }

  TvNav.wireSettingsButton(openSettings);
  btnRefresh.addEventListener("click", () => reloadCatalog());
  TvNav.wireRefreshButton(() => reloadCatalog());

  document.addEventListener("keydown", (e) => {
    const gear = document.getElementById("btn-settings");
    if (
      !SettingsPanel.isOpen() &&
      gear &&
      (document.activeElement === gear || gear.classList.contains("is-focused")) &&
      typeof TvKeys !== "undefined" &&
      TvKeys.isSelect(e)
    ) {
      openSettings();
      e.preventDefault();
      return;
    }
    if (SettingsPanel.isOpen() && SettingsPanel.handleKeyDown(e)) return;
    if (!SettingsPanel.isOpen() && CatalogNav.handleKeyDown(e)) return;
    TvNav.onKeyDown(e, { openSettings });

    if (e.keyCode === 10009 || e.key === "Back" || e.key === "Escape") {
      if (!document.getElementById("player").classList.contains("hidden")) {
        Player.hideScreen();
        e.preventDefault();
        return;
      }
      if (SettingsPanel.handleBack(e)) return;
    }
  });

  reloadCatalog();
})();

