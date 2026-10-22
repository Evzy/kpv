import { cp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readReleaseVersion, syncTizenPackageJson } from "../../scripts/read-release-version.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const releaseMeta = await syncTizenPackageJson();
await writeFile(
  path.join(root, "js", "app-version.js"),
  `const KPV_APP_VERSION = "${releaseMeta.version}";\n`,
  "utf8",
);
const jsOrder = [
  "app-version.js",
  "bundle-cache.js",
  "site.js",
  "tv-keys.js",
  "remote-guide.js",
  "companion.js",
  "playback-cache.js",
  "stream-resolve.js",
  "stream-live.js",
  "catalog.js",
  "player.js",
  "tv-nav.js",
  "catalog-nav.js",
  "tv-update.js",
  "settings.js",
  "app.js",
];

await cp(path.join(root, "js", "boot.js"), path.join(root, "boot.js"));
await cp(path.join(root, "js", "bundle-cache.js"), path.join(root, "bundle-cache.js"));
await cp(path.join(root, "js", "watch.js"), path.join(root, "watch.js"));
await cp(path.join(root, "js", "sniff.js"), path.join(root, "sniff.js"));
await cp(path.join(root, "js", "embed-engine.js"), path.join(root, "embed-engine.js"));
await cp(path.join(root, "js", "avplay-play.js"), path.join(root, "avplay-play.js"));
await cp(path.join(root, "js", "playback-cache.js"), path.join(root, "playback-cache.js"));
await cp(path.join(root, "js", "stream-resolve.js"), path.join(root, "stream-resolve.js"));
await cp(path.join(root, "js", "wasm-lower.js"), path.join(root, "wasm-lower.js"));
await cp(path.join(root, "js", "gasm-resolve.js"), path.join(root, "gasm-resolve.js"));
await cp(path.join(root, "js", "tizen-play.js"), path.join(root, "tizen-play.js"));
await cp(path.join(root, "js", "site.js"), path.join(root, "site.js"));
await cp(path.join(root, "js", "companion.js"), path.join(root, "companion.js"));
await cp(path.join(root, "js", "tv-keys.js"), path.join(root, "tv-keys.js"));
const hlsMin = path.join(root, "node_modules", "hls.js", "dist", "hls.min.js");
try {
  await cp(hlsMin, path.join(root, "hls.min.js"));
} catch (_) {
  /* npm install hls.js first */
}

const parts = await Promise.all(
  jsOrder.map((name) => readFile(path.join(root, "js", name), "utf8")),
);
await writeFile(path.join(root, "main.js"), `${parts.join("\n\n")}\n`, "utf8");
await cp(path.join(root, "css", "style.css"), path.join(root, "style.css"));
