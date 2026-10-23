package dev.kpv.app

import org.json.JSONObject

/** Live rules aligned with the catalog `/api/streams` (`always_live`, `starts_at`, `ends_at`, `timestamp`). */
object StreamLive {

    fun isLive(stream: JSONObject, nowSec: Long): Boolean {
        if (stream.optInt("always_live") == 1) return true
        val start = stream.optLong("starts_at", 0L)
        val end = stream.optLong("ends_at", 0L)
        if (start > 0L && end > 0L) return nowSec in start..end
        return false
    }

    fun sortChannels(channels: List<ChannelListing>): List<ChannelListing> {
        val (live, rest) = channels.partition { it.isLive }
        return live + rest
    }

    fun sortCategories(categories: List<StreamCategory>): List<StreamCategory> {
        val mapped =
            categories.map { cat ->
                StreamCategory(cat.name, sortChannels(cat.channels))
            }
        val (withLive, rest) = mapped.partition { cat -> cat.channels.any { it.isLive } }
        return withLive + rest
    }
}
