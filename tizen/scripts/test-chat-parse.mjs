// Live chat frames → overlay lines (mirrors the Android ChatMessageParser).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx = {};
vm.createContext(ctx);
vm.runInContext(
  `${readFileSync(path.join(root, "js", "chat-overlay.js"), "utf8")}\nglobalThis.ChatOverlay = ChatOverlay;`,
  ctx,
);
const C = ctx.ChatOverlay;
const line = (username, message, extra = {}) =>
  JSON.stringify({ username, message, color: "ff5733", ...extra });

{
  const [m, ...rest] = C.parse(line("lagged_6", "hello there", { uuid: "abc" }));
  assert.equal(rest.length, 0);
  assert.equal(m.id, "abc");
  assert.equal(m.username, "lagged_6");
  assert.equal(m.text, "hello there");
  assert.equal(m.color, "#ff5733");
}

{
  const items = Array.from({ length: 9 }, (_, i) => JSON.parse(line("u", `m${i}`)));
  const messages = C.parse(JSON.stringify({ prefill: items }));
  assert.equal(messages.length, 5, "prefill keeps the last five");
  assert.equal(messages[0].text, "m4");
  assert.equal(messages[4].text, "m8");
}

assert.equal(C.parse(JSON.stringify({ viewers: 4 })).length, 0, "viewer counts are ignored");
assert.equal(C.parse(line("System", "only you", { private: 1 })).length, 0, "private messages are hidden");
assert.equal(C.parse(line("x", "   ")).length, 0, "blank text is dropped");
assert.equal(C.parse("not json").length, 0);
assert.equal(C.parse("null").length, 0);

assert.equal(C.plainText("<b>Go</b> &amp; win &#127936; &lt;3"), "Go & win 🏀 <3");
assert.equal(C.plainText("a<br>\n  b"), "a b");
assert.equal(C.parse(line("x", "hi", { color: "" }))[0].color, null);
assert.equal(C.parse(line("x", "hi", { color: "zzzzzz" }))[0].color, null);

assert.equal(C.socketUrl(42, false), "wss://ws.television.st/chat?channel=42");
assert.equal(C.socketUrl(42, true), "wss://ws.television.st/chat?channel=42&reconnect=true");

console.log("test-chat-parse: PASS");
