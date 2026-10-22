# Remove Phone Pairing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the phone companion (LAN pairing) from the Tizen `.wgt` and the Android APK; the TV resolves streams only via site API → playback cache → TV decoder.

**Architecture:** Pure deletion plus rewiring. TV: drop `Companion` and every call site, simplify `StreamResolve.resolveForWatch` and the watch page retry. Android: delete the companion server/pairing classes and their settings UI; keep `StreamResolver`, `LanAddress`, NanoHTTPD for Cast.

**Tech Stack:** Tizen web app (plain JS, Node test scripts), Android Kotlin (Gradle).

Spec: `docs/superpowers/specs/2026-10-23-remove-pairing-design.md`

## Global Constraints

- Work in worktree `C:\Users\User\kpv-remove-pairing` on branch `remove-pairing` (off `main`). Do not touch `C:\Users\User\kpv` (Cast work on `feature/android-chromecast-relay`).
- Keep: `playback-cache.js`, the hidden embed sniffer (`kpv_use_embed_sniff`, `sniff.html`), `StreamResolver.kt`, `LanAddress.kt`, NanoHTTPD dependency.
- No migration of stale `kpv_companion_*` localStorage keys or `companion_*` SharedPreferences.
- Release version 1.0.43 (versionCode 44), bump `release/version.json` + `tizen/package.json`, `node scripts/check-release-version.mjs`.

---

### Task 1: TV — resolve without the phone (TDD)

**Files:**
- Create: `tizen/scripts/test-resolve-flow.mjs`
- Modify: `tizen/js/stream-resolve.js`, `tizen/package.json` (`test:tizen`)

**Interfaces:**
- Produces: `StreamResolve.resolveForWatch(opts, { skipCache?, onStep? })` → `{ hls, embed, referer, streamData, usedTvResolver, fromCache, tvNote, embedSniffEnabled }`. Exports no longer include `fetchFromCompanion`, `prepareOnPhone`, `companionReady`.

- [ ] **Step 1: Write the failing test** — `test-resolve-flow.mjs` loads `js/stream-resolve.js` in a `node:vm` context with stub `Site`, `GasmResolve`, `PlaybackCache`, `localStorage`, and a `Companion` stub that throws if touched. Cases: API HLS wins without calling the decoder; cache hit returns `fromCache`; embed-only payload calls `GasmResolve.resolve` and caches the result; decoder error surfaces as `tvNote`; `skipCache` bypasses the cache; exports lack the companion functions.
- [ ] **Step 2:** `node tizen/scripts/test-resolve-flow.mjs` → FAIL (exports still contain `companionReady`).
- [ ] **Step 3:** In `stream-resolve.js` delete `companionReady`, `RESOLVE_TIMEOUT_MS`, `streamApiPath`, `fetchFromCompanion`, `prepareOnPhone`, the `forcePhone` option, `usedResolver`, `companionNote`; header comment becomes "site API, playback cache, then the embed site's decoder run on the TV (GasmResolve)".
- [ ] **Step 4:** Test PASS; add it to `test:tizen`.

### Task 2: TV — watch page, player, catalog, settings, packaging

**Files:**
- Delete: `tizen/js/companion.js`, `tizen/COMPANION.md`
- Modify: `tizen/js/watch.js`, `tizen/js/player.js`, `tizen/js/catalog.js`, `tizen/js/settings.js`, `tizen/index.html`, `tizen/watch.html`, `tizen/scripts/build-flat.mjs`, `tizen/scripts/build-web-bundle.mjs`, `tizen/scripts/package-kpv-tizen.mjs`, `tizen/scripts/test-package-files.mjs` (guard)

**Interfaces:**
- Consumes: Task 1 `resolveForWatch` (no `forcePhone`).

