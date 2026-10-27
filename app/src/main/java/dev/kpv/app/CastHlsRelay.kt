package dev.kpv.app

import java.net.URL
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.util.Base64

/**
 * Rewrites HLS playlists so segment and child-playlist URLs are fetched via the phone relay.
 */
object CastHlsRelay {

    fun masterRelayUrl(lanIp: String, port: Int, token: String): String =
        "http://$lanIp:$port/cast/$token/master.m3u8"

    fun encodeUpstreamPath(upstreamAbsolute: String): String =
        Base64.getUrlEncoder().withoutPadding()
            .encodeToString(upstreamAbsolute.toByteArray(StandardCharsets.UTF_8))

    fun decodeUpstreamPath(encoded: String): String =
        String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8)

    /** Legacy query form; kept for any in-flight sessions. */
    fun decodeProxyTarget(query: String?): String? {
        val raw = query?.trim().orEmpty().removePrefix("u=").trim()
        if (raw.isEmpty()) return null
        return URLDecoder.decode(raw, StandardCharsets.UTF_8)
    }

    /**
     * If [body] is a single-variant master playlist, returns the absolute variant URL; otherwise null.
     * Media playlists (#EXTINF) and multi-bitrate masters are left unchanged.
     */
    /** Prefer video renditions when the player (or Cast) would otherwise pick an audio-only HLS track. */
    fun isSignedStreamUrl(url: String): Boolean {
        val lower = url.lowercase()
        return lower.contains("/secure/") || lower.contains("token=") || lower.contains("e=")
    }

    fun preferVideoMediaPlaylistUrl(url: String): String {
        if (isSignedStreamUrl(url)) return url
        val lower = url.lowercase()
        if (!lower.contains("v1a1") && !lower.contains("/a1/") && !lower.contains("audio")) return url
        listOf("v1v1", "v1", "v2").forEach { rep ->
            val candidate = url.replace("v1a1", rep, ignoreCase = true)
            if (candidate != url) return candidate
        }
        return url.replace("/a1/", "/v1/", ignoreCase = true)
    }

    fun scoreCapturedPlaylistUrl(url: String): Int {
        val lower = url.lowercase()
        return when {
            lower.contains("v1a1") || lower.contains("/tracks-a") || lower.contains("audio") -> 5
            lower.contains("avc") || lower.contains("h264") -> 90
            lower.contains("v1v") || lower.contains("tracks-v1v") -> 85
            lower.contains("mono.ts.m3u8") && !lower.contains("a1") -> 78
            lower.contains("1080") -> 80
            lower.contains("720") -> 70
            lower.contains("index.m3u8") || lower.contains("master.m3u8") -> 0
            lower.contains("master") -> 20
            lower.contains(".m3u8") -> 35
            else -> 0
        }
    }

    /** Track/media playlists the LAN relay can fetch; master index URLs usually 403 outside WebView. */
    fun isRelayablePlaylistUrl(url: String): Boolean {
        val lower = url.lowercase()
        if (!lower.contains(".m3u8")) return false
        if (lower.contains("index.m3u8") || lower.contains("master.m3u8")) return false
        return true
    }

    /** CDN masters often 403 from the relay; try known track playlists derived from index.m3u8. */
    fun castEntryFetchCandidates(entryUrl: String): List<String> {
        if (isSignedStreamUrl(entryUrl)) return listOf(entryUrl)
        val preferred = preferVideoMediaPlaylistUrl(entryUrl)
        val out = linkedSetOf(preferred, entryUrl)
        if (!entryUrl.contains("index.m3u8", ignoreCase = true)) return out.toList()
        val base = stripSuffixIgnoreCase(entryUrl, "index.m3u8")
        listOf(
            "tracks-v1v1/mono.ts.m3u8",
            "tracks-v1/mono.ts.m3u8",
            "tracks-v1a1/mono.ts.m3u8",
        ).forEach { track ->
            out.add(preferVideoMediaPlaylistUrl(base + track))
        }
        return out.toList()
    }

    data class Variant(val url: String, val bandwidth: Int, val codecs: String)

    fun bestVariantPlaylistUrl(body: String, upstreamPlaylistUrl: String): String? {
        val lines = body.lines().map { it.trim() }.filter { it.isNotEmpty() }
        if (lines.any { it.startsWith("#EXTINF", ignoreCase = true) }) return null
        val baseDir = playlistBaseDir(upstreamPlaylistUrl)
        val variants = mutableListOf<Variant>()
        for (i in lines.indices) {
            val line = lines[i]
            if (!line.startsWith("#EXT-X-STREAM-INF", ignoreCase = true)) continue
            val bandwidth = Regex("BANDWIDTH=(\\d+)").find(line)?.groupValues?.get(1)?.toIntOrNull() ?: 0
            val codecs = Regex("CODECS=\"([^\"]+)\"").find(line)?.groupValues?.get(1).orEmpty()
            val uriInTag = Regex("URI=\"([^\"]+)\"").find(line)?.groupValues?.get(1)
            if (uriInTag != null) {
                variants.add(Variant(resolveAgainstBase(uriInTag, baseDir), bandwidth, codecs))
            } else {
                for (j in i + 1 until lines.size) {
                    if (!lines[j].startsWith("#")) {
                        variants.add(Variant(resolveAgainstBase(lines[j], baseDir), bandwidth, codecs))
                        break
                    }
                }
            }
        }
        if (variants.isEmpty()) return null
        return variants.maxWith(
            compareBy<Variant>({ variantVideoScore(it) }).thenBy { it.bandwidth },
        )!!.url
    }

    internal fun variantVideoScore(variant: Variant): Int {
        val codecs = variant.codecs.lowercase()
        val url = variant.url.lowercase()
        return when {
            codecs.contains("avc1") || codecs.contains("hvc1") -> 100
            url.contains("v1a1") || url.contains("/a1/") -> 10
            url.contains("v1v") || url.contains("tracks-v1/") -> 90
            codecs.contains("mp4a") && !codecs.contains("avc1") -> 15
            else -> 50
        }
    }

    fun singleVariantPlaylistUrl(body: String, upstreamPlaylistUrl: String): String? {
        val baseDir = playlistBaseDir(upstreamPlaylistUrl)
        val lines = body.lines().map { it.trim() }.filter { it.isNotEmpty() }
        if (lines.any { it.startsWith("#EXTINF", ignoreCase = true) }) return null
        val streamInf = lines.filter { it.startsWith("#EXT-X-STREAM-INF", ignoreCase = true) }
        if (streamInf.size != 1) return null
        val inf = streamInf.first()
        Regex("URI=\"([^\"]+)\"").find(inf)?.groupValues?.get(1)?.let { uri ->
            return resolveAgainstBase(uri, baseDir)
        }
        val idx = lines.indexOf(inf)
        for (i in idx + 1 until lines.size) {
            val line = lines[i]
            if (!line.startsWith("#")) return resolveAgainstBase(line, baseDir)
        }
        return null
    }

    fun rewritePlaylist(
        body: String,
        upstreamPlaylistUrl: String,
        relayUrl: (absoluteUpstream: String) -> String,
    ): String {
        val baseDir = playlistBaseDir(upstreamPlaylistUrl)
        return body
            .lineSequence()
            .joinToString("\n") { line -> rewriteLine(line, baseDir, relayUrl) }
    }

    internal fun rewriteLine(
        line: String,
        baseDir: String,
        relayUrl: (String) -> String,
    ): String {
        val trimmed = line.trim()
        if (trimmed.isEmpty()) return line
        if (trimmed.startsWith("#")) {
            val uriMatch = Regex("URI=\"([^\"]+)\"").find(trimmed)
            if (uriMatch != null) {
                val uri = uriMatch.groupValues[1]
                val absolute = resolveAgainstBase(uri, baseDir)
                val relay = relayUrl(absolute)
                return trimmed.replace("URI=\"$uri\"", "URI=\"$relay\"")
            }
            return line
        }
        val absolute = resolveAgainstBase(trimmed, baseDir)
        return relayUrl(absolute)
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

    /** Absolute segment URLs of a media playlist, oldest first; empty for master playlists. */
    fun mediaSegmentUrls(body: String, upstreamPlaylistUrl: String): List<String> {
        val lines = body.lines().map { it.trim() }
        if (lines.none { it.startsWith("#EXTINF", ignoreCase = true) }) return emptyList()
        val baseDir = playlistBaseDir(upstreamPlaylistUrl)
        return lines
            .filter { it.isNotEmpty() && !it.startsWith("#") }
            .map { resolveAgainstBase(it, baseDir) }
    }

    /** Keeps the header and the first [keepSegments] segments, dropping newer ones from the end. */
    fun trimMediaPlaylist(body: String, keepSegments: Int): String {
        val out = mutableListOf<String>()
        var kept = 0
        for (line in body.lines()) {
            val trimmed = line.trim()
            if (trimmed.isNotEmpty() && !trimmed.startsWith("#")) {
                if (kept >= keepSegments) break
                kept++
                out.add(line)
                continue
            }
            if (kept >= keepSegments && trimmed.startsWith("#EXTINF", ignoreCase = true)) break
            out.add(line)
        }
        return out.joinToString("\n").trimEnd() + "\n"
    }

    /**
     * Offset of the first MPEG-TS packet (0x47 sync byte repeating every 188 bytes), or -1.
     * Some CDNs disguise segments as images by prepending a fake header.
     */
    fun mpegTsSyncOffset(bytes: ByteArray, packetsToCheck: Int = 5): Int {
        val limit = minOf(bytes.size, 64 * 1024)
        for (start in 0 until limit) {
            if (bytes[start] != TS_SYNC) continue
            var ok = true
            for (p in 1 until packetsToCheck) {
                val idx = start + p * TS_PACKET
                if (idx >= bytes.size || bytes[idx] != TS_SYNC) {
                    ok = false
                    break
                }
            }
            if (ok) return start
        }
        return -1
    }

    private const val TS_SYNC: Byte = 0x47
    private const val TS_PACKET = 188

    fun looksLikeHlsPlaylist(bytes: ByteArray): Boolean {
        if (bytes.isEmpty()) return false
        val head = String(bytes, 0, minOf(bytes.size, 512), StandardCharsets.UTF_8)
        return head.contains("#EXTM3U", ignoreCase = true)
    }

    private fun playlistBaseDir(upstreamPlaylistUrl: String): String =
        upstreamPlaylistUrl.substringBeforeLast('/').let {
            if (it.startsWith("http")) "$it/" else "$upstreamPlaylistUrl/"
        }

    private fun stripSuffixIgnoreCase(url: String, suffix: String): String {
        val lower = url.lowercase()
        val idx = lower.lastIndexOf(suffix.lowercase())
        if (idx < 0) return url
        return url.substring(0, idx)
    }

    /**
     * Sliding live window advertised to the receiver. Upstream CDNs often list only ~16 s of
     * segments; listing just the downloaded ones left Shaka with 8–12 s, too little to sit behind
     * the live edge. This keeps already-advertised segments (by media sequence) after upstream drops
     * them, up to [maxSegments], and only appends downloaded segments so the window stays contiguous.
     */
    class LiveWindow(private val maxSegments: Int) {

        private class Entry(val sequence: Long, val tags: List<String>, val url: String)

        private val entries = ArrayDeque<Entry>()

        val isEmpty: Boolean get() = synchronized(this) { entries.isEmpty() }

        /** Returns the playlist to serve, with absolute upstream segment URLs. */
        fun update(body: String, upstreamPlaylistUrl: String, isReady: (String) -> Boolean): String =
            synchronized(this) {
                if (body.lines().any { it.trim().startsWith("#EXT-X-ENDLIST", ignoreCase = true) }) {
                    return body
                }
                val parsed = parse(body, upstreamPlaylistUrl)
                val incoming = parsed.segments
                val last = entries.lastOrNull()
                if (last != null && incoming.isNotEmpty()) {
                    val restarted = incoming.first().sequence > last.sequence + 1 ||
                        incoming.last().sequence < entries.first().sequence
                    if (restarted) entries.clear()
                }
                val after = entries.lastOrNull()?.sequence ?: Long.MIN_VALUE
                for (segment in incoming) {
                    if (segment.sequence <= after) continue
                    if (!isReady(segment.url)) break
                    entries.addLast(segment)
                }
                while (entries.size > maxSegments) entries.removeFirst()
                render(parsed.header)
            }

        private class Parsed(val header: List<String>, val segments: List<Entry>)

        private fun parse(body: String, upstreamPlaylistUrl: String): Parsed {
            val baseDir = playlistBaseDir(upstreamPlaylistUrl)
            val header = mutableListOf<String>()
            val segments = mutableListOf<Entry>()
            var sequence = 0L
            var pending = mutableListOf<String>()
            var seenSegment = false
            for (raw in body.lines()) {
                val line = raw.trim()
                if (line.isEmpty()) continue
                when {
                    line.startsWith("#EXT-X-MEDIA-SEQUENCE:", ignoreCase = true) ->
                        sequence = line.substringAfter(':').trim().toLongOrNull() ?: 0L
                    line.startsWith("#") && !seenSegment && !isSegmentTag(line) -> header.add(line)
                    line.startsWith("#") -> pending.add(line)
                    else -> {
                        segments.add(Entry(sequence, pending, resolveAgainstBase(line, baseDir)))
                        sequence++
                        pending = mutableListOf()
                        seenSegment = true
                    }
                }
            }
            return Parsed(header, segments)
        }

        private fun isSegmentTag(line: String): Boolean {
            val tag = line.substringBefore(':').uppercase()
            return tag in SEGMENT_TAGS
        }

        private fun render(header: List<String>): String = buildString {
            header.forEach { appendLine(it) }
            appendLine("#EXT-X-MEDIA-SEQUENCE:${entries.firstOrNull()?.sequence ?: 0}")
            for (entry in entries) {
                entry.tags.forEach { appendLine(it) }
                appendLine(entry.url)
            }
        }

        private companion object {
            val SEGMENT_TAGS = setOf(
                "#EXTINF",
                "#EXT-X-PROGRAM-DATE-TIME",
                "#EXT-X-DISCONTINUITY",
                "#EXT-X-KEY",
                "#EXT-X-BYTERANGE",
                "#EXT-X-MAP",
                "#EXT-X-GAP",
                "#EXT-X-BITRATE",
                "#EXT-X-CUE-OUT",
                "#EXT-X-CUE-IN",
                "#EXT-X-CUE-OUT-CONT",
            )
        }
    }
}
