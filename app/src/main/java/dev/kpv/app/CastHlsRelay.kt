package dev.kpv.app

import java.net.URL
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * Rewrites HLS playlists so segment and child-playlist URLs are fetched via the phone relay.
 */
object CastHlsRelay {

    fun masterRelayUrl(lanIp: String, port: Int, token: String): String =
        "http://$lanIp:$port/cast/$token/master.m3u8"

    fun proxyUrl(lanIp: String, port: Int, token: String, upstreamAbsolute: String): String {
        val encoded = URLEncoder.encode(upstreamAbsolute, StandardCharsets.UTF_8)
        return "http://$lanIp:$port/cast/$token/p?u=$encoded"
    }

    fun decodeProxyTarget(query: String?): String? {
        val raw = query?.trim().orEmpty().removePrefix("u=").trim()
        if (raw.isEmpty()) return null
        return URLDecoder.decode(raw, StandardCharsets.UTF_8)
    }

    fun rewritePlaylist(
        body: String,
        upstreamPlaylistUrl: String,
        lanIp: String,
        port: Int,
        token: String,
    ): String {
        val baseDir = upstreamPlaylistUrl.substringBeforeLast('/').let {
            if (it.startsWith("http")) "$it/" else "$upstreamPlaylistUrl/"
        }
        return body
            .lineSequence()
            .joinToString("\n") { line -> rewriteLine(line, baseDir, lanIp, port, token) }
    }

    internal fun rewriteLine(
        line: String,
        baseDir: String,
        lanIp: String,
        port: Int,
        token: String,
    ): String {
        val trimmed = line.trim()
        if (trimmed.isEmpty()) return line
        if (trimmed.startsWith("#")) {
            val uriMatch = Regex("URI=\"([^\"]+)\"").find(trimmed)
            if (uriMatch != null) {
                val uri = uriMatch.groupValues[1]
                val absolute = resolveAgainstBase(uri, baseDir)
                val relay = proxyUrl(lanIp, port, token, absolute)
                return trimmed.replace("URI=\"$uri\"", "URI=\"$relay\"")
            }
            return line
        }
        val absolute = resolveAgainstBase(trimmed, baseDir)
        return proxyUrl(lanIp, port, token, absolute)
    }

    fun resolveAgainstBase(relativeOrAbsolute: String, baseDir: String): String {
        val trimmed = relativeOrAbsolute.trim()
        if (trimmed.startsWith("http://", ignoreCase = true) ||
            trimmed.startsWith("https://", ignoreCase = true)
        ) {
            return trimmed
        }
        return URL(URL(baseDir), trimmed).toString()
    }

    fun looksLikeHlsPlaylist(bytes: ByteArray): Boolean {
        if (bytes.isEmpty()) return false
        val head = String(bytes, 0, minOf(bytes.size, 512), StandardCharsets.UTF_8)
        return head.contains("#EXTM3U", ignoreCase = true)
    }
}