- [ ] **Step 1: Failing guard** — extend `test-package-files.mjs`: fail if any `tizen/js/*.js` or `tizen/*.html` (source pages only: `index.html`, `watch.html`, `sniff.html`, `hls-shell.html`) contains `Companion` or `companion`. Run → FAIL.
- [ ] **Step 2: watch.js** — `resolveAndPlay(fresh)`: when `fresh`, clear cache and step "Getting a fresh link…"; call `resolveForWatch({uri, hlsUrl: fresh ? "" : payload.hlsUrl, embedUrl}, { skipCache: fresh, onStep: step })`. `canReresolve()` = `payload.uri && StreamResolve.tvResolveAvailable(embed)`. `noStreamMessage` lines: "No direct HLS URL for this channel.", "", "The TV decoder could not get a playlist from the embed page." (+ `tvNote`), sniff hint, "Press Play/OK to retry · Back for channels." Rename `forcePhone` params to `fresh`.
- [ ] **Step 3: player.js** — remove the `prepareOnPhone` block and `Companion` from the globals header. **catalog.js** — remove the `/catalog/playback` block.
- [ ] **Step 4: settings.js + index.html** — remove companion fields, status, save/pair logic, labels; Save hint "OK — saves site URL and reloads channels."; RemoteGuide "Site URL at top · teal Save box below"; Save lead in index.html "Press ↓ from Address until this row is teal, then OK on Save." Remove the companion `<div class="settings-block">`.
- [ ] **Step 5: packaging** — remove `companion.js` from `watch.html`, `build-flat.mjs` (jsOrder + cp), `build-web-bundle.mjs`, `package-kpv-tizen.mjs`; delete `companion.js`, `COMPANION.md`.
- [ ] **Step 6:** `npm run test:tizen` → all PASS; `npm run package` builds.
- [ ] **Step 7:** Commit "TV: remove phone companion pairing".

### Task 3: Android — remove companion

**Files:**
- Delete: `TvCompanion.kt`, `TvCompanionServer.kt`, `CompanionPairing.kt`, `CompanionHost.kt`, `CompanionResolveQueue.kt`, `CatalogCache.kt` (only the companion served it)
- Modify: `KpvApp.kt`, `MainActivity.kt`, `SettingsActivity.kt`, `SiteConfig.kt`, `res/layout/activity_settings.xml`, `res/values/strings.xml`

- [ ] **Step 1:** `KpvApp` drop `CompanionPairing.init`. `MainActivity` drop `CompanionHost` interface and its three overrides, `TvCompanion.*` calls, `CatalogCache.*` calls, empty `onPause`. `SiteConfig` drop `KEY_COMPANION*`, `isCompanionEnabled`, `setCompanionEnabled`, `companionPort`.
- [ ] **Step 2:** `SettingsActivity` drop companion fields/UI; apply bar insets when `!TvHelper.isTelevision(this)`. Layout: remove the five companion views. Strings: remove the six `companion_*`.
- [ ] **Step 3:** `rg -n "Companion|CatalogCache" app/src` → no matches. `./gradlew :app:assembleDebug :app:testDebugUnitTest` → BUILD SUCCESSFUL.
- [ ] **Step 4:** Commit "Android: remove TV companion server and pairing".

### Task 4: Docs, release, verify, ship

- [ ] **Step 1:** Docs: `docs/TESTING.md` (drop PIN/companion from TV checklist, `-Reinstall` note says "resets site URL once"), `docs/CI_CD.md` (drop "companion"), `tizen/INTEGRATION.md` (note companion removed in v1.0.43 at the Option A heading).
- [ ] **Step 2:** Bump to 1.0.43 / 44; `node scripts/check-release-version.mjs`.
- [ ] **Step 3:** TV: `.\scripts\deploy-tv.ps1 -Debug`; play a channel; trigger Retry once (clear cache, OK on error screen or reload watch page with a bad cached entry); Settings shows no companion block.
- [ ] **Step 4:** Commit, merge `remove-pairing` into `main` (fast-forward), `git push origin main`, remove worktree.
