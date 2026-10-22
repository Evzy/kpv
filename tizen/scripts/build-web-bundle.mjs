import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { readReleaseVersion } from "../../scripts/read-release-version.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "..");

const bundleFiles = [
  "bundle-cache.js",
  "main.js",
  "style.css",
  "watch.html",
  "watch.js",
  "sniff.html",
  "sniff.js",
  "embed-engine.js",
  "avplay-play.js",
  "site.js",
  "companion.js",
  "playback-cache.js",
  "stream-resolve.js",
  "wasm-lower.js",
  "gasm-resolve.js",
  "tizen-play.js",
  "hls-shell.html",
  "hls.min.js",
];

async function exists(p) {
  try {
    await access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const meta = await readReleaseVersion();
  const zip = new JSZip();
  const missing = [];
  for (const name of bundleFiles) {
    const filePath = path.join(root, name);
    if (!(await exists(filePath))) {
      missing.push(name);
      continue;
    }
    zip.file(name, await readFile(filePath));
  }
  if (missing.length) {
    console.error(`Missing bundle files (run npm run package first): ${missing.join(", ")}`);
    process.exit(1);
  }
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const outZip = path.join(repoRoot, "release", "kpv-web-bundle.zip");
  const outMeta = path.join(repoRoot, "release", "bundle-sha256.txt");
  await writeFile(outZip, buffer);
  await writeFile(outMeta, `${sha256}\n`, "utf8");
  console.log(`Bundle: ${outZip}`);
  console.log(`bundleVersion: ${meta.version}`);
  console.log(`bundleSha256: ${sha256}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
