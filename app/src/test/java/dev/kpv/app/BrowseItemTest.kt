package dev.kpv.app

import org.junit.Assert.assertEquals
import org.junit.Test

class BrowseItemTest {

    private fun channel(id: String) = ChannelListing(id, "", id, "", "")

    private val categories = listOf(
        StreamCategory("Football", listOf(channel("a"), channel("b"))),
        StreamCategory("Basketball", listOf(channel("c"))),
    )

    @Test
    fun collapsedCategoryKeepsHeaderButHidesChannels() {
        val items = flattenForBrowse(categories, television = true, collapsed = setOf("Football"))
        assertEquals(
            listOf(
                BrowseItem.Header("Football", collapsed = true),
                BrowseItem.Header("Basketball", collapsed = false),
                BrowseItem.Channel(channel("c")),
            ),
            items,
        )
    }

    @Test
    fun phoneLayoutUsesRowsForExpandedCategories() {
        val items = flattenForBrowse(categories, television = false, collapsed = setOf("Basketball"))
        assertEquals(
            listOf(
                BrowseItem.Header("Football"),
                BrowseItem.Row(listOf(channel("a"), channel("b"))),
                BrowseItem.Header("Basketball", collapsed = true),
            ),
            items,
        )
    }
}
