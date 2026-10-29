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
