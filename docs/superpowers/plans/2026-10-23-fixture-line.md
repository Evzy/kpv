# Fixture Line Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each event's start time (device timezone) or live ESPN score under the card title, on Tizen and Android.

**Architecture:** A pure formatter (`FixtureLine`) turns `starts_at`/`ends_at`/`always_live` into a line; a score module (`LiveScores`) fetches ESPN's public scoreboard per league for started team events and matches by normalised team names. Cards render the time line immediately; score lines replace it in place when lookups finish.

**Tech Stack:** Tizen web app (plain ES2017 JS, `node:vm` tests), Android Kotlin (minSdk 21, `Calendar`, `org.json`, JUnit 4).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-23-fixture-line-design.md` (line formats, tag map, matching rules).
- ESPN URL: `https://site.api.espn.com/apis/site/v2/sports/<path>/scoreboard?limit=300`, 5 s timeout, failures silent.
- No optional chaining or numeric separators in Tizen JS (older TV Chromium).
- 12-hour clock, `–` (en dash) between scores, `·` separators.
- Shared fixture: `app/src/test/resources/espn-scoreboard.json` (NFL live NE@CHI 0–3 "5:11 - 1st", two `pre` NFL games, `post` MGL@STU 1–2 "FT").
- Release: bump `release/version.json` and `tizen/package.json` together, run `node scripts/check-release-version.mjs`.

---

### Task 1: Tizen `FixtureLine` + `LiveScores`

**Files:**
- Create: `tizen/js/fixture-line.js`, `tizen/js/live-scores.js`
- Create: `tizen/scripts/test-fixture-line.mjs`
- Modify: `tizen/package.json` (`test:tizen` appends `&& node ./scripts/test-fixture-line.mjs`)

**Interfaces:**
- Produces: `FixtureLine.timeLine(ch, nowSec) -> string|null`, `FixtureLine.scoreLine(score) -> string`, `FixtureLine.splitTeams(title) -> [left, right]|null`, `FixtureLine.hasStarted(ch, nowSec) -> bool` where `ch = {title, tag, startsAt, endsAt, alwaysLive}` (seconds).
- Produces: `LiveScores.lookup(channels, nowSec) -> Promise<Map<channel, line>>`, `LiveScores.leaguePath(tag)`, `LiveScores.scoreFor(title, events) -> {state, detail, left:{abbr,score}, right:{abbr,score}}|null`.

- [ ] **Step 1: Write the failing test** `tizen/scripts/test-fixture-line.mjs`

Sets `process.env.TZ = "Australia/Melbourne"`, loads both files into a `vm` context with a mock
`XMLHttpRequest` that serves the fixture for `football/nfl` and errors otherwise. Now is
`2026-10-23T00:38:30Z` (Fri 11:38 AM in Melbourne). Asserts:

```js
line({ startsAt: at("2026-10-23T08:30Z") }) === "Today 7:30 PM"
line({ startsAt: at("2026-10-23T16:00Z") }) === "Tomorrow 3:00 AM"
line({ startsAt: at("2026-10-25T16:00Z") }) === "Mon 3:00 AM"
line({ startsAt: at("2026-11-05T16:00Z") }) === "6 Nov 3:00 AM"
line({ title: "A at B", startsAt: at("2026-10-23T00:15Z") }) === "Live · Score TBC"
line({ title: "Darts | Day 2", startsAt: at("2026-10-23T00:15Z") }) === "Live · started 11:15 AM"
line({ startsAt: 1, endsAt: 2 }) === "Ended"
line({ alwaysLive: true, startsAt: 1 }) === null
scoreFor("New England Patriots at Chicago Bears") -> "NE 0 – 3 CHI · 5:11 - 1st"
scoreFor("Chicago Bears vs. New England Patriots") -> "CHI 3 – 0 NE · 5:11 - 1st"
scoreFor("VfB Stuttgart vs. Borussia Mönchengladbach") -> "Final · STU 2 – 1 MGL"
scoreFor("Pittsburgh Steelers at New Orleans Saints") === null   // pre
scoreFor("Los Angeles Rams at Chicago Bears") === null
leaguePath("Premier League") === "soccer/eng.1"; leaguePath("Darts") === ""
lookup([NFL live, CFL live, Darts live]) -> one NFL line; requests only nfl + cfl scoreboards
```

- [ ] **Step 2: Run** `node tizen/scripts/test-fixture-line.mjs` — Expected: FAIL (ENOENT `fixture-line.js`).

- [ ] **Step 3: Implement** `fixture-line.js` (clock/day label via local `Date` getters, `TEAM_SPLIT = /\s+(?:at|vs\.?)\s+/i`) and `live-scores.js` (tag map from spec, NFD accent strip, noise words `fc cf sc afc`, whole-word containment on `displayName`/`shortDisplayName`/`name`, equality on `location`, XHR `getJson` resolving `null` on error/timeout, `lookup` grouping by league and fetching in parallel).

- [ ] **Step 4: Run** the test — Expected: `test-fixture-line: PASS`.

- [ ] **Step 5: Commit** `git commit -m "TV: fixture line formatter and ESPN live scores"`

### Task 2: Tizen cards show the line

