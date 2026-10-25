# Live chat overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read-only site chat shown as bottom-up pop-ups over the Android player, toggled by a chat button, hidden on every stream open.

**Architecture:** The catalog `id` travels with each `ChannelListing` into `PlayerActivity`. A small OkHttp WebSocket client (`LiveChatClient`) connects to the chat host that `ChatEndpoint` discovers from the site's scripts, parses frames with the pure `ChatMessageParser`, and feeds a `ChatOverlayView` that animates bubbles.

**Tech Stack:** Kotlin, Android Views, OkHttp 4.12 WebSocket, org.json, JUnit 4.

## Global Constraints

- minSdk 21; dependency `com.squareup.okhttp3:okhttp:4.12.0`.
- Read-only; no Tizen changes.
- Chat hidden on every stream open; no persisted preference.
- Socket open only while chat is visible and the activity is started.
- Chat errors must never affect playback.
- Default endpoint `wss://ws.television.st/chat`; query `?channel=<id>`, `&reconnect=true` on reconnect; first frame `{"session_id":""}`.

---

### Task 1: Carry the stream id

**Files:** Modify `ChannelListing.kt`, `ApiCatalogFetcher.kt`, `MainActivity.kt`, `PlayerActivity.kt` (intent extra only).

**Produces:** `ChannelListing.streamId: Long = 0L`; `PlayerActivity.intent(context, stream, title, streamId: Long = 0L)`; extra `stream_id`.

- [ ] Add `val streamId: Long = 0L` to `ChannelListing`.
- [ ] Parse `streamId = stream.optLong("id", 0L)` in `ApiCatalogFetcher.parse`.
- [ ] Pass `channel.streamId` from `MainActivity` into `PlayerActivity.intent`.
- [ ] `./gradlew :app:testDebugUnitTest` passes; commit.

### Task 2: Message parser (TDD)

**Files:** Create `chat/ChatMessage.kt`, `chat/ChatMessageParser.kt`; Test `chat/ChatMessageParserTest.kt`.

**Produces:**
- `data class ChatMessage(val id: String, val username: String, val text: String, val color: Int?)`
- `object ChatMessageParser { fun parse(frame: String): List<ChatMessage>; fun plainText(html: String): String; const val PREFILL_LIMIT = 5 }`

Rules: `prefill` array → last 5 valid messages; object with `message` + `username` → one message; skip `private == 1`, blank text, frames with only `viewers`; colour `RRGGBB` → opaque ARGB int, invalid → null; id = `uuid` or `username:text` hash; HTML tags removed, entities `&amp; &lt; &gt; &quot; &#39; &#NNN;` decoded, whitespace collapsed; malformed JSON → empty list.

- [ ] Write `ChatMessageParserTest` covering: live line, prefill capped to last 5, viewers ignored, private system ignored, HTML stripped + entities decoded, colour parsing (valid/invalid), malformed JSON.
- [ ] Run, see failures; implement; run, see passes; commit.

### Task 3: Endpoint discovery + WebSocket client

**Files:** Modify `app/build.gradle.kts`; Create `chat/ChatEndpoint.kt`, `chat/LiveChatClient.kt`; Test additions in `chat/ChatEndpointTest.kt`.

**Produces:**
- `object ChatEndpoint { const val DEFAULT = "wss://ws.television.st/chat"; fun findInScript(js: String): String?; fun scriptUrls(html: String, base: String): List<String>; fun resolve(context): String /* blocking, cached */ ; fun socketUrl(base: String, streamId: Long, reconnect: Boolean): String }`
- `class LiveChatClient(context, onMessages: (List<ChatMessage>) -> Unit) { fun start(streamId: Long); fun stop() }`

- [ ] Tests for `findInScript`, `scriptUrls` (relative + absolute, de-duplicated) and `socketUrl`.
- [ ] Implement; `resolve` fetches the live page, scans up to 15 scripts, caches the result in memory and prefs (`kpv_chat`/`endpoint`), falls back to `DEFAULT`.
- [ ] `LiveChatClient`: background thread resolves the endpoint, opens the socket, sends `{"session_id":""}`, posts parsed messages to main; reconnects after 5 s unless stopped; a generation counter discards callbacks from stale sockets.
- [ ] Tests pass; commit.

### Task 4: Overlay view, toggle button, player wiring

**Files:** Create `chat/ChatOverlayView.kt`, `res/drawable/ic_chat.xml`, `res/drawable/bg_chat_bubble.xml`, `res/drawable/bg_player_icon_button.xml`; Modify `PlayerActivity.kt`, `strings.xml`.

**Produces:** `ChatOverlayView(context) { fun add(messages: List<ChatMessage>); fun clear() }`.

- [ ] Overlay: vertical bottom-aligned `LinearLayout`; ≤5 bubbles; slide-up + fade-in; fade-out after 8 s; ≥350 ms pacing; pending queue capped at 20 (oldest dropped); width 40% (phone) / 32% (TV) of screen width, min 240dp.
- [ ] Chat button top-end beside cast (TV: alone at top-end), visible with controller; focusable on TV; content description `Show chat` / `Hide chat`; only shown when `streamId > 0`.
- [ ] Toggling starts/stops `LiveChatClient` and shows/clears the overlay; `onStop` stops, `onStart` restarts if on.
- [ ] Build, unit tests, manual check on phone + TV with 24/7 COWS; commit.
