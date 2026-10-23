// Opening Settings with OK must not also activate its first row (the Address field / keyboard),
// and panels must not rely on CSS `inset`, which the TV browser ignores (Settings grew off-screen).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const css = readFileSync(path.join(root, "css", "style.css"), "utf8");
assert.ok(!/(^|[;{\s])inset\s*:/m.test(css), "style.css must not use `inset` (unsupported on Tizen)");

{
  const listeners = {};
  const btn = {
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    },
  };
  const ctx = {
    document: { getElementById: (id) => (id === "btn-settings" ? btn : null) },
    TvKeys: { isSelect: (e) => e.keyCode === 13 },
  };
  vm.createContext(ctx);
  vm.runInContext(`${readFileSync(path.join(root, "js", "tv-nav.js"), "utf8")}\nglobalThis.TvNav = TvNav;`, ctx);

  let opened = 0;
  ctx.TvNav.wireSettingsButton(() => {
    opened += 1;
  });
  let stopped = false;
  listeners.keydown({ keyCode: 13, preventDefault() {}, stopPropagation: () => (stopped = true) });
  assert.equal(opened, 1, "OK on the gear opens Settings");
  assert.ok(stopped, "the same OK press must not reach the Settings panel");
}

console.log("test-settings-open: PASS");
