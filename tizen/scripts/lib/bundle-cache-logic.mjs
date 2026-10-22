/** Pure hot-cache path logic (Node-tested; keep in sync with tizen/js/bundle-cache.js). */

export function slugVersion(version) {
  return String(version || "")
    .trim()
    .replace(/^v/i, "")
    .replace(/[^0-9A-Za-z._-]+/g, "_");
}

export function cacheRootPath(root = "kpv-hot-cache") {
  return `documents/${root}`;
}

export function dirPathForSlug(slug, root = "kpv-hot-cache") {
  return `${cacheRootPath(root)}/${slug}`;
}

export function mainJsPathForSlug(slug, root = "kpv-hot-cache") {
  return `${dirPathForSlug(slug, root)}/main.js`;
}

export function versionDirPath(version, root = "kpv-hot-cache") {
  return `${cacheRootPath(root)}/${slugVersion(version)}`;
}

export function mainJsPath(version, root = "kpv-hot-cache") {
  return `${versionDirPath(version, root)}/main.js`;
}

/** @param {number} [nowMs] */
export function freshSlugForVersion(version, nowMs = Date.now()) {
  return `${slugVersion(version)}-${nowMs.toString(36)}`;
}

export function listMainJsCandidates({ cachedVer, slug, root = "kpv-hot-cache" }) {
  const paths = [];
  if (slug) paths.push(mainJsPathForSlug(slug, root));
  if (cachedVer) paths.push(mainJsPath(cachedVer, root));
  paths.push(`${cacheRootPath(root)}/main.js`);
  return paths;
}
