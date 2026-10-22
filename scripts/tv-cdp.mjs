// DevTools client for KPV on the TV (after `sdb forward tcp:9222 tcp:<debug port>`).
//   node scripts/tv-cdp.mjs eval "<js expression>"   evaluate (awaits promises), print JSON
//   node scripts/tv-cdp.mjs console [seconds]        stream console + exceptions
//   node scripts/tv-cdp.mjs inject <file.js>         run a local script in the page (global scope)
//   node scripts/tv-cdp.mjs reload                   reload the page
const PORT = process.env.TV_CDP_PORT || "9222";
const [, , cmd = "console", arg = ""] = process.argv;

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = targets.find((t) => t.type === "page") || targets[0];
if (!page) throw new Error("No DevTools target. Is the app running in debug mode and port forwarded?");

const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function fmtArg(a) {
  if (a.value !== undefined) return typeof a.value === "string" ? a.value : JSON.stringify(a.value);
  return a.description || a.type;
}

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message));
    else p.resolve(msg.result);
    return;
  }
  if (msg.method === "Runtime.consoleAPICalled") {
    const { type, args } = msg.params;
    console.log(`[${type}] ${args.map(fmtArg).join(" ")}`);
  } else if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    console.log(`[exception] ${d.exception ? d.exception.description : d.text} @ ${d.url || ""}:${d.lineNumber}`);
  } else if (msg.method === "Log.entryAdded") {
    const e = msg.params.entry;
    console.log(`[log:${e.level}] ${e.text} ${e.url || ""}`);
  }
};

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

// Debug launches can start paused; make sure the page is running before anything else.
await send("Runtime.runIfWaitingForDebugger").catch(() => {});
await send("Debugger.enable").catch(() => {});
await send("Debugger.setSkipAllPauses", { skip: true }).catch(() => {});
await send("Debugger.resume").catch(() => {});

if (cmd === "resume") {
  console.log("resumed");
  ws.close();
} else if (cmd === "inject") {
  const { readFileSync } = await import("node:fs");
  const r = await send("Runtime.evaluate", { expression: readFileSync(arg, "utf8"), returnByValue: true });
  if (r.exceptionDetails) {
    console.error("Exception:", r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    process.exitCode = 1;
  } else {
    console.log(`injected ${arg}`);
  }
  ws.close();
} else if (cmd === "eval") {
  // Tizen 6 (Chromium 76) inspector ignores awaitPromise, so park the result on window and poll.
  const slot = `__kpvCdp${Date.now()}`;
  const start = await send("Runtime.evaluate", {
    expression:
      `window.${slot}=null;Promise.resolve().then(function(){return (${arg});})` +
      `.then(function(v){window.${slot}={ok:v}},function(e){window.${slot}={err:String(e&&e.message||e)}});0`,
    returnByValue: true,
  });
  if (start.exceptionDetails) {
    console.error("Exception:", start.exceptionDetails.exception?.description || start.exceptionDetails.text);
    process.exitCode = 1;
    ws.close();
  } else {
    const deadline = Date.now() + (Number(process.env.TV_CDP_TIMEOUT_MS) || 120000);
    let out = null;
    while (Date.now() < deadline) {
      const r = await send("Runtime.evaluate", { expression: `JSON.stringify(window.${slot})`, returnByValue: true });
      if (r.result.value && r.result.value !== "null") {
        out = JSON.parse(r.result.value);
        break;
      }
      await new Promise((res) => setTimeout(res, 300));
    }
    if (!out) {
      console.error("Timed out waiting for result");
      process.exitCode = 2;
    } else if (out.err !== undefined) {
      console.error("Rejected:", out.err);
      process.exitCode = 1;
    } else {
      const v = out.ok;
      console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));
    }
    ws.close();
  }
} else if (cmd === "reload") {
  await send("Page.reload", { ignoreCache: true });
  ws.close();
} else {
  await send("Runtime.enable");
  await send("Log.enable").catch(() => {});
  const secs = Number(arg) || 60;
  console.log(`Streaming console for ${secs}s...`);
  setTimeout(() => ws.close(), secs * 1000);
}
