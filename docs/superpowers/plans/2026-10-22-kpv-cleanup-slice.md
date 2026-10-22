# KPV Cleanup Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove unused code and tracked build output from KPV without changing any feature the user relies on, then ship it as v1.0.35 and verify it on the reference TV.

**Architecture:** Purely subtractive. Git stops tracking generated Tizen files. The TV app loses the "Test HLS URL" field and the unused "resolver URL" code in `Site`. The Android app loses one unused object, one unused function, two unused layouts and one unused string. A new Node test guards against TV code looking up DOM ids that no HTML page defines.

**Tech Stack:** Vanilla JS (Tizen 6 / Chromium 76 TV app), Node 24 scripts and tests, Kotlin Android app (Gradle), GitHub Actions release workflow.

Spec: `docs/superpowers/specs/2026-10-22-kpv-cleanup-slice-design.md`

## Global Constraints

- Keep: phone companion pairing, phone-side sniffing, AVPlay and the hls.js backup player, the startup update check, the Android APK updater, the TV embed sniffer (`sniff.html`, `sniff.js`, `embed-engine.js`), and everything in `tizen/scripts/` except the new test.
- Keep the **Test playback** button. It always plays `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`.
- Release version 1.0.35 / versionCode 36. `wgtShellVersion` stays `1.0.40`, and `minWgtShell` stays `1.0.38`.
- Shell commands run in PowerShell 5 on Windows. Avoid inline `node -e` with regexes or quotes; write a file instead.
- Reference TV: `192.168.68.53:26101`. KPV app id `NuvioTV001.KPV`. DevTools via `scripts/tv-cdp.mjs` on port 9222.

---

### Task 1: Stop tracking generated Tizen files

**Files:**
- Modify: `.gitignore` (after the `!tizen/scripts/` line)
- Untrack (keep on disk): `tizen/main.js`, `tizen/hls.min.js`, `tizen/style.css`, `tizen/avplay-play.js`, `tizen/companion.js`, `tizen/embed-engine.js`, `tizen/playback-cache.js`, `tizen/site.js`, `tizen/sniff.js`, `tizen/stream-resolve.js`, `tizen/tizen-play.js`, `tizen/watch.js`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing code-level. After this task, `git ls-files -ci --exclude-standard` prints nothing.

- [ ] **Step 1: Confirm the current state**

Run: `git ls-files -ci --exclude-standard`
Expected: the 12 files above plus `tizen/generate-icon.js`.

- [ ] **Step 2: Keep `generate-icon.js` tracked**

`tizen/generate-icon.js` is a hand-written script that `tizen/pack-wgt.ps1` uses. The `tizen/*.js` ignore rule catches it by mistake. In `.gitignore`, replace:

```
!tizen/js/
!tizen/scripts/
```

with:

```
!tizen/js/
!tizen/scripts/
!tizen/generate-icon.js
```

- [ ] **Step 3: Untrack the generated files**

```powershell
git rm --cached tizen/main.js tizen/hls.min.js tizen/style.css tizen/avplay-play.js tizen/companion.js tizen/embed-engine.js tizen/playback-cache.js tizen/site.js tizen/sniff.js tizen/stream-resolve.js tizen/tizen-play.js tizen/watch.js
```

Expected: 12 `rm '...'` lines. The files still exist on disk (`Test-Path tizen/main.js` → `True`).

- [ ] **Step 4: Verify nothing ignored is still tracked, and the build regenerates everything**

```powershell
git ls-files -ci --exclude-standard
Set-Location tizen; npm run package; npm run bundle:web; Set-Location ..
```

Expected:
- The first command prints nothing.
- `package` ends with `KPV WGT created`.
- `bundle:web` prints a `bundleSha256` line and no "Missing bundle files" error.

- [ ] **Step 5: Commit**

```powershell
git add .gitignore
git commit -m "Stop tracking generated Tizen build output" -m "Co-authored-by: Cursor <cursoragent@cursor.com>"
```

---

### Task 2: Guard test, DOM ids used by TV code must exist in an HTML page

**Files:**
- Create: `tizen/scripts/test-dom-ids.mjs`
- Modify: `tizen/package.json` (`test:tizen` script)

