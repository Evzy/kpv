package dev.kpv.app

import dev.kpv.app.CategoryLayout.Prefs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class CategoryLayoutTest {
    private fun ch(title: String, tag: String, live: Boolean = false) =
        ChannelListing(title, tag, title, "", "", isLive = live)

    private val catalog = listOf(
        StreamCategory(
            "Football",
            listOf(ch("Liga live", "LaLiga", true), ch("MLS", "MLS"), ch("EPL", "Premier League"), ch("Liga 2", "LaLiga")),
        ),
        StreamCategory("Darts", listOf(ch("Day 2", "Darts"))),
        StreamCategory("Misc", listOf(ch("No tag", ""), ch("Tagged", "Cup"))),
    )
    private val sports = CategoryLayout.group(catalog)

    @Test
    fun groupsLeaguesWithPremierLeagueFirstAndOther() {
        assertEquals(listOf("Football", "Darts", "Misc"), sports.map { it.name })
        assertEquals(listOf("Premier League", "LaLiga", "MLS"), sports[0].leagues.map { it.name })
        assertEquals(listOf("Liga live", "Liga 2"), sports[0].leagues[1].channels.map { it.title })
        assertEquals(listOf("Other", "Cup"), sports[2].leagues.map { it.name })
    }

    @Test
    fun defaultLayoutShowsLeagueHeadingsOnlyForSeveralLeagues() {
        val layout = CategoryLayout.arrange(sports, Prefs())
        assertEquals(listOf(true, false, true), layout.map { it.showLeagues })
    }

    @Test
    fun reorderHideAndEditorRows() {
        var prefs = CategoryLayout.moveSport(sports, Prefs(), "Darts", -1)
        assertEquals(listOf("Darts", "Football", "Misc"), prefs.sportOrder)
        assertSame(prefs, CategoryLayout.moveSport(sports, prefs, "Darts", -1))
        prefs = CategoryLayout.moveLeague(sports, prefs, "Football", "MLS", -1)
        assertEquals(listOf("Premier League", "MLS", "LaLiga"), prefs.leagueOrder["Football"])
        prefs = CategoryLayout.toggleHidden(prefs, CategoryLayout.leagueKey("Football", "Premier League"))
        prefs = CategoryLayout.toggleHidden(prefs, "Misc")

        val layout = CategoryLayout.arrange(sports, prefs)
        assertEquals(listOf("Darts", "Football"), layout.map { it.name })
        assertEquals(listOf("MLS", "LaLiga"), layout[1].leagues.map { it.name })

        val rows = CategoryLayout.editorRows(sports, prefs).map {
            "${it.kind.name.lowercase()}:${it.label}${if (it.hidden) " (hidden)" else ""}"
        }
        assertEquals(
            listOf(
                "sport:Darts",
                "sport:Football",
                "league:Premier League (hidden)",
                "league:MLS",
                "league:LaLiga",
                "sport:Misc (hidden)",
                "league:Other",
                "league:Cup",
            ),
            rows,
        )

        prefs = CategoryLayout.toggleHidden(prefs, "Misc")
        val withNew = CategoryLayout.group(catalog + StreamCategory("Rugby", listOf(ch("A v B", "NRL"))))
        assertEquals(listOf("Darts", "Football", "Misc", "Rugby"), CategoryLayout.arrange(withNew, prefs).map { it.name })

        assertEquals(prefs, CategoryPrefsStore.decode(CategoryPrefsStore.encode(prefs)))
    }

    @Test
    fun everythingHiddenShowsNothing() {
        var prefs = Prefs()
        for (name in listOf("Football", "Darts", "Misc")) prefs = CategoryLayout.toggleHidden(prefs, name)
        assertEquals(0, CategoryLayout.arrange(sports, prefs).size)
    }

    @Test
    fun knownRoundTripAndBadInput() {
        val known = CategoryPrefsStore.decodeKnown(CategoryPrefsStore.encodeKnown(sports))
        assertEquals(listOf("Football", "Darts", "Misc"), known.map { it.name })
        assertEquals(listOf("Premier League", "LaLiga", "MLS"), known[0].leagues.map { it.name })
        assertEquals(Prefs(), CategoryPrefsStore.decode("not json"))
        assertEquals(emptyList<CategoryLayout.Sport>(), CategoryPrefsStore.decodeKnown(null))
    }
}
