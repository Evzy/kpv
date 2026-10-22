# KPV cleanup, slice 1 (safe removals)

## Goal

Remove code and tracked files that nothing uses, without changing anything the user relies on. This slice runs before the TV embed-sniffing work, so that work starts on a smaller codebase with readable diffs.

## Order of the wider effort

1. This slice (safe removals), released and checked on the reference TV.
2. Go/no-go test: why the embed site's `/fetch` answers the TV with 502.
3. TV embed-sniffing fix, if step 2 says it is possible.
4. Remaining cleanup: old debug scripts in `tizen/scripts/`, and merging the two TV updaters (`bootstrap.js` startup check and `tv-update.js` Refresh).

## In scope

### 1. Stop tracking build output

These files are listed in `.gitignore` but are still tracked because they were committed before the ignore rules existed. The build regenerates all of them (`tizen/scripts/build-flat.mjs`, `embed-shell-version.mjs`, `package-kpv-tizen.mjs`), and CI runs the build before packaging.

`tizen/main.js`, `tizen/hls.min.js`, `tizen/style.css`, `tizen/avplay-play.js`, `tizen/companion.js`, `tizen/embed-engine.js`, `tizen/playback-cache.js`, `tizen/site.js`, `tizen/sniff.js`, `tizen/stream-resolve.js`, `tizen/tizen-play.js`, `tizen/watch.js`, `tizen/generate-icon.js`.

Action: `git rm --cached` only; the files stay on disk. `tizen/generate-icon.js` is not a build output. It is a hand-written script that only `tizen/pack-wgt.ps1` uses, and the `tizen/*.js` ignore rule caught it. Keep it tracked by adding `!tizen/generate-icon.js` to `.gitignore`.

### 2. Remove the "Test HLS URL" field (TV)

- `tizen/index.html`: remove the URL input row (`test-hls-url`).
- `tizen/js/settings.js`: remove `testHlsInput` and every use of it (field list, hints, save, populate on open, focus handling).
- `tizen/js/site.js`: remove `STORAGE_TEST_HLS`, `testHls`, `saveTestHls`, `testHlsUrl`.
- Keep the **Test playback** button. It always plays the fixed Mux test stream (`https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`), which still lets you check the TV's player on its own.
- An existing `kpv_test_hls_url` value in localStorage is left alone. It is harmless, and nothing reads it.

### 3. Remove the "resolver URL" leftovers (TV)

`tizen/js/site.js`: remove `STORAGE_RESOLVER`, `resolver`, `saveResolver`, `resolverOrigin`. Nothing calls them. Update the `stream-resolve.js` header comment that mentions an "optional LAN resolver".

### 4. Remove Android dead code

- `app/src/main/java/dev/kpv/app/CompanionPlaybackCache.kt` (no references).
- `ApiCatalogFetcher.fetchFromJson` (never called).
- `app/src/main/res/layout/item_category.xml` and `item_channel_grid.xml` (no `R.layout` or binding references).
- String `update_failed_generic` in `values/strings.xml` (unused).

## Out of scope (kept on purpose)

- Phone companion pairing, phone-side sniffing (`StreamResolver.kt`), Samsung AVPlay and the hls.js backup player, the startup update check, and the Android APK updater.
- TV embed sniffing (`sniff.html`, `sniff.js`, `embed-engine.js`). It is being worked on next.
- Debug scripts in `tizen/scripts/` (some may document earlier sniffing attempts), test pages, docs.
- Trimming module exports that are only used internally. This is cosmetic and can go in step 4.

## Release and verification

- Version bump to 1.0.35 (hot bundle; no shell files change, so `wgtShellVersion` stays 1.0.40).
- Before pushing: `npm run package` and `npm run test:tizen` in `tizen/`, `node scripts/check-release-version.mjs`, Android `assembleDebug` plus the instrumented Settings tests on `kpv_api34`.
- After release, on the reference TV (QA55Q60AAWXXY) over sdb + DevTools:
  - Refresh moves it to 1.0.35, loaded from the hot cache.
  - The catalog loads.
  - A channel plays from the paired phone.
  - Settings opens, and the site URL and PIN rows still navigate and save.
  - Test playback plays the Mux stream.

## Risks

- **A missed reference to removed TV code.** That throws when Settings opens. It's caught by the TV check above, and fixed with a hot update.
- **Untracking `tizen/main.js` breaks a workflow that reads it from git.** This has been checked:
  - `release-kpv.yml` runs `npm install` and then `npm run package`, which regenerates every file listed above, before `bundle:web` reads them.
  - The Tizen tests (`test:tizen`) only read `tizen/scripts/` and `scripts/`.
  - `deploy-tv.ps1` builds unless `-SkipBuild` is passed.
