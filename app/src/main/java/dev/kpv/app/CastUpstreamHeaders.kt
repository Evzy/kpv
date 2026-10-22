package dev.kpv.app

object CastUpstreamHeaders {
    private val blocked = setOf(
        "host",
        "connection",
        "content-length",
        "content-type",
        "accept-encoding",
        "transfer-encoding",
        "if-none-match",
        "if-modified-since",
    )

    /** Forward browser-like headers captured from the WebView; drop hop-by-hop only. */
    fun forRelay(headers: Map<String, String>): Map<String, String> =
        headers
            .filterKeys { it.lowercase() !in blocked }
            .filterValues { it.isNotBlank() }
}
