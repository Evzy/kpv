/* global AvplayPlay, Site, StreamResolve, TizenPlay, TvKeys, PlaybackCache, Companion */
(function watchPage() {
  function isBackKey(e) {
    if (typeof TvKeys !== "undefined" && TvKeys.isBack(e)) return true;
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
  const APP_VER = "1.0.31";

  function readPayload() {
    const params = new URLSearchParams(window.location.search);
    let stored = {};
    try {
      stored = JSON.parse(sessionStorage.getItem("kpv_watch") || "{}");
    } catch (_) {
      stored = {};
    }
    return {
      embedUrl: (params.get("u") || stored.u || "").trim(),
      hlsUrl: (params.get("hls") || stored.hls || "").trim(),
      uri: (params.get("uri") || stored.uri || "").trim(),
      title: (params.get("t") || stored.t || "Stream").trim(),
      mode: (params.get("mode") || stored.mode || "").trim(),
    };
  }

  const payload = readPayload();
  const loading = document.getElementById("player-loading");
  const loadingText = document.getElementById("loading-text");
  const status = document.getElementById("player-status");
  const hudLog = document.getElementById("watch-hud-log");

  let paused = false;
  let recovering = false;
  /** @type {object|null} */
  let lastResolved = null;

  function step(msg) {
    if (loadingText) loadingText.textContent = msg;
    if (status) {
      status.textContent = msg;
      status.style.display = msg ? "block" : "none";
    }
    if (hudLog) hudLog.textContent = msg;
    if (loading) loading.classList.remove("hidden");
  }

  /** Stop AVPlay and restore opaque UI so Back/OK reach the page (Samsung eats keys over the player). */
  function releasePlaybackForInput() {
    AvplayPlay.stop();
    paused = false;
    if (loading) loading.classList.remove("hidden");
    try {
      document.body.focus();
    } catch (_) {
      /* ignore */
    }
  }

  function showIdleMessage(msg) {
    releasePlaybackForInput();
    step(msg);
  }

  function hideLoading() {
    if (loading) loading.classList.add("hidden");
  }

  function clearPlaybackHud() {
    hideLoading();
    if (loadingText) loadingText.textContent = "";
    if (status) {
      status.textContent = "";
      status.style.display = "none";
    }
    if (hudLog) hudLog.textContent = "";
  }

  function exitWatch() {
    AvplayPlay.stop();
    window.location.href = "index.html";
  }

  function onWatchKeyDown(e) {
    if (isBackKey(e)) {
      e.preventDefault();
      e.stopPropagation();
      exitWatch();
      return;
    }
    if (typeof TvKeys === "undefined" || !TvKeys.isPlayPause(e)) return;
    if (!AvplayPlay.isActive() && !paused) {
      if (/retry|Stream lost|failed/i.test(loadingText ? loadingText.textContent : "")) {
        e.preventDefault();
        e.stopPropagation();
        restartFromNetwork(false);
      }
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (!paused) {
      if (TizenPlay.pauseAvplay()) {
        paused = true;
        step("Paused — press Play/OK again to restart stream");
      }
      return;
    }
    paused = false;
    step("Restarting stream…");
    if (AvplayPlay.restart()) {
      clearPlaybackHud();
    } else {
      restartFromNetwork(false);
    }
  }

  document.addEventListener("keydown", onWatchKeyDown, true);
  window.addEventListener("keydown", onWatchKeyDown, true);
  document.addEventListener("tizenhwkey", (e) => {
    if (e && e.keyName === "back") {
      e.preventDefault();
      exitWatch();
    }
  });

  try {
    if (typeof tizen !== "undefined" && tizen.tvinputdevice) {
      ["Back", "Return", "MediaPlayPause", "MediaPlay", "MediaPause", "Play", "Pause"].forEach((key) => {
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

  function openEmbedSniffer(embedUrl) {
    step("Experimental: resolving from embed…");
    const q = new URLSearchParams();
    q.set("embed", embedUrl);
    q.set("t", payload.title);
    if (payload.uri) q.set("uri", payload.uri);
    window.location.replace(`sniff.html?${q.toString()}`);
  }

  function noStreamMessage(resolved) {
    const lines = [
      "No direct HLS URL for this channel.",
      "",
      "Tizen playback needs a .m3u8 (site API, paired phone companion, or test stream).",
    ];
    if (typeof Companion !== "undefined" && Companion.isModeOn() && !Companion.isActive()) {
      lines.push("", "Companion is on but TV is not paired — enter PIN from the phone in Settings.");
    } else if (Companion.isActive() && !resolved.usedResolver) {
      lines.push("", "Phone companion did not return a playlist.");
      if (resolved.companionNote) {
        lines.push(resolved.companionNote);
      } else {
        lines.push("Keep KPV on the channel list on the phone (up to ~45s), then try again.");
      }
    } else if (!Companion.isModeOn()) {
      lines.push("", "Settings → enable Phone companion and pair with the PIN shown on Android KPV.");
    }
    if (!StreamResolve.embedSniffEnabled()) {
      lines.push("", "Advanced: localStorage kpv_use_embed_sniff=1 enables embed sniff.");
    }
    lines.push("", "Press Back.");
    return lines.join("\n");
  }

  async function startAvplay(resolved) {
    lastResolved = resolved;
    paused = false;
    const result = await TizenPlay.playHls({
      url: resolved.hls,
      referer: resolved.referer,
      embed: resolved.embed,
      title: payload.title,
      onStep: step,
      onPlaying: clearPlaybackHud,
      onPlaybackIssue: () => {
        handleStreamFailure(true);
      },
    });
    if (result.engine === "avplay") {
      clearPlaybackHud();
      document.body.focus();
    }
    return result;
  }

  async function resolveAndPlay(forcePhone) {
    if (forcePhone && payload.uri) {
      PlaybackCache.clear(payload.uri);
    }

    if (forcePhone && typeof Companion !== "undefined" && Companion.isActive() && payload.uri) {
      step("Requesting fresh playlist from phone…");
    } else if (payload.uri && PlaybackCache.get(payload.uri)) {
      step(`Loading ${payload.title} (cached)…`);
    } else {
      step(`KPV ${APP_VER} — ${payload.title}`);
    }

    Site.load();

    if (!forcePhone && typeof Companion !== "undefined" && Companion.isActive() && payload.uri) {
      const cached = PlaybackCache.get(payload.uri);
      if (!cached) {
        step("Asking phone for playlist… (can take up to 45 seconds)");
      }
    }

    const resolved = await StreamResolve.resolveForWatch(
      {
        uri: payload.uri,
        hlsUrl: forcePhone ? "" : payload.hlsUrl,
        embedUrl: payload.embedUrl,
      },
      { forcePhone },
    );

    if (!resolved.hls.startsWith("http")) {
      if (resolved.embed.startsWith("http") && StreamResolve.embedSniffEnabled()) {
        openEmbedSniffer(resolved.embed);
        return;
      }
      showIdleMessage(noStreamMessage(resolved));
      return;
    }

    try {
      await startAvplay(resolved);
    } catch (e) {
      const canPhone =
        typeof Companion !== "undefined" && Companion.isActive() && payload.uri;
      if (!forcePhone && resolved.fromCache && canPhone) {
        PlaybackCache.clear(payload.uri);
        await resolveAndPlay(true);
        return;
      }
      showIdleMessage(`${e.message}\nPress Play/OK to retry · Back for channels.`);
    }
  }

  async function handleStreamFailure(fromAvplay) {
    if (recovering) return;
    recovering = true;
    paused = false;
    AvplayPlay.stop();

    const canPhone =
      typeof Companion !== "undefined" && Companion.isActive() && payload.uri;

    if (canPhone) {
      if (payload.uri) PlaybackCache.clear(payload.uri);
      step("Stream lost — asking phone for a new link…");
      try {
        await resolveAndPlay(true);
      } catch (e) {
        showIdleMessage(`${e.message}\nPress Play/OK to retry · Back for channels.`);
      }
      recovering = false;
      return;
    }

    if (fromAvplay && lastResolved && lastResolved.hls) {
      step("Stream lost — retrying…");
      try {
        await startAvplay(lastResolved);
        recovering = false;
        return;
      } catch (_) {
        /* fall through */
      }
    }

    showIdleMessage("Stream lost.\nPress Play/OK to retry · Back for channels.");
    recovering = false;
  }

  async function restartFromNetwork(forcePhone) {
    if (recovering) return;
    await resolveAndPlay(Boolean(forcePhone));
  }

  async function run() {
    await resolveAndPlay(false);
  }

  run().catch((e) => showIdleMessage(`${e.message}\nPress Back.`));
})();
