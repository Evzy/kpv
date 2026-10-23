package dev.kpv.app

import org.junit.Assert.assertEquals
import org.junit.Test

class StreamLiveTest {
    @Test
    fun sortChannelsLiveFirst() {
        val sorted =
            StreamLive.sortChannels(
                listOf(
                    ChannelListing("b", "", "b", "", "", isLive = false),
                    ChannelListing("a", "", "a", "", "", isLive = true),
                ),
            )
        assertEquals(listOf("a", "b"), sorted.map { it.streamUri })
    }

    @Test
    fun sortCategoriesWithLiveFirst() {
        val sorted =
            StreamLive.sortCategories(
                listOf(
                    StreamCategory("cold", listOf(ChannelListing("x", "", "x", "", "", isLive = false))),
                    StreamCategory("hot", listOf(ChannelListing("y", "", "y", "", "", isLive = true))),
                ),
            )
        assertEquals(listOf("hot", "cold"), sorted.map { it.name })
    }
}
