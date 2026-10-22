/* global tizen, document, localStorage */
/** Versioned hot-cache on Samsung TV (flat cache overwrites fail with "overwrite is not allowed"). */
var KpvBundleCache = (function () {
  var ROOT = "kpv-hot-cache";
  var LS_KEY = "kpv_bundle_version";
  var LS_SLUG_KEY = "kpv_bundle_cache_slug";

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

  function dirPathForSlug(slug) {
    return cacheRootPath() + "/" + slug;
  }

  function mainJsPath(version) {
    return versionDirPath(version) + "/main.js";
  }

  function mainJsPathForSlug(slug) {
    return dirPathForSlug(slug) + "/main.js";
  }

  function freshSlugForVersion(version) {
    var rand = Math.random().toString(36).slice(2, 8);
    return slugVersion(version) + "-" + Date.now().toString(36) + "-" + rand;
  }

  /*
   * Samsung's legacy File.createDirectory / createFile are synchronous (they return the File and
   * ignore callbacks), FileStream.write only accepts strings, and deleteFile/deleteDirectory need
   * full paths. Prefer the Tizen 5+ path API (tizen.filesystem.openFile etc.) when present.
   */
  function hasPathApi() {
    var fs = tizen.filesystem;
    return (
      typeof fs.createDirectory === "function" &&
      typeof fs.openFile === "function" &&
      typeof fs.deleteDirectory === "function"
    );
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

  function pathExists(path) {
    if (typeof tizen.filesystem.pathExists === "function") {
      try {
        return Promise.resolve(tizen.filesystem.pathExists(path));
      } catch (_) {
        return Promise.resolve(false);
      }
    }
    return resolvePath(path, "r").then(
      function () {
        return true;
      },
      function () {
        return false;
      },
    );
  }

  function makeDir(path) {
    if (hasPathApi()) {
      return Promise.resolve().then(function () {
        tizen.filesystem.createDirectory(path, true);
      });
    }
    var cut = path.lastIndexOf("/");
    return resolvePath(path.slice(0, cut), "rw").then(function (parent) {
      parent.createDirectory(path.slice(cut + 1));
    });
  }

  function ensureRootDir() {
    return pathExists(cacheRootPath()).then(function (exists) {
      if (!exists) return makeDir(cacheRootPath());
    });
  }

  /** New unique subfolder; retry with a new slug on a name collision. */
  function createFreshSubdir(version) {
    var attempts = 0;
    function tryCreate() {
      attempts += 1;
      var slug = freshSlugForVersion(version);
      var path = dirPathForSlug(slug);
      return pathExists(path)
        .then(function (exists) {
          if (exists) throw new Error("exists");
          return makeDir(path);
        })
        .then(
          function () {
            return slug;
          },
          function (err) {
            if (attempts >= 5) throw err;
            return tryCreate();
          },
        );
    }
    return tryCreate();
  }

  function removeDirQuiet(path) {
    return new Promise(function (resolve) {
      try {
        if (hasPathApi()) {
          tizen.filesystem.deleteDirectory(path, true, resolve, resolve);
          return;
        }
        var cut = path.lastIndexOf("/");
        resolvePath(path.slice(0, cut), "rw").then(function (parent) {
          parent.deleteDirectory(parent.fullPath + "/" + path.slice(cut + 1), true, resolve, resolve);
        }, resolve);
      } catch (_) {
        resolve();
      }
    });
  }

  function removeFileQuiet(path) {
    return new Promise(function (resolve) {
      try {
        if (typeof tizen.filesystem.deleteFile === "function") {
          tizen.filesystem.deleteFile(path, resolve, resolve);
          return;
        }
        resolve();
      } catch (_) {
        resolve();
      }
    });
  }

  function bytesToBase64(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  function writeFile(dirPath, name, bytes) {
    var path = dirPath + "/" + name;
    if (hasPathApi()) {
      return Promise.resolve().then(function () {
        var fh = tizen.filesystem.openFile(path, "w");
        try {
          fh.writeData(bytes);
        } finally {
          fh.close();
        }
      });
    }
    return resolvePath(dirPath, "rw").then(function (dir) {
      var file = dir.createFile(name);
      return new Promise(function (resolve, reject) {
        file.openStream(
          "w",
          function (stream) {
            try {
              stream.writeBase64(bytesToBase64(bytes));
              stream.close();
              resolve();
            } catch (e) {
              reject(e);
            }
          },
          reject,
        );
      });
    });
  }

  /** Drop abandoned attempt folders and stray root files from earlier broken builds. */
  function pruneCache(keepSlug) {
    return resolvePath(cacheRootPath(), "r")
      .then(function (root) {
        return new Promise(function (resolve) {
          root.listFiles(resolve, function () {
            resolve([]);
          });
        });
      })
      .then(
        function (entries) {
          return entries.reduce(function (chain, f) {
            return chain.then(function () {
              if (f.name === keepSlug) return;
              var p = cacheRootPath() + "/" + f.name;
              return f.isDirectory ? removeDirQuiet(p) : removeFileQuiet(p);
            });
          }, Promise.resolve());
        },
        function () {},
      );
  }

  function readStoredSlug() {
    try {
      return localStorage.getItem(LS_SLUG_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function persistCachePointers(version, slug) {
    try {
      localStorage.setItem(LS_KEY, version);
      localStorage.setItem(LS_SLUG_KEY, slug);
    } catch (_) {
      /* ignore */
    }
  }

  function extractZipToVersion(version, zip) {
    var newSlug = "";
    var names = Object.keys(zip.files).filter(function (n) {
      return !zip.files[n].dir;
    });
    if (
      !names.some(function (n) {
        return /(^|\/)main\.js$/i.test(n);
      })
    ) {
      return Promise.reject(new Error("bundle has no main.js"));
    }

    return ensureRootDir()
      .then(function () {
        return createFreshSubdir(version);
      })
      .then(function (slug) {
        newSlug = slug;
        var dirPath = dirPathForSlug(slug);
        return names.reduce(function (chain, name) {
          return chain.then(function () {
            var base = name.split("/").pop().split("\\").pop();
            return zip.files[name].async("uint8array").then(function (bytes) {
              return writeFile(dirPath, base, bytes);
            });
          });
        }, Promise.resolve());
      })
      .then(function () {
        persistCachePointers(version, newSlug);
        return pruneCache(newSlug);
      });
  }

  function listMainJsCandidates(cachedVer) {
    var paths = [];
    var slug = readStoredSlug();
    if (slug) paths.push(mainJsPathForSlug(slug));
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
    LS_SLUG_KEY: LS_SLUG_KEY,
    slugVersion: slugVersion,
    mainJsPath: mainJsPath,
    mainJsPathForSlug: mainJsPathForSlug,
    listMainJsCandidates: listMainJsCandidates,
    extractZipToVersion: extractZipToVersion,
    setCachedVersion: setCachedVersion,
  };
})();
