package dev.kpv.app

data class ChannelListing(
    val title: String,
    val tag: String,
    /** Path segment after `/live/`, e.g. `some-channel`. */
    val streamUri: String,
    val pageUrl: String,
    val posterUrl: String,
    /** Full iframe URL from the catalog API when present. */
    val playerIframeUrl: String = "",
    /** On-air now (catalog schedule or always_live). */
    val isLive: Boolean = false,
    /** Unix seconds from the catalog API; 0 when the source has no schedule. */
    val startsAt: Long = 0L,
    val endsAt: Long = 0L,
    val alwaysLive: Boolean = false,
)
