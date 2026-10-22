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
          doc.createDirectory(ROOT, resolve, reject, false);
        });
      });
    });
  }

  function clearDirContents(dir) {
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
              deleteFileQuiet(dir, fname).then(next);
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

  /** Open cache subfolder, clearing files if it already exists (orphan from failed extract). */
  function openOrClearSubdir(rootDir, slug) {
    return new Promise(function (resolve, reject) {
      rootDir.createDirectory(
        slug,
        function (dir) {
          clearDirContents(dir).then(function () {
            resolve(dir);
          });
        },
        function () {
          resolvePath(dirPathForSlug(slug), "rw")
            .then(function (dir) {
              return clearDirContents(dir).then(function () {
                resolve(dir);
              });
            })
            .catch(function () {
              rootDir.createDirectory(slug, resolve, reject, false);
            });
        },
        true,
      );
    });
  }

  function removeSubdirQuiet(rootDir, slug) {
    if (!slug) return Promise.resolve();
    return new Promise(function (resolve) {
      try {
        rootDir.deleteDirectory(slug, resolve, resolve);
      } catch (_) {
        resolve();
      }
    });
  }

  function deleteFileQuiet(dir, name) {
    return new Promise(function (resolve) {
      try {
        dir.deleteFile(name, resolve, resolve);
      } catch (_) {
        resolve();
      }
    });
  }

  function writeFile(dir, name, blob) {
    return deleteFileQuiet(dir, name).then(function () {
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
    });
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
    var newSlug = freshSlugForVersion(version);
    var oldSlug = readStoredSlug();

    return ensureRootDir().then(function (rootDir) {
      return openOrClearSubdir(rootDir, newSlug).then(function (dir) {
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
      }).then(function () {
        persistCachePointers(version, newSlug);
        return removeSubdirQuiet(rootDir, oldSlug);
      });
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
    listMainJsCandidates: listMainJsCandidates,
    extractZipToVersion: extractZipToVersion,
    setCachedVersion: setCachedVersion,
  };
})();
