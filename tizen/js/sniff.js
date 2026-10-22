/* global AvplayPlay, Site, EmbedEngine */
(function sniffPage() {
  const APP_VER = "1.0.19";
  const SNIFF_MS = 90_000;
  const NUDGE_MS = 1_000;

  const params = new URLSearchParams(window.location.search);
  let stored = {};
  try {
    stored = JSON.parse(sessionStorage.getItem("kpv_watch") || "{}");
  } catch (_) {
    stored = {};
  }

  const embedUrl = (params.get("embed") || stored.u || "").trim();
  const title = (params.get("t") || stored.t || "Stream").trim();

  const hud = document.getElementById("sniff-text");
  const frame = document.getElementById("sniff-frame");

  function step(msg) {
    if (hud) hud.textContent = msg;
  }

  function exitCatalog() {
    AvplayPlay.stop();
    window.location.href = "index.html";
  }

  function isBackKey(e) {
    if (!e) return false;
    return (
      e.keyCode === 10009 ||
      e.keyCode === 461 ||
      e.keyCode === 27 ||
      e.key === "Back" ||
      e.key === "XF86Back" ||
      e.key === "Escape"
    );
  }

  function onBackKey(e) {
    if (!isBackKey(e)) return;
    e.preventDefault();
    e.stopPropagation();
    exitCatalog();
  }

  function onEnterKey(e) {
    if (e.keyCode !== 13 && e.key !== "Enter") return;
    e.preventDefault();
    nudgeFrame(true);
  }

  document.addEventListener("keydown", onBackKey, true);
  window.addEventListener("keydown", onBackKey, true);
  document.addEventListener("tizenhwkey", (e) => {
    if (e && e.keyName === "back") {
      e.preventDefault();
      exitCatalog();
    }
  });
  document.addEventListener("keydown", onEnterKey, true);

  try {
    if (typeof tizen !== "undefined" && tizen.tvinputdevice) {
      ["Back", "Return"].forEach((key) => {
        try {
          tizen.tvinputdevice.registerKey(key);
        } catch (_) {
          /* ignore */
        }
      });
    }
  } catch (_) {
    /* ignore */
  }

  let done = false;
  let nudgeTimer = null;
  let timeoutTimer = null;
  let nudgeCount = 0;

  window.kpvOnSniffed = function onSniffed(url) {
    if (done || !url || !/\.m3u8/i.test(url)) return;
    finish(null, String(url), embedUrl);
  };

  function finish(err, m3u8, referer) {
    if (done) return;
    done = true;
    if (nudgeTimer) window.clearInterval(nudgeTimer);
    if (timeoutTimer) window.clearTimeout(timeoutTimer);
    try {
      delete window.kpvOnSniffed;
    } catch (_) {
      window.kpvOnSniffed = undefined;
    }
    if (frame && frame._kpvBlobUrl) {
      try {
        URL.revokeObjectURL(frame._kpvBlobUrl);
      } catch (_) {
        /* ignore */
      }
    }
    if (frame) frame.remove();

    if (m3u8) {
      playAvplay(m3u8, referer || embedUrl);
      return;
    }
    step(
      (err || "Could not resolve stream from embed.") +
        "\n\nRun npm run test:sniff on a PC — if that fails, TV will too.\n" +
        "Use Android KPV or add .m3u8 in the stream API.\n\n" +
        "Press Back.",
    );
  }

  function playAvplay(url, referer) {
    step(`Starting AVPlay…\n${url.slice(0, 80)}…`);
    if (!AvplayPlay.hasAvplay()) {
      finish("AVPlay not available");
      return;
    }

    let started = false;
    const guard = window.setTimeout(() => {
      if (started) return;
      finish("AVPlay timeout — CDN may block TV or link expired.");
    }, 22_000);

    AvplayPlay.play({
      url,
      live: true,
      referer: referer || embedUrl || Site.siteOrigin(),
      onBuffering() {
        step("AVPlay buffering…");
      },
      onTime(ms) {
        if (started || ms < 600) return;
        started = true;
        window.clearTimeout(guard);
        if (hud) {
          hud.textContent = "";
          hud.classList.add("sniff-hud--minimal", "hidden");
        }
      },
      onError(e) {
        if (started) return;
        window.clearTimeout(guard);
        finish(`AVPlay error: ${e}`);
      },
    });
  }

  function nudgeFrame(fromUser) {
    if (done || !frame) return;
    nudgeCount += 1;
    let doc;
    try {
      doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
    } catch (_) {
      if (fromUser) step(`${title}\nEmbed not reachable yet.\n(KPV ${APP_VER})`);
      return;
    }
    if (!doc) return;

    if (fromUser || nudgeCount % 8 === 0) {
      let jw = "?";
      try {
        jw = frame.contentWindow && frame.contentWindow.jwplayer ? "yes" : "no";
      } catch (_) {
        jw = "block";
      }
      step(
        `${title}\nEmbed engine… jwplayer: ${jw}\n` +
          `(OK to nudge · KPV ${APP_VER})`,
      );
    }

    try {
      const win = frame.contentWindow;
      if (win && win.jwplayer) {
        try {
          const list = win.jwplayer().getPlaylist();
          const file = list && list[0] && list[0].file;
          if (file && /\.m3u8/i.test(file)) {
            finish(null, file, embedUrl);
            return;
          }
          const j = win.jwplayer();
          if (j.setMute) j.setMute(true);
          if (j.play) j.play();
        } catch (_) {
          /* not ready */
        }
      }
    } catch (_) {
      /* ignore */
    }

    try {
      doc.querySelectorAll("video").forEach((v) => {
        v.muted = true;
        try {
          const p = v.play();
          if (p && p.catch) p.catch(() => {});
        } catch (_) {
          /* ignore */
        }
      });
      const selectors = [
        ".jw-display-icon-container",
        ".jw-icon-display",
        ".vjs-big-play-button",
        '[aria-label="Play"]',
        ".play-button",
        "#play",
      ];
      for (const sel of selectors) {
        const el = doc.querySelector(sel);
        if (el) {
          el.click();
          break;
        }
      }
    } catch (_) {
      /* ignore */
    }
  }

  async function start() {
    Site.load();
    step(`KPV ${APP_VER} — ${title}\nFetching embed for TV…`);

    if (!embedUrl.startsWith("http")) {
      finish("No embed URL for this channel.");
      return;
    }

    frame.addEventListener("load", () => {
      nudgeFrame(false);
    });

    try {
      const { html } = await EmbedEngine.fetchPreparedDocument(
        embedUrl,
        Site.siteOrigin() ? `${Site.siteOrigin()}/` : embedUrl,
      );
      step(`${title}\nRunning embed engine (stay on this screen)…`);
      EmbedEngine.mountInFrame(frame, html);
    } catch (e) {
      finish(`Could not fetch embed page (${e.message}).`);
      return;
    }

    nudgeTimer = window.setInterval(() => nudgeFrame(false), NUDGE_MS);
    timeoutTimer = window.setTimeout(
      () =>
        finish(
          "JW Player did not start on this TV.\n" +
            "Test on PC: cd tizen && npm run test:sniff",
        ),
      SNIFF_MS,
    );
  }

  start();
})();
