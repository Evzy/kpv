# Remove phone pairing (TV companion) — design

**Date:** 2026-10-23
**Status:** Approved

## Why

The TV now resolves embed streams itself (`wasm-lower.js` + `gasm-resolve.js`, verified on the reference TV with no phone). The phone companion — a LAN HTTP server on Android that the TV pairs with by PIN — is no longer needed, and it leaves an open network service on the phone.

## Scope

Remove pairing from both builds in one release, as two commits (TV, then Android).

### TV (`.wgt`)

- Delete `tizen/js/companion.js`, its `<script>` tags, its entries in `build-flat.mjs` / `build-web-bundle.mjs` / `package-kpv-tizen.mjs`, and `tizen/COMPANION.md`.
- Settings: remove the companion section (`settings.js` logic and its markup in `index.html`).
- `stream-resolve.js`: resolve order is site API → per-channel playback cache → TV decoder. Remove `fetchFromCompanion`, `prepare`/prefetch, `companionReady`, `companionNote`, and the `forcePhone` option.
- `watch.js`: drop the phone steps and hints. The no-stream screen shows the TV decoder's note and keeps **Retry**, which clears the channel's cache entry and re-runs resolve. Retry is offered whenever the channel has an embed URL (`StreamResolve.tvResolveAvailable`).
- `player.js`: drop companion checks; `catalog.js`: drop the `/catalog/playback` phone fetch.
- Kept: `playback-cache.js` (now only holds links the TV resolved), the hidden embed sniffer (`kpv_use_embed_sniff`, removed in a later cleanup).
- Stale `kpv_companion_*` localStorage keys are not migrated; nothing reads them.

### Android (APK)

- Delete `TvCompanion.kt`, `TvCompanionServer.kt`, `CompanionPairing.kt`, `CompanionHost.kt`, `CompanionResolveQueue.kt`.
- Remove companion wiring in `KpvApp`, `MainActivity` (host interface, start/stop), `SettingsActivity`, `activity_settings.xml`, `strings.xml`, and the companion prefs in `SiteConfig`.
- Kept: `StreamResolver` (phone playback and Cast), `LanAddress` (Cast relay), NanoHTTPD (Cast relay).
- The uncommitted Chromecast work on `feature/android-chromecast-relay` is not touched; this work happens in a worktree off `main`.

### Docs

Remove pairing sections from `docs/TESTING.md`, `docs/CI_CD.md`, and the Tizen READMEs. Dated specs/plans stay as history.

## Testing

- `test-stream-resolve.mjs` covers the phone-less order (API, cache, TV decoder).
- New guard in `test:tizen`: no file in `tizen/js` or the Tizen HTML pages references `Companion`.
- `npm run test:tizen`; `./gradlew :app:assembleDebug :app:testDebugUnitTest`.
- On the TV: `scripts/deploy-tv.ps1`, play a channel, use Retry once.
- Release v1.0.43 (bump `release/version.json` and `tizen/package.json`).
