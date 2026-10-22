/* global document, localStorage, sessionStorage, KPV_APP_VERSION */
/** TV hot-bundle update status (GitHub kpv-tv-manifest.json). */
const TvUpdate = (() => {
  const OWNER = "Evzy";
  const REPO = "kpv-releases";
  const MANIFEST_URL =
    "https://github.com/" + OWNER + "/" + REPO + "/releases/latest/download/kpv-tv-manifest.json";
  const LS_BUNDLE = "kpv_bundle_version";
  const LS_LAST_FAIL = "kpv_update_last_fail";
  const SS_MANIFEST = "kpv_update_manifest";
  const MANIFEST_FETCH_MS = 15000;
  const BUNDLE_FETCH_MS = 180000;
  const APPLY_MAX_MS = 240000;
  let progressToastEl = null;

  function parseTriple(v) {
    const s = String(v || "")
      .trim()
      .replace(/^v/i, "")
      .split("-")[0];
    const p = s.split(".").map((x) => parseInt(x, 10) || 0);
    while (p.length < 3) p.push(0);
    return p.slice(0, 3);
  }

  function compare(a, b) {
    const x = parseTriple(a);
    const y = parseTriple(b);
    for (let i = 0; i < 3; i += 1) {
      if (x[i] !== y[i]) return x[i] - y[i];
    }
    return 0;
  }

  function runningVersion() {
    return typeof KPV_APP_VERSION === "string" ? KPV_APP_VERSION : "";
  }

  function cachedVersion() {
    try {
      return localStorage.getItem(LS_BUNDLE) || "";
    } catch (_) {
      return "";
    }
  }

  function withCacheBust(url) {
    const sep = String(url).indexOf("?") >= 0 ? "&" : "?";
    return String(url) + sep + "_=" + Date.now();
  }

  function xhrGet(url, responseType, bust, timeoutMs) {
    const fetchUrl = bust ? withCacheBust(url) : url;
    const ms = timeoutMs || MANIFEST_FETCH_MS;
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", fetchUrl, true);
      xhr.timeout = ms;
      if (responseType) xhr.responseType = responseType;
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
        else reject(new Error("HTTP " + xhr.status));
      };
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.ontimeout = () => reject(new Error("Timeout"));
      xhr.send();
    });
  }

  function loadJSZip() {
    if (window.JSZip) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "jszip.min.js";
      s.onload = resolve;
      s.onerror = () => reject(new Error("Could not load jszip"));
      document.head.appendChild(s);
    });
  }

  function withTimeout(promise, ms, message) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  }

  function showProgress(msg) {
    if (!progressToastEl) {
      progressToastEl = document.createElement("div");
      progressToastEl.style.cssText =
        "position:fixed;bottom:48px;left:50%;transform:translateX(-50%);max-width:92%;background:#1a2332;color:#fff;padding:16px 32px;border-radius:8px;z-index:99999;font:22px sans-serif;text-align:center;";
      document.body.appendChild(progressToastEl);
    }
    progressToastEl.textContent = msg;
  }

  function hideProgress() {
    if (progressToastEl && progressToastEl.parentNode) {
      progressToastEl.parentNode.removeChild(progressToastEl);
    }
    progressToastEl = null;
  }

  function rememberFail(msg) {
    try {
      localStorage.setItem(LS_LAST_FAIL, String(msg || "").slice(0, 200));
    } catch (_) {
      /* ignore */
    }
  }

  function lastFail() {
    try {
      return localStorage.getItem(LS_LAST_FAIL) || "";
    } catch (_) {
      return "";
    }
  }

  async function applyManifest(manifest, onProgress) {
    if (typeof KpvBundleCache === "undefined") {
      throw new Error("Sideload latest KPV.wgt once (TV cache fix)");
    }
    const version = String(manifest.bundleVersion || "");
    if (!version || !manifest.bundleUrl) throw new Error("Invalid manifest");
    const progress = onProgress || showProgress;
    progress("KPV v" + version + " — loading unzip…");
    await loadJSZip();
    progress("KPV v" + version + " — downloading bundle…");
    const buf = await xhrGet(manifest.bundleUrl, "arraybuffer", true, BUNDLE_FETCH_MS);
    progress("KPV v" + version + " — unpacking…");
    const zip = await JSZip.loadAsync(buf);
    progress("KPV v" + version + " — saving to TV…");
    await KpvBundleCache.extractZipToVersion(version, zip);
    KpvBundleCache.setCachedVersion(version);
    try {
      localStorage.setItem(LS_BUNDLE, version);
      localStorage.removeItem(LS_LAST_FAIL);
    } catch (_) {
      /* ignore */
    }
    progress("KPV v" + version + " — restart now…");
  }

  function showToast(msg, ms) {
    const t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText =
      "position:fixed;bottom:48px;left:50%;transform:translateX(-50%);max-width:90%;background:#1a2332;color:#fff;padding:16px 32px;border-radius:8px;z-index:99998;font:22px sans-serif;text-align:center;";
    document.body.appendChild(t);
    setTimeout(() => {
      if (t.parentNode) t.parentNode.removeChild(t);
    }, ms || 6000);
  }

  function applyVersionLine(state) {
    const el = document.getElementById("app-version");
    if (!el) return;
    const run = state.running || runningVersion();
    const cached = state.cached != null ? state.cached : cachedVersion();
    let text = run ? "v" + run : "KPV";
    if (cached && cached !== run) {
      text += " · saved v" + cached;
    }
    if (state.latest && compare(state.latest, run) > 0) {
      text += " · GitHub v" + state.latest;
    } else if (state.latest && compare(state.latest, run) === 0) {
      text += " · up to date";
    } else if (state.status === "downloading") {
      text += " · updating…";
    } else if (state.status === "failed") {
      text += " · update failed";
    }
    const fail = lastFail();
    if (fail && state.status !== "downloading") {
      text += " · " + fail;
    }
    el.textContent = text;
  }

  function sessionManifest() {
    try {
      const raw = sessionStorage.getItem(SS_MANIFEST);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function rememberSessionManifest(manifest) {
    try {
      sessionStorage.setItem(SS_MANIFEST, JSON.stringify(manifest));
    } catch (_) {
      /* ignore */
    }
  }

  /**
   * @param {{ useSession?: boolean }} [options] useSession: reuse the manifest fetched earlier this launch
   * @returns {Promise<{running:string,cached:string,latest:string,status:string,detail?:string}>}
   */
  async function fetchStatus(options) {
    const running = runningVersion();
    const cached = cachedVersion();
    let latest = "";
    let manifest = options && options.useSession ? sessionManifest() : null;
    try {
      if (!manifest) {
        manifest = JSON.parse(await xhrGet(MANIFEST_URL, undefined, true));
        rememberSessionManifest(manifest);
      }
      latest = String(manifest.bundleVersion || "");
    } catch (e) {
      return {
        running,
        cached,
        latest: "",
        status: "offline",
        detail: e.message || String(e),
      };
    }
    if (!latest) {
      return { running, cached, latest: "", status: "unknown" };
    }
    if (compare(latest, running) <= 0) {
      return { running, cached, latest, status: "current", manifest };
    }
    return { running, cached, latest, status: "update-available", manifest };
  }

  async function check(options) {
    const opts = options || {};
    const state = await fetchStatus();
    applyVersionLine({ ...state, running: state.running });

    if (state.status === "offline") {
      if (opts.toast) showToast("Could not reach GitHub for updates. " + (state.detail || ""));
      return state;
    }
    if (state.status === "update-available" && state.manifest) {
      try {
        applyVersionLine({ ...state, status: "downloading" });
        if (opts.toast) showProgress("KPV v" + state.latest + " — starting…");
        await withTimeout(
          applyManifest(state.manifest, opts.toast ? showProgress : () => {}),
          APPLY_MAX_MS,
          "Update timed out (try again or sideload KPV.wgt)",
        );
        hideProgress();
        if (opts.toast) showToast("Updated to v" + state.latest + " — restarting", 4000);
        window.location.reload();
      } catch (e) {
        hideProgress();
        const msg = e && e.message ? e.message : String(e);
        rememberFail(msg);
        applyVersionLine({ ...state, status: "failed" });
        if (opts.toast) {
          showToast("Update failed — " + msg, 12000);
        }
      }
      return state;
    }
    if (opts.toast && state.status === "current") {
      const gh = state.latest ? " · GitHub v" + state.latest : "";
      showToast("KPV is up to date (running v" + state.running + gh + ").");
    }
    return state;
  }

  function settingsSummary(state) {
    const s = state || {};
    const parts = ["Running v" + (s.running || runningVersion() || "?")];
    if (s.cached) parts.push("cached v" + s.cached);
    if (s.latest) parts.push("GitHub v" + s.latest);
    if (s.status === "update-available") parts.push("— update available, press Check for updates");
    if (s.status === "offline") parts.push("— offline");
    return parts.join(" · ");
  }

  return {
    check,
    fetchStatus,
    applyVersionLine,
    settingsSummary,
    compare,
    showToast,
    MANIFEST_URL,
  };
})();
