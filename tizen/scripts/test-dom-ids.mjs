// Every document.getElementById("x") in tizen/js must match an id="x" in some tizen/*.html page.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jsDir = path.join(root, "js");

const htmlIds = new Set();
for (const name of readdirSync(root).filter((n) => n.endsWith(".html"))) {
  const html = readFileSync(path.join(root, name), "utf8");
  for (const m of html.matchAll(/\bid="([^"]+)"/g)) htmlIds.add(m[1]);
}

// Ids created at runtime with createElement, never present in HTML.
const dynamic = new Set([
  "kpv-tizen-catalog-fix", // app.js injects this <style> once, guarded by its own lookup
]);

const missing = [];
let checked = 0;
for (const name of readdirSync(jsDir).filter((n) => n.endsWith(".js"))) {
  const src = readFileSync(path.join(jsDir, name), "utf8");
  for (const m of src.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g)) {
    checked += 1;
    if (!htmlIds.has(m[1]) && !dynamic.has(m[1])) missing.push(`${name}: #${m[1]}`);
  }
}

if (missing.length) {
  console.error("test-dom-ids: ids used in JS but not defined in any tizen/*.html:");
  for (const line of missing) console.error("  " + line);
  process.exit(1);
}
console.log(`test-dom-ids: ok (${checked} ids)`);
