# Ordered Site List and Cross-Site Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single site address with an ordered, user-entered site list where each site is assigned the best-scoring parser, the top site feeds the home screen, and a "Try other sites" button finds the same match on lower sites when every source fails.

**Architecture:** Pure, unit-tested pieces (`SiteListCodec`, `EventPagesParser`, `MatchFinder`, `SiteKindDetector.choose`) sit under thin Android glue: `SiteList` (prefs), `SiteAdapters` (network + parser per kind), and UI in `SettingsActivity`, `MainActivity` (`OtherSitesFallback`) and `CastControlsActivity`. Existing API-site code paths stay; they just take a site origin instead of reading the one global address.

**Tech Stack:** Kotlin, Android Views (programmatic), org.json, JUnit 4 (`./gradlew :app:testDebugUnitTest`), CI-signed APK via `gh workflow run release-kpv.yml --ref site-list`.

## Global Constraints

- Android app only. No Tizen changes.
- No site address or site name in app code, strings, or tests. Test fixtures use `https://events.example` / `https://api-site.example`.
- The user enters every site in the app. The top site supplies the home screen catalog.
- Each site entry stores the parser kind chosen at add time: `API` or `EVENT_PAGES`. UI labels are "API" and "Event pages".
- Detection scores every parser. Ties go to `API`. All scores 0 means the site is not added.
- Matching: two-sided titles only; start times within 3 h when both known; exactly one qualifier for an automatic match.
- Event-pages catalog: drop events ended more than 30 min ago and events starting more than 24 h from now.
- Unit tests: `./gradlew :app:testDebugUnitTest`. Full check before commit: `./gradlew :app:assembleDebug :app:testDebugUnitTest`.

## File Structure

| File | Responsibility |
| --- | --- |
| `app/src/main/java/dev/kpv/app/sites/SiteEntry.kt` (new) | `SiteKind` enum and `SiteEntry(origin, kind)` |
| `app/src/main/java/dev/kpv/app/sites/SiteListCodec.kt` (new, pure) | JSON encode/decode, add/remove/move, origin normalising |
| `app/src/main/java/dev/kpv/app/sites/SiteList.kt` (new) | Prefs-backed list, migration from the old single address |
| `app/src/main/java/dev/kpv/app/sites/EventPagesParser.kt` (new, pure) | `EVENTS_DATA` events, feed buttons, catalog building |
| `app/src/main/java/dev/kpv/app/sites/MatchFinder.kt` (new, pure) | Title/time matching across sites |
| `app/src/main/java/dev/kpv/app/sites/SiteKindDetector.kt` (new) | Probes per kind and pure `choose()` scoring |
| `app/src/main/java/dev/kpv/app/sites/SiteAdapters.kt` (new) | Catalog, events and sources per kind (network) |
| `app/src/main/java/dev/kpv/app/OtherSitesFallback.kt` (new) | Walk lower sites, auto-play or pick dialog |
| `SiteConfig.kt`, `ApiCatalogFetcher.kt`, `SiteHttp.kt`, `StreamResolver.kt`, `CatalogLoader.kt`, `ChannelListing.kt` | Take an origin; top site from `SiteList`; referer per site |
| `SettingsActivity.kt`, `res/layout/activity_settings.xml`, `strings.xml` | Site list editor |
| `MainActivity.kt`, `CastPlayback.kt`, `CastControlsActivity.kt`, `PlayerActivity.kt` | Load sources at play time, Try other sites button |
| Tests in `app/src/test/java/dev/kpv/app/sites/` | Codec, parser, matcher, detector scoring |

---

### Task 1: Site entries and list codec

**Files:**
- Create: `app/src/main/java/dev/kpv/app/sites/SiteEntry.kt`
- Create: `app/src/main/java/dev/kpv/app/sites/SiteListCodec.kt`
- Test: `app/src/test/java/dev/kpv/app/sites/SiteListCodecTest.kt`

**Interfaces:**
- Produces: `enum class SiteKind { API, EVENT_PAGES }`, `data class SiteEntry(val origin: String, val kind: SiteKind)`, `object SiteListCodec { fun normalize(raw: String): String; fun encode(list: List<SiteEntry>): String; fun decode(json: String?): List<SiteEntry>; fun add(list, entry): List<SiteEntry>; fun remove(list, index): List<SiteEntry>; fun move(list, index, dir): List<SiteEntry> }`

- [ ] **Step 1: Write the failing test**

```kotlin
package dev.kpv.app.sites

import org.junit.Assert.assertEquals
import org.junit.Test

class SiteListCodecTest {
    private val a = SiteEntry("https://api-site.example", SiteKind.API)
    private val b = SiteEntry("https://events.example", SiteKind.EVENT_PAGES)

    @Test fun normalizeAddsSchemeAndTrimsSlash() {
        assertEquals("https://events.example", SiteListCodec.normalize(" events.example/ "))
        assertEquals("http://x.example", SiteListCodec.normalize("http://x.example/"))
    }

    @Test fun encodeDecodeRoundTrip() {
        assertEquals(listOf(a, b), SiteListCodec.decode(SiteListCodec.encode(listOf(a, b))))
    }

    @Test fun decodeBadJsonIsEmpty() {
        assertEquals(emptyList<SiteEntry>(), SiteListCodec.decode("not json"))
        assertEquals(emptyList<SiteEntry>(), SiteListCodec.decode(null))
    }

    @Test fun decodeUnknownKindSkipsEntry() {
        val json = """[{"origin":"https://a.example","kind":"MYSTERY"},{"origin":"https://events.example","kind":"EVENT_PAGES"}]"""
        assertEquals(listOf(b), SiteListCodec.decode(json))
    }

    @Test fun addReplacesSameOriginInPlace() {
        val updated = SiteListCodec.add(listOf(a, b), SiteEntry("https://api-site.example", SiteKind.EVENT_PAGES))
        assertEquals(listOf(SiteEntry("https://api-site.example", SiteKind.EVENT_PAGES), b), updated)
    }

    @Test fun addAppendsNewOrigin() {
        assertEquals(listOf(a, b), SiteListCodec.add(listOf(a), b))
    }

    @Test fun moveSwapsAndClampsAtEnds() {
        assertEquals(listOf(b, a), SiteListCodec.move(listOf(a, b), 1, -1))
        assertEquals(listOf(a, b), SiteListCodec.move(listOf(a, b), 0, -1))
        assertEquals(listOf(a, b), SiteListCodec.move(listOf(a, b), 1, 1))
    }

    @Test fun removeDropsIndex() {
        assertEquals(listOf(b), SiteListCodec.remove(listOf(a, b), 0))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :app:testDebugUnitTest --tests "dev.kpv.app.sites.SiteListCodecTest"`
Expected: FAIL, unresolved reference `SiteEntry`.

- [ ] **Step 3: Write minimal implementation**

`SiteEntry.kt`:

```kotlin
package dev.kpv.app.sites

/** How KPV reads a site; chosen by [SiteKindDetector] when the site is added. */
enum class SiteKind { API, EVENT_PAGES }

data class SiteEntry(val origin: String, val kind: SiteKind)
```

`SiteListCodec.kt`:

```kotlin
package dev.kpv.app.sites

import org.json.JSONArray
import org.json.JSONObject

object SiteListCodec {

    fun normalize(raw: String): String {
        val trimmed = raw.trim().trimEnd('/')
        if (trimmed.isEmpty()) return ""
        return if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) trimmed else "https://$trimmed"
    }

    fun encode(list: List<SiteEntry>): String =
        JSONArray().apply {
            list.forEach { put(JSONObject().put("origin", it.origin).put("kind", it.kind.name)) }
        }.toString()

    fun decode(json: String?): List<SiteEntry> {
        if (json.isNullOrBlank()) return emptyList()
        val array = runCatching { JSONArray(json) }.getOrNull() ?: return emptyList()
        return (0 until array.length()).mapNotNull { i ->
            val obj = array.optJSONObject(i) ?: return@mapNotNull null
            val origin = normalize(obj.optString("origin"))
            val kind = runCatching { SiteKind.valueOf(obj.optString("kind")) }.getOrNull()
            if (origin.isEmpty() || kind == null) null else SiteEntry(origin, kind)
        }
    }

    fun add(list: List<SiteEntry>, entry: SiteEntry): List<SiteEntry> {
        val index = list.indexOfFirst { it.origin == entry.origin }
        return if (index >= 0) list.toMutableList().also { it[index] = entry } else list + entry
    }

    fun remove(list: List<SiteEntry>, index: Int): List<SiteEntry> =
        list.filterIndexed { i, _ -> i != index }

    fun move(list: List<SiteEntry>, index: Int, dir: Int): List<SiteEntry> {
        val target = index + dir
        if (index !in list.indices || target !in list.indices) return list
        return list.toMutableList().also { it[index] = list[target]; it[target] = list[index] }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew :app:testDebugUnitTest --tests "dev.kpv.app.sites.SiteListCodecTest"`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/dev/kpv/app/sites app/src/test/java/dev/kpv/app/sites
