import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const file = path.join(os.tmpdir(), "bundle-jw.js");
if (!fs.existsSync(file)) {
  const res = await fetch("https://embed.example.com/js/bundle-jw.js");
  fs.writeFileSync(file, await res.text());
}
const h = fs.readFileSync(file, "utf8");
const idx = h.indexOf("/fetch");
console.log("count /fetch", (h.match(/\/fetch/g) || []).length);
for (let i = 0; i < 5; i++) {
  const at = h.indexOf("/fetch", i ? h.indexOf("/fetch", idx + i * 5) + 1 : idx);
  if (at < 0) break;
  console.log("\n--- context", at);
  console.log(h.slice(Math.max(0, at - 120), at + 200));
}
