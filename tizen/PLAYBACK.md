# How KPV (and similar apps) play these streams

Sites using the **catalog-style API** (`/api/streams`, `/api/streams/{uri}`) almost never give you a plain file URL that works everywhere. They give you:

| API field | Meaning |
|-----------|---------|
| `sources[].type: "iframe"` + `data: "https://…/embed/…"` | **Primary.** A small web page with JW Player / HLS.js / etc. |
| `sources[].type: "hls"` + `.m3u8` | Sometimes present; often needs **Referer / cookies** from the embed origin. |
| Catalog `iframe` on each stream | Same embed URL shortcut. |

## What actually works on each platform

### Nuvio on Samsung TV ([NuvioTizen](https://github.com/NuvioMedia/NuvioTizen))

Not AVPlay in the widget. The `.wgt` is a **launcher** that runs:

```javascript
window.location.replace("https://web.nuvioapp.space/…");
```

The **remote website** owns playback (same as Chrome on a PC). No local m3u8 handling.

### KPV on Android (this repo)

1. Open the **embed URL** in a hidden **WebView** (full browser engine).
2. **Intercept** the first `.m3u8` request (with Referer, cookies, User-Agent).
3. Play that URL in **ExoPlayer** with the same headers.

That matches the API design: the embed page negotiates tokens/headers; the app steals the final playlist URL.

### KPV on Tizen (v1.0.20+ — IPTV app model)

Same stack as [sky-iptv-tizen](https://github.com/sanwhere/sky-iptv-tizen) / [TVapp](https://github.com/KaashDev/TVapp): **you need a direct `.m3u8`**, then:

1. **`watch.html`** resolves HLS from the API (or optional **LAN resolver** — `GET {resolver}/resolve?uri=…` → `{ "m3u8": "…" }`).
2. **`AvplayPlay`** (Samsung `webapis.avplay`) with Referer / live / adaptive props.
3. **`hls-shell.html`** — bundled **Hls.js** + `<video>` if AVPlay fails (Referer passed via `xhrSetup`).

Embed-only channels (catalog-style empty API `m3u8`) **do not play by default** on Tizen. Options: site adds `m3u8` to the API, run a resolver on the LAN (future Android KPV endpoint), or set `localStorage kpv_use_embed_sniff=1` for experimental `sniff.html` (often fails on Tizen 6).

**PC tests before sideload:** `npm run test:tizen`, `npm run test:play` → open `test-play.html` or Settings → **Test playback** (Mux test stream).

## Open-source WGT apps to compare

| Project | Playback | Notes |
|---------|----------|--------|
| [NuvioTizen](https://github.com/NuvioMedia/NuvioTizen) | Full-page **hosted website** | No local m3u8; `window.location.replace(...)`. |
| [sky-iptv-tizen](https://github.com/sanwhere/sky-iptv-tizen) | **`webapis.avplay`** | Direct playlist URLs; `USER_AGENT`, `ADAPTIVE_INFO`, buffering params; **HTML must be transparent** over the video plane. |
| [OpenIPTV](https://github.com/shayanline/OpenIPTV) | AVPlay + browser fallback | M3U/Xtream; tries several URL variants (.m3u8 / .ts). |
| [KaashDev/TVapp](https://github.com/KaashDev/TVapp) | **Hls.js + `<video>`** | Works for many IPTV m3u8 URLs in the widget DOM (not embed-iframes). |

KPV TV v1.0.20: **API / resolver `.m3u8` → AVPlay → hls-shell** only (no full-page embed fallback).

## Will example.com / embed-site embed work on Samsung TV?

**Maybe, but often no** without a site change.

| Check | Meaning |
|-------|---------|
| PC `test-sniff.html` → **SUCCESS playlist** | TV sniff has a fair shot (install WGT after). |
| PC test → **jwplayer stays no** / timeout | TV will fail too; use **Android KPV** or add **`.m3u8` in the API**. |
| TV HUD **`jwplayer: yes`** then AVPlay error | Sniff worked; CDN/Referer/codec issue. |
| TV **`jwplayer: no`** | WebAssembly or JW blocked in the widget. |

Android works because **WebView intercepts** the `.m3u8` network request. Tizen has no equivalent; KPV runs the embed HTML in a **blob iframe** and reads `jwplayer().getPlaylist()`.

## Test before sideloading the WGT

From `cows-tv/tizen`:

```bash
npm run test:embed          # Node: fetch + HTML transforms only (~5s)
npm run test:sniff          # Same + local server on :8766
```

Open **http://127.0.0.1:8766/test-sniff.html**, click **Run test** (default: sample-channel embed).

Optional: Chrome DevTools → **Network conditions** → User agent → **Samsung TV** to mimic Tizen.

Only after **SUCCESS** on PC is it worth copying `KPV.wgt` to the TV again.

**On TV:** Tizen Studio **TV emulator** or Samsung **Remote Test Lab** can sideload the same WGT without walking to the living room each build.

## If playback still fails

- Confirm the **embed URL** opens on a PC browser (logged out is fine for public streams).
- On TV, embed pages that load **HLS.js only from a CDN** fail offline/CDN-blocked; fix the **site** embed or use direct HTTPS `m3u8` in the API.
- For mock: restart `mock-site/server.js` so embed uses the direct cow HLS URL (no jsDelivr required).