git commit -m "Sites: entry model and list codec"
```

---

### Task 2: Event-pages parser

**Files:**
- Create: `app/src/main/java/dev/kpv/app/sites/EventPagesParser.kt`
- Test: `app/src/test/java/dev/kpv/app/sites/EventPagesParserTest.kt`

**Interfaces:**
- Consumes: `dev.kpv.app.StreamSource(label, streamUri, iframeUrl)`, `dev.kpv.app.ChannelListing`, `dev.kpv.app.StreamCategory(name, channels)`.
- Produces: `data class PageEvent(val title: String, val pageUrl: String, val startMs: Long, val endMs: Long, val posterUrl: String, val category: String)`; `object EventPagesParser { fun parseEvents(html: String, origin: String): List<PageEvent>; fun parseSources(html: String, pageUrl: String): List<StreamSource>; fun toCatalog(events: List<PageEvent>, nowMs: Long): List<StreamCategory>; fun isListed(event: PageEvent, nowMs: Long): Boolean }`. Catalog channels set `sourcesPage = pageUrl` (field added in Task 5; in this task the parser builds `ChannelListing` with `streamUri = pageUrl`, `pageUrl = pageUrl`, and Task 5 adds `sourcesPage`).

- [ ] **Step 1: Write the failing test**

```kotlin
package dev.kpv.app.sites

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class EventPagesParserTest {
    private val origin = "https://events.example"

    private val home = """
        <script>
        const API_URL = 'https://scores.events.example/api/scoreboard';
        const EVENTS_DATA = [
          {
            "title": "Milwaukee Brewers vs Tampa Bay Rays",
            "href": "mlb-2.html",
            "start": "2026-10-29T00:00:00Z",
            "end": "2026-10-29T02:30:00Z",
            "bg": "https://img.example/?logo1=a.png&w=100",
            "category": "Baseball"
          },
          {
            "title": "Manchester City vs Brighton & Hove Albion [Live]",
            "href": "soccer-1.html",
            "start": "2026-10-28T19:30:00Z",
            "end": "2026-10-28T21:30:00Z",
            "bg": "",
            "category": "Soccer"
          }
        ]

        const SLING_LINEUP_MAP = { 'X': { id: 'x' } };
        </script>
    """.trimIndent()

    private val matchPage = """
        <div class="stream-switcher">
            <button class="stream-btn active" data-url="/embed?nba1h">Hawks Broadcast</button>
            <button class="stream-btn" data-url="/embed?nba1a">Heat Broadcast</button>
        </div>
        <iframe id="stream-player" src="/embed?nba1h" allowfullscreen></iframe>
    """.trimIndent()

    @Test fun parsesEventsWithAbsolutePageUrls() {
        val events = EventPagesParser.parseEvents(home, origin)
        assertEquals(2, events.size)
        val first = events[0]
        assertEquals("Milwaukee Brewers vs Tampa Bay Rays", first.title)
        assertEquals("https://events.example/mlb-2.html", first.pageUrl)
        assertEquals(1_793_232_000_000L, first.startMs)
        assertEquals("Baseball", first.category)
        assertEquals("https://img.example/?logo1=a.png&w=100", first.posterUrl)
    }

    @Test fun bracketInsideStringDoesNotEndArray() {
        assertEquals("Manchester City vs Brighton & Hove Albion [Live]", EventPagesParser.parseEvents(home, origin)[1].title)
    }

    @Test fun pageWithoutEventsDataHasNoEvents() {
        assertEquals(emptyList<PageEvent>(), EventPagesParser.parseEvents("<html>hello</html>", origin))
    }

    @Test fun parsesFeedButtonsAsSources() {
        val sources = EventPagesParser.parseSources(matchPage, "$origin/nba-1.html")
        assertEquals(listOf("Hawks Broadcast", "Heat Broadcast"), sources.map { it.label })
        assertEquals("https://events.example/embed?nba1h", sources[0].iframeUrl)
        assertEquals(sources[0].iframeUrl, sources[0].streamUri)
    }

    @Test fun fallsBackToEmbedIframe() {
        val page = """<iframe src="/embed?solo"></iframe>"""
        val sources = EventPagesParser.parseSources(page, "$origin/x.html")
        assertEquals(listOf("Main"), sources.map { it.label })
        assertEquals("https://events.example/embed?solo", sources[0].iframeUrl)
    }

    @Test fun catalogDropsLongEndedAndFarFutureEvents() {
        val now = 1_793_235_600_000L // 2026-10-29T01:00:00Z
        val events = listOf(
            PageEvent("Live A vs B", "$origin/a.html", now - 3_600_000, now + 3_600_000, "", "Baseball"),
            PageEvent("Ended C vs D", "$origin/c.html", now - 7_200_000, now - 31 * 60_000, "", "Baseball"),
            PageEvent("Soon E vs F", "$origin/e.html", now + 3_600_000, now + 7_200_000, "", "Hockey"),
            PageEvent("Far G vs H", "$origin/g.html", now + 25 * 3_600_000, now + 26 * 3_600_000, "", "Hockey"),
        )
        val catalog = EventPagesParser.toCatalog(events, now)
        assertEquals(listOf("Baseball", "Hockey"), catalog.map { it.name })
        assertEquals(listOf("Live A vs B"), catalog[0].channels.map { it.title })
        assertTrue(catalog[0].channels[0].isLive)
        assertEquals(listOf("Soon E vs F"), catalog[1].channels.map { it.title })
        assertEquals((now + 3_600_000) / 1000, catalog[1].channels[0].startsAt)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :app:testDebugUnitTest --tests "dev.kpv.app.sites.EventPagesParserTest"`
Expected: FAIL, unresolved reference `EventPagesParser`.

- [ ] **Step 3: Write minimal implementation**

```kotlin
package dev.kpv.app.sites

import dev.kpv.app.ChannelListing
import dev.kpv.app.StreamCategory
import dev.kpv.app.StreamLive
import dev.kpv.app.StreamSource
import org.json.JSONArray
import java.net.URI
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

data class PageEvent(
    val title: String,
    val pageUrl: String,
    val startMs: Long,
    val endMs: Long,
    val posterUrl: String,
    val category: String,
)

/** Sites that list matches in an `EVENTS_DATA` script array, with a page of embed feeds per match. */
object EventPagesParser {

    private const val ENDED_GRACE_MS = 30 * 60_000L
    private const val UPCOMING_WINDOW_MS = 24 * 3_600_000L
    private val EVENTS_START = Regex("""EVENTS_DATA\s*=\s*\[""")
    private val FEED_BUTTON = Regex(
        """<button[^>]*class="[^"]*stream-btn[^"]*"[^>]*data-url="([^"]+)"[^>]*>([^<]*)</button>""",
        RegexOption.IGNORE_CASE,
    )
    private val EMBED_IFRAME = Regex("""<iframe[^>]*\ssrc="([^"]*/embed[^"]*)"""", RegexOption.IGNORE_CASE)

    fun parseEvents(html: String, origin: String): List<PageEvent> {
        val json = eventsArray(html) ?: return emptyList()
        val array = runCatching { JSONArray(json) }.getOrNull() ?: return emptyList()
        return (0 until array.length()).mapNotNull { i ->
            val obj = array.optJSONObject(i) ?: return@mapNotNull null
            val title = obj.optString("title").trim()
            val href = obj.optString("href").trim()
            val start = parseInstant(obj.optString("start"))
            val end = parseInstant(obj.optString("end"))
            if (title.isEmpty() || href.isEmpty() || start == null || end == null) return@mapNotNull null
            PageEvent(
                title = title,
                pageUrl = resolve("$origin/", href),
                startMs = start,
                endMs = end,
                posterUrl = obj.optString("bg"),
                category = obj.optString("category").ifBlank { "Events" },
            )
        }
    }

    fun parseSources(html: String, pageUrl: String): List<StreamSource> {
        val buttons = FEED_BUTTON.findAll(html).map { m ->
            val url = resolve(pageUrl, m.groupValues[1].replace("&amp;", "&"))
            val label = m.groupValues[2].trim().ifEmpty { "Feed" }
            StreamSource(label, url, url)
        }.distinctBy { it.iframeUrl }.toList()
        if (buttons.isNotEmpty()) return buttons
        val iframe = EMBED_IFRAME.find(html)?.groupValues?.get(1) ?: return emptyList()
        val url = resolve(pageUrl, iframe.replace("&amp;", "&"))
        return listOf(StreamSource("Main", url, url))
    }

    fun isListed(event: PageEvent, nowMs: Long): Boolean =
        nowMs - event.endMs <= ENDED_GRACE_MS && event.startMs - nowMs <= UPCOMING_WINDOW_MS

    fun toCatalog(events: List<PageEvent>, nowMs: Long): List<StreamCategory> {
        val listed = events.filter { isListed(it, nowMs) }
        val categories = listed.groupBy { it.category }.map { (name, group) ->
            StreamCategory(name, group.sortedBy { it.startMs }.map { toListing(it, nowMs) })
        }
        return StreamLive.sortCategories(categories)
    }

    private fun toListing(event: PageEvent, nowMs: Long) = ChannelListing(
        title = event.title,
        tag = event.category,
        streamUri = event.pageUrl,
        pageUrl = event.pageUrl,
        posterUrl = event.posterUrl,
        isLive = nowMs in event.startMs..event.endMs,
        startsAt = event.startMs / 1000,
        endsAt = event.endMs / 1000,
    )

    /** The `[...]` after `EVENTS_DATA =`, matched by bracket depth outside string literals. */
    private fun eventsArray(html: String): String? {
        val start = EVENTS_START.find(html)?.let { it.range.last } ?: return null
        var depth = 0
        var quote: Char? = null
        var i = start
        while (i < html.length) {
            val c = html[i]
            if (quote != null) {
                if (c == '\\') i++ else if (c == quote) quote = null
            } else when (c) {
                '"', '\'' -> quote = c
                '[' -> depth++
                ']' -> if (--depth == 0) return html.substring(start, i + 1)
            }
            i++
        }
        return null
    }

    /** ISO UTC times like `2026-10-29T00:00:00Z` (minSdk 21 has no java.time). */
    private fun parseInstant(raw: String): Long? = runCatching {
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC"); isLenient = false }
            .parse(raw.trim().replace(Regex("""\.\d+Z$"""), "Z"))!!.time
    }.getOrNull()

    private fun resolve(base: String, ref: String): String =
        runCatching { URI(base).resolve(ref).toString() }.getOrDefault(ref)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew :app:testDebugUnitTest --tests "dev.kpv.app.sites.EventPagesParserTest"`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/dev/kpv/app/sites/EventPagesParser.kt app/src/test/java/dev/kpv/app/sites/EventPagesParserTest.kt
git commit -m "Sites: event-pages parser for events, feeds and catalog"
```

---

### Task 3: Match finder

**Files:**
- Create: `app/src/main/java/dev/kpv/app/sites/MatchFinder.kt`
- Test: `app/src/test/java/dev/kpv/app/sites/MatchFinderTest.kt`

**Interfaces:**
- Produces: `data class SiteEvent(val title: String, val startsAtSec: Long, val ref: String)`; `sealed interface MatchResult { data class Match(val event: SiteEvent); data class Unsure(val candidates: List<SiteEvent>); data object None }`; `object MatchFinder { fun find(target: SiteEvent, candidates: List<SiteEvent>): MatchResult }`. `ref` is the catalog key used to play the event (event-pages: page URL; API: `streamUri`).

- [ ] **Step 1: Write the failing test**

```kotlin
package dev.kpv.app.sites

import org.junit.Assert.assertEquals
import org.junit.Test

class MatchFinderTest {
    private val t0 = 1_792_890_000L
    private fun ev(title: String, start: Long = t0, ref: String = title) = SiteEvent(title, start, ref)

    @Test fun matchesShortTeamNames() {
        val hit = ev("Hawks vs Heat")
        assertEquals(MatchResult.Match(hit), MatchFinder.find(ev("Atlanta Hawks vs Miami Heat"), listOf(ev("Bulls vs Knicks"), hit)))
    }

    @Test fun matchesSwappedSidesAndOtherSeparators() {
        val hit = ev("Man City v Brighton")
        assertEquals(MatchResult.Match(hit), MatchFinder.find(ev("Brighton & Hove Albion @ Manchester City"), listOf(hit)))
    }

    @Test fun startTimesTooFarApartDoNotMatch() {
        val later = ev("Hawks vs Heat", start = t0 + 4 * 3600)
        assertEquals(MatchResult.Unsure(listOf(later)), MatchFinder.find(ev("Atlanta Hawks vs Miami Heat"), listOf(later)))
    }

    @Test fun unknownStartTimeStillMatches() {
        val hit = ev("Hawks vs Heat", start = 0)
        assertEquals(MatchResult.Match(hit), MatchFinder.find(ev("Atlanta Hawks vs Miami Heat"), listOf(hit)))
    }

    @Test fun oneSideOnlyIsUnsure() {
        val half = ev("Hawks vs Celtics")
        assertEquals(MatchResult.Unsure(listOf(half)), MatchFinder.find(ev("Atlanta Hawks vs Miami Heat"), listOf(half)))
    }

    @Test fun twoQualifiersAreUnsure() {
        val a = ev("Hawks vs Heat", ref = "a")
        val b = ev("Hawks vs Heat (Spanish)", ref = "b")
        assertEquals(MatchResult.Unsure(listOf(a, b)), MatchFinder.find(ev("Atlanta Hawks vs Miami Heat"), listOf(a, b)))
    }

    @Test fun singleSidedTitleNeverAutoMatches() {
        val channel = ev("Fox Footy")
        assertEquals(MatchResult.Unsure(listOf(channel)), MatchFinder.find(ev("Fox Footy"), listOf(channel)))
    }

    @Test fun noCandidatesIsNone() {
        assertEquals(MatchResult.None, MatchFinder.find(ev("Atlanta Hawks vs Miami Heat"), emptyList()))
    }

    @Test fun nothingRelatedIsUnsureWithAllCandidates() {
        val other = ev("Bulls vs Knicks")
        assertEquals(MatchResult.Unsure(listOf(other)), MatchFinder.find(ev("Atlanta Hawks vs Miami Heat"), listOf(other)))
    }
}
```

`Unsure` carries candidates in this order: one-side matches first, then the rest, each group in input order; the dialog shows them that way.

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :app:testDebugUnitTest --tests "dev.kpv.app.sites.MatchFinderTest"`
Expected: FAIL, unresolved reference `MatchFinder`.

- [ ] **Step 3: Write minimal implementation**

```kotlin
package dev.kpv.app.sites

import kotlin.math.abs

data class SiteEvent(val title: String, val startsAtSec: Long, val ref: String)

sealed interface MatchResult {
    data class Match(val event: SiteEvent) : MatchResult
    data class Unsure(val candidates: List<SiteEvent>) : MatchResult
    data object None : MatchResult
}

/** Finds the same match on another site by team names on both sides and start time. */
object MatchFinder {

    private const val TIME_WINDOW_SEC = 3 * 3600L
    private val SEPARATORS = Regex("""\s+(?:vs\.?|v|@|-)\s+""", RegexOption.IGNORE_CASE)
    private val FILLER = setOf("fc", "cf", "sc", "afc", "the", "club", "and")

    fun find(target: SiteEvent, candidates: List<SiteEvent>): MatchResult {
        if (candidates.isEmpty()) return MatchResult.None
        val sides = sides(target.title) ?: return MatchResult.Unsure(candidates)
        val scored = candidates.map { it to score(sides, it) }
        val full = scored.filter { (event, s) -> s == 2 && timesClose(target, event) }.map { it.first }
        if (full.size == 1) return MatchResult.Match(full[0])
        val partial = scored.filter { it.second >= 1 }.map { it.first }
        return MatchResult.Unsure(partial + candidates.filter { it !in partial })
    }

    private fun score(target: Pair<Set<String>, Set<String>>, candidate: SiteEvent): Int {
        val other = sides(candidate.title) ?: return 0
        val straight = overlap(target.first, other.first) + overlap(target.second, other.second)
        val swapped = overlap(target.first, other.second) + overlap(target.second, other.first)
        return maxOf(straight, swapped)
    }

    private fun overlap(a: Set<String>, b: Set<String>): Int = if (a.any { it in b }) 1 else 0

    private fun timesClose(a: SiteEvent, b: SiteEvent): Boolean =
        a.startsAtSec <= 0 || b.startsAtSec <= 0 || abs(a.startsAtSec - b.startsAtSec) <= TIME_WINDOW_SEC

    private fun sides(title: String): Pair<Set<String>, Set<String>>? {
        val parts = title.split(SEPARATORS)
        if (parts.size != 2) return null
        val left = words(parts[0])
        val right = words(parts[1])
        return if (left.isEmpty() || right.isEmpty()) null else left to right
    }

    private fun words(side: String): Set<String> =
        side.lowercase()
            .replace(Regex("""\(.*?\)|\[.*?]"""), " ")
            .split(Regex("""[^a-z0-9]+"""))
            .filter { it.length >= 3 && it !in FILLER }
            .toSet()
}
```

Note: "Man City" ↔ "Manchester City" matches on `city`; "Brighton & Hove Albion" ↔ "Brighton" on `brighton`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew :app:testDebugUnitTest --tests "dev.kpv.app.sites.MatchFinderTest"`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/dev/kpv/app/sites/MatchFinder.kt app/src/test/java/dev/kpv/app/sites/MatchFinderTest.kt
git commit -m "Sites: match finder for the same event across sites"
```

---

### Task 4: Site list storage and per-site SiteConfig

**Files:**
- Create: `app/src/main/java/dev/kpv/app/sites/SiteList.kt`
- Modify: `app/src/main/java/dev/kpv/app/SiteConfig.kt`, `app/src/main/java/dev/kpv/app/ApiCatalogFetcher.kt`, `app/src/main/java/dev/kpv/app/SiteHttp.kt`, `app/src/main/java/dev/kpv/app/StreamResolver.kt`, `app/src/main/java/dev/kpv/app/KpvApp.kt`
- Delete: `app/src/androidTest/java/dev/kpv/app/SettingsActivityTest.kt` (tests the removed single-address field; list logic is covered by `SiteListCodecTest`)

**Interfaces:**
- Consumes: `SiteEntry`, `SiteKind`, `SiteListCodec` (Task 1).
- Produces:
  - `object SiteList { fun init(context: Context); fun all(): List<SiteEntry>; fun top(): SiteEntry?; fun save(list: List<SiteEntry>) }`. `save` also calls `SiteConfig.reload()`.
  - `SiteConfig.siteUrl()` = `SiteList.top()?.origin.orEmpty()` (the old `saveSite` is removed).
  - `SiteConfig.apiCandidatesFor(origin: String): List<String>`; `apiCandidates()` = `apiCandidatesFor(siteUrl())` plus the remembered API first.
  - `SiteConfig.refererFor(url: String): String` — homepage of the listed site whose host matches `url`, else `siteReferer`.
  - `SiteConfig.isAllowedHost` also accepts hosts of every listed site.
  - `ApiCatalogFetcher.fetch(origin: String = SiteConfig.siteUrl()): List<StreamCategory>?` — remembers the API only when `origin` is the top site.
  - `SiteHttp.openJsonGet(url: String, referer: String = SiteConfig.siteReferer)` and new `SiteHttp.openTextGet(url: String, referer: String): String?` (HTML, `Accept: text/html`).

- [ ] **Step 1: Write `SiteList`**

```kotlin
package dev.kpv.app.sites

import android.content.Context
import dev.kpv.app.SiteConfig

/** The user's ordered sites; the first one feeds the home screen. */
object SiteList {
    private const val PREFS = "kpv_site_config"
    private const val KEY_SITES = "sites"
    private const val KEY_LEGACY_SITE = "site_origin"

    private lateinit var appContext: Context
    @Volatile private var cached: List<SiteEntry> = emptyList()

    fun init(context: Context) {
        appContext = context.applicationContext
        val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        cached = SiteListCodec.decode(prefs.getString(KEY_SITES, null))
        if (cached.isEmpty()) {
            val legacy = SiteListCodec.normalize(prefs.getString(KEY_LEGACY_SITE, null).orEmpty())
            if (legacy.isNotEmpty()) {
                cached = listOf(SiteEntry(legacy, SiteKind.API))
                prefs.edit().putString(KEY_SITES, SiteListCodec.encode(cached)).remove(KEY_LEGACY_SITE).apply()
            }
        }
    }

    fun all(): List<SiteEntry> = cached

    fun top(): SiteEntry? = cached.firstOrNull()

    fun save(list: List<SiteEntry>) {
        cached = list
        appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_SITES, SiteListCodec.encode(list))
            .apply()
        SiteConfig.reload()
    }
}
```

- [ ] **Step 2: Rework `SiteConfig` to read the top site**

In `SiteConfig.kt`:
- Remove `KEY_SITE`, `saveSite`, and the `site.config.properties` fallback in `load()` (sites now come only from the in-app list; the asset stays unused and is deleted: `app/src/main/assets/site.config.properties`).
- `load()` becomes:

```kotlin
private fun load() {
    val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val top = SiteList.top()
    val newSite = top?.origin.orEmpty()
    if (newSite != cachedSite) prefs.edit().remove(KEY_API).apply()
    cachedSite = newSite
    resolvedApi = if (top?.kind == SiteKind.API) normalizeOrigin(prefs.getString(KEY_API, null).orEmpty()) else ""
    clearResolvedEndpoints(keepApi = resolvedApi.isNotEmpty())
}
```

- Replace `apiCandidates()` with:

```kotlin
fun apiCandidatesFor(origin: String): List<String> {
    val site = normalizeOrigin(origin)
    if (site.isEmpty()) return emptyList()
    val uri = Uri.parse(site)
    val scheme = uri.scheme ?: "https"
    val host = uri.host ?: return listOf(site)
    val out = linkedSetOf<String>()
    if (!host.startsWith("api.")) out += "$scheme://api.$host"
    out += site
    return out.toList()
}

fun apiCandidates(): List<String> =
    (listOfNotNull(resolvedApi.takeIf { it.isNotEmpty() }) + apiCandidatesFor(cachedSite)).distinct()

fun refererFor(url: String): String {
    val host = Uri.parse(url).host ?: return siteReferer
    val site = SiteList.all().firstOrNull { entry ->
        val siteHost = Uri.parse(entry.origin).host ?: return@firstOrNull false
        host == siteHost || host.endsWith(".$siteHost")
    }
    return site?.let { "${it.origin}/" } ?: siteReferer
}
```

- `origins()` becomes `(listOf(cachedSite, resolvedApi, resolvedEmbed) + SiteList.all().map { it.origin }).filter { it.isNotEmpty() }.distinct()`.
- Add imports `dev.kpv.app.sites.SiteKind`, `dev.kpv.app.sites.SiteList`; drop `java.util.Properties` and the `Properties.opt` helper.

In `KpvApp.kt`, call `SiteList.init(this)` before `SiteConfig.init(this)`.

- [ ] **Step 3: Origin-aware HTTP and API fetch**

`SiteHttp.kt`:

```kotlin
fun openJsonGet(url: String, referer: String = SiteConfig.siteReferer): String? =
    get(url, referer, "application/json")

fun openTextGet(url: String, referer: String): String? = get(url, referer, "text/html,*/*")

private fun get(url: String, referer: String, accept: String): String? = runCatching {
    val connection = URL(url).openConnection() as HttpURLConnection
    connection.connectTimeout = 12_000
    connection.readTimeout = 20_000
    connection.setRequestProperty("Accept", accept)
    connection.setRequestProperty("Referer", referer)
    connection.setRequestProperty("Origin", referer.trimEnd('/'))
    connection.setRequestProperty("User-Agent", USER_AGENT)
    try {
        if (connection.responseCode !in 200..299) return@runCatching null
        connection.inputStream.bufferedReader().use { it.readText() }
    } finally {
        connection.disconnect()
    }
}.getOrNull()
```

`ApiCatalogFetcher.fetch`:

```kotlin
fun fetch(origin: String = SiteConfig.siteUrl()): List<StreamCategory>? {
    val isTop = origin == SiteConfig.siteUrl()
    if (isTop) SiteConfig.beginCatalogFetch()
    val candidates = if (isTop) SiteConfig.apiCandidates() else SiteConfig.apiCandidatesFor(origin)
    for (apiBase in candidates) {
        val body = SiteHttp.openJsonGet(SiteConfig.streamsApiUrl(apiBase), referer = "$origin/") ?: continue
        val categories = runCatching { parse(body, origin) }.getOrNull() ?: continue
        if (isTop) SiteConfig.rememberApi(apiBase)
        return categories
    }
    return null
}
```

`parse(body, origin)` sets `pageUrl = "$origin/live/$uri"` instead of `SiteConfig.livePageUrl(uri)`; everything else unchanged.

`StreamResolver.loadEmbed`: replace `mapOf("Referer" to SiteConfig.siteReferer)` with `mapOf("Referer" to SiteConfig.refererFor(embedUrl))`.

- [ ] **Step 4: Temporarily keep Settings compiling**

In `SettingsActivity.saveSiteAndFinish`, replace `SiteConfig.saveSite(s)` with
`SiteList.save(SiteListCodec.add(SiteList.all(), SiteEntry(SiteListCodec.normalize(s), SiteKind.API)))` and `site.setText(SiteConfig.siteUrl())` stays. (Task 6 replaces this screen.) Delete `SettingsActivityTest.kt`.

- [ ] **Step 5: Build and test**

Run: `./gradlew :app:assembleDebug :app:testDebugUnitTest`
Expected: BUILD SUCCESSFUL, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A app/src
git commit -m "Sites: ordered site list storage; SiteConfig reads the top site"
```

---

### Task 5: Adapters, detection, and playing event-pages matches

**Files:**
- Create: `app/src/main/java/dev/kpv/app/sites/SiteAdapters.kt`, `app/src/main/java/dev/kpv/app/sites/SiteKindDetector.kt`
- Modify: `app/src/main/java/dev/kpv/app/ChannelListing.kt`, `app/src/main/java/dev/kpv/app/sites/EventPagesParser.kt`, `app/src/main/java/dev/kpv/app/CatalogLoader.kt`, `app/src/main/java/dev/kpv/app/MainActivity.kt`
- Test: `app/src/test/java/dev/kpv/app/sites/SiteKindDetectorTest.kt`

**Interfaces:**
- Consumes: `SiteList`, `EventPagesParser`, `ApiCatalogFetcher.fetch(origin)`, `SiteHttp.openTextGet`, `SiteEvent`.
- Produces:
  - `ChannelListing.sourcesPage: String = ""` (non-empty: load sources from this page before playing) and `ChannelListing.siteIndex: Int = 0`.
  - `object SiteAdapters { fun catalog(entry: SiteEntry): List<StreamCategory>?; fun events(entry: SiteEntry): List<Pair<SiteEvent, ChannelListing>>?; fun withSources(channel: ChannelListing): ChannelListing? }` — all blocking, call off the main thread. `withSources` returns the channel unchanged when `sourcesPage` is empty; otherwise fetches the page, sets `sources` (2+) or `playerIframeUrl` (exactly 1), and returns null when there are none.
  - `data class Probe(val kind: SiteKind, val listed: Int, val hasSources: Boolean)`; `object SiteKindDetector { fun choose(probes: List<Probe>): SiteKind?; fun detect(origin: String): SiteKind? }`.

- [ ] **Step 1: Write the failing detector test**

```kotlin
package dev.kpv.app.sites

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SiteKindDetectorTest {
    @Test fun nothingParsedIsNull() {
        assertNull(SiteKindDetector.choose(listOf(Probe(SiteKind.API, 0, false), Probe(SiteKind.EVENT_PAGES, 0, false))))
    }

    @Test fun sourcesBeatMoreEvents() {
        val probes = listOf(Probe(SiteKind.API, 40, false), Probe(SiteKind.EVENT_PAGES, 5, true))
        assertEquals(SiteKind.EVENT_PAGES, SiteKindDetector.choose(probes))
    }

    @Test fun moreEventsWinWhenBothHaveSources() {
        val probes = listOf(Probe(SiteKind.API, 3, true), Probe(SiteKind.EVENT_PAGES, 12, true))
        assertEquals(SiteKind.EVENT_PAGES, SiteKindDetector.choose(probes))
    }

    @Test fun tieGoesToApi() {
        val probes = listOf(Probe(SiteKind.EVENT_PAGES, 4, true), Probe(SiteKind.API, 4, true))
        assertEquals(SiteKind.API, SiteKindDetector.choose(probes))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :app:testDebugUnitTest --tests "dev.kpv.app.sites.SiteKindDetectorTest"`
Expected: FAIL, unresolved reference `SiteKindDetector`.

- [ ] **Step 3: Add the channel fields and adapters**

`ChannelListing.kt`, add after `sources`:

```kotlin
    /** Event page to read the sources from just before playing; empty when [sources] is complete. */
    val sourcesPage: String = "",
    /** Position in the site list of the site this came from. */
    val siteIndex: Int = 0,
```

`EventPagesParser.toListing` adds `sourcesPage = event.pageUrl`.

`SiteAdapters.kt`:

```kotlin
package dev.kpv.app.sites

import dev.kpv.app.ApiCatalogFetcher
import dev.kpv.app.ChannelListing
import dev.kpv.app.SiteHttp
import dev.kpv.app.StreamCategory

/** Reads a site with the parser chosen for it. Blocking; call off the main thread. */
object SiteAdapters {

    fun catalog(entry: SiteEntry): List<StreamCategory>? = when (entry.kind) {
        SiteKind.API -> ApiCatalogFetcher.fetch(entry.origin)
        SiteKind.EVENT_PAGES -> {
            val html = SiteHttp.openTextGet("${entry.origin}/", "${entry.origin}/")
            html?.let { EventPagesParser.toCatalog(EventPagesParser.parseEvents(it, entry.origin), System.currentTimeMillis()) }
                ?.takeIf { it.isNotEmpty() }
        }
    }

    fun events(entry: SiteEntry): List<Pair<SiteEvent, ChannelListing>>? {
        val index = SiteList.all().indexOf(entry).coerceAtLeast(0)
        val channels = catalog(entry)?.flatMap { it.channels } ?: return null
        return channels.distinctBy { it.streamUri }.map { channel ->
            SiteEvent(channel.title, channel.startsAt, channel.streamUri) to channel.copy(siteIndex = index)
        }
    }

    fun withSources(channel: ChannelListing): ChannelListing? {
        if (channel.sourcesPage.isEmpty()) return channel
        val origin = SiteList.all().getOrNull(channel.siteIndex)?.origin ?: return null
        val html = SiteHttp.openTextGet(channel.sourcesPage, "$origin/") ?: return null
        val sources = EventPagesParser.parseSources(html, channel.sourcesPage)
        return when {
            sources.isEmpty() -> null
            sources.size == 1 -> channel.copy(playerIframeUrl = sources[0].iframeUrl, sources = emptyList(), sourcesPage = "")
            else -> channel.copy(playerIframeUrl = sources[0].iframeUrl, sources = sources, sourcesPage = "")
        }
    }
}
```

- [ ] **Step 4: Write the detector**

```kotlin
package dev.kpv.app.sites

import dev.kpv.app.ApiCatalogFetcher
import dev.kpv.app.SiteHttp

data class Probe(val kind: SiteKind, val listed: Int, val hasSources: Boolean)

/** Tries every parser on a site and picks the one that reads it best. */
object SiteKindDetector {

    private const val SOURCES_BONUS = 1_000

    fun choose(probes: List<Probe>): SiteKind? {
        val best = probes
            .map { it to score(it) }
            .filter { it.second > 0 }
            .sortedWith(compareByDescending<Pair<Probe, Int>> { it.second }.thenBy { it.first.kind.ordinal })
            .firstOrNull()
        return best?.first?.kind
    }

    /** Blocking; call off the main thread. */
    fun detect(origin: String): SiteKind? = choose(listOf(probeApi(origin), probeEventPages(origin)))

    private fun score(probe: Probe): Int =
        if (probe.listed == 0) 0 else probe.listed + if (probe.hasSources) SOURCES_BONUS else 0

    private fun probeApi(origin: String): Probe {
        val channels = runCatching { ApiCatalogFetcher.fetch(origin) }.getOrNull()?.flatMap { it.channels }.orEmpty()
        val hasSources = channels.any { it.playerIframeUrl.startsWith("http") || it.sources.isNotEmpty() }
        return Probe(SiteKind.API, channels.size, hasSources)
    }

    private fun probeEventPages(origin: String): Probe {
        val html = SiteHttp.openTextGet("$origin/", "$origin/") ?: return Probe(SiteKind.EVENT_PAGES, 0, false)
        val now = System.currentTimeMillis()
        val listed = EventPagesParser.parseEvents(html, origin).filter { EventPagesParser.isListed(it, now) }
        val sample = listed.minByOrNull { if (now in it.startMs..it.endMs) 0 else 1 }
        val hasSources = sample?.let { event ->
            SiteHttp.openTextGet(event.pageUrl, "$origin/")?.let { EventPagesParser.parseSources(it, event.pageUrl).isNotEmpty() }
        } == true
        return Probe(SiteKind.EVENT_PAGES, listed.size, hasSources)
    }
}
```

`SiteKind` declares `API` first, so `thenBy { ordinal }` makes ties go to API.

- [ ] **Step 5: Run detector test**

Run: `./gradlew :app:testDebugUnitTest --tests "dev.kpv.app.sites.SiteKindDetectorTest"`
Expected: PASS (4 tests).

- [ ] **Step 6: Home screen catalog from the top site's parser**

In `CatalogLoader.start()`, replace `ApiCatalogFetcher.fetch()` with:

```kotlin
val top = SiteList.top()
val categories = top?.let { SiteAdapters.catalog(it) }
```

and only start the homepage scrape fallback (`homepageKick` and the `else if (homepageLoader == null)` branch) when `top?.kind == SiteKind.API`; for event-pages sites a null result finishes with null.

- [ ] **Step 7: Load sources at play time in `MainActivity`**

Rename the existing private `playChannel(channel, sourceIndex, tried)` to `resolveChannel(...)` (body unchanged, recursive call renamed). Add:

```kotlin
private fun playChannel(channel: ChannelListing) {
    if (resolver != null) return
    if (channel.sourcesPage.isEmpty()) {
        resolveChannel(channel, sourceIndex = 0, tried = emptySet())
        return
    }
    catalogView.setLoadingStream(channel.streamUri)
    catalogView.isEnabled = false
    Thread {
        val ready = SiteAdapters.withSources(channel)
        runOnUiThread {
            if (isFinishing) return@runOnUiThread
            catalogView.setLoadingStream(null)
            catalogView.isEnabled = true
            if (ready == null) {
                showFailure(channel, "Couldn't find a stream for ${channel.title}.")
            } else {
                resolveChannel(ready, sourceIndex = 0, tried = emptySet())
            }
        }
    }.start()
}
```

`showFailure` is added in Task 7; in this task define it minimally:

```kotlin
private fun showFailure(channel: ChannelListing, message: String) {
    selected = channel
    status.visibility = View.VISIBLE
    status.text = message
}
```

and use it for the two existing failure messages in `resolveChannel` ("Couldn't start …") and `onActivityResult` ("… stopped. Pick another stream.").

`castItem(channel)` also passes `siteIndex = channel.siteIndex` and `startsAt = channel.startsAt` once Task 8 adds those fields to `CastPlayback.Item`.

- [ ] **Step 8: Build, test, commit**

Run: `./gradlew :app:assembleDebug :app:testDebugUnitTest`
Expected: BUILD SUCCESSFUL, all tests pass.

```bash
git add -A app/src
git commit -m "Sites: per-kind adapters, best-parser detection, play event-pages matches"
```

---

### Task 6: Settings site list editor

**Files:**
- Modify: `app/src/main/res/layout/activity_settings.xml`, `app/src/main/java/dev/kpv/app/SettingsActivity.kt`, `app/src/main/res/values/strings.xml`

**Interfaces:**
- Consumes: `SiteList.all()/save()`, `SiteListCodec.add/remove/move/normalize`, `SiteKindDetector.detect(origin)`.
- Produces: `RESULT_OK` from Settings whenever the top site changed (MainActivity already reloads on it).

- [ ] **Step 1: Strings**

Add to `strings.xml` (and change `settings_title` to "Sites"):

```xml
<string name="sites_hint">KPV shows the first site\'s channels. Lower sites are used by Try other sites.</string>
<string name="site_add">Add site</string>
<string name="site_checking">Checking %1$s…</string>
<string name="site_unrecognised">%1$s isn\'t a site KPV can read.</string>
<string name="site_added">Added %1$s (%2$s)</string>
<string name="site_recheck">Re-check</string>
<string name="site_remove">Remove</string>
<string name="site_last">Keep at least one site.</string>
<string name="site_kind_api">API</string>
<string name="site_kind_event_pages">Event pages</string>
```

- [ ] **Step 2: Layout**

In `activity_settings.xml`, replace the `site_origin` label, the `EditText` and the `save` button with:

```xml
<TextView
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:paddingBottom="12dp"
    android:text="@string/sites_hint"
    android:textColor="@color/kpv_text_secondary"
    android:textSize="14sp" />

<LinearLayout
    android:id="@+id/site_list"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="vertical" />

<EditText
    android:id="@+id/site_origin"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="16dp"
    android:autofillHints=""
    android:hint="@string/hint_site"
    android:imeOptions="actionDone|flagNoEnterAction|flagNoFullscreen"
    android:importantForAutofill="no"
    android:inputType="textUri|textNoSuggestions"
    android:maxLines="1"
    android:singleLine="true"
    android:textColor="@color/kpv_text_primary"
    android:textColorHint="@color/kpv_text_secondary" />

<Button
    android:id="@+id/add_site"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="8dp"
    android:text="@string/site_add" />
```

Remove the now-unused `site_origin` label string only if nothing else references it (`rg "string/site_origin|R.string.site_origin"`).

- [ ] **Step 3: SettingsActivity**

Replace the site-field code in `onCreate` (from `val site = findViewById<EditText>(R.id.site_origin)` through the `save` click listener) with `bindSites()` and delete `saveSiteAndFinish`. Add:

```kotlin
private val startTopEntry = SiteList.top()
private var checking = false

private fun bindSites() {
    val input = findViewById<EditText>(R.id.site_origin)
    val add = findViewById<Button>(R.id.add_site)
    add.setOnClickListener { addSite(input.text.toString()) }
    input.setOnEditorActionListener { _, actionId, event ->
        val done = (actionId and EditorInfo.IME_MASK_ACTION) in
            setOf(EditorInfo.IME_ACTION_DONE, EditorInfo.IME_ACTION_GO, EditorInfo.IME_ACTION_SEND)
        val enter = event?.keyCode == KeyEvent.KEYCODE_ENTER && event.action == KeyEvent.ACTION_DOWN
        if (done || enter) { addSite(input.text.toString()); true } else false
    }
    renderSites()
}

private fun renderSites() {
    val list = findViewById<LinearLayout>(R.id.site_list)
    list.removeAllViews()
    SiteList.all().forEachIndexed { index, entry ->
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(8), 0, dp(4))
        }
        val label = TextView(this).apply {
            text = "${index + 1}. ${entry.origin}\n${kindLabel(entry.kind)}"
            setTextColor(ContextCompat.getColor(this@SettingsActivity, R.color.kpv_text_primary))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        }
        row.addView(label, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        row.addView(smallButton("▲") { update(SiteListCodec.move(SiteList.all(), index, -1)) })
        row.addView(smallButton("▼") { update(SiteListCodec.move(SiteList.all(), index, 1)) })
        row.addView(smallButton(getString(R.string.site_recheck)) { detectAndSave(entry.origin) })
        row.addView(smallButton(getString(R.string.site_remove)) {
            if (SiteList.all().size <= 1) {
                Toast.makeText(this, R.string.site_last, Toast.LENGTH_SHORT).show()
            } else {
                update(SiteListCodec.remove(SiteList.all(), index))
            }
        })
        list.addView(row)
    }
}

private fun addSite(raw: String) {
    val origin = SiteListCodec.normalize(raw)
    if (origin.isEmpty()) {
        Toast.makeText(this, R.string.settings_site_required, Toast.LENGTH_SHORT).show()
        return
    }
    getSystemService(InputMethodManager::class.java)
        ?.hideSoftInputFromWindow(findViewById<EditText>(R.id.site_origin).windowToken, 0)
    detectAndSave(origin)
}

private fun detectAndSave(origin: String) {
    if (checking) return
    checking = true
    Toast.makeText(this, getString(R.string.site_checking, origin), Toast.LENGTH_SHORT).show()
    Thread {
        val kind = SiteKindDetector.detect(origin)
        runOnUiThread {
            checking = false
            if (isFinishing) return@runOnUiThread
            if (kind == null) {
                Toast.makeText(this, getString(R.string.site_unrecognised, origin), Toast.LENGTH_LONG).show()
                return@runOnUiThread
            }
            update(SiteListCodec.add(SiteList.all(), SiteEntry(origin, kind)))
            findViewById<EditText>(R.id.site_origin).setText("")
            Toast.makeText(this, getString(R.string.site_added, origin, kindLabel(kind)), Toast.LENGTH_SHORT).show()
        }
    }.start()
}

private fun update(list: List<SiteEntry>) {
    if (list == SiteList.all()) return
    SiteList.save(list)
    // A re-check can change the top site's parser without changing its address.
    setResult(if (SiteList.top() != startTopEntry) RESULT_OK else RESULT_CANCELED)
    renderSites()
}

private fun kindLabel(kind: SiteKind) = getString(
    when (kind) {
        SiteKind.API -> R.string.site_kind_api
        SiteKind.EVENT_PAGES -> R.string.site_kind_event_pages
    },
)

private fun smallButton(label: String, onClick: () -> Unit) = Button(this).apply {
    text = label
    minWidth = dp(56)
    setOnClickListener { onClick() }
}

private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
```

Imports: `android.util.TypedValue`, `android.view.Gravity`, `android.view.ViewGroup`, `android.widget.LinearLayout`, `androidx.core.content.ContextCompat`, `dev.kpv.app.sites.*`.

- [ ] **Step 4: Build and test**

Run: `./gradlew :app:assembleDebug :app:testDebugUnitTest`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: Device check: detection and event-pages playback (main risk)**

Build via CI and install on the phone:

```bash
git push origin site-list
gh workflow run release-kpv.yml --ref site-list
gh run list --workflow release-kpv.yml --limit 1   # note the run id
gh run watch <id> --exit-status
gh run download <id> -n kpv-release-assets -D %TEMP%\kpvci
adb -s R5CYA1Q4PSL install -r %TEMP%\kpvci\app\build\outputs\apk\debug\app-debug.apk
```

On the phone (user types the addresses): confirm the existing site migrated as entry 1 "API"; add the event site and confirm it is labelled "Event pages"; move it to the top; confirm the home screen lists its matches; play a live match and confirm it plays (logcat `adb logcat -d | findstr /i "m3u8 KpvCast"`). If the embed never yields a playlist, stop and report before Task 7.

- [ ] **Step 6: Commit**

```bash
git add -A app/src
git commit -m "Settings: ordered site list with best-parser detection"
```

---

### Task 7: Try other sites (home screen)

**Files:**
- Create: `app/src/main/java/dev/kpv/app/OtherSitesFallback.kt`
- Modify: `app/src/main/java/dev/kpv/app/MainActivity.kt`, `app/src/main/res/values/strings.xml`

**Interfaces:**
- Consumes: `SiteList`, `SiteAdapters.events/withSources`, `MatchFinder.find`, `SiteEvent`, `MatchResult`.
- Produces: `class OtherSitesFallback(activity: Activity, target: ChannelListing, onPlay: (ChannelListing) -> Unit, onStatus: (String) -> Unit) { fun start(); fun cancel() }`. `onPlay` receives a channel with sources loaded and `siteIndex` set.

- [ ] **Step 1: Strings**

```xml
<string name="other_sites">Try other sites</string>
<string name="other_sites_searching">Looking on %1$s…</string>
<string name="other_sites_pick">Pick the match on %1$s</string>
<string name="other_sites_next">Next site</string>
<string name="other_sites_none">No other site has this match.</string>
<string name="other_sites_found">Found on %1$s</string>
```

- [ ] **Step 2: OtherSitesFallback**

```kotlin
package dev.kpv.app

import android.app.Activity
import android.net.Uri
import androidx.appcompat.app.AlertDialog
import dev.kpv.app.sites.MatchFinder
import dev.kpv.app.sites.MatchResult
import dev.kpv.app.sites.SiteAdapters
import dev.kpv.app.sites.SiteEvent
import dev.kpv.app.sites.SiteList

/** Looks for [target] on each site below the one it came from, in list order. */
class OtherSitesFallback(
    private val activity: Activity,
    private val target: ChannelListing,
    private val onPlay: (ChannelListing) -> Unit,
    private val onStatus: (String) -> Unit,
) {
    @Volatile private var cancelled = false
    private val sites = SiteList.all()
    private val wanted = SiteEvent(target.title, target.startsAt, target.streamUri)

    fun start() = trySite(target.siteIndex + 1)

    fun cancel() {
        cancelled = true
    }

    private fun trySite(index: Int) {
        if (cancelled) return
        val entry = sites.getOrNull(index)
        if (entry == null) {
            onStatus(activity.getString(R.string.other_sites_none))
            return
        }
        val name = Uri.parse(entry.origin).host ?: entry.origin
        onStatus(activity.getString(R.string.other_sites_searching, name))
        Thread {
            val events = SiteAdapters.events(entry).orEmpty()
            val result = MatchFinder.find(wanted, events.map { it.first })
            activity.runOnUiThread {
                if (cancelled || activity.isFinishing) return@runOnUiThread
                when (result) {
                    MatchResult.None -> trySite(index + 1)
                    is MatchResult.Match -> play(events.first { it.first == result.event }.second, name)
                    is MatchResult.Unsure -> pick(index, name, result.candidates.map { c -> events.first { it.first == c }.second })
                }
            }
        }.start()
    }

    private fun pick(index: Int, name: String, channels: List<ChannelListing>) {
        AlertDialog.Builder(activity)
            .setTitle(activity.getString(R.string.other_sites_pick, name))
            .setItems(channels.map { it.title }.toTypedArray()) { _, which -> play(channels[which], name) }
            .setPositiveButton(R.string.other_sites_next) { _, _ -> trySite(index + 1) }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun play(channel: ChannelListing, name: String) {
        Thread {
            val ready = SiteAdapters.withSources(channel)
            activity.runOnUiThread {
                if (cancelled || activity.isFinishing) return@runOnUiThread
                if (ready == null) {
                    trySite(channel.siteIndex + 1)
                } else {
                    onStatus(activity.getString(R.string.other_sites_found, name))
                    onPlay(ready)
                }
            }
        }.start()
    }
}
```

- [ ] **Step 3: Button on the home screen**

In `MainActivity`:
- Add `private lateinit var otherSitesButton: Button` and `private var otherSites: OtherSitesFallback? = null`.
- Wrap the existing bottom `status` `TextView` in a vertical `LinearLayout` (`statusBar`) added to `root` at `Gravity.BOTTOM` instead of `status`; add `otherSitesButton` under the text:

```kotlin
otherSitesButton = Button(this).apply {
    text = getString(R.string.other_sites)
    visibility = View.GONE
    setOnClickListener { selected?.let { tryOtherSites(it) } }
}
```

- `showFailure` becomes:

```kotlin
private fun showFailure(channel: ChannelListing, message: String) {
    selected = channel
    status.visibility = View.VISIBLE
    status.text = message
    otherSitesButton.visibility =
        if (channel.siteIndex < SiteList.all().lastIndex) View.VISIBLE else View.GONE
}

private fun tryOtherSites(channel: ChannelListing) {
    otherSites?.cancel()
    otherSitesButton.visibility = View.GONE
    otherSites = OtherSitesFallback(
        this,
        channel,
        onPlay = { found -> resolveChannel(found, sourceIndex = 0, tried = emptySet()) },
        onStatus = { text -> status.visibility = View.VISIBLE; status.text = text },
    ).also { it.start() }
}
```

- Hide `otherSitesButton` wherever `status` is hidden after success (`status.visibility = View.GONE` sites in `resolveChannel` and `onActivityResult`), and call `otherSites?.cancel()` in `onDestroy`.

- [ ] **Step 4: Build, test, commit**

Run: `./gradlew :app:assembleDebug :app:testDebugUnitTest`
Expected: BUILD SUCCESSFUL.

```bash
git add -A app/src
git commit -m "Home: Try other sites when every source of a stream fails"
```

---

### Task 8: Try other sites (cast control screen)

**Files:**
- Modify: `app/src/main/java/dev/kpv/app/CastPlayback.kt`, `app/src/main/java/dev/kpv/app/CastControlsActivity.kt`, `app/src/main/java/dev/kpv/app/MainActivity.kt`, `app/src/main/java/dev/kpv/app/PlayerActivity.kt`, `app/src/main/res/values/cast_controls.xml`
- Create: `app/src/main/res/drawable/ic_other_sites.xml`

**Interfaces:**
- Consumes: `OtherSitesFallback`, `ChannelListing`.
- Produces: `CastPlayback.Item` gains `startsAt: Long = 0L` and `siteIndex: Int = 0`; `CastPlayback.gaveUp: Boolean` (true after `GiveUp`, reset by `start`/`selectSource`); `CastPlayback.onChange: (() -> Unit)?` invoked on the main thread when `gaveUp` changes.

- [ ] **Step 1: CastPlayback state**

In `CastPlayback`:

```kotlin
var gaveUp = false
    private set
var onChange: (() -> Unit)? = null
```

Set `gaveUp = false` in `start()` and `selectSource()`, `gaveUp = true` in the `GiveUp` branch of `perform`, then call `onChange?.invoke()` in each place. Add `val startsAt: Long = 0L, val siteIndex: Int = 0` to `Item`. Add:

```kotlin
fun toChannel(item: Item) = ChannelListing(
    title = item.title, tag = "", streamUri = item.streamUri, pageUrl = "", posterUrl = "",
    playerIframeUrl = item.iframeUrl, startsAt = item.startsAt, streamId = item.streamId,
    sources = item.sources, siteIndex = item.siteIndex,
)
```

`MainActivity.castItem` passes `startsAt = channel.startsAt, siteIndex = channel.siteIndex`. `PlayerActivity` carries `siteIndex`/`startsAt` through new extras `EXTRA_SITE_INDEX`/`EXTRA_STARTS_AT` in `intent(...)` and into the `CastPlayback.Item` it builds.

- [ ] **Step 2: Control screen slot**

`cast_controls.xml`: slot 1 changes from `@id/cast_button_type_empty` to `@id/cast_button_type_custom`. Add `ic_other_sites.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M4,4h7v7H4zM13,4h7v7h-7zM4,13h7v7H4zM14,14l4,3.5 -4,3.5z" />
</vector>
```

In `CastControlsActivity`:

```kotlin
private var otherSites: OtherSitesFallback? = null

// onCreate
getButtonImageViewAt(OTHER_SITES_SLOT).apply {
    setImageResource(R.drawable.ic_other_sites)
    contentDescription = getString(R.string.other_sites)
    setOnClickListener { tryOtherSites() }
}

// onResume
CastPlayback.onChange = { updateOtherSites() }
updateOtherSites()

// onPause
CastPlayback.onChange = null
otherSites?.cancel()

private fun updateOtherSites() {
    val item = CastPlayback.item
    val show = CastPlayback.gaveUp && item != null && item.siteIndex < SiteList.all().lastIndex
    getButtonImageViewAt(OTHER_SITES_SLOT).visibility = if (show) View.VISIBLE else View.INVISIBLE
}

private fun tryOtherSites() {
    val item = CastPlayback.item ?: return
    otherSites?.cancel()
    otherSites = OtherSitesFallback(
        this,
        CastPlayback.toChannel(item),
        onPlay = { found -> CastPlayback.play(this, found, resolveHost) },
        onStatus = { text -> Toast.makeText(this, text, Toast.LENGTH_SHORT).show() },
    ).also { it.start() }
}
```

with `OTHER_SITES_SLOT = 1`.

- [ ] **Step 3: `CastPlayback.play` for an unresolved channel**

The found channel isn't resolved yet. Add to `CastPlayback`:

```kotlin
/** Resolves [channel]'s first source in [container] and casts it. */
fun play(activity: Activity, channel: ChannelListing, container: ViewGroup) {
    cancelResolve()
    val source = channel.sources.firstOrNull()
    resolver = StreamResolver(
        activity,
        container,
        source?.streamUri ?: channel.streamUri,
        (source?.iframeUrl ?: channel.playerIframeUrl).takeIf { it.startsWith("http") },
        castMode = true,
    ) { stream ->
        resolver = null
        val item = Item(channel.title, channel.streamId, channel.streamUri, channel.playerIframeUrl,
            channel.sources, channel.startsAt, channel.siteIndex)
        if (stream == null || !start(activity, item, 0, stream)) {
            toast(appContext?.getString(R.string.cast_gave_up, channel.title))
        }
    }.also { it.start() }
}
```

(`appContext` is set in `start`; also set `appContext = activity.applicationContext` at the top of `play`.)

- [ ] **Step 4: Build, test, commit**

Run: `./gradlew :app:assembleDebug :app:testDebugUnitTest`
Expected: BUILD SUCCESSFUL.

```bash
git add -A app/src
git commit -m "Cast: Try other sites on the control screen after every source fails"
```

---

### Task 9: Device verification and release

- [ ] **Step 1: CI build and install** (commands as in Task 6 Step 5).
- [ ] **Step 2: Phone checks**
  - Site list: migrate, add, detect, reorder, re-check, remove (blocked on last site).
  - Home with API site on top: unchanged behaviour; a dead stream shows Try other sites; pressing it finds the match on the event site (auto) or offers a pick list; playing works.
  - Casting: same fallback from the cast control screen after the TV gives up.
- [ ] **Step 3: Confirm no site names in the app:** `rg -i "xyz|streamxyz" app/` returns nothing.
- [ ] **Step 4: Release (after the user is happy):** bump `release/version.json` (`version` 1.0.66, `versionCode` 67, `wgtShellVersion` 1.0.66) and `tizen/package.json` `version` 1.0.66; `node tizen/scripts/embed-shell-version.mjs`; `node scripts/check-release-version.mjs` (expect `Release version OK: 1.0.66 (67)`); `./gradlew :app:assembleDebug :app:testDebugUnitTest`; commit; `git checkout main && git merge --ff-only site-list && git push origin main`; watch the Release KPV run (rerun once if the Tizen network test times out).