**Interfaces:**
- Consumes: nothing.
- Produces: `node ./scripts/test-dom-ids.mjs`, which exits 0 and prints `test-dom-ids: ok (N ids)`, or exits 1 and lists the missing ids. Tasks 3 and 4 rely on it.

- [ ] **Step 1: Write the test**

Create `tizen/scripts/test-dom-ids.mjs`:

```js
// Every document.getElementById("x") in tizen/js must match an id="x" in some tizen/*.html page.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jsDir = path.join(root, "js");

const htmlIds = new Set();
for (const name of readdirSync(root).filter((n) => n.endsWith(".html"))) {
  const html = readFileSync(path.join(root, name), "utf8");
  for (const m of html.matchAll(/\bid="([^"]+)"/g)) htmlIds.add(m[1]);
}

const missing = [];
let checked = 0;
for (const name of readdirSync(jsDir).filter((n) => n.endsWith(".js"))) {
  const src = readFileSync(path.join(jsDir, name), "utf8");
  for (const m of src.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g)) {
    checked += 1;
    if (!htmlIds.has(m[1])) missing.push(`${name}: #${m[1]}`);
  }
}

if (missing.length) {
  console.error("test-dom-ids: ids used in JS but not defined in any tizen/*.html:");
  for (const line of missing) console.error("  " + line);
  process.exit(1);
}
console.log(`test-dom-ids: ok (${checked} ids)`);
```

- [ ] **Step 2: Run it against the current code**

Run: `Set-Location tizen; node ./scripts/test-dom-ids.mjs; Set-Location ..`
Expected: `test-dom-ids: ok (...)`, exit 0. If it fails, the ids it lists are lookups that were already broken. They are runtime-created elements built with `createElement`, so give them an allow-list in the test (`const dynamic = new Set([...])` checked before reporting a miss), then re-run until it passes.

- [ ] **Step 3: Wire it into `test:tizen`**

In `tizen/package.json`, change:

```json
"test:tizen": "node ./scripts/test-stream-resolve.mjs && node ./scripts/test-embed-engine.mjs && node ./scripts/test-stream-live.mjs && node ./scripts/test-bundle-cache-logic.mjs",
```

to:

```json
"test:tizen": "node ./scripts/test-stream-resolve.mjs && node ./scripts/test-embed-engine.mjs && node ./scripts/test-stream-live.mjs && node ./scripts/test-bundle-cache-logic.mjs && node ./scripts/test-dom-ids.mjs",
```

- [ ] **Step 4: Run the full suite**

Run: `Set-Location tizen; npm run test:tizen; Set-Location ..`
Expected: ends with `test-dom-ids: ok (...)`, exit 0.

- [ ] **Step 5: Commit**

```powershell
git add tizen/scripts/test-dom-ids.mjs tizen/package.json
git commit -m "Test: DOM ids used by TV code must exist in an HTML page" -m "Co-authored-by: Cursor <cursoragent@cursor.com>"
```

---

### Task 3: Remove the "Test HLS URL" field (keep the Test playback button)

**Files:**
- Modify: `tizen/index.html:81-88`
- Modify: `tizen/js/settings.js` (lines 10, 36, 153, 189, 238, 282-287, 319, 332, 345, 469)
- Modify: `tizen/js/site.js` (lines 6, 16, 22, 71-75, 81-83, 178, 180)

**Interfaces:**
- Consumes: `test-dom-ids.mjs` from Task 2.
- Produces: `Site` no longer exports `saveTestHls` or `testHlsUrl`. `SettingsPanel` keeps the same exports (`init`, `open`, `close`, `isOpen`, `handleBack`).

- [ ] **Step 1: Remove the input from the HTML (makes the guard test fail)**

In `tizen/index.html`, replace:

```html
      <div class="settings-block settings-block--optional">
        <h3 class="settings-block-title">Test playback (optional)</h3>
        <label class="field">
          <span>Test HLS URL</span>
          <input id="test-hls-url" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://test-streams.mux.dev/…" />
        </label>
        <button id="btn-test-play" type="button" class="settings-secondary-btn">Test playback</button>
      </div>
