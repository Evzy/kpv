/* global tizen, document, localStorage */
/**
 * Loads catalog JS/CSS from hot-cache when bootstrap has applied a bundle;
 * otherwise uses the copy embedded in the installed .wgt.
 */
(function kpvBoot() {
  var CACHE_DIR = "kpv-hot-cache";
  var LS_BUNDLE = "kpv_bundle_version";

  function appendScript(src, onError) {
    var s = document.createElement("script");
    s.src = src;
    s.onerror = function () {
      if (onError) onError();
    };
    document.body.appendChild(s);
  }

  function loadPackaged() {
    appendScript("main.js");
  }

  function swapStylesheet(file) {
    var link = document.getElementById("kpv-stylesheet");
    if (!link || !file || !file.toURI) return;
    try {
      link.href = file.toURI();
    } catch (_) {
      /* ignore */
    }
  }

  function tryResolveMain(paths, idx) {
    if (idx >= paths.length) {
      loadPackaged();
      return;
    }
    tizen.filesystem.resolve(
      paths[idx],
      function (mainFile) {
        var cssPath = paths[idx].replace(/main\.js$/i, "style.css");
        tizen.filesystem.resolve(
          cssPath,
          function (cssFile) {
            swapStylesheet(cssFile);
          },
          function () {},
          "r",
        );
        appendScript(mainFile.toURI(), loadPackaged);
      },
      function () {
        tryResolveMain(paths, idx + 1);
      },
      "r",
    );
  }

  function loadFromHotCache() {
    var cachedVer = "";
    try {
      cachedVer = localStorage.getItem(LS_BUNDLE) || "";
    } catch (_) {
      cachedVer = "";
    }
    if (!cachedVer || typeof tizen === "undefined" || !tizen.filesystem) {
      loadPackaged();
      return;
    }
    var paths =
      typeof KpvBundleCache !== "undefined"
        ? KpvBundleCache.listMainJsCandidates(cachedVer)
        : ["documents/" + CACHE_DIR + "/main.js"];
    tryResolveMain(paths, 0);
  }

  loadFromHotCache();
})();
