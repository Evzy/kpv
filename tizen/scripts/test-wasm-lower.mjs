import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function load(file, name) {
  const src = readFileSync(new URL(`../js/${file}`, import.meta.url), "utf8");
  return new Function(`${src}\nreturn ${name};`)();
}

const WasmLower = load("wasm-lower.js", "WasmLower");
const GasmResolve = load("gasm-resolve.js", "GasmResolve");

const EXT = 0x6f;
const I32 = 0x7f;

function u32(n) {
  const out = [];
  do {
    let b = n & 0x7f;
    n >>>= 7;
    if (n) b |= 0x80;
    out.push(b);
  } while (n);
  return out;
}
const str = (s) => [...u32(s.length), ...Buffer.from(s)];
const vec = (items) => [...u32(items.length), ...items.flat()];
const section = (id, body) => [id, ...u32(body.length), ...body];

/** Small module exercising every externref feature WasmLower rewrites. */
function buildModule() {
  const types = [
    [[EXT], [EXT]], // 0 roundtrip / callEcho
    [[EXT], []], // 1 store
    [[], [EXT]], // 2 load / nul
    [[EXT], [I32]], // 3 isNull / grow
    [[], [I32]], // 4 size
  ];
  const typeSec = vec(types.map(([p, r]) => [0x60, ...vec(p.map((t) => [t])), ...vec(r.map((t) => [t]))]));
  const importSec = vec([[...str("env"), ...str("echo"), 0x00, ...u32(0)]]);
  const funcs = [
    { type: 0, name: "roundtrip", code: [0x20, 0x00] },
    { type: 1, name: "store", code: [0x41, 0x01, 0x20, 0x00, 0x26, 0x00] },
    { type: 2, name: "load", code: [0x41, 0x01, 0x25, 0x00] },
    { type: 3, name: "isNull", code: [0x20, 0x00, 0xd1] },
    { type: 3, name: "grow", code: [0x20, 0x00, 0x41, 0x03, 0xfc, 0x0f, 0x00] },
    { type: 4, name: "size", code: [0xfc, 0x10, 0x00] },
    { type: 2, name: "nul", code: [0xd0, EXT] },
    { type: 0, name: "callEcho", code: [0x20, 0x00, 0x10, 0x00] },
    // externref local + typed select + externref block result
    {
      type: 0,
      name: "viaLocal",
      locals: [[1, EXT]],
      code: [0x20, 0x00, 0x21, 0x01, 0x02, EXT, 0x20, 0x01, 0xd0, EXT, 0x41, 0x01, 0x1c, 0x01, EXT, 0x0b],
    },
  ];
  const funcSec = vec(funcs.map((f) => u32(f.type)));
  const tableSec = vec([[EXT, 0x00, ...u32(2)]]);
  const exportSec = vec([
    ...funcs.map((f, i) => [...str(f.name), 0x00, ...u32(i + 1)]),
    [...str("refs"), 0x01, ...u32(0)],
  ]);
  const codeSec = vec(
    funcs.map((f) => {
      const body = [...vec((f.locals || []).map(([n, t]) => [...u32(n), t])), ...f.code, 0x0b];
      return [...u32(body.length), ...body];
    }),
  );
  return Uint8Array.from([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...section(1, typeSec),
    ...section(2, importSec),
    ...section(3, funcSec),
    ...section(4, tableSec),
    ...section(7, exportSec),
    ...section(10, codeSec),
  ]);
}

const original = buildModule();
assert.ok(WebAssembly.validate(original), "hand-built module should be valid");

const { bytes, meta } = WasmLower.lower(original);
assert.ok(WebAssembly.validate(bytes), "lowered module should be valid");
assert.equal(meta.externTables.length, 1);
assert.deepEqual(meta.externTables[0].exportNames, ["refs"]);

const again = WasmLower.lower(bytes).meta;
assert.equal(again.externTables.length, 0, "lowered module keeps no externref table");
assert.ok(
  again.types.every((t) => !t.params.includes(EXT) && !t.results.includes(EXT)),
  "lowered module keeps no externref types",
);

const echoed = [];
const { instance } = await WasmLower.instantiate(original, {
  env: {
    echo(v) {
      echoed.push(v);
      return { wrapped: v };
    },
  },
});
const ex = instance.exports;
const obj = { a: 1 };

assert.equal(ex.roundtrip(obj), obj);
assert.equal(ex.roundtrip(undefined), undefined);
assert.equal(ex.roundtrip(null), null);
assert.equal(ex.isNull(null), 1);
assert.equal(ex.isNull(obj), 0);
assert.equal(ex.isNull(undefined), 0);
assert.equal(ex.nul(), null);

ex.store(obj);
assert.equal(ex.load(), obj);
assert.equal(ex.refs.get(1), obj, "exported table sees values set from wasm");
ex.refs.set(1, "from js");
assert.equal(ex.load(), "from js", "wasm sees values set through the exported table");

assert.equal(ex.size(), 2);
assert.equal(ex.grow(obj), 2, "table.grow returns the old size");
assert.equal(ex.size(), 5);
assert.equal(ex.refs.length, 5);
assert.equal(ex.refs.get(4), obj);

const res = ex.callEcho(obj);
assert.deepEqual(echoed, [obj]);
assert.deepEqual(res, { wrapped: obj });

assert.equal(ex.viaLocal(obj), obj);

assert.deepEqual(GasmResolve.parseEmbed("https://taifood-blog.asia/embed/247-willow"), {
  origin: "https://taifood-blog.asia",
  host: "taifood-blog.asia",
  channel: "247-willow",
});
assert.equal(GasmResolve.parseEmbed("https://x.test/embed/a/b?x=1").channel, "a/b");
assert.equal(GasmResolve.parseEmbed("https://x.test/live/247-willow"), null);
assert.equal(GasmResolve.canResolve("not a url"), false);

console.log("test-wasm-lower: PASS");
