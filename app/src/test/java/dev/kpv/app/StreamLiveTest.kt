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
    fun premierLeagueFirstThenLive() {
        val sorted =
            StreamLive.sortChannels(
                listOf(
                    ChannelListing("MLS later", "MLS", "a", "", ""),
                    ChannelListing("LaLiga live", "LaLiga", "b", "", "", isLive = true),
                    ChannelListing("EPL later", "Premier League", "c", "", ""),
                    ChannelListing("EPL live", "Premier League", "d", "", "", isLive = true),
                ),
            )
        assertEquals(listOf("EPL live", "EPL later", "LaLiga live", "MLS later"), sorted.map { it.title })
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
