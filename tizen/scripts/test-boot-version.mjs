// boot.js must not let an older downloaded bundle override a newer installed .wgt.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const boot = readFileSync(path.join(root, "js", "boot.js"), "utf8").replace(/__KPV_PACKAGED_VERSION__/g, "1.0.53");

function run(cachedVersion) {
  const loaded = [];
  const store = { kpv_bundle_version: cachedVersion, kpv_bundle_cache_slug: cachedVersion ? "slug" : "" };
  const ctx = {
    localStorage: { getItem: (k) => store[k] || null },
    document: {
      createElement: () => ({}),
      body: { appendChild: (s) => loaded.push(s.src) },
      getElementById: () => null,
    },
    KpvBundleCache: { mainJsPathForSlug: (s) => `documents/${s}/main.js`, listMainJsCandidates: () => [] },
    tizen: {
      filesystem: {
        resolve(p, ok) {
          ok({ toURI: () => `file:///${p}` });
        },
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(boot, ctx);
  return loaded;
}

assert.deepEqual(run(""), ["main.js"], "no download: packaged");
assert.deepEqual(run("1.0.52"), ["main.js"], "older download: packaged");
assert.deepEqual(run("1.0.53"), ["file:///documents/slug/main.js"], "same version download still used");
assert.deepEqual(run("1.0.60"), ["file:///documents/slug/main.js"], "newer download used");

const flat = readFileSync(path.join(root, "scripts", "build-flat.mjs"), "utf8");
assert.match(flat, /__KPV_PACKAGED_VERSION__/, "build-flat stamps the packaged version into boot.js");

console.log("test-boot-version: PASS");
