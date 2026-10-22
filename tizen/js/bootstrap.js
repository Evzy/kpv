/* global JSZip, tizen */
(function bootstrapKpv() {
  var WGT_SHELL_VERSION = "__KPV_WGT_SHELL_VERSION__";
  var RELEASES_OWNER = "__KPV_RELEASES_OWNER__";
  var RELEASES_REPO = "__KPV_RELEASES_REPO__";
  var MANIFEST_URL =
    "https://github.com/" + RELEASES_OWNER + "/" + RELEASES_REPO + "/releases/latest/download/kpv-tv-manifest.json";
  var LS_BUNDLE_VERSION = "kpv_bundle_version";
  var LS_ANNOUNCED = "kpv_last_announced_bundle";
  var CACHE_DIR = "kpv-hot-cache";
  var FETCH_TIMEOUT_MS = 12000;

  var entry = "index";
  var scriptEl = document.currentScript;
  if (scriptEl && scriptEl.getAttribute("data-entry") === "watch") {
    entry = "watch";
  }

  function parseTriple(v) {
    var s = String(v || "")
      .trim()
      .replace(/^v/i, "")
      .split("-")[0];
    var p = s.split(".").map(function (x) {
      return parseInt(x, 10) || 0;
    });
    while (p.length < 3) p.push(0);
    return p.slice(0, 3);
  }

  function compareTriple(a, b) {
    for (var i = 0; i < 3; i += 1) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  }

  function xhrGet(url, responseType) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.timeout = FETCH_TIMEOUT_MS;
      if (responseType) xhr.responseType = responseType;
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
        else reject(new Error("HTTP " + xhr.status));
      };
      xhr.onerror = function () {
        reject(new Error("Network error"));
      };
      xhr.ontimeout = function () {
        reject(new Error("Timeout"));
      };
      xhr.send();
    });
  }

  function sha256Hex(buffer) {
    if (!window.crypto || !window.crypto.subtle) {
      return Promise.reject(new Error("crypto.subtle unavailable"));
    }
    return window.crypto.subtle.digest("SHA-256", buffer).then(function (hash) {
      var bytes = new Uint8Array(hash);
      var hex = "";
      for (var i = 0; i < bytes.length; i += 1) {
        hex += ("0" + bytes[i].toString(16)).slice(-2);
      }
      return hex;
    });
  }

  function showBlockingScreen(manifest) {
    var wrap = document.createElement("div");
    wrap.id = "kpv-wgt-block";
    wrap.style.cssText =
      "position:fixed;inset:0;z-index:99999;background:#0a0e14;color:#e8eef5;font:24px/1.4 sans-serif;padding:48px;box-sizing:border-box;";
    var wgtUrl = (manifest && manifest.wgtUrl) || "";
    wrap.innerHTML =
      "<h1 style='margin:0 0 24px;font-size:36px'>KPV update required</h1>" +
      "<p>This TV needs a new <strong>KPV.wgt</strong> install (Developer Mode / USB / Apps2Samsung on PC).</p>" +
      "<p>Download from GitHub Releases, then sideload over the existing app.</p>" +
      (wgtUrl
        ? "<p style='word-break:break-all'><a href='" +
          wgtUrl +
          "' style='color:#3dd6c6'>" +
          wgtUrl +
          "</a></p>"
        : "") +
      "<p>Installed shell: <code>" +
      WGT_SHELL_VERSION +
      "</code></p>";
    document.body.innerHTML = "";
    document.body.appendChild(wrap);
  }

  function showToast(msg) {
    var t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText =
      "position:fixed;bottom:48px;left:50%;transform:translateX(-50%);background:#1a2332;color:#fff;padding:16px 32px;border-radius:8px;z-index:99998;font:22px sans-serif;";
    document.body.appendChild(t);
    setTimeout(function () {
      if (t.parentNode) t.parentNode.removeChild(t);
    }, 5000);
  }

  function resolveDocumentsDir() {
    return new Promise(function (resolve, reject) {
      try {
        tizen.filesystem.resolve(
          "documents/" + CACHE_DIR,
          function (dir) {
            resolve(dir);
          },
          function () {
            tizen.filesystem.resolve(
              "documents",
              function (doc) {
                doc.createDirectory(
                  CACHE_DIR,
                  function (dir) {
                    resolve(dir);
                  },
                  reject,
                  false,
                );
              },
              reject,
            );
          },
          "rw",
        );
      } catch (e) {
        reject(e);
      }
    });
  }

  function writeFileToDir(dir, name, blob) {
    return new Promise(function (resolve, reject) {
      dir.createFile(
        name,
        true,
        function (file) {
          file.openStream(
            "w",
            function (stream) {
              var reader = new FileReader();
              reader.onload = function () {
                try {
                  stream.write(reader.result);
                  stream.close();
                  resolve(file.toURI());
                } catch (err) {
                  reject(err);
                }
              };
              reader.onerror = reject;
              reader.readAsArrayBuffer(blob);
            },
            reject,
            "UTF-8",
          );
        },
        reject,
      );
    });
  }

  function applyBundleZip(arrayBuffer, expectedSha256) {
    return sha256Hex(arrayBuffer).then(function (hex) {
      if (expectedSha256 && hex.toLowerCase() !== String(expectedSha256).toLowerCase()) {
        throw new Error("Bundle SHA-256 mismatch");
      }
      return JSZip.loadAsync(arrayBuffer);
    });
  }

  function extractZipToCache(zip) {
    return resolveDocumentsDir().then(function (dir) {
      var names = Object.keys(zip.files).filter(function (n) {
        return !zip.files[n].dir;
      });
      return names.reduce(function (chain, name) {
        return chain.then(function (uris) {
          return zip.files[name].async("blob").then(function (blob) {
            var safe = name.replace(/[/\\]/g, "_");
            return writeFileToDir(dir, safe, blob).then(function (uri) {
              uris[name] = uri;
              return uris;
            });
          });
        });
      }, Promise.resolve({}));
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function loadStylesheet(href) {
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    document.head.appendChild(l);
  }

  function cachedUri(map, name) {
    if (map && map[name]) return map[name];
    return name;
  }

  function loadIndexApp(fileUris) {
    loadStylesheet(cachedUri(fileUris, "style.css"));
    return loadScript(cachedUri(fileUris, "main.js"));
  }

  function loadWatchApp(fileUris) {
    loadStylesheet(cachedUri(fileUris, "style.css"));
    var order = [
      "avplay-play.js",
      "site.js",
      "companion.js",
      "playback-cache.js",
      "stream-resolve.js",
      "tizen-play.js",
      "watch.js",
    ];
    return order.reduce(function (p, name) {
      return p.then(function () {
        return loadScript(cachedUri(fileUris, name));
      });
    }, Promise.resolve());
  }

  function loadEmbeddedFallback() {
    if (entry === "watch") {
      return loadWatchApp(null);
    }
    return loadIndexApp(null);
  }

  function readCachedVersion() {
    try {
      return localStorage.getItem(LS_BUNDLE_VERSION) || "";
    } catch (_) {
      return "";
    }
  }

  function setCachedVersion(v) {
    try {
      localStorage.setItem(LS_BUNDLE_VERSION, v);
    } catch (_) {}
  }

  function maybeAnnounce(version, manifest) {
    try {
      if (localStorage.getItem(LS_ANNOUNCED) === version) return;
      localStorage.setItem(LS_ANNOUNCED, version);
      var notes = (manifest && manifest.releaseNotes) || "";
      showToast("Updated to " + version + (notes ? " — " + notes : ""));
    } catch (_) {}
  }

  function runWithManifest(manifest) {
    var shell = parseTriple(WGT_SHELL_VERSION);
    var minShell = parseTriple(manifest.minWgtShell || "0.0.0");
    if (manifest.forceWgtInstall || compareTriple(shell, minShell) < 0) {
      showBlockingScreen(manifest);
      return;
    }
    var cached = readCachedVersion();
    var remote = String(manifest.bundleVersion || "");
    var needDownload = remote && compareTriple(parseTriple(remote), parseTriple(cached)) > 0;

    function listCacheUris() {
      return resolveDocumentsDir().then(function (dir) {
        return new Promise(function (resolve, reject) {
          dir.listFiles(
            function (files) {
              var map = {};
              (files || []).forEach(function (f) {
                map[f.name] = f.toURI();
              });
              resolve(map);
            },
            reject,
          );
        });
      });
    }

    function loadFromCacheOrEmbedded() {
      if (!cached) return loadEmbeddedFallback();
      return listCacheUris()
        .then(function (uris) {
          if (entry === "watch") return loadWatchApp(uris);
          return loadIndexApp(uris);
        })
        .catch(function () {
          return loadEmbeddedFallback();
        });
    }

    if (!needDownload) {
      return loadFromCacheOrEmbedded().then(function () {
        if (remote) maybeAnnounce(remote, manifest);
      });
    }
    return xhrGet(manifest.bundleUrl, "arraybuffer")
      .then(function (buf) {
        return applyBundleZip(buf, manifest.bundleSha256);
      })
      .then(extractZipToCache)
      .then(function (uris) {
        setCachedVersion(remote);
        if (entry === "watch") return loadWatchApp(uris);
        return loadIndexApp(uris);
      })
      .then(function () {
        maybeAnnounce(remote, manifest);
      })
      .catch(function (err) {
        console.warn("Hot update failed, using embedded bundle:", err);
        return loadEmbeddedFallback();
      });
  }

  function run() {
    xhrGet(MANIFEST_URL, "text")
      .then(function (text) {
        return JSON.parse(text);
      })
      .then(runWithManifest)
      .catch(function () {
        return loadEmbeddedFallback();
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
