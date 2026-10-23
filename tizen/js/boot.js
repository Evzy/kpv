/* global tizen, document, localStorage */
/**
 * Loads catalog JS/CSS from hot-cache when bootstrap has applied a bundle;
 * otherwise uses the copy embedded in the installed .wgt.
 */
(function kpvBoot() {
  var CACHE_DIR = "kpv-hot-cache";
  var LS_BUNDLE = "kpv_bundle_version";
  var PACKAGED_VERSION = "__KPV_PACKAGED_VERSION__";

  /** True when `a` is an older x.y.z than `b`; unparseable versions never count as older. */
  function olderThan(a, b) {
    var pa = String(a).split(".");
    var pb = String(b).split(".");
    if (pa.length !== 3 || pb.length !== 3) return false;
    for (var i = 0; i < 3; i += 1) {
      var x = parseInt(pa[i], 10);
      var y = parseInt(pb[i], 10);
      if (isNaN(x) || isNaN(y)) return false;
      if (x !== y) return x < y;
    }
    return false;
  }

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
    var slug = "";
    try {
      cachedVer = localStorage.getItem(LS_BUNDLE) || "";
      slug = localStorage.getItem("kpv_bundle_cache_slug") || "";
    } catch (_) {
      cachedVer = "";
      slug = "";
    }
    if (typeof tizen === "undefined" || !tizen.filesystem || olderThan(cachedVer, PACKAGED_VERSION)) {
      loadPackaged();
      return;
    }
    if (slug && typeof KpvBundleCache !== "undefined" && KpvBundleCache.mainJsPathForSlug) {
      tryResolveMain([KpvBundleCache.mainJsPathForSlug(slug)], 0);
      return;
    }
    if (!cachedVer) {
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
