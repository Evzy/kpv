package dev.kpv.app

data class ChannelListing(
    val title: String,
    val tag: String,
    /** Path segment after `/live/`, e.g. `sample-channel`. */
    val streamUri: String,
    val pageUrl: String,
    val posterUrl: String,
    /** Full iframe URL from the catalog API when present. */
    val playerIframeUrl: String = "",
)
