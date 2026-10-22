# Android Chromecast (catalog + player)

**Status:** implemented 2026-10-22  
**Scope:** Android phone/tablet sender (`app/`) — not Android TV leanback UI

## Problem

Users watch KPV on a phone but want the picture on a TV. Today they can sideload on Android TV, use TV Companion for the Tizen widget, or use a third-party app such as Web Video Caster. Native **Google Cast** from the Android app would let users pick a Chromecast or Cast-enabled TV from the same UI they already use for browsing channels, without leaving KPV.

KPV streams are **signed HLS** discovered via a hidden WebView; playback requires **Referer**, **User-Agent**, and sometimes **Cookie** headers. Chromecast’s default receiver cannot attach those headers to upstream requests, so a direct `.m3u8` URL often returns **403**.

## Goals

1. Show a **Cast control** on the **channel catalog** once the catalog has loaded successfully (same moment the browse grid becomes visible).
2. Show a **Cast control** on **full-screen playback** once the stream is ready (ExoPlayer prepared / playing).
3. When a Cast session is active and the user picks a channel, **resolve** the stream (existing `StreamResolver` path), then **play on the receiver** with headers preserved.
4. When Cast connects during local playback, **hand off** the current `ResolvedStream` to the receiver and pause local ExoPlayer.
5. **Phone/tablet only** — hide all Cast sender UI on Android TV (`TvHelper.isTelevision`), consistent with TV Companion settings.

## Non-goals (v1)

- Cast sender on Android TV / leanback launcher.
- Custom hosted CAF receiver (JavaScript header injection on the dongle).
- DLNA, AirPlay, or Fire TV Fling.
- Casting the entire catalog as a queue / autoplay-next channel.
- Replacing or merging TV Companion (LAN pairing for Tizen).
- Settings toggle to disable Cast (can add later if needed).
- Registered custom Cast application ID (start with **Default Media Receiver** + LAN relay).

## Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│ MainActivity (phone)                                        │
│  top bar: title | Cast button (if catalogReady) | settings  │
│  catalog grid → pick channel                                │
└───────────────┬─────────────────────────────────────────────┘
                │ pick channel
                ▼
        StreamResolver → ResolvedStream { url, headers }
                │
     ┌──────────┴──────────┐
     │ Cast connected?     │
     └──────────┬──────────┘
           yes  │  no
                ▼              ▼
    CastController.load   PlayerActivity (ExoPlayer)
    via relay URL              │
                │              └── Cast button after prepared
                ▼
    Chromecast ←── GET ── CastRelayServer (NanoHTTPD on phone LAN)
                      └── upstream HLS + injected headers
