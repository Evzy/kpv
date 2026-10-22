package dev.kpv.app

object CastUpstreamHeaders {
    private val allowed = setOf(
        "referer",
        "user-agent",
        "cookie",
        "origin",
        "accept",
        "accept-language",
    )

    fun forRelay(headers: Map<String, String>): Map<String, String> =
        headers
            .filterKeys { it.lowercase() in allowed }
            .filterValues { it.isNotBlank() }
}
