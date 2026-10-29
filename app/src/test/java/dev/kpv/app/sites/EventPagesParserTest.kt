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
        assertEquals("$origin/a.html", catalog[0].channels[0].sourcesPage)
    }
}
