// Update checks run once per app launch (sessionStorage), not on every return to index.html.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = JSON.stringify({ bundleVersion: "9.9.9", bundleUrl: "https://x.test/b.zip" });

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

function makeContext(session) {
  const requests = [];
  class XMLHttpRequest {
    open(method, url) {
      this.url = url;
    }
    send() {
      requests.push(this.url);
      setTimeout(() => {
        if (/kpv-tv-manifest\.json/.test(this.url)) {
          this.status = 200;
          this.response = MANIFEST;
          this.onload();
        } else {
          this.onerror();
        }
      }, 0);
    }
  }
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {} });
  const document = {
    readyState: "complete",
    currentScript: { getAttribute: () => "index" },
    querySelectorAll: () => [{ getAttribute: () => "boot.js" }],
    getElementById: () => null,
    createElement: el,
    body: { appendChild() {}, classList: { remove() {} } },
    head: { appendChild() {} },
    addEventListener() {},
  };
  const ctx = {
    XMLHttpRequest,
    document,
    localStorage: makeStorage(),
    sessionStorage: session,
    setTimeout,
    clearTimeout,
    console: { log() {}, warn() {} },
    KPV_APP_VERSION: "1.0.0",
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  return { ctx, requests };
}

const tick = () => new Promise((r) => setTimeout(r, 10));

{
  const session = makeStorage();
  const bootstrap = readFileSync(path.join(root, "js", "bootstrap.js"), "utf8");
  const first = makeContext(session);
  vm.runInContext(bootstrap, first.ctx);
  await tick();
  assert.equal(first.requests.filter((u) => /manifest/.test(u)).length, 1, "launch checks once");

  const back = makeContext(session);
  vm.runInContext(bootstrap, back.ctx);
  await tick();
  assert.equal(back.requests.length, 0, "returning to index.html in the same session skips the check");
}

{
  const session = makeStorage();
  const tvUpdate = readFileSync(path.join(root, "js", "tv-update.js"), "utf8");
  const { ctx, requests } = makeContext(session);
  vm.runInContext(`${tvUpdate}\nglobalThis.TvUpdate = TvUpdate;`, ctx);

  const a = await ctx.TvUpdate.fetchStatus({ useSession: true });
  const b = await ctx.TvUpdate.fetchStatus({ useSession: true });
  assert.equal(a.latest, "9.9.9");
  assert.equal(b.latest, "9.9.9");
  assert.equal(requests.length, 1, "version line reuses this session's manifest");

  await ctx.TvUpdate.fetchStatus();
  assert.equal(requests.length, 2, "explicit checks always hit the network");
}

console.log("test-update-session: PASS");
