package dev.kpv.app

data class CachedPlayback(
    val m3u8: String,
    val referer: String,
    val embed: String,
    val cachedAtMs: Long,
)

/** Disabled — stream URLs are cached on Samsung Tizen only, not on the phone. */
object CompanionPlaybackCache {

    fun get(uri: String): CachedPlayback? = null

    @Synchronized
    fun put(uri: String, playback: CachedPlayback) {
        /* no-op */
    }

    @Synchronized
    fun clear(uri: String? = null) {
        /* no-op */
    }

    @Synchronized
    fun snapshot(): Map<String, CachedPlayback> = emptyMap()
}
