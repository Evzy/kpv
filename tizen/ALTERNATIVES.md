# Samsung TV options for embed-first catalog sites (embed / JW Player)

For **how WVC-style logic maps into KPV** and **open-source code to reuse**, see [INTEGRATION.md](./INTEGRATION.md).


Sites like your catalog source expose an **iframe embed**, not a stable public `.m3u8` in the API. Different products solve that in different ways.

## Quick comparison

| Approach | How it works | Embed-first sites | Tradeoffs |
|----------|----------------|----------------|-----------|
| **Web Video Caster (WVC)** | Phone browser opens the **page**, detects **HLS/MP4**, TV runs **WVC Receiver** (Tizen app) | **Works today** if you open embed or live URL and cast | Phone required; install receiver on TV; not a single “KPV only” UX |
| **TV Cast (2kit)** | Same idea: phone browser → pick detected video → **TV Cast** receiver on Samsung | Similar to WVC | Separate phone app + TV receiver |
| **Nuvio (Tizen)** | Widget **replaces** itself with **full-screen hosted website** | Works like Chrome on a URL you host | Not your site URL unless Nuvio’s web app points at it |
| **KPV Android** | Hidden **WebView** on embed → **sniff `.m3u8`** → **ExoPlayer** | **Works** for embed-first APIs | Phone/tablea/Android TV, not Samsung Tizen widget |
| **KPV Tizen (this repo)** | Fetch embed HTML → **blob iframe** → read **JW playlist** → **AVPlay** | **Uncertain** on Tizen 6; must pass [PC test](PLAYBACK.md#test-before-sideloading-the-wgt) | No phone; fragile vs WASM/ads/JW on TV |
| **Samsung Internet (TV browser)** | Open `https://<your-site>/live/…` on TV | Sometimes; remote + ads painful | No catalog app; bad UX |
| **Chromecast / Fire TV + WVC** | Cast from phone to dongle | Very common workaround | Extra hardware |
| **Site API change** | Add **`m3u8`** (or token URL) to `/api/streams/{uri}` | **Best** for all native TV apps | Requires backend change |

## Web Video Caster (what you already use)

This matches your experience: *“give it the page”*.

1. Install **Web Video Caster** on phone and **Web Video Caster Receiver** on the Samsung TV (Tizen).
2. Same Wi‑Fi.
3. In WVC, open the channel's live page or embed URL.
4. **Play once on the phone** so JW/HLS loads; WVC detects the stream link.
5. Cast to the TV receiver (supports **HLS**, **Referer/Cookie/User-Agent** via headers).

Docs: [receivers](https://www.webvideocaster.com/receivers), [integrations / headers](https://www.webvideocaster.com/integrations).

**Why WVC succeeds where KPV Tizen struggles:** the **phone** runs a full mobile Chrome engine, loads the real embed origin, and passes the **final media URL + headers** to a thin **receiver** on the TV. KPV Tizen tries to run the same embed **inside the widget** without network intercept (no Android WebView).

## TV Cast (2kit)

[Video & TV Cast for Samsung TV](https://video-tv-cast.com/samsung-smart-tv): install **TV Cast receiver** from Samsung apps, pair phone IP, browse site on phone, tap detected video. Same class as WVC.

## Nuvio-style full-page web

[NuvioTizen](https://github.com/NuvioMedia/NuvioTizen) does `window.location.replace("https://web.nuvioapp.space/…")`. Playback is entirely on their **web app**, not AVPlay/sniff. You could do the same with the site’s live URL, but you lose KPV catalog UX unless you rebuild a hosted shell.

## Punktfunk / “browser streaming” Tizen apps

Some Tizen apps are **remote-controlled browsers** (host streams from a PC/console). Different ops model; not drop-in for an API catalog.

## What we recommend by goal

| Goal | Recommendation |
|------|------------------|
| **Watch a channel on Samsung TV now** | **Web Video Caster** (or Android KPV + cast if you prefer) |
| **One app, no phone** | **Site: expose `.m3u8` in API** (even short-lived) + KPV AVPlay |
| **Keep investing in KPV Tizen** | Fix embed engine → **`npm run test:sniff`** on PC; only sideload if **SUCCESS** |
| **Same as Android on TV** | **Android TV / Google TV box** with KPV APK, or sideload APK on supported devices |

## KPV + WVC together (optional product idea)

After Android (or future TV) sniff resolves a URL:

- Share to WVC with Referer:  
  `wvc-x-callback://open?url=…&header=Referer:%20<embed-page-url>`

That does not help **phone-less TV-only** users unless the **Tizen app** can launch WVC (usually not from a widget).

## Testing KPV without the living-room loop

See [PLAYBACK.md — Test before sideloading](./PLAYBACK.md#test-before-sideloading-the-wgt):

```bash
cd tizen
npm run test:embed    # fetch + HTML prep
npm run test:sniff    # + browser harness at :8766/test-sniff.html
```

If the browser test never shows a `.m3u8`, a new WGT will not fix the TV.
