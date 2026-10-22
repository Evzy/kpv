// StreamResolve.resolveForWatch order: site API, playback cache, then the TV decoder. No phone.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "js", "stream-resolve.js"), "utf8");

function load({ payload = null, decoder = null, cached = null } = {}) {
  const calls = { decoder: 0, cachePut: [] };
  const cache = new Map(cached ? [[cached.uri, cached.entry]] : []);
  const ctx = {
    Site: {
      toAbsoluteUrl: (u) => u,
      apiCandidates: () => ["https://api.site.test"],
      streamUrl: (uri, api) => `${api}/api/streams/${uri}`,
      fetchJson: async () => {
        if (!payload) throw new Error("offline");
        return payload;
      },
      rememberApi: () => {},
      noteEmbedFromUrl: () => {},
      embedFallback: (uri) => `https://embed.test/embed/${uri}`,
      siteOrigin: () => "https://site.test",
      resolveMediaUrl: async (u) => u,
    },
    GasmResolve: {
      canResolve: (u) => /\/embed\//.test(u || ""),
      resolve: async () => {
        calls.decoder += 1;
        if (decoder instanceof Error) throw decoder;
        return decoder || "";
      },
    },
    PlaybackCache: {
      get: (uri) => cache.get(uri) || null,
      put: (uri, entry) => {
        calls.cachePut.push(uri);
        cache.set(uri, entry);
      },
    },
    Companion: new Proxy(
      {},
      {
        get() {
          throw new Error("Companion must not be used");
        },
      },
    ),
    localStorage: { getItem: () => null },
  };
  vm.createContext(ctx);
  vm.runInContext(`${source}\nglobalThis.StreamResolve = StreamResolve;`, ctx);
  return { StreamResolve: ctx.StreamResolve, calls };
}

const LIVE = "https://cdn.test/live/index.m3u8";
const DECODED = "https://edge.test/secure/x/index.m3u8";

{
  const { StreamResolve } = load();
  for (const gone of ["fetchFromCompanion", "prepareOnPhone", "companionReady"]) {
    assert.equal(gone in StreamResolve, false, `${gone} should be removed`);
  }
}

{
  const { StreamResolve, calls } = load({
    payload: { data: { sources: [{ type: "hls", data: LIVE }] } },
    decoder: DECODED,
  });
  const r = await StreamResolve.resolveForWatch({ uri: "ch" });
  assert.equal(r.hls, LIVE);
  assert.equal(calls.decoder, 0, "API playlist should skip the decoder");
}

{
  const { StreamResolve, calls } = load({
    cached: { uri: "ch", entry: { hls: LIVE, embed: "https://embed.test/embed/ch" } },
    decoder: DECODED,
  });
  const r = await StreamResolve.resolveForWatch({ uri: "ch" });
  assert.equal(r.hls, LIVE);
  assert.equal(r.fromCache, true);
  assert.equal(calls.decoder, 0);
}

{
  const { StreamResolve, calls } = load({
    payload: { data: { sources: [{ type: "iframe", data: "https://embed.test/embed/ch" }] } },
    decoder: DECODED,
  });
  const r = await StreamResolve.resolveForWatch({ uri: "ch" });
  assert.equal(r.hls, DECODED);
  assert.equal(r.usedTvResolver, true);
  assert.deepEqual(calls.cachePut, ["ch"]);
}

{
  const { StreamResolve } = load({ decoder: new Error("blocked") });
  const r = await StreamResolve.resolveForWatch({ uri: "ch" });
  assert.equal(r.hls, "");
  assert.equal(r.embed, "https://embed.test/embed/ch");
  assert.match(r.tvNote, /blocked/);
}

{
  const { StreamResolve, calls } = load({
    cached: { uri: "ch", entry: { hls: LIVE, embed: "https://embed.test/embed/ch" } },
    decoder: DECODED,
  });
  const r = await StreamResolve.resolveForWatch({ uri: "ch" }, { skipCache: true });
  assert.equal(r.hls, DECODED);
  assert.equal(calls.decoder, 1);
}

console.log("test-resolve-flow: PASS");
