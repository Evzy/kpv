/* global WasmLower */
/**
 * Resolve an embed URL (https://<host>/embed/<channel>) to its HLS playlist on the TV by
 * running the embed site's own gasm decoder (lowered for Chromium 76 by WasmLower).
 * The decoder expects to run on the embed page, so it is given that page's hostname,
 * its relative /fetch is sent to the embed host, and the JW Player / P2P globals it
 * drives are stand-ins that capture the playlist URL.
 */
const GasmResolve = (() => {
  const TIMEOUT_MS = 25_000;
  let session = null;
  let importModule = (url) => import(url);

  function parseEmbed(embedUrl) {
    const m = /^(https?:\/\/[^/?#]+)\/embed\/([^?#]+?)\/?(?:[?#].*)?$/.exec(String(embedUrl || ""));
    if (!m) return null;
    return { origin: m[1], host: new URL(m[1]).hostname, channel: decodeURIComponent(m[2]) };
  }

  function canResolve(embedUrl) {
    return typeof WebAssembly !== "undefined" && Boolean(parseEmbed(embedUrl));
  }

  function shortImportName(name) {
    return String(name).replace(/^__wbg_/, "").replace(/_[0-9a-f]{16}$/, "");
  }

  const NULL_BODY_STATUS = [101, 204, 205, 304];

  function parseResponseHeaders(raw) {
    const headers = new Headers();
    String(raw || "")
      .split(/\r?\n/)
      .forEach((line) => {
        const i = line.indexOf(":");
        if (i <= 0) return;
        const name = line.slice(0, i).trim();
        if (/^set-cookie2?$/i.test(name)) return;
        try {
          headers.append(name, line.slice(i + 1).trim());
        } catch (_) {
          /* skip headers the Response guard rejects */
        }
      });
    return headers;
  }

  /**
   * Tizen sends app requests without an Origin, so the embed host omits
   * Access-Control-Expose-Headers and fetch() hides its custom response headers
   * (the decoder needs one of them). XHR on the TV still exposes them.
   */
  function sendViaXhr(req, url) {
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    return (hasBody ? req.arrayBuffer() : Promise.resolve(null)).then(
      (body) =>
        new Promise((resolveResponse, reject) => {
          const x = new XMLHttpRequest();
          x.open(req.method, url);
          x.responseType = "arraybuffer";
          req.headers.forEach((value, name) => {
            try {
              x.setRequestHeader(name, value);
            } catch (_) {
              /* forbidden request header */
            }
          });
          x.onload = () => {
            const status = x.status || 200;
            resolveResponse(
              new Response(NULL_BODY_STATUS.indexOf(status) >= 0 ? null : x.response, {
                status,
                statusText: x.statusText,
                headers: parseResponseHeaders(x.getAllResponseHeaders()),
              }),
            );
          };
          x.onerror = () => reject(new TypeError("Failed to fetch"));
          x.ontimeout = x.onerror;
          x.send(body);
        }),
    );
  }

  function embedRequest(fetchFn, self, win, req, origin) {
    const u = new URL(req.url);
    const target = `${origin}${u.pathname}${u.search}`;
    if (typeof XMLHttpRequest !== "undefined") return sendViaXhr(req, target);
    if (target === req.url) return fetchFn.call(self, win, req);
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    return (hasBody ? req.arrayBuffer() : Promise.resolve(undefined)).then((body) =>
      fetchFn.call(
        self,
        win,
        new Request(target, { method: req.method, headers: req.headers, body, mode: "cors", credentials: "omit" }),
      ),
    );
  }

  function isEmbedApiRequest(req, embed) {
    try {
      const u = new URL(req.url);
      return u.origin === embed.origin || u.protocol === "file:" || u.host === location.host;
    } catch (_) {
      return false;
    }
  }

  function hookImports(imports, embed) {
    const out = {};
    Object.keys(imports || {}).forEach((mod) => {
      const src = imports[mod];
      if (!src || typeof src !== "object") {
        out[mod] = src;
        return;
      }
      out[mod] = {};
      Object.keys(src).forEach((name) => {
        const fn = src[name];
        const short = shortImportName(name);
        if (typeof fn !== "function" || (short !== "get" && short !== "fetch")) {
          out[mod][name] = fn;
          return;
        }
        out[mod][name] = function hookedImport(a, b) {
          if (short === "get" && arguments.length === 2 && a instanceof Location && b === "hostname") {
            return embed.host;
          }
          if (short === "fetch" && b instanceof Request && isEmbedApiRequest(b, embed)) {
            return embedRequest(fn, this, a, b, embed.origin);
          }
          return fn.apply(this, arguments);
        };
      });
    });
    return out;
  }

  function toBytes(source) {
    return Promise.resolve(source).then((v) =>
      v && typeof v.arrayBuffer === "function" ? v.arrayBuffer() : v,
    );
  }

  /** Load gasm once per page; every later resolve reuses the same decoder instance. */
  function openSession(embed) {
    const WA = WebAssembly;
    const realInstantiate = WA.instantiate;
    const realStreaming = WA.instantiateStreaming;
    WA.instantiate = function patchedInstantiate(source, imports) {
      if (source instanceof WA.Module) return realInstantiate.call(WA, source, imports);
      return toBytes(source).then((bytes) => WasmLower.instantiate(bytes, hookImports(imports, embed)));
    };
    WA.instantiateStreaming = function patchedStreaming(source, imports) {
      return WA.instantiate(source, imports);
    };
    const restore = () => {
      WA.instantiate = realInstantiate;
      WA.instantiateStreaming = realStreaming;
    };
    const loaded = importModule(`${embed.origin}/js/wasm/gasm.js`)
      .then((mod) => Promise.resolve(mod.default()).then(() => mod))
      .then(
        (mod) => {
          restore();
          mod.init_wasm();
          return mod;
        },
        (err) => {
          restore();
          throw err;
        },
      );
    return { origin: embed.origin, host: embed.host, loaded };
  }

  function installStandIns(onFile) {
    const saved = { jwplayer: window.jwplayer, P2PEngineHls: window.P2PEngineHls };
    const player = {
      setup(config) {
        if (config && config.file) onFile(String(config.file));
        return player;
      },
      once: () => player,
      on: () => player,
      off: () => player,
      remove: () => player,
      getState: () => "idle",
    };
    window.jwplayer = () => player;
    window.P2PEngineHls = { tryRegisterServiceWorker: () => Promise.resolve() };
    return () => {
      window.jwplayer = saved.jwplayer;
      window.P2PEngineHls = saved.P2PEngineHls;
      ["__wasm_jw_player", "__wasm_jw_p2p_config", "__wasm_jw_engine"].forEach((k) => {
        try {
          delete window[k];
        } catch (_) {
          window[k] = undefined;
        }
      });
    };
  }

  /**
   * @param {string} embedUrl
   * @returns {Promise<string>} HLS playlist URL
   */
  async function resolve(embedUrl) {
    const embed = parseEmbed(embedUrl);
    if (!embed) throw new Error("Not an embed URL");
    if (!session || session.origin !== embed.origin) session = openSession(embed);
    const current = session;

    const headBefore = new Set(Array.from(document.head ? document.head.children : []));
    let restoreGlobals = () => {};
    let timer = 0;
    try {
      const mod = await current.loaded;
      const file = await new Promise((resolveFile, reject) => {
        restoreGlobals = installStandIns(resolveFile);
        timer = setTimeout(() => reject(new Error("Embed decoder timed out")), TIMEOUT_MS);
        mod.set_stream_jw(embed.channel);
      });
      return file;
    } catch (e) {
      if (session === current) session = null;
      throw e;
    } finally {
      clearTimeout(timer);
      restoreGlobals();
      if (document.head) {
        Array.from(document.head.children).forEach((el) => {
          if (!headBefore.has(el) && el.tagName === "STYLE") el.remove();
        });
      }
    }
  }

  function setModuleLoader(fn) {
    importModule = fn;
    session = null;
  }

  return { canResolve, parseEmbed, resolve, setModuleLoader };
})();
