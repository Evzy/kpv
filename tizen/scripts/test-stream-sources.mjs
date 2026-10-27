// Alternative stream sources from the catalog, and the fallback order between them.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx = {};
vm.createContext(ctx);
vm.runInContext(
  `${readFileSync(path.join(root, "js", "stream-sources.js"), "utf8")}\nglobalThis.StreamSources = StreamSources;`,
  ctx,
);
const S = ctx.StreamSources;
const plain = (v) => JSON.parse(JSON.stringify(v));

{
  const sources = S.fromStream({
    uri_name: "nba/2026-10-26/dal-mia",
    iframe: "https://embed.example/main",
    source_tag: "NBA TV",
    substreams: [
      { uri_name: "nba/2026-10-26/dal-mia/away", iframe: "https://embed.example/away", source_tag: "KFAA-TV (Away)" },
      { uri_name: "", source_tag: "Broken" },
      { uri_name: "nba/2026-10-26/dal-mia/home", iframe: "" },
    ],
  });
  assert.deepEqual(plain(sources), [
    { label: "NBA TV", uri: "nba/2026-10-26/dal-mia", iframe: "https://embed.example/main" },
    { label: "KFAA-TV (Away)", uri: "nba/2026-10-26/dal-mia/away", iframe: "https://embed.example/away" },
    { label: "Source 3", uri: "nba/2026-10-26/dal-mia/home", iframe: "" },
  ]);
}

assert.equal(S.fromStream({ uri_name: "a", substreams: [{ uri_name: "a/b" }] })[0].label, "Main");
assert.deepEqual(plain(S.fromStream({ uri_name: "a" })), [], "no substreams");
assert.deepEqual(plain(S.fromStream({ uri_name: "a", substreams: [{ uri_name: " " }] })), [], "only blank substreams");

assert.equal(S.next(3, 0, new Set([0])), 1);
assert.equal(S.next(3, 2, new Set([2])), 0, "wraps around");
assert.equal(S.next(3, 1, new Set([0, 1])), 2);
assert.equal(S.next(3, 2, new Set([0, 1, 2])), null);
assert.equal(S.next(1, 0, new Set([0])), null);

console.log("test-stream-sources: PASS");
