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

  async function fetchJson(url, timeoutMs = 20_000) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer =
      controller &&
      setTimeout(() => {
        controller.abort();
      }, timeoutMs);
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          Referer: `${site}/`,
          Origin: site,
        },
        signal: controller ? controller.signal : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } catch (err) {
      if (controller && err && err.name === "AbortError") {
        throw new Error("Request timed out");
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
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