```

with:

```html
      <div class="settings-block settings-block--optional">
        <h3 class="settings-block-title">Test playback (optional)</h3>
        <button id="btn-test-play" type="button" class="settings-secondary-btn">Test playback</button>
      </div>
```

- [ ] **Step 2: Run the guard test and see it fail**

Run: `Set-Location tizen; node ./scripts/test-dom-ids.mjs; Set-Location ..`
Expected: exit 1, listing `settings.js: #test-hls-url`.

- [ ] **Step 3: Remove `testHlsInput` from `tizen/js/settings.js`**

Make these exact edits:

1. Delete the declaration line `  let testHlsInput;`.
2. In `textFields()`:
   - before: `    return [input, companionPhone, companionPin, testHlsInput].filter(Boolean);`
   - after: `    return [input, companionPhone, companionPin].filter(Boolean);`
3. In `focusables()`, delete the line `      testHlsInput,`, which comes between `btnCancel,` and `btnTestPlay,`.
4. In `applyRowFocus()`'s `labels` object, delete the line `      [testHlsInput && testHlsInput.id]: "Test stream URL — OK to type",`.
5. In `saveAndClose()`, delete the line `    Site.saveTestHls(normalizeUrl(testHlsInput.value));`.
6. Replace `openTestPlayback()`'s URL selection:

```js
    const testUrl =
      normalizeUrl(testHlsInput.value) ||
      Site.testHlsUrl() ||
      "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
```

with:

```js
    const testUrl = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
```

7. In `activateRow()`:
   - before: `    if (cur === input || cur === companionPhone || cur === companionPin || cur === testHlsInput) {`
   - after: `    if (cur === input || cur === companionPhone || cur === companionPin) {`
8. In `open()`, delete both lines `      testHlsInput.value = Site.testHlsUrl();`. One is in the Companion branch and one in the else branch; they have different indentation.
9. In `init()`, delete the line `    testHlsInput = document.getElementById("test-hls-url");`.

Then confirm no references remain:

Run: `rg -n "testHls|test-hls" tizen/js tizen/index.html`
Expected: matches only in `tizen/js/site.js`, which Step 4 handles.

- [ ] **Step 4: Remove test-HLS storage from `tizen/js/site.js`**

1. Delete `  const STORAGE_TEST_HLS = "kpv_test_hls_url";`.
2. Delete `  let testHls = "";`.
3. In `load()`, delete `    testHls = normalize(localStorage.getItem(STORAGE_TEST_HLS) || "");`.
4. Delete the whole function:

```js
  function saveTestHls(url) {
    testHls = normalize(url);
    if (testHls) localStorage.setItem(STORAGE_TEST_HLS, testHls);
    else localStorage.removeItem(STORAGE_TEST_HLS);
  }

```

5. Delete the whole function:

```js
  function testHlsUrl() {
    return testHls;
  }

```

6. In the returned object, delete the lines `    saveTestHls,` and `    testHlsUrl,`.

Run: `rg -n "testHls|TestHls|test-hls|TEST_HLS" tizen/js tizen/index.html`
Expected: no matches (exit 1).

- [ ] **Step 5: Run the tests and build**

Run: `Set-Location tizen; npm run test:tizen; npm run package; Set-Location ..`
Expected: `test-dom-ids: ok (...)` and `KPV WGT created`.

- [ ] **Step 6: Commit**

```powershell
git add tizen/index.html tizen/js/settings.js tizen/js/site.js
git commit -m "TV Settings: remove Test HLS URL field (Test playback uses the Mux stream)" -m "Co-authored-by: Cursor <cursoragent@cursor.com>"
```

---

### Task 4: Remove the unused "resolver URL" code

