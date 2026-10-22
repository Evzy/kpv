/* global EmbedEngine */
/**
 * PC browser harness — same embed engine as TV sniff.html. Open via npm run test:sniff
 */
(function testSniffHarness() {
  const DEFAULT_EMBED = "https://embed.example.com/embed/sample-channel";
  const logEl = document.getElementById("log");
  const statusEl = document.getElementById("status");
  const frame = document.getElementById("engine-frame");
  const input = document.getElementById("embed-url");
  const btn = document.getElementById("btn-run");
  const uaEl = document.getElementById("ua-hint");

  let runId = 0;
  let timer = null;
  let nudgeTimer = null;

  function log(msg) {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    if (logEl) {
      logEl.textContent = `${line}\n${logEl.textContent}`.slice(0, 12000);
    }
    if (statusEl) statusEl.textContent = msg;
  }

  window.kpvOnSniffed = function (url) {
    log(`SUCCESS parent.kpvOnSniffed: ${url}`);
    stopTimers();
    btn.disabled = false;
  };

  function stopTimers() {
    if (timer) window.clearTimeout(timer);
    if (nudgeTimer) window.clearInterval(nudgeTimer);
    timer = null;
    nudgeTimer = null;
  }

  function nudge() {
    let jw = "?";
    try {
      jw = frame.contentWindow && frame.contentWindow.jwplayer ? "yes" : "no";
    } catch (_) {
      jw = "blocked (cross-origin)";
    }
    log(`nudge jwplayer=${jw}`);
    if (jw !== "yes") return;
    try {
      const file = frame.contentWindow.jwplayer().getPlaylist()[0].file;
      if (file && /\.m3u8/i.test(file)) {
        log(`SUCCESS playlist: ${file}`);
        stopTimers();
        btn.disabled = false;
      }
    } catch (e) {
      log(`playlist read: ${e.message}`);
    }
  }

  async function run() {
    const embedUrl = (input.value || DEFAULT_EMBED).trim();
    const id = ++runId;
    stopTimers();
    btn.disabled = true;
    log(`Run #${id} embed=${embedUrl}`);

    if (uaEl) {
      uaEl.textContent =
        "Tip: DevTools → Network conditions → User agent → Samsung TV to mimic Tizen browser.";
    }

    try {
      log("Fetching embed HTML…");
      const { raw, html } = await EmbedEngine.fetchPreparedDocument(embedUrl, "https://example.com/");
      log(`Fetched ${raw.length} bytes → prepared ${html.length} bytes`);
      log(`Has bundle-jw: ${/bundle-jw/.test(html)} · hook: ${/kpvOnSniffed/.test(html)}`);
      const mode = EmbedEngine.mountInFrame(frame, html);
      log(`Mounted in iframe (${mode})`);
      frame.onload = () => {
        log("iframe load event");
        nudge();
      };
      nudgeTimer = window.setInterval(nudge, 1500);
      timer = window.setTimeout(() => {
        log("TIMEOUT (90s) — JW did not expose .m3u8. TV likely fails too for this embed.");
        btn.disabled = false;
        stopTimers();
      }, 90_000);
    } catch (e) {
      log(`FAIL fetch/prepare: ${e.message}`);
      btn.disabled = false;
    }
  }

  btn.addEventListener("click", run);
  input.value = DEFAULT_EMBED;
  log("Ready. Click Run test (uses same engine as KPV 1.0.17+ TV sniff).");
})();
