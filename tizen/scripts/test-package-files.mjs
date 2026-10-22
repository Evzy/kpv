// Every local <script src> / <link href> in a shipped page must also ship in the .wgt and the hot-update bundle.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fileList(script, varName) {
  const src = readFileSync(path.join(root, "scripts", script), "utf8");
  const m = src.match(new RegExp(`const ${varName} = \\[([\\s\\S]*?)\\];`));
  if (!m) throw new Error(`${script}: ${varName} not found`);
  return new Set([...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
}

function localRefs(page) {
  const html = readFileSync(path.join(root, page), "utf8");
  return [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1].split("?")[0])
    .filter((ref) => !ref.startsWith("$WEBAPIS") && !/^[a-z]+:/i.test(ref));
}

const lists = {
  "package-kpv-tizen.mjs": fileList("package-kpv-tizen.mjs", "flatFiles"),
  "build-web-bundle.mjs": fileList("build-web-bundle.mjs", "bundleFiles"),
};

const missing = [];
let checked = 0;
for (const [script, files] of Object.entries(lists)) {
  for (const page of [...files].filter((f) => f.endsWith(".html"))) {
    for (const ref of localRefs(page)) {
      checked += 1;
      if (!files.has(ref)) missing.push(`${script}: ${page} loads ${ref}`);
    }
  }
}

if (missing.length) {
  console.error("test-package-files: pages reference files that are not packaged:");
  for (const line of missing) console.error("  " + line);
  process.exit(1);
}
console.log(`test-package-files: ok (${checked} refs)`);
