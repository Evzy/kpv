package dev.kpv.app

import org.junit.Assert.assertEquals
import org.junit.Test

class BrowseItemTest {

    private fun channel(id: String, tag: String = "") = ChannelListing(id, tag, id, "", "")

    private val sports = CategoryLayout.arrange(
        CategoryLayout.group(
            listOf(
                StreamCategory("Football", listOf(channel("a", "EPL"), channel("b", "MLS"), channel("c", "EPL"))),
                StreamCategory("Basketball", listOf(channel("d", "NBA"))),
            ),
        ),
        CategoryLayout.Prefs(),
    )

    private val eplKey = CategoryLayout.leagueKey("Football", "EPL")
    private val mlsKey = CategoryLayout.leagueKey("Football", "MLS")

    @Test
    fun collapsedSportKeepsHeaderButHidesLeagues() {
        val items = flattenForBrowse(sports, television = true, collapsed = setOf("Football"))
        assertEquals(
            listOf(
                BrowseItem.Header("Football", "Football", collapsed = true),
                BrowseItem.Header("Basketball", "Basketball"),
                BrowseItem.Channel(channel("d", "NBA")),
            ),
            items,
        )
    }

    @Test
    fun leaguesGetSubHeadingsAndCanCollapse() {
        val items = flattenForBrowse(sports, television = false, collapsed = setOf(mlsKey))
        assertEquals(
            listOf(
                BrowseItem.Header("Football", "Football"),
                BrowseItem.Header(eplKey, "EPL", level = 1),
                BrowseItem.Row(listOf(channel("a", "EPL"), channel("c", "EPL"))),
                BrowseItem.Header(mlsKey, "MLS", collapsed = true, level = 1),
                BrowseItem.Header("Basketball", "Basketball"),
                BrowseItem.Row(listOf(channel("d", "NBA"))),
            ),
            items,
        )
    }
}
