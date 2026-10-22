/* global Site, StreamResolve, Companion, PlaybackCache */
/**
 * TV playback: watch.html → direct .m3u8 → AVPlay → hls-shell (sky-iptv / TVapp style).
 */
const Player = (() => {
  function isHlsUrl(url) {
    return Boolean(url && /\.m3u8(\?|$)/i.test(url));
  }

  function pickSourceUrl(src) {
    const url = Site.toAbsoluteUrl(src.data || src.url || "");
    if (!url.startsWith("http")) return null;
    const type = String(src.type || "").toLowerCase();
    if (type.includes("iframe") || type.includes("embed")) {
      return { kind: "embed", url };
    }
    if (isHlsUrl(url) || type.includes("hls") || type.includes("mpegurl")) {
      return { kind: "hls", url };
    }
    return { kind: "embed", url };
  }

  async function resolvePlayTarget(channel) {
    if (channel.hlsUrl && channel.hlsUrl.startsWith("http")) {
      const embed =
        (channel.iframe && channel.iframe.startsWith("http") && channel.iframe) ||
        Site.embedFallback(channel.uri);
      if (embed) Site.noteEmbedFromUrl(embed);
      return { mode: "hls", url: embed || channel.hlsUrl, hlsUrl: channel.hlsUrl };
    }
    if (channel.iframe && channel.iframe.startsWith("http")) {
      Site.noteEmbedFromUrl(channel.iframe);
      if (isHlsUrl(channel.iframe)) {
        return { mode: "hls", url: channel.iframe, hlsUrl: channel.iframe };
      }
      return { mode: "embed", url: channel.iframe, hlsUrl: "" };
    }

    for (const api of Site.apiCandidates()) {
      try {
        const data = await Site.fetchJson(Site.streamUrl(channel.uri, api));
        const payload = data.data || {};
        const sources = payload.sources || [];
        let embedPick = null;
        let hlsPick = null;
        let defaultPick = null;

        for (const src of sources) {
          const raw = Site.toAbsoluteUrl(src.data || src.url || "");
          if (raw.startsWith("http") && isHlsUrl(raw) && !hlsPick) hlsPick = raw;
          const picked = pickSourceUrl(src);
          if (!picked) continue;
          if (picked.kind === "embed" && !embedPick) embedPick = picked.url;
          if (picked.kind === "hls" && !hlsPick) hlsPick = picked.url;
          if (src.default && !defaultPick) defaultPick = picked;
        }

        Site.rememberApi(api);

        const topM3u8 = (payload.m3u8 || "").trim();
        const apiHls =
          hlsPick || (topM3u8.startsWith("http") && isHlsUrl(topM3u8) ? topM3u8 : null);
        const apiEmbed =
          (defaultPick && defaultPick.kind === "embed" ? defaultPick.url : null) ||
          embedPick ||
          (defaultPick ? defaultPick.url : null);

        if (apiEmbed) Site.noteEmbedFromUrl(apiEmbed);
        if (apiHls) Site.noteEmbedFromUrl(apiHls);

        return {
          mode: apiHls ? "hls" : "embed",
          url: apiEmbed || apiHls || Site.embedFallback(channel.uri),
          hlsUrl: apiHls || "",
        };

      } catch (_) {
        /* try next */
      }
    }

    return {
      mode: "embed",
      url: Site.embedFallback(channel.uri),
      hlsUrl: "",
    };
  }

  function openWatchPage(channel, target) {
    const pack = {
      u: target.url,
      hls: target.hlsUrl || "",
      uri: channel.uri || "",
      t: channel.title || "Stream",
      mode: target.mode,
    };
    try {
      sessionStorage.setItem("kpv_watch", JSON.stringify(pack));
    } catch (_) {
      /* ignore */
    }
    const q = new URLSearchParams();
    q.set("u", pack.u);
    q.set("t", pack.t);
    q.set("mode", pack.mode);
    if (pack.uri) q.set("uri", pack.uri);
    if (pack.hls) q.set("hls", pack.hls);
    window.location.href = `watch.html?${q.toString()}`;
  }

  async function play(channel) {
    stepStatus(`Loading ${channel.title}…`);

    if (typeof PlaybackCache !== "undefined" && channel.uri) {
      const cached = PlaybackCache.get(channel.uri);
      if (cached && cached.hls) {
        openWatchPage(channel, {
          mode: "hls",
          url:
            (cached.embed && cached.embed.startsWith("http") && cached.embed) ||
            (channel.iframe && channel.iframe.startsWith("http") && channel.iframe) ||
            Site.embedFallback(channel.uri),
          hlsUrl: cached.hls,
        });
        return;
      }
    }

    if (
      typeof StreamResolve !== "undefined" &&
      StreamResolve.companionReady() &&
      channel.uri
    ) {
      const embed =
        (channel.iframe && channel.iframe.startsWith("http") && channel.iframe) ||
        "";
      StreamResolve.prepareOnPhone(channel.uri, embed);
    }
    const target = await resolvePlayTarget(channel);
    openWatchPage(channel, target);
  }

  function stepStatus(msg) {
    const el = document.getElementById("player-loading");
    const text =
      document.getElementById("loading-text") ||
      document.querySelector(".player-loading-text");
    if (text) text.textContent = msg;
    if (el) el.classList.remove("hidden");
  }

  function hideScreen() {
    window.location.href = "index.html";
  }

  return { play, hideScreen, stop: hideScreen };
})();
