/* global tizen, document, localStorage */
/** Versioned hot-cache on Samsung TV (flat cache overwrites fail with "overwrite is not allowed"). */
var KpvBundleCache = (function () {
  var ROOT = "kpv-hot-cache";
  var LS_KEY = "kpv_bundle_version";

  function slugVersion(version) {
    return String(version || "")
      .trim()
      .replace(/^v/i, "")
      .replace(/[^0-9A-Za-z._-]+/g, "_");
  }

  function cacheRootPath() {
    return "documents/" + ROOT;
  }

  function versionDirPath(version) {
    return cacheRootPath() + "/" + slugVersion(version);
  }

  function mainJsPath(version) {
    return versionDirPath(version) + "/main.js";
  }

  function resolvePath(path, mode) {
    return new Promise(function (resolve, reject) {
      try {
        tizen.filesystem.resolve(path, resolve, reject, mode || "rw");
      } catch (e) {
        reject(e);
      }
    });
  }

  function ensureRootDir() {
    return resolvePath(cacheRootPath(), "rw").catch(function () {
      return resolvePath("documents", "rw").then(function (doc) {
        return new Promise(function (resolve, reject) {
          doc.createDirectory(ROOT, resolve, reject, true);
        });
      });
    });
  }

  /** Recreate an empty folder for this bundle version (no per-file overwrite). */
  function ensureVersionDir(version) {
    var slug = slugVersion(version);
    return ensureRootDir().then(function (rootDir) {
      return new Promise(function (resolve, reject) {
        rootDir.createDirectory(slug, resolve, reject, true);
      });
    });
  }

  function writeFile(dir, name, blob) {
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
                  resolve();
                } catch (e) {
                  reject(e);
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
  }

  function extractZipToVersion(version, zip) {
    return ensureVersionDir(version).then(function (dir) {
      var names = Object.keys(zip.files).filter(function (n) {
        return !zip.files[n].dir;
      });
      return names.reduce(function (chain, name) {
        return chain.then(function () {
          var base = name.split("/").pop().split("\\").pop();
          return zip.files[name].async("blob").then(function (blob) {
            return writeFile(dir, base, blob);
          });
        });
      }, Promise.resolve());
    });
  }

  function listMainJsCandidates(cachedVer) {
    var paths = [];
    if (cachedVer) paths.push(mainJsPath(cachedVer));
    paths.push(cacheRootPath() + "/main.js");
    return paths;
  }

  function setCachedVersion(version) {
    try {
      localStorage.setItem(LS_KEY, version);
    } catch (_) {
      /* ignore */
    }
  }

  return {
    LS_KEY: LS_KEY,
    slugVersion: slugVersion,
    mainJsPath: mainJsPath,
    listMainJsCandidates: listMainJsCandidates,
    extractZipToVersion: extractZipToVersion,
    setCachedVersion: setCachedVersion,
  };
})();
