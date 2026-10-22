/* global AvplayPlay, Site */
/**
 * Playback stack used by OSS Tizen IPTV apps: AVPlay first, then full-page Hls.js (hls-shell).
 */
const TizenPlay = (() => {
  const AVPLAY_MS = 12_000;

  function openHlsShell(hls, meta) {
    const q = new URLSearchParams();
    q.set("url", hls);
    q.set("t", meta.title || "Stream");
    if (meta.referer) q.set("ref", meta.referer);
    if (meta.embed && meta.embed.startsWith("http")) q.set("embed", meta.embed);
    window.location.replace(`hls-shell.html?${q.toString()}`);
  }

  function avplayOpts(hls, meta, hooks) {
    return {
      url: hls,
      live: true,
      referer: meta.referer || Site.siteOrigin(),
      onBuffering: hooks.onBuffering,
      onPlaying: hooks.onPlaying,
      onTime: hooks.onTime,
      onError: hooks.onError,
      onPlaybackIssue: hooks.onPlaybackIssue,
    };
  }

  function tryAvplay(hls, meta, hooks) {
    return new Promise((resolve, reject) => {
      hooks.onStep && hooks.onStep(`Trying AVPlay…\n${hls.slice(0, 72)}…`);
      if (!AvplayPlay.hasAvplay()) {
        reject(new Error("no AVPlay"));
        return;
      }
      let done = false;
      const timer = window.setTimeout(() => {
        if (done) return;
        done = true;
        AvplayPlay.stop();
        reject(new Error("AVPlay timeout"));
      }, AVPLAY_MS);

      AvplayPlay.play(
        avplayOpts(hls, meta, {
          onBuffering() {
            hooks.onStep && hooks.onStep("AVPlay buffering…");
          },
          onTime(ms) {
            if (done || ms < 800) return;
            done = true;
            window.clearTimeout(timer);
            hooks.onPlaying && hooks.onPlaying();
            resolve({ engine: "avplay" });
          },
          onError(err) {
            if (done) return;
            done = true;
            window.clearTimeout(timer);
            AvplayPlay.stop();
            reject(new Error(String(err)));
          },
          onPlaybackIssue: hooks.onPlaybackIssue,
        }),
      );
    });
  }

  /**
   * @param {{ url: string, referer?: string, embed?: string, title?: string, onStep?: (msg: string) => void, onPlaying?: () => void, onPlaybackIssue?: (msg: string) => void }} opts
   */
  async function playHls(opts) {
    const hls = (opts.url || "").trim();
    if (!hls.startsWith("http")) throw new Error("missing HLS URL");
    const meta = {
      referer: opts.referer || Site.siteOrigin(),
      embed: opts.embed || "",
      title: opts.title || "Stream",
    };
    const hooks = {
      onStep: opts.onStep,
      onPlaying: opts.onPlaying,
      onPlaybackIssue: opts.onPlaybackIssue,
    };

    try {
      return await tryAvplay(hls, meta, hooks);
    } catch (e) {
      opts.onStep && opts.onStep(`AVPlay failed (${e.message}). Opening Hls.js…`);
      openHlsShell(hls, meta);
      return { engine: "hls-shell" };
    }
  }

  function restartAvplay(hooks) {
    return AvplayPlay.restart();
  }

  return { playHls, tryAvplay, openHlsShell, restartAvplay, pauseAvplay: () => AvplayPlay.pause() };
})();
