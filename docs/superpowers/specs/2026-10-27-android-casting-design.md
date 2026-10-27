# Android casting: reliability and controls

## Goal

Casting from the Android app to a Chromecast / Google TV should play smoothly, and the phone should
control what is on the TV: a "now casting" bar, a full control screen, source switching and
auto-fallback. Chat on the TV is out of scope (it needs a custom Cast receiver).

## Baseline (2026-10-27, Galaxy A56 → TCL Google TV, live NBA stream)

The receiver (Default Media Receiver, Shaka) spent most of a 30 s sample in BUFFERING, with the
position jumping forward and once backwards. The relay served segments from memory instantly; the
problem is the live window it advertises:

- Upstream lists only the newest 4 segments (4 s each).
- The relay trims that to the segments it already downloaded, so the receiver usually sees 2–3
  segments (8–12 s). Shaka wants to sit about three target durations behind the live edge, so it
  keeps running dry and jumping; when the window shrinks the playhead falls off its start.

## 1. Relay live window

`CastHlsRelay.LiveWindow` (pure Kotlin, one per relay session) remembers segments it has advertised,
keyed by media sequence number, and keeps listing up to `WINDOW_SEGMENTS = 7` of them after
upstream drops them.

- Each upstream refresh: parse the media sequence and segments (with the tags before each URI).
  Append segments newer than the last one listed, in order, stopping at the first one not yet
  downloaded (the window must stay contiguous). Drop the oldest beyond 7.
- Output keeps the upstream header, rewrites `#EXT-X-MEDIA-SEQUENCE` to the first listed segment.
- If upstream's sequence goes backwards or jumps past our window (stream restarted), reset.
- Playlists with `#EXT-X-ENDLIST` (VOD) pass through unchanged.
- The segment cache grows from 6 to 12 so every listed segment plus upstream's newest are in memory
  (~55 MB worst case at 9 Mbps).
- The first playlist of a session waits (up to 10 s, as today) for the whole upstream window instead
  of 2 segments, so playback starts with a full buffer.

Success: on the same test, the receiver stays PLAYING with the position advancing steadily for
10 minutes, with no backwards jumps.

## 2. Idle shutdown and pause

The relay stops after 90 s without receiver requests. A paused receiver stops requesting, so the
watchdog must not stop the relay while the cast session reports PAUSED.

## 3. `CastPlayback`

An app-wide object owning what is on the TV: channel, sources, current index, relay token. Channel
taps in cast mode and the player's hand-over both call `CastPlayback.play(channel, sources, index)`.
It resolves on the phone (`StreamResolver`), registers the relay token and loads the receiver. It
outlives activities; the existing foreground service keeps the process alive.

## 4. Controls (Cast SDK UI)

- Mini controller (`MiniControllerFragment`) at the bottom of the home screen and the player while
  a session is connected: channel title, play/pause; tapping opens the expanded controller.
- Expanded controller (`ExpandedControllerActivity` subclass, set via `CastMediaOptions`): play /
  pause, stop casting, and a **Sources** button (only with 2+ sources) that lists sources with the
  current one marked.
- Styled with the app's colours.

## 5. Source switching and auto-fallback

- Picking a source resolves it and replaces the receiver's media.
- Failure on the TV = receiver IDLE with reason ERROR, BUFFERING for more than 20 s, or the relay
  failing the upstream playlist 3 times in a row.
- On failure: one fresh re-resolve of the current source, then the next untried source
  (`StreamSources` logic). A toast / notification on the phone says "X didn't load, trying Y".
  The tried set resets once a source plays for 30 s.

## Testing

- Unit tests: `LiveWindow` (append, contiguity, trimming, restart, VOD), fallback decisions.
- On devices via adb: phone (Galaxy A56) casting to the TCL Google TV; receiver state polled from
  the PC over the Cast protocol (`castv2-client`), TV logcat and screenshots, phone logcat.
