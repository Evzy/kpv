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

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function ensureJSZip() {
    if (window.JSZip) return Promise.resolve();
    return loadScript("jszip.min.js");
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
    var latest =
      (manifest && manifest.bundleVersion) ||
      "https://github.com/" + RELEASES_OWNER + "/" + RELEASES_REPO + "/releases/latest";
    wrap.innerHTML =
      "<h1 style='margin:0 0 24px;font-size:36px'>KPV update required</h1>" +
      "<p>Hot updates cannot move this TV past the version baked into the old widget (e.g. v1.0.16).</p>" +
      "<p>Sideload a new <strong>KPV.wgt</strong> once (Apps2Samsung / USB). Latest app: <strong>" +
      latest +
      "</strong>, shell <strong>" +
      (manifest && manifest.minWgtShell ? manifest.minWgtShell : "1.0.38") +
      "+</strong>.</p>" +
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
    try {
      document.body.classList.remove("settings-open");
      var settings = document.getElementById("settings");
      if (settings) {
        settings.classList.add("hidden");
        settings.setAttribute("aria-hidden", "true");
      }
      var browse = document.getElementById("browse");
      if (browse) browse.classList.remove("hidden");
    } catch (_) {
      /* ignore */
    }
    document.body.appendChild(wrap);
  }

  function usesLegacyMainScript() {
    var list = document.querySelectorAll("script[src]");
    for (var i = 0; i < list.length; i += 1) {
      var src = list[i].getAttribute("src") || "";
      if (src.indexOf("boot.js") >= 0) return false;
      if (src.indexOf("main.js") >= 0) return true;
    }
    return false;
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

  function deleteCacheEntry(dir, name) {
    return new Promise(function (resolve) {
      try {
        dir.deleteFile(name, resolve, resolve);
      } catch (_) {
        resolve();
      }
    });
  }

  function clearCacheDir(dir) {
    return new Promise(function (resolve) {
      try {
        dir.listFiles(
          function (files) {
            if (!files || !files.length) {
              resolve();
              return;
            }
            var i = 0;
            function next() {
              if (i >= files.length) {
                resolve();
                return;
              }
              var entry = files[i++];
              var fname = entry && entry.name ? entry.name : String(entry);
              dir.deleteFile(fname, next, next);
            }
            next();
          },
          function () {
            resolve();
          },
        );
      } catch (_) {
        resolve();
      }
    });
  }

  function writeFileToDir(dir, name, blob) {
    return deleteCacheEntry(dir, name).then(function () {
      return new Promise(function (resolve, reject) {
        dir.createFile(
          name,
          false,
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
            );
          },
          reject,
        );
      });
    });
  }

  function runningBundleVersion() {
    try {
      if (typeof KPV_APP_VERSION === "string" && KPV_APP_VERSION) {
        return KPV_APP_VERSION;
      }
    } catch (_) {
      /* ignore */
    }
    return readCachedVersion();
  }

  function applyBundleZip(arrayBuffer, expectedSha256) {
    var zipFromBuffer = function () {
      return ensureJSZip().then(function () {
        return JSZip.loadAsync(arrayBuffer);
      });
    };
    if (!window.crypto || !window.crypto.subtle) {
      if (expectedSha256) {
        console.warn("KPV: crypto.subtle unavailable — applying bundle without SHA-256 verify");
      }
      return zipFromBuffer();
    }
    return sha256Hex(arrayBuffer).then(function (hex) {
      if (expectedSha256 && hex.toLowerCase() !== String(expectedSha256).toLowerCase()) {
        throw new Error("Bundle SHA-256 mismatch");
      }
      return zipFromBuffer();
    });
  }

  function extractZipToCache(zip) {
    return resolveDocumentsDir().then(function (dir) {
      return clearCacheDir(dir).then(function () {
        return dir;
      });
    }).then(function (dir) {
      var names = Object.keys(zip.files).filter(function (n) {
        return !zip.files[n].dir;
      });
      return names.reduce(function (chain, name) {
        return chain.then(function () {
          return zip.files[name].async("blob").then(function (blob) {
            var safe = name.replace(/[/\\]/g, "_");
            return writeFileToDir(dir, safe, blob);
          });
        });
      }, Promise.resolve());
    });
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

  /** Non-blocking: index.html loads main.js first; we only check manifest / cache bundle. */
  function runWithManifest(manifest) {
    var shell = parseTriple(WGT_SHELL_VERSION);
    var minShell = parseTriple(manifest.minWgtShell || "0.0.0");
    if (manifest.forceWgtInstall || compareTriple(shell, minShell) < 0) {
      showBlockingScreen(manifest);
      return;
    }
    var running = runningBundleVersion();
    var remote = String(manifest.bundleVersion || "");
    if (!remote || compareTriple(parseTriple(remote), parseTriple(running)) <= 0) {
      return;
    }
    xhrGet(manifest.bundleUrl, "arraybuffer")
      .then(function (buf) {
        return applyBundleZip(buf, manifest.bundleSha256);
      })
      .then(extractZipToCache)
      .then(function () {
        setCachedVersion(remote);
        maybeAnnounce(remote, manifest);
        window.location.reload();
      })
      .catch(function (err) {
        console.warn("Background bundle download failed:", err);
        showToast("Update failed — " + (err && err.message ? err.message : "download error"), 9000);
      });
  }

  function runBackgroundUpdate() {
    xhrGet(MANIFEST_URL, "text")
      .then(function (text) {
        return JSON.parse(text);
      })
      .then(function (manifest) {
        var remote = String(manifest.bundleVersion || "");
        var cached = readCachedVersion();
        if (remote && compareTriple(parseTriple(remote), parseTriple(cached)) > 0) {
          showToast("Downloading KPV v" + remote + "…", 8000);
        }
        runWithManifest(manifest);
      })
      .catch(function (err) {
        showToast("Update check failed — " + (err && err.message ? err.message : "network"), 7000);
      });
  }

  window.KPV_triggerHotUpdate = runBackgroundUpdate;

  function run() {
    if (entry === "watch") return;
    if (usesLegacyMainScript()) {
      showBlockingScreen({
        wgtUrl:
          "https://github.com/" + RELEASES_OWNER + "/" + RELEASES_REPO + "/releases/latest/download/KPV.wgt",
        bundleVersion: "latest",
        minWgtShell: "1.0.38",
      });
      return;
    }
    runBackgroundUpdate();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
