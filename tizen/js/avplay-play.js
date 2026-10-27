/* global webapis, document */
/**
 * AVPlay — create the avplayer object only while playing (avoids black plane over iframe).
 */
const AvplayPlay = (() => {
  const TV_UA =
    "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/4.0 Chrome/108.0.5359.1 TV Safari/537.36";

  let avObject = null;
  /** @type {object|null} */
  let activeOpts = null;
  let playing = false;

  function hasAvplay() {
    return typeof webapis !== "undefined" && webapis.avplay;
  }

  function av() {
    return webapis.avplay;
  }

  function isActive() {
    return playing && hasAvplay();
  }

  function mountObject() {
    removeObject();
    avObject = document.createElement("object");
    avObject.type = "application/avplayer";
    avObject.className = "watch-av";
    avObject.style.left = "0";
    avObject.style.top = "0";
    avObject.style.width = "1920px";
    avObject.style.height = "1080px";
    document.body.appendChild(avObject);
  }

  function removeObject() {
    if (avObject && avObject.parentNode) {
      avObject.parentNode.removeChild(avObject);
    }
    avObject = null;
  }

  function close() {
    playing = false;
    if (hasAvplay()) {
      try {
        av().stop();
        av().close();
      } catch (_) {
        /* ignore */
      }
    }
    removeObject();
  }

  function notifyIssue(err) {
    if (activeOpts && activeOpts.onPlaybackIssue) {
      activeOpts.onPlaybackIssue(String(err || "playback error"));
    }
  }

  function play(opts) {
    const url = opts.url;
    if (!hasAvplay()) {
      opts.onError && opts.onError("AVPlay not available");
      return;
    }

    activeOpts = opts;
    playing = false;
    close();
    mountObject();
    document.documentElement.classList.add("avplay-active");
    document.body.classList.add("avplay-active");

    let settled = false;
    const guard = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      playing = false;
      opts.onError && opts.onError("prepare timeout");
    }, 12_000);

    function finish(err) {
      if (settled) return;
      settled = true;
      window.clearTimeout(guard);
      if (err) opts.onError && opts.onError(String(err));
    }

    function issue(err) {
      window.clearTimeout(guard);
      playing = false;
      notifyIssue(err);
    }

    try {
      av().open(url);
      av().setDisplayRect(0, 0, 1920, 1080);
      try {
        av().setBufferingParam("PLAYER_BUFFER_FOR_PLAY", "PLAYER_BUFFER_SIZE_IN_SECOND", 3);
        av().setBufferingParam("PLAYER_BUFFER_FOR_RESUME", "PLAYER_BUFFER_SIZE_IN_SECOND", 8);
      } catch (_) {
        /* optional */
      }
      try {
        av().setStreamingProperty("USER_AGENT", TV_UA);
      } catch (_) {
        /* optional */
      }
      if (opts.referer) {
        const ref = String(opts.referer);
        try {
          av().setStreamingProperty("COOKIE", `Referer=${ref}`);
        } catch (_) {
          /* optional */
        }
        try {
          av().setStreamingProperty("CUSTOM_MESSAGE", `Referer: ${ref}`);
        } catch (_) {
          /* optional */
        }
      }
      if (opts.live !== false && /\.m3u8(\?|$)/i.test(url)) {
        try {
          av().setStreamingProperty("IS_LIVE", "TRUE");
        } catch (_) {
          /* optional */
        }
        try {
          av().setStreamingProperty("ADAPTIVE_INFO", "BITRATES=|STARTBITRATE=LOWEST");
        } catch (_) {
          /* optional */
        }
      }

      av().setListener({
        onbufferingstart() {
          opts.onBuffering && opts.onBuffering();
        },
        onbufferingcomplete() {
          opts.onPlaying && opts.onPlaying();
        },
        oncurrentplaytime(ms) {
          opts.onTime && opts.onTime(ms);
          if (ms > 0) {
            playing = true;
            settled = true;
            window.clearTimeout(guard);
            opts.onPlaying && opts.onPlaying();
          }
        },
        onstreamcompleted() {
          if (playing) issue("stream ended");
          else finish("stream ended");
        },
        onerror(err) {
          if (playing) issue(err);
          else finish(err);
        },
      });

      av().prepareAsync(
        () => {
          try {
            av().setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");
          } catch (_) {
            /* optional */
          }
          try {
            av().play();
          } catch (e) {
            finish(e);
          }
        },
        (e) => {
          finish(e);
        },
      );
    } catch (e) {
      finish(e);
    }
  }

  function pause() {
    if (!hasAvplay() || !playing) return false;
    try {
      av().pause();
      return true;
    } catch (_) {
      return false;
    }
  }

  function restart() {
    if (!activeOpts || !activeOpts.url) return false;
    play(activeOpts);
    return true;
  }

  function stop() {
    document.documentElement.classList.remove("avplay-active");
    document.body.classList.remove("avplay-active");
    activeOpts = null;
    close();
  }

  return { hasAvplay, play, pause, restart, stop, close, isActive };
})();