```

### Components

| Unit | Responsibility |
|------|----------------|
| **`CastController`** | Singleton: initialize Cast framework, expose connection state, load/stop media, notify listeners. Uses Cast SDK + Media3 Cast integration where appropriate. |
| **`CastRelayServer`** | Daemon NanoHTTPD on a fixed or ephemeral LAN port. Maps opaque token paths to one active `ResolvedStream`. Proxies master playlist, variant playlists, and segments; rewrites relative URLs in playlists to stay on the relay. Forwards upstream requests with stored headers. Stops serving a token when session ends or load is replaced. |
| **`CastOptionsProvider`** | Android `OptionsProvider`: default receiver app ID `CC1AD845`, notification / expanded controller options as needed for Media3. |
| **`MainActivity`** | Hosts `MediaRouteButton` in top bar; visibility `catalogReady && !isTelevision`. Channel play path branches on `CastController.isConnected`. |
| **`PlayerActivity`** | Hosts `MediaRouteButton` (overlay or `PlayerView` custom layout); visible after player `STATE_READY`. Registers current `ResolvedStream` with `CastController` for mid-playback handoff. |

### Initialization

- **`KpvApp.onCreate`**: no heavy Cast init (lazy init on first activity).
- **`MainActivity.onCreate`**: `CastContext.getSharedInstance` (async) on phone only; bind route button when ready.
- **Manifest**: `meta-data` for `com.google.android.gms.cast.framework.OPTIONS_PROVIDER_CLASS_NAME`, and `INTERNET` / multicast permissions already satisfied via existing cleartext + LAN usage.

## UX behavior

### Catalog

| State | Cast button |
|-------|-------------|
| Loading / error / no site URL | Hidden |
| Catalog visible (`catalogReady`) | Visible (may be inactive gray until Cast devices on network) |

Tapping Cast opens the system device picker. No media loads until the user picks a channel (or until handoff from player).

### Channel selection

1. User taps channel card (unchanged loading indicator on card).
2. `StreamResolver` runs (unchanged).
3. **If Cast not connected:** start `PlayerActivity` with `ResolvedStream` (unchanged).
4. **If Cast connected:** register stream on `CastRelayServer`, build relay master URL using `LanAddress.primaryIpv4()`, call `RemoteMediaClient.load` with HLS content type and metadata (title from `ChannelListing`). Optionally show **ExpandedControllerActivity** or in-app mini controller; local full-screen player is **not** opened unless user chooses “play on phone” (v1: skip opening player when casting succeeds).

### Player

- Cast button appears after ExoPlayer reaches ready.
- Connecting Cast while playing: pause ExoPlayer, start relay + load same `ResolvedStream` on receiver.
- Disconnecting Cast: stop relay token; ExoPlayer remains paused (user can resume locally).

### Android TV

- No Cast button in `MainActivity` or `PlayerActivity` when `TvHelper.isTelevision` is true.

## Relay design

### Why relay

Chromecast fetches media URLs from the dongle’s network context. KPV’s upstream CDN expects browser-like headers. The phone already holds the resolved URL and header map; exposing them via a **short-lived LAN HTTP proxy** matches the pattern documented in `tizen/INTEGRATION.md` (origin-caster / Watchbox).

### Token lifecycle

1. On load: generate random token (e.g. 128-bit hex). Store `ResolvedStream` + upstream base URL in memory map.
2. Relay path pattern: `GET /cast/{token}/master.m3u8` (entry), `GET /cast/{token}/{...}` for relative paths rewritten in playlists.
3. On new load or `CastController` session ended: remove prior token(s) for that session.
4. On app process death: all tokens lost (acceptable; user re-picks channel).

### Playlist rewriting

- Parse `#EXT-X-*` lines; rewrite `URI="..."` and bare segment lines to `http://{phoneIp}:{port}/cast/{token}/{relativePath}`.
- Follow redirects on upstream segment fetches with same headers.
- Limit relay to HLS content types; reject non-playlist paths that escape token directory.

### Security / exposure

- v1: no auth on relay (same LAN trust model as TV Companion). Token is unguessable; relay binds to LAN IP only (not `0.0.0.0` on cellular — only start relay when on Wi‑Fi and Cast session active).
- Cleartext HTTP to phone is required for default receiver; already allowed via `usesCleartextTraffic`.

## Dependencies

Add to `app/build.gradle.kts`:

- `androidx.media3:media3-cast` (align with existing Media3 `1.4.1`)
- `androidx.mediarouter:mediarouter` (version compatible with Cast SDK)
- `com.google.android.gms:play-services-cast-framework` (current stable)

ProGuard: not minified today; note keep rules if minify enabled later.

## Error handling

| Failure | User-visible behavior |
|---------|------------------------|
| Catalog load failed | No Cast button (unchanged) |
| Resolve failed | Toast / status line (unchanged); no Cast load |
| No LAN IP | Toast: cannot cast — connect to Wi‑Fi |
| Relay upstream 403/5xx | Cast error; toast with short message |
| Cast session dropped mid-play | Stop relay; toast optional |

Log tags: `KpvCast`, `KpvCastRelay` at info/warn for debugging.

## Testing (manual)

1. Phone + Chromecast on same Wi‑Fi; catalog shows Cast after channels load.
2. Connect Cast from catalog; pick live channel; verify playback on TV.
3. Pick channel without Cast connected; local play; connect Cast mid-stream; verify handoff.
4. Channel that fails without Referer on direct URL (regression: must work via relay).
5. Android TV build: confirm Cast button absent.
6. Disconnect Cast; confirm relay stops and phone does not leak background server.

## Future extensions (out of v1)

- Custom Cast receiver + registered app ID to reduce phone relay dependency for public URLs.
- Settings switch to disable Cast.
- `ExpandedControllerActivity` styling to match KPV theme.
- Queue / “play next” from catalog while casting.

## Approval

Design approved in chat 2026-10-22 (catalog + player Cast, relay approach, phone-only UI).
