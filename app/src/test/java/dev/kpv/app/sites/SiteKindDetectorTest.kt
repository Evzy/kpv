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
