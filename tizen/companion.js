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
