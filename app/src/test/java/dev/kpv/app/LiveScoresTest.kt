package dev.kpv.app

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Collections

class LiveScoresTest {
    private val fixture = javaClass.classLoader!!.getResource("espn-scoreboard.json")!!.readText()
    private val events = JSONObject(fixture).getJSONArray("events")

    private fun score(title: String) = LiveScores.scoreFor(title, events)?.let(FixtureLine::scoreLine)

    @Test
    fun matchesTeamsInTitleOrder() {
        assertEquals("NE 0 – 3 CHI · 5:11 - 1st", score("New England Patriots at Chicago Bears"))
        assertEquals("CHI 3 – 0 NE · 5:11 - 1st", score("Chicago Bears vs. New England Patriots"))
    }

    @Test
    fun finishedGameIgnoresAccentsAndShowsFinal() {
        assertEquals("Final · STU 2 – 1 MGL", score("VfB Stuttgart vs. Borussia Mönchengladbach"))
    }

    @Test
    fun noScoreBeforeKickoffOrWhenATeamDoesNotMatch() {
        assertNull(score("Pittsburgh Steelers at New Orleans Saints"))
        assertNull(score("Los Angeles Rams at Chicago Bears"))
    }

    @Test
    fun leaguePaths() {
        assertEquals("soccer/eng.1", LiveScores.leaguePath("Premier League"))
        assertEquals("football/nfl", LiveScores.leaguePath(" nfl "))
        assertEquals("", LiveScores.leaguePath("Darts"))
    }

    @Test
    fun sportTagsCheckEveryLeagueOfThatSport() {
        assertEquals(listOf("baseball/mlb"), LiveScores.leaguePaths("Baseball"))
        assertEquals(listOf("hockey/nhl"), LiveScores.leaguePaths("Hockey"))
        assertTrue("basketball/nba" in LiveScores.leaguePaths("Basketball"))
        assertTrue("soccer/eng.1" in LiveScores.leaguePaths("Soccer"))
        assertEquals(listOf("soccer/eng.1"), LiveScores.leaguePaths("Premier League"))
        assertEquals(emptyList<String>(), LiveScores.leaguePaths("Darts"))
    }

    @Test
    fun sportTaggedEventGetsTheScoreFromWhicheverLeagueHasIt() {
        val now = 1_792_715_910L
        val categories = listOf(
            StreamCategory(
                "Football",
                listOf(ChannelListing("New England Patriots at Chicago Bears", "Football", "e1", "", "", startsAt = now - 1_000L)),
            ),
        )
        val lines = LiveScores.refresh(categories, now) { url -> if ("/football/nfl/" in url) fixture else null }
        assertEquals(mapOf("e1" to "NE 0 – 3 CHI · 5:11 - 1st"), lines)
    }

    @Test
    fun refreshFetchesOncePerLeagueWithStartedTeamEvents() {
        val now = 1_792_715_910L
        val started = now - 1_000L
        fun ch(uri: String, title: String, tag: String, startsAt: Long) =
            ChannelListing(title, tag, uri, "", "", startsAt = startsAt)
        val categories = listOf(
            StreamCategory(
                "Mixed",
                listOf(
                    ch("nfl", "New England Patriots at Chicago Bears", "NFL", started),
                    ch("cfl", "Montreal Alouettes at Toronto Argonauts", "Canadian Football", started),
                    ch("darts", "Darts | Day 2", "Darts", started),
                    ch("later", "San Francisco 49ers at Atlanta Falcons", "NFL", now + 3_600L),
                ),
            ),
        )
        val requested = Collections.synchronizedList(mutableListOf<String>())
        val lines = LiveScores.refresh(categories, now) { url ->
            requested += url
            if ("/football/nfl/" in url) fixture else null
        }
        assertEquals(mapOf("nfl" to "NE 0 – 3 CHI · 5:11 - 1st"), lines)
        assertEquals(
            listOf(
                "https://site.api.espn.com/apis/site/v2/sports/football/cfl/scoreboard?limit=300",
                "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=300",
            ),
            requested.sorted(),
        )
    }
}
