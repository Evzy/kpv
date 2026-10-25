# Live chat overlay (Android) — design

## Goal

Show the site's live chat over the stream in the Android app (phone and Android TV) as
Instagram/YouTube-Live style pop-ups rising from the bottom. Read-only. Hidden by default on
every stream open; the viewer can toggle it on. Tizen is out of scope for now.

## Chat source

The site's chat panel uses a public WebSocket:

- URL: `wss://ws.television.st/chat?channel=<streamId>` (`&reconnect=true` on reconnects).
- `streamId` is the numeric `id` of the stream in `{api}/api/streams` (e.g. 24/7 COWS = 3663).
- On open the client sends `{"session_id":""}` (empty when not logged in).
- No cookies, origin or login are needed to read.

Messages (JSON, one per frame):

- `{"prefill":[msg, ...]}` — recent history on connect.
- `msg` — a live chat line: `username`, `message` (may contain HTML), `color` (hex without `#`),
  `badges`, `uuid`, optional `private`, `admin`, `platform`.
- `{"viewers":N}` — viewer count pings (ignored).
- A `private:1` SYSTEM welcome asking to log in (ignored).

### Endpoint discovery

The chat host lives in the site's JS bundle rather than the API. `ChatEndpoint` resolves it once
per app run: fetch the live page, follow its `_app` JS module scripts and regex
`wss://[^"'`\s]+/chat`. The result is cached in prefs; on failure the known default
`wss://ws.television.st/chat` is used.

## Components

- **`ChannelListing.streamId: Long`** — parsed from the catalog `id` (0 when absent). Passed to
  `PlayerActivity` via an intent extra. Chat is unavailable when it is 0.
- **`ChatMessage` / `ChatMessageParser`** (pure Kotlin, unit tested) — parses a frame into
  `List<ChatMessage>(id, username, text, color)`; strips HTML and decodes entities; drops viewer
  pings, `private` messages and blank text; caps prefill to the last 5.
- **`LiveChatClient`** — OkHttp WebSocket wrapper. `start(streamId)` / `stop()`. Reconnects after
  5 s when the socket drops unintentionally. Delivers parsed messages on the main thread.
- **`ChatOverlayView`** — `LinearLayout` (vertical, bottom-aligned) in the bottom-start corner of
  the player. Each line is a rounded semi-transparent dark bubble with the username in its colour
  and the message in white. New lines slide up + fade in; at most 5 are shown (oldest removed);
  each fades out after ~8 s. Incoming lines are paced (≥350 ms apart) and the pending queue is
  capped (oldest dropped) so busy chats don't flood. Width ~40% of screen on phone landscape,
  ~32% on TV; capped for portrait.
- **Chat toggle button** — a chat icon button beside the cast button (top-end). It shows and hides
  with the player controller (`ControllerVisibilityListener`). On TV it is focusable so the D-pad
  can reach it while controls are visible. Toggling on starts the client and shows the overlay;
  toggling off stops the client and clears the overlay.

## Behaviour

- Chat starts hidden on every stream open (no persisted preference).
- The socket is only open while chat is visible and the activity is started; `onStop` stops it,
  `onStart` restarts it if chat was on.
- Errors never affect playback; chat failures are silent apart from the overlay staying empty.

## Dependencies

- `com.squareup.okhttp3:okhttp:4.12.0` (supports minSdk 21).

## Testing

- Unit tests: `ChatMessageParserTest` (prefill, live line, viewers, private system message, HTML
  stripping, entity decoding, colour parsing), catalog `id` parsing.
- Manual: 24/7 COWS on the phone and on the TV — toggle on, see prefill + live lines rise, toggle
  off, D-pad reachability on TV, playback unaffected.

## Out of scope

- Sending messages / login, badges and emotes as images, Tizen WGT.