**Files:**
- Modify: `tizen/js/catalog.js` (channel gets `startsAt`, `endsAt`, `alwaysLive`)
- Modify: `tizen/js/app.js` (`renderCatalog` adds `<div class="fixture">`, then `LiveScores.lookup` updates text)
- Modify: `tizen/css/style.css` (`.card` height 184 → 204px; `.card .fixture` 18px line, `#5eead4`)
- Modify: `tizen/scripts/build-flat.mjs` (`jsOrder` adds `fixture-line.js`, `live-scores.js` after `stream-live.js`)

**Interfaces:**
- Consumes: Task 1 `FixtureLine.timeLine`, `LiveScores.lookup`.

- [ ] **Step 1:** Extend `test-fixture-line.mjs`: `Catalog.parse` on a sample `{timestamp, streams:[{category, streams:[{uri_name, name, tag, starts_at, ends_at, always_live}]}]}` yields `startsAt/endsAt/alwaysLive`; and `build-flat.mjs` source lists both new files.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement the edits above. In `renderCatalog`, compute `nowSec` once, render `FixtureLine.timeLine(ch, nowSec) || ""` into `.fixture`, keep `Map(channel → element)`, then `LiveScores.lookup(allChannels, nowSec).then(lines => lines.forEach((text, ch) => el.textContent = text))`.
- [ ] **Step 4:** `npm run build:flat` (or `node scripts/build-flat.mjs`) and `npm run test:tizen` — PASS.
- [ ] **Step 5:** Commit `"TV: start time and live score under channel titles"`.

### Task 3: Android `FixtureLine` + `LiveScores`

**Files:**
- Create: `app/src/main/java/dev/kpv/app/FixtureLine.kt`, `LiveScores.kt`
- Create: `app/src/test/java/dev/kpv/app/FixtureLineTest.kt`, `LiveScoresTest.kt`
- Modify: `app/src/main/java/dev/kpv/app/ChannelListing.kt` (`startsAt: Long = 0L`, `endsAt: Long = 0L`, `alwaysLive: Boolean = false`)
- Modify: `app/build.gradle.kts` (`testImplementation("org.json:json:20240303")`)

**Interfaces:**
- Produces: `FixtureLine.timeLine(ch, nowSec, zone = TimeZone.getDefault()): String?`, `FixtureLine.scoreLine(FixtureLine.Score)`, `FixtureLine.splitTeams(title): Pair<String,String>?`, `FixtureLine.hasStarted(ch, nowSec)`.
- Produces: `LiveScores.refresh(categories, nowSec, fetch = ::httpGet): Map<String,String>` (by `streamUri`, blocking), `LiveScores.lineFor(ch, nowSec): String?`, `LiveScores.scoreFor(title, events: JSONArray): FixtureLine.Score?`, `LiveScores.leaguePath(tag)`.

- [ ] **Step 1:** Write `FixtureLineTest` (same time cases as Task 1, zone `Australia/Melbourne`) and `LiveScoresTest` (same score cases from the shared fixture resource; `refresh` with a fake `fetch` records URLs and returns the fixture for nfl, `null` otherwise).
- [ ] **Step 2:** `./gradlew :app:testDebugUnitTest --tests "dev.kpv.app.FixtureLineTest" --tests "dev.kpv.app.LiveScoresTest"` — FAIL (unresolved references).
- [ ] **Step 3:** Implement mirroring Task 1 (Calendar with `Locale.US`, DST-safe day difference via UTC date numbers; `Normalizer.Form.NFD`; one thread per league joined; `@Volatile lines`).
- [ ] **Step 4:** Run tests — PASS.
- [ ] **Step 5:** Commit `"Android: fixture line formatter and ESPN live scores"`.

### Task 4: Android cards show the line, refresh on return

**Files:**
- Modify: `app/src/main/res/layout/item_stream_card.xml` (TextView `@+id/fixture` between title and tag, 18dp, 12sp, `@color/kpv_accent`; `minHeight` 184 → 202dp)
- Modify: `app/src/main/java/dev/kpv/app/CatalogBrowseView.kt` (phone `cardHeightPx` +18dp; `refreshFixtureLines()`)
- Modify: `app/src/main/java/dev/kpv/app/StreamCardBinder.kt` (bind fixture text and `tag = channel`; `refreshFixtures(root)` walks descendants)
- Modify: `app/src/main/java/dev/kpv/app/ApiCatalogFetcher.kt` (pass `starts_at`, `ends_at`, `always_live`)
- Modify: `app/src/main/java/dev/kpv/app/MainActivity.kt` (`refreshScores()` after catalog load and in `onResume` when `catalogReady`)
- Release: `release/version.json`, `tizen/package.json`

- [ ] **Step 1:** `./gradlew :app:assembleDebug :app:testDebugUnitTest` after edits — PASS.
- [ ] **Step 2:** Bump version, `node scripts/check-release-version.mjs` — OK.
- [ ] **Step 3:** Deploy to TV (`.\scripts\deploy-tv.ps1`), check cards via CDP: upcoming show `Today/Tomorrow/<day> h:mm AM`, live NFL/NHL show scores.
- [ ] **Step 4:** Commit `"Release v1.0.53: start time and live score under channel titles"`, push `fixture-line:main`.
