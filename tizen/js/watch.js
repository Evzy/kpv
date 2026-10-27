/* global Site, StreamResolve, TizenPlay, TvKeys, PlaybackCache, StreamSources, WatchControls */
/** Resolves the chosen source to an HLS URL, then hands playback to hls-shell.html. */
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

  function readStored() {
    try {
      return JSON.parse(sessionStorage.getItem("kpv_watch") || "{}");
    } catch (_) {
      return {};
    }
  }

  function readPayload() {
    const params = new URLSearchParams(window.location.search);
    const stored = readStored();
    return {
      embedUrl: (params.get("u") || stored.u || "").trim(),
      hlsUrl: (params.get("hls") || stored.hls || "").trim(),
      uri: (params.get("uri") || stored.uri || "").trim(),
      title: (params.get("t") || stored.t || "Stream").trim(),
      sources: Array.isArray(stored.sources) ? stored.sources.filter((s) => s && s.uri) : [],
      si: Number(stored.si) || 0,
      tried: Array.isArray(stored.tried) ? stored.tried : [],
      fresh: stored.fresh === true,
    };
  }

  const payload = readPayload();
  const loading = document.getElementById("player-loading");
  const loadingText = document.getElementById("loading-text");
  const sources = payload.sources.length > 1 ? payload.sources : [];
  const RETRY = "Press OK to retry · Back for channels.";

  let si = payload.si < sources.length ? payload.si : 0;
  /** Source indexes that failed since the last one played (shared with hls-shell). */
  let failed = new Set(payload.tried.concat([si]));
  let busy = false;
  let idle = false;
  let controls = null;

  function sourceLabel(i) {
    return sources[i] ? sources[i].label : "Source";
  }

  function step(msg) {
    if (loadingText) loadingText.textContent = msg;
    if (loading) loading.classList.remove("hidden");
  }

  function showIdleMessage(msg) {
    idle = true;
    step(msg);
  }

  function exitWatch() {
    window.location.href = "index.html";
  }

  function persist(extra) {
    const stored = readStored();
    stored.u = payload.embedUrl;
    stored.hls = payload.hlsUrl;
    stored.uri = payload.uri;
    stored.si = si;
    stored.tried = [...failed];
    Object.assign(stored, extra);
    try {
      sessionStorage.setItem("kpv_watch", JSON.stringify(stored));
    } catch (_) {
      /* ignore */
    }
  }

  function useSource(i) {
    const s = sources[i];
    si = i;
    failed.add(i);
    payload.uri = s.uri;
    payload.embedUrl = s.iframe || "";
    payload.hlsUrl = "";
  }

  function openSourcePicker() {
    controls.choose(
      "Sources",
      sources.map((s) => s.label),
      si,
      (i) => {
        if (busy) return;
        failed = new Set();
        useSource(i);
        resolveAndPlay(false);
      },
    );
  }

  function setupControls() {
    if (typeof WatchControls === "undefined") return;
    const buttons = [{ id: "stop", label: "Stop", onSelect: exitWatch }];
    if (sources.length > 1) buttons.push({ id: "sources", label: "Sources", onSelect: openSourcePicker });
    controls = WatchControls.create(buttons);
  }

  function retry() {
    failed = new Set([si]);
    resolveAndPlay(false);
  }

  function onWatchKeyDown(e) {
    if (isBackKey(e)) {
      e.preventDefault();
      e.stopPropagation();
      if (controls && controls.closePicker()) return;
      exitWatch();
      return;
    }
    const playKey = typeof TvKeys !== "undefined" && TvKeys.isPlayPause(e);
    const select = typeof TvKeys !== "undefined" ? TvKeys.isSelect(e) : e.keyCode === 13;
    if (idle && (playKey || (select && !(controls && controls.isVisible())))) {
      e.preventDefault();
      e.stopPropagation();
      retry();
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
    lines.push("", RETRY);
    return lines.join("\n");
  }

  async function resolveOnce(fresh) {
    if (fresh && payload.uri) PlaybackCache.clear(payload.uri);
    return StreamResolve.resolveForWatch(
      { uri: payload.uri, hlsUrl: fresh ? "" : payload.hlsUrl, embedUrl: payload.embedUrl },
      { skipCache: fresh, onStep: step },
    );
  }

  /** Resolves the current source, moving through untried sources until one gives an HLS URL. */
  async function resolveAndPlay(fresh) {
    if (busy) return;
    busy = true;
    idle = false;
    Site.load();
    let msg = fresh
      ? "Getting a fresh link…"
      : payload.uri && PlaybackCache.get(payload.uri)
        ? `Loading ${payload.title} (cached)…`
        : `KPV ${APP_VER} — ${payload.title}`;
    try {
      for (;;) {
        if (sources.length) msg += `\n${sourceLabel(si)}`;
        step(msg);
        const resolved = await resolveOnce(fresh);
        if (resolved.hls.startsWith("http")) {
          payload.hlsUrl = resolved.hls;
          persist({ fresh });
          TizenPlay.openHlsShell(resolved.hls, {
            referer: resolved.referer,
            embed: resolved.embed,
            title: payload.title,
          });
          return;
        }
        const next = sources.length ? StreamSources.next(sources.length, si, failed) : null;
        if (next === null) {
          if (resolved.embed.startsWith("http") && StreamResolve.embedSniffEnabled()) {
            openEmbedSniffer(resolved.embed);
            return;
          }
          showIdleMessage(noStreamMessage(resolved));
          return;
        }
        msg = `${sourceLabel(si)} didn't load, trying ${sourceLabel(next)}`;
        if (controls) controls.toast(msg);
        useSource(next);
        fresh = false;
      }
    } catch (e) {
      showIdleMessage(`${e.message}\n${RETRY}`);
    } finally {
      busy = false;
    }
  }

  resolveAndPlay(payload.fresh);
})();
