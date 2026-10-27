package dev.kpv.app

import dev.kpv.app.CategoryLayout.Prefs
import org.junit.Assert.assertEquals
import org.junit.Test

class LiveNowTest {
    private fun ch(title: String, tag: String, live: Boolean = false, allDay: Boolean = false) =
        ChannelListing(title, tag, title, "", "", isLive = live, alwaysLive = allDay)

    private val sports = CategoryLayout.group(
        listOf(
            StreamCategory(
                "Football",
                listOf(ch("Liga live", "LaLiga", live = true), ch("MLS later", "MLS"), ch("MLS live", "MLS", live = true)),
            ),
            StreamCategory("Basketball", listOf(ch("NBA live", "NBA", live = true))),
            StreamCategory("24/7", listOf(ch("Channel", "24/7 channel", live = true, allDay = true))),
        ),
    )

    private fun live(prefs: Prefs) =
        CategoryLayout.withLiveNow(CategoryLayout.arrange(sports, prefs), prefs)

    @Test
    fun liveNowComesFirstWithLiveEventsInHomeOrder() {
        val layout = live(Prefs())
        assertEquals(CategoryLayout.LIVE_NOW, layout.first().name)
        assertEquals(false, layout.first().showLeagues)
        assertEquals(
            listOf("Liga live", "MLS live", "NBA live"),
            layout.first().leagues.single().channels.map { it.title },
        )
        assertEquals(listOf("Football", "Basketball", "24/7"), layout.drop(1).map { it.name })
    }

    @Test
    fun skipsHiddenSportsAndLeagues() {
        val prefs = Prefs(hidden = listOf("Basketball", CategoryLayout.leagueKey("Football", "LaLiga")))
        assertEquals(listOf("MLS live"), live(prefs).first().leagues.single().channels.map { it.title })
    }

    @Test
    fun followsSportOrder() {
        val prefs = Prefs(sportOrder = listOf("Basketball", "Football", "24/7"))
        assertEquals(
            listOf("NBA live", "Liga live", "MLS live"),
            live(prefs).first().leagues.single().channels.map { it.title },
        )
    }

    @Test
    fun deDuplicatesByStreamUri() {
        val dup = CategoryLayout.group(
            listOf(
                StreamCategory("A", listOf(ch("Same", "X", live = true))),
                StreamCategory("B", listOf(ch("Same", "Y", live = true))),
            ),
        )
        val layout = CategoryLayout.withLiveNow(CategoryLayout.arrange(dup, Prefs()), Prefs())
        assertEquals(1, layout.first().leagues.single().channels.size)
    }

    @Test
    fun absentWhenNothingLiveOrHidden() {
        val quiet = CategoryLayout.group(listOf(StreamCategory("A", listOf(ch("Later", "X")))))
        assertEquals(listOf("A"), CategoryLayout.withLiveNow(CategoryLayout.arrange(quiet, Prefs()), Prefs()).map { it.name })
        val hidden = Prefs(hidden = listOf(CategoryLayout.LIVE_NOW_KEY))
        assertEquals(listOf("Football", "Basketball", "24/7"), live(hidden).map { it.name })
    }

    @Test
    fun editorListsLiveNowFirst() {
        val rows = CategoryLayout.editorRows(sports, Prefs(hidden = listOf(CategoryLayout.LIVE_NOW_KEY)))
        val first = rows.first()
        assertEquals(CategoryLayout.Kind.LIVE_NOW, first.kind)
        assertEquals(CategoryLayout.LIVE_NOW_KEY, first.key)
        assertEquals(true, first.hidden)
    }
}
