# Tizen player parity: controls, chat, sources, Live now

Date: 2026-10-27
Status: approved

Bring the Samsung (WGT) app up to the Android player: a working on-screen control bar, the
read-only live chat overlay, alternative stream sources with auto-fallback, and the hideable
Live now home row.

## Problem

`watch.html` only reacts to Back and the dedicated media Play/Pause keys. OK does nothing, there
is no on-screen control, and pause tears the stream down ("press again to restart"). The Hls.js
fallback page (`hls-shell.html`) only handles Back.

## Delivery constraint

`watch.html`, `hls-shell.html` and their scripts are not hot-updated (bootstrap skips the watch
entry), so the player changes reach TVs with the WGT install, not the web bundle. Every new file
is added to `build-flat.mjs`, `package-kpv-tizen.mjs` (`flatFiles`) and `build-web-bundle.mjs`
(`bundleFiles`); `test-package-files.mjs` enforces this.

## Control bar (`js/watch-controls.js`)

- OK or any arrow shows a bar over the video: Play/Pause, Stop, Sources (only with 2+ sources),
  Chat. Left/Right move, OK activates, auto-hide after 4 s; it stays up while paused.
- Back closes the sources list if open, otherwise returns to the channel list (as before). Stop
  does the same.
- Media Play/Pause keys toggle directly without showing the list.
- Pause uses `webapis.avplay.pause()`; resume tries `play()`, then falls back to a full restart.
- A small toast (`WatchControls.toast`) carries source messages without covering the video.
- `hls-shell.html` loads the same module: pause/resume on the `<video>`, Stop, Chat, and Sources
  (picking one returns to `watch.html` with that source index).

## Chat (`js/chat-overlay.js`)

- Same server as Android: `wss://ws.television.st/chat?channel=<stream id>` (`&reconnect=true` on
  reconnect after 5 s), sends `{"session_id":""}` on open.
- Parsing mirrors `ChatMessageParser`: prefill arrays keep the last 5, private and empty messages
  are dropped, HTML is reduced to plain text, `color` must be a 6-digit hex.
- Bottom-right box, ~32% width, hidden on every stream open; the socket only runs while shown.
  Up to 5 lines, each fades after 8 s, paced 350 ms apart with a pending cap of 20.
- Chat button only when the stream id is known.

## Sources (`js/stream-sources.js`)

- `StreamSources.fromStream(s)`: main (`source_tag` or "Main") plus `substreams[]` (`source_tag`
  or "Source N"), skipping blank `uri_name`; empty when fewer than 2.
- `StreamSources.next(size, current, tried)`: the next untried index after `current`, wrapping.
- `catalog.js` adds `id` and `sources` to each channel; `player.js` passes them to the watch page
  through `sessionStorage` (`kpv_watch`: `id`, `sources`, `si`).
- Picking a source toasts "Switching to X…" and resolves that source's `uri`/`iframe` through
  `StreamResolve.resolveForWatch` while the current one keeps playing, then swaps AVPlay to it.
  On failure it moves on with "X didn't load, trying Y"; with nothing left a manual pick toasts
  "No other source loaded" and keeps the current source, a playback failure shows the existing
  "Stream lost" screen.
- Auto-fallback: when the current source cannot be recovered (fresh re-resolve gives no playlist
  or AVPlay fails), the next untried source is tried. The tried set resets once a source plays.

## Live now (`category-prefs.js`)

- `CategoryPrefs.withLiveNow(layout, prefs)`: unless `LIVE_NOW_KEY` (`"\u0000live-now"`) is
  hidden, prepends a "Live now" section with every live, non-24/7 channel from the visible
  layout, de-duplicated by `uri`. Games stay in their own categories too.
- `editorRows` starts with a `live_now` row (Hide/Show only) when there are sports.
- `app.js` renders the section like a single-league sport; fixture lines update both cards.

## Tests

Node tests wired into `test:tizen`: `test-stream-sources.mjs`, `test-chat-parse.mjs`, Live now
cases in `test-category-prefs.mjs`. The real TV is unreachable, so on-device checks wait for a
WGT install; layout can be checked in a desktop browser.
