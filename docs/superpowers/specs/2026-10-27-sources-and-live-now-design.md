# Alternative sources + Live now (Android) — design

Tizen parity (player controls, chat, sources, Live now) gets its own spec after this ships.

## 1. Alternative sources in the player

### Data

The catalog API returns, per stream, `source_tag` (label of the main source, e.g. "NBA TV") and
`substreams[]`, each with `uri_name`, `iframe`, `source_tag` (e.g. "KFAA-TV (Away)"). Example:
`nba/2026-10-26/dal-mia` (main "NBA TV") + `nba/2026-10-26/dal-mia/away` ("KFAA-TV (Away)").

- `StreamSource(label: String, streamUri: String, iframeUrl: String)`.
- `ChannelListing.sources: List<StreamSource>` — main first (label = `source_tag`, falling back to
  "Main"), then substreams in API order (label = `source_tag`, falling back to "Source N").
  Empty for streams without substreams.

### Player

- `PlayerActivity` receives the sources (parallel string-array extras) and the index playing.
- **Sources button** in the top bar beside chat, shown with the controller, only when there are 2+
  sources. Opens an `AlertDialog` single-choice list with the current source checked (touch and
  D-pad).
- **Switching:** toast "Switching to X…", run `StreamResolver` with the player root as container;
  the current video keeps playing until the new one resolves, then `setMediaSource` + `prepare`.
  `resolvedStream` (used for cast hand-off) updates to the new source.
- **Fallback** (`SourceQueue`, pure, tested): sources are tried in list order starting after the
  current one, skipping ones already tried in this attempt.
  - Opening (in `MainActivity`): the main source fails to resolve → toast "X didn't load, trying
    Y" and resolve the next; only when all fail show the existing "Couldn't start" message.
  - Picked source fails to resolve → try the next untried one; if all fail, keep the current
    source playing and toast "No other source loaded".
  - Playback error mid-stream (not behind-live-window) → try the next untried source; when none
    are left, finish with `RESULT_PLAYBACK_FAILED` as today.
- Chat stays on the main stream id.

## 2. Live now section

- A synthetic "Live now" sport always first on the home screen (phone and TV).
- Contents: channels with `isLive && !alwaysLive` from the **visible** (not hidden) sports and
  leagues, in home-screen order, de-duplicated by `streamUri`. Channels also stay in their own
  category.
- Omitted when empty.
- Hideable: Customize shows a "Live now" row first with Hide/Show and no move buttons; stored in
  `Prefs.hidden` under the key `CategoryLayout.LIVE_NOW_KEY`.
- Collapsible like any category (existing header chevron).

## Testing

- Unit: source parsing (labels, fallbacks, no substreams → empty), `SourceQueue` order, Live now
  building (excludes hidden sports/leagues and 24/7, de-dup, empty → absent, hidden key → absent),
  editor rows include the Live now row first.
- Manual: phone and TV emulators — Live now at the top, hide/show from Customize; Sources button on
  Mavericks vs. Heat, switch both ways, fallback toast when a source fails.

## Out of scope

Tizen (separate spec), remembering a preferred source.