**Files:**
- Modify: `tizen/js/site.js` (lines 5, 15, 21, 65-69, 77-79, 177, 179 before Task 3's edits; find them by content)
- Modify: `tizen/js/stream-resolve.js:1-5` (header comment)

**Interfaces:**
- Consumes: nothing from earlier tasks beyond the tests.
- Produces: `Site` no longer exports `saveResolver` or `resolverOrigin`.

- [ ] **Step 1: Confirm nothing outside `site.js` uses them**

Run: `rg -n "saveResolver|resolverOrigin|kpv_resolver_url" tizen/js tizen/index.html app/src`
Expected: matches only in `tizen/js/site.js`.

- [ ] **Step 2: Edit `tizen/js/site.js`**

1. Delete `  const STORAGE_RESOLVER = "kpv_resolver_url";`.
2. Delete `  let resolver = "";`.
3. In `load()`, delete `    resolver = normalize(localStorage.getItem(STORAGE_RESOLVER) || "");`.
4. Delete the whole function:

```js
  function saveResolver(url) {
    resolver = normalize(url);
    if (resolver) localStorage.setItem(STORAGE_RESOLVER, resolver);
    else localStorage.removeItem(STORAGE_RESOLVER);
  }

```

5. Delete the whole function:

```js
  function resolverOrigin() {
    return resolver;
  }

```

6. In the returned object, delete the lines `    saveResolver,` and `    resolverOrigin,`.

- [ ] **Step 3: Update the stale header comment in `tizen/js/stream-resolve.js`**

Replace:

```js
/**
 * Resolve a playable HLS URL the way IPTV Tizen apps do: API first, optional LAN resolver.
 * No in-widget JW/embed engine on the default path (testable without a TV).
 */
```

with:

```js
/**
 * Resolve a playable HLS URL: playback cache, then site API, then the paired phone companion.
 * No in-widget JW/embed engine on the default path (testable without a TV).
 */
```

- [ ] **Step 4: Verify, test and build**

Run: `rg -n "resolver\b|RESOLVER|resolverOrigin|saveResolver" tizen/js/site.js`
Expected: no matches.

Run: `Set-Location tizen; npm run test:tizen; npm run package; Set-Location ..`
Expected: all tests pass, and the output ends with `KPV WGT created`.

- [ ] **Step 5: Commit**

```powershell
git add tizen/js/site.js tizen/js/stream-resolve.js
git commit -m "TV: remove unused resolver URL setting code" -m "Co-authored-by: Cursor <cursoragent@cursor.com>"
```

---

### Task 5: Remove Android dead code

**Files:**
- Delete: `app/src/main/java/dev/kpv/app/CompanionPlaybackCache.kt`
- Delete: `app/src/main/res/layout/item_category.xml`
- Delete: `app/src/main/res/layout/item_channel_grid.xml`
- Modify: `app/src/main/java/dev/kpv/app/ApiCatalogFetcher.kt:19-20`
- Modify: `app/src/main/res/values/strings.xml:24`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. No public API that is still used changes.

- [ ] **Step 1: Re-confirm there are no references (including tests)**

Run: `rg -n "CompanionPlaybackCache|fetchFromJson|item_category|ItemCategoryBinding|item_channel_grid|ItemChannelGridBinding|update_failed_generic" app/src`
Expected: only the declarations, in `CompanionPlaybackCache.kt`, `ApiCatalogFetcher.kt` and `strings.xml`.

- [ ] **Step 2: Delete the files**

```powershell
git rm app/src/main/java/dev/kpv/app/CompanionPlaybackCache.kt app/src/main/res/layout/item_category.xml app/src/main/res/layout/item_channel_grid.xml
```

- [ ] **Step 3: Remove `fetchFromJson` from `ApiCatalogFetcher.kt`**

Delete these two lines (the function and the blank line after it):

```kotlin
    fun fetchFromJson(body: String): List<StreamCategory>? = parse(body)

```

- [ ] **Step 4: Remove the unused string from `strings.xml`**

Delete:

```xml
    <string name="update_failed_generic">Install was rejected</string>
```

- [ ] **Step 5: Build, unit-test and run the instrumented tests**

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug --no-daemon
.\scripts\start-android-emulator.ps1
.\scripts\run-android-instrumented.ps1
```

Expected:
- Gradle prints `BUILD SUCCESSFUL`.
- The instrumented run reports both `SettingsActivityTest` tests passing.

- [ ] **Step 6: Commit**

```powershell
git add app/src/main/java/dev/kpv/app/ApiCatalogFetcher.kt app/src/main/res/values/strings.xml
git commit -m "Android: remove unused CompanionPlaybackCache, fetchFromJson, layouts and string" -m "Co-authored-by: Cursor <cursoragent@cursor.com>"
```

---

### Task 6: Release v1.0.35

**Files:**
- Modify: `release/version.json`
- Modify: `tizen/package.json` (`version`, synced by the build)

**Interfaces:**
- Consumes: Tasks 1-5 committed.
- Produces: GitHub release 1.0.35 on `Evzy/kpv-releases`, with the manifest `bundleVersion` set to `1.0.35`.

- [ ] **Step 1: Bump the version**

In `release/version.json`, change:

```json
  "version": "1.0.34",
  "versionCode": 35,
```

to:

```json
  "version": "1.0.35",
  "versionCode": 36,
```

- [ ] **Step 2: Build and check**

```powershell
Set-Location tizen; npm run package; npm run test:tizen; Set-Location ..
node scripts/check-release-version.mjs
```

Expected: `KPV WGT created`, all tests pass, `Release version OK: 1.0.35 (36)`.

- [ ] **Step 3: Commit and push**

```powershell
git add release/version.json tizen/package.json
git commit -m "Release v1.0.35 (cleanup slice 1)" -m "Co-authored-by: Cursor <cursoragent@cursor.com>"
git push
```

- [ ] **Step 4: Wait for CI**

Run: `gh run list --limit 1` and then `gh run watch <id> --exit-status`.
Expected: the "Release KPV" run completes with `success`.

---

### Task 7: Verify on the reference TV

**Files:** none (verification only).

**Interfaces:**
- Consumes: release 1.0.35 from Task 6; `scripts/tv-cdp.mjs` (`eval`, `reload`).

- [ ] **Step 1: Make sure the debug session is live**

Run: `node scripts/tv-cdp.mjs eval "KPV_APP_VERSION"`
Expected: `1.0.34`.

If it fails, reconnect:

```powershell
& "C:\Users\User\tizen-studio\tools\sdb.exe" connect 192.168.68.53:26101
& "C:\Users\User\tizen-studio\tools\sdb.exe" -s 192.168.68.53:26101 shell 0 debug NuvioTV001.KPV
& "C:\Users\User\tizen-studio\tools\sdb.exe" -s 192.168.68.53:26101 forward tcp:9222 tcp:<port printed above>
& "C:\Users\User\tizen-studio\tools\sdb.exe" -s 192.168.68.53:26101 shell 0 execute NuvioTV001.KPV
```

- [ ] **Step 2: Run the real Refresh path**

Run: `node scripts/tv-cdp.mjs eval "(TvUpdate.check({toast:true}),'started')"`, wait 15 seconds, then:

Run: `node scripts/tv-cdp.mjs eval "({ver:KPV_APP_VERSION,header:document.getElementById('app-version').textContent,main:[].map.call(document.scripts,function(s){return s.src}).filter(function(s){return /main\.js/.test(s)})})"`
Expected:
- `ver` is `1.0.35`.
- `header` contains `up to date`.
- `main` points into `Documents/kpv-hot-cache/1.0.35-…/main.js`.

- [ ] **Step 3: Check the catalog and Settings**

Run: `node scripts/tv-cdp.mjs eval "({cards:document.querySelectorAll('.card, [data-uri]').length,testHlsField:!!document.getElementById('test-hls-url'),testPlayBtn:!!document.getElementById('btn-test-play'),site:typeof Site.saveTestHls+'/'+typeof Site.saveResolver})"`
Expected:
- `cards` is greater than 0.
- `testHlsField` is `false`.
- `testPlayBtn` is `true`.
- `site` is `undefined/undefined`.

Then ask the user to check on the TV:
- Settings opens.
- ↓ reaches the Site URL, Phone URL, PIN, Save, Cancel and Test playback rows.
- Test playback plays the Mux stream.
- A channel plays from the paired phone.

- [ ] **Step 4: Mark the slice done**

No commit needed. Report the results to the user, then move on to step 2 of the wider effort: the `/fetch` 502 go/no-go test.
