/* global AvplayPlay, Site, StreamResolve, TizenPlay, TvKeys, PlaybackCache, StreamSources, WatchControls, ChatOverlay */
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
      id: Number(stored.id) || 0,
      sources: Array.isArray(stored.sources) ? stored.sources.filter((s) => s && s.uri) : [],
      si: Number(stored.si) || 0,
    };
  }

  const payload = readPayload();
  const loading = document.getElementById("player-loading");
  const loadingText = document.getElementById("loading-text");
  const sources = payload.sources.length > 1 ? payload.sources : [];
  const LOST = "Stream lost.\nPress Play/OK to retry · Back for channels.";

  let paused = false;
  let recovering = false;
  let switching = false;
  let idle = false;
  let si = payload.si < sources.length ? payload.si : 0;
  /** Source indexes that failed since the last one played. */
  let failed = new Set([si]);
  /** @type {object|null} */
  let lastResolved = null;
  let chat = null;
  let controls = null;

  function sourceLabel(i) {
    return sources[i] ? sources[i].label : "Source";
  }

  function toast(msg) {
    if (controls) controls.toast(msg);
  }

  function step(msg) {
    if (loadingText) loadingText.textContent = msg;
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
    idle = true;
    setPausedUi(false);
    step(msg);
  }

  function hideLoading() {
    if (loading) loading.classList.add("hidden");
  }

  function clearPlaybackHud() {
    hideLoading();
    if (loadingText) loadingText.textContent = "";
  }

  function exitWatch() {
    if (chat) chat.stop();
    AvplayPlay.stop();
    window.location.href = "index.html";
  }

  function setPausedUi(on) {
    if (!controls) {
      if (on) step("Paused — press Play to resume");
      return;
    }
    controls.setLabel("pause", on ? "Play" : "Pause");
    controls.setSticky(on);
    if (on) controls.show();
  }

  function togglePause() {
    if (idle) {
      failed = new Set([si]);
      restartFromNetwork(false);
      return;
    }
    if (!paused) {
      if (TizenPlay.pauseAvplay()) {
        paused = true;
        setPausedUi(true);
      }
      return;
    }
    paused = false;
    setPausedUi(false);
    if (!controls) hideLoading();
    if (AvplayPlay.resume()) return;
    step("Restarting stream…");
    if (AvplayPlay.restart()) {
      clearPlaybackHud();
    } else {
      restartFromNetwork(false);
    }
  }

  function openSourcePicker() {
    controls.choose(
      "Sources",
      sources.map((s) => s.label),
      si,
      (i) => {
        if (i !== si || idle) switchSource(i, new Set([si]), idle);
      },
    );
  }

  function toggleChat() {
    const shown = chat.toggle();
    controls.setLabel("chat", shown ? "Hide chat" : "Chat");
  }

  function setupControls() {
    if (typeof WatchControls === "undefined") return;
    const buttons = [
      { id: "pause", label: "Pause", onSelect: togglePause },
      { id: "stop", label: "Stop", onSelect: exitWatch },
    ];
    if (sources.length > 1) buttons.push({ id: "sources", label: "Sources", onSelect: openSourcePicker });
    if (payload.id && typeof ChatOverlay !== "undefined") {
      chat = ChatOverlay.create(payload.id);
      buttons.push({ id: "chat", label: "Chat", onSelect: toggleChat });
    }
    controls = WatchControls.create(buttons);
  }

  function onWatchKeyDown(e) {
    if (isBackKey(e)) {
      e.preventDefault();
      e.stopPropagation();
      if (controls && controls.closePicker()) return;
      exitWatch();
      return;
    }
    if (typeof TvKeys !== "undefined" && TvKeys.isPlayPause(e)) {
      e.preventDefault();
      e.stopPropagation();
      togglePause();
      return;
    }
    if (controls && controls.handleKey(e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  setupControls();

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

  function canReresolve() {
    if (!payload.uri) return false;
    return StreamResolve.tvResolveAvailable(payload.embedUrl || Site.embedFallback(payload.uri));
  }

  function noStreamMessage(resolved) {
    const lines = [
      "No direct HLS URL for this channel.",
      "",
      "The TV decoder could not get a playlist from the embed page.",
    ];
    if (resolved.tvNote) lines.push(resolved.tvNote);
    if (!StreamResolve.embedSniffEnabled()) {
      lines.push("", "Advanced: localStorage kpv_use_embed_sniff=1 enables embed sniff.");
    }
    lines.push("", "Press Play/OK to retry · Back for channels.");
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
      failed = new Set([si]);
      clearPlaybackHud();
      document.body.focus();
    }
    return result;
  }

  function persistSource() {
    try {
      const stored = JSON.parse(sessionStorage.getItem("kpv_watch") || "{}");
      stored.u = payload.embedUrl;
      stored.hls = payload.hlsUrl;
      stored.uri = payload.uri;
      stored.si = si;
      sessionStorage.setItem("kpv_watch", JSON.stringify(stored));
    } catch (_) {
      /* ignore */
    }
  }

  /** Resolves source `i` and starts it in AVPlay; rejects without opening the Hls.js page. */
  async function loadSource(i, fresh) {
    const s = sources[i];
    const resolved = await StreamResolve.resolveForWatch(
      { uri: s.uri, hlsUrl: "", embedUrl: s.iframe || "" },
      { skipCache: fresh, onStep() {} },
    );
    if (!resolved.hls.startsWith("http")) throw new Error("no stream");
    try {
      await TizenPlay.tryAvplay(
        resolved.hls,
        { referer: resolved.referer, embed: resolved.embed, title: payload.title },
        { onPlaying: clearPlaybackHud, onPlaybackIssue: () => handleStreamFailure(true) },
      );
    } catch (e) {
      if (resolved.fromCache && !fresh) {
        PlaybackCache.clear(s.uri);
        return loadSource(i, true);
      }
      throw e;
    }
    return resolved;
  }

  function adoptSource(i, resolved) {
    const s = sources[i];
    si = i;
    failed = new Set([i]);
    lastResolved = resolved;
    idle = false;
    paused = false;
    setPausedUi(false);
    payload.uri = s.uri;
    payload.embedUrl = s.iframe || "";
    payload.hlsUrl = resolved.hls;
    persistSource();
    clearPlaybackHud();
    document.body.focus();
  }

  /**
   * Tries source `index`, then any untried others. While a manual pick resolves the current
   * source keeps playing; if nothing loads it is restored.
   */
  async function switchSource(index, tried, afterError, firstMsg) {
    if (switching) return;
    switching = true;
    const restore = afterError ? null : lastResolved;
    let i = index;
    let msg = firstMsg || `Switching to ${sourceLabel(i)}…`;
    while (i !== null) {
      tried.add(i);
      toast(msg);
      if (afterError) step(msg);
      try {
        const resolved = await loadSource(i, false);
        adoptSource(i, resolved);
        switching = false;
        toast(`Playing ${sourceLabel(i)}`);
        return;
      } catch (_) {
        const next = StreamSources.next(sources.length, i, tried);
        if (next !== null) msg = `${sourceLabel(i)} didn't load, trying ${sourceLabel(next)}`;
        i = next;
      }
    }
    switching = false;
    if (restore) {
      toast("No other source loaded");
      if (AvplayPlay.isActive()) return;
      try {
        await startAvplay(restore);
      } catch (e) {
        showIdleMessage(LOST);
      }
      return;
    }
    toast("Stream lost");
    showIdleMessage(LOST);
  }

  /** Moves on to the next untried source; false when there is none. */
  async function failOver() {
    if (!sources.length) return false;
    const next = StreamSources.next(sources.length, si, failed);
    if (next === null) return false;
    await switchSource(next, failed, true, `${sourceLabel(si)} didn't load, trying ${sourceLabel(next)}`);
    return true;
  }

  async function resolveAndPlay(fresh) {
    idle = false;
    if (fresh && payload.uri) {
      PlaybackCache.clear(payload.uri);
      step("Getting a fresh link…");
    } else if (payload.uri && PlaybackCache.get(payload.uri)) {
      step(`Loading ${payload.title} (cached)…`);
    } else {
      step(`KPV ${APP_VER} — ${payload.title}`);
    }

    Site.load();

    const resolved = await StreamResolve.resolveForWatch(
      {
        uri: payload.uri,
        hlsUrl: fresh ? "" : payload.hlsUrl,
        embedUrl: payload.embedUrl,
      },
      { skipCache: fresh, onStep: step },
    );

    if (!resolved.hls.startsWith("http")) {
      if (resolved.embed.startsWith("http") && StreamResolve.embedSniffEnabled()) {
        openEmbedSniffer(resolved.embed);
        return;
      }
      if (await failOver()) return;
      showIdleMessage(noStreamMessage(resolved));
      return;
    }

    try {
      await startAvplay(resolved);
    } catch (e) {
      if (!fresh && resolved.fromCache && canReresolve()) {
        PlaybackCache.clear(payload.uri);
        await resolveAndPlay(true);
        return;
      }
      if (await failOver()) return;
      showIdleMessage(`${e.message}\nPress Play/OK to retry · Back for channels.`);
    }
  }

  async function handleStreamFailure(fromAvplay) {
    if (recovering || switching) return;
    recovering = true;
    paused = false;
    setPausedUi(false);
    AvplayPlay.stop();

    if (sources.length) {
      step("Stream lost — getting a new link…");
      try {
        adoptSource(si, await loadSource(si, true));
        recovering = false;
        return;
      } catch (_) {
        /* fall through to the next source */
      }
      recovering = false;
      if (!(await failOver())) showIdleMessage(LOST);
      return;
    }

    if (canReresolve()) {
      PlaybackCache.clear(payload.uri);
      step("Stream lost — getting a new link…");
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

    showIdleMessage(LOST);
    recovering = false;
  }

  async function restartFromNetwork(fresh) {
    if (recovering) return;
    await resolveAndPlay(Boolean(fresh));
  }

  async function run() {
    await resolveAndPlay(false);
  }

  run().catch((e) => showIdleMessage(`${e.message}\nPress Back.`));
})();
