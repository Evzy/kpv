package dev.kpv.app

import android.util.Log
import android.webkit.CookieManager
import fi.iki.elonen.NanoHTTPD
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

class CastRelayServer private constructor(port: Int) : NanoHTTPD("0.0.0.0", port) {

    private class RelaySession(
        val stream: ResolvedStream,
        val masterUrl: String,
    ) {
        private val upstreamById = ConcurrentHashMap<String, String>()
        private val idByUpstream = ConcurrentHashMap<String, String>()
        private val nextId = AtomicInteger(0)

        fun relayUrl(upstream: String, lanIp: String, port: Int, token: String): String {
            idByUpstream[upstream]?.let { id ->
                return "http://$lanIp:$port/cast/$token/r/$id"
            }
            val id = nextId.incrementAndGet().toString()
            upstreamById[id] = upstream
            idByUpstream[upstream] = id
            return "http://$lanIp:$port/cast/$token/r/$id"
        }

        fun upstreamFor(id: String): String? = upstreamById[id]
    }

    private val sessions = ConcurrentHashMap<String, RelaySession>()

    fun register(stream: ResolvedStream): String {
        val token = UUID.randomUUID().toString().replace("-", "")
        sessions[token] = RelaySession(stream, stream.url)
        return token
    }

    fun removeToken(token: String) {
        sessions.remove(token)
    }

    fun clearAll() {
        sessions.clear()
    }

    override fun serve(session: IHTTPSession): Response {
        val path = session.uri.substringBefore('?')
        val segments = path.trim('/').split('/')
        if (segments.size < 2 || segments[0] != "cast") {
            return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "not found")
        }
        val token = segments[1]
        val entry = sessions[token]
            ?: return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "expired")

        val lanIp = LanAddress.primaryIpv4()
            ?: return newFixedLengthResponse(Response.Status.SERVICE_UNAVAILABLE, MIME_PLAINTEXT, "no lan")

        Log.i(TAG, "${session.remoteIpAddress} ${session.method} ${session.uri}")
        return try {
            when {
                segments.getOrNull(2) == "master.m3u8" -> serveMaster(entry, lanIp, token)
                segments.getOrNull(2) == "r" && segments.size >= 4 -> {
                    val target = entry.upstreamFor(segments[3])
                        ?: return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "unknown id")
                    serveProxyUrl(entry, target, session)
                }
                segments.getOrNull(2) == "h" && segments.size >= 4 -> {
                    val target = runCatching { CastHlsRelay.decodeUpstreamPath(segments[3]) }.getOrNull()
                        ?: return newFixedLengthResponse(Response.Status.BAD_REQUEST, MIME_PLAINTEXT, "bad h")
                    serveProxyUrl(entry, target, session)
                }
                segments.getOrNull(2) == "p" -> serveProxy(entry, session)
                else -> newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "not found")
            }
        } catch (e: Exception) {
            Log.w(TAG, "relay error: ${e.message}")
            newFixedLengthResponse(Response.Status.INTERNAL_ERROR, MIME_PLAINTEXT, e.message ?: "error")
        }
    }

    private fun serveMaster(entry: RelaySession, lanIp: String, token: String): Response {
        val fetched = fetchFirstPlaylist(
            CastHlsRelay.castEntryFetchCandidates(entry.masterUrl),
            entry.stream.headers,
        ) ?: return newFixedLengthResponse(
            Response.Status.SERVICE_UNAVAILABLE,
            MIME_PLAINTEXT,
            "upstream playlist failed",
        )
        if (!CastHlsRelay.looksLikeHlsPlaylist(fetched.body)) {
            Log.w(TAG, "master not HLS (${fetched.body.size}B ct=${fetched.contentType})")
            return binaryResponse(fetched)
        }

        var playlistText = String(fetched.body, Charsets.UTF_8)
        var playlistBase = fetched.url

        repeat(3) {
            val variantUrl = CastHlsRelay.bestVariantPlaylistUrl(playlistText, playlistBase)
                ?: CastHlsRelay.singleVariantPlaylistUrl(playlistText, playlistBase)
                ?: return@repeat
            val fetchUrl = CastHlsRelay.preferVideoMediaPlaylistUrl(variantUrl)
            val variantFetched = fetchUpstream(fetchUrl, entry.stream.headers)
            if (!CastHlsRelay.looksLikeHlsPlaylist(variantFetched.body)) {
                Log.w(TAG, "variant not HLS (${variantFetched.body.size}B)")
                return@repeat
            }
            Log.i(TAG, "flatten variant ${variantFetched.body.size}B <- $fetchUrl")
            playlistText = String(variantFetched.body, Charsets.UTF_8)
            playlistBase = fetchUrl
        }

        val rewritten = rewrite(entry, playlistText, playlistBase, lanIp, token)
        val segLines = rewritten.lineSequence().count { it.isNotBlank() && !it.trimStart().startsWith("#") }
        Log.i(TAG, "master response ${rewritten.length}B segLines=$segLines body=${rewritten.take(400)}")
        return playlistResponse(rewritten)
    }

    private fun serveProxy(entry: RelaySession, session: IHTTPSession): Response {
        val target = session.parameters["u"]?.firstOrNull()
            ?: CastHlsRelay.decodeProxyTarget(session.queryParameterString)
            ?: return newFixedLengthResponse(Response.Status.BAD_REQUEST, MIME_PLAINTEXT, "missing u")
        return serveProxyUrl(entry, target, session)
    }

    private fun serveProxyUrl(entry: RelaySession, target: String, session: IHTTPSession): Response {
        if (!target.startsWith("http://", ignoreCase = true) &&
            !target.startsWith("https://", ignoreCase = true)
        ) {
            return newFixedLengthResponse(Response.Status.BAD_REQUEST, MIME_PLAINTEXT, "bad url")
        }
        val lanIp = LanAddress.primaryIpv4()
            ?: return newFixedLengthResponse(Response.Status.SERVICE_UNAVAILABLE, MIME_PLAINTEXT, "no lan")
        val token = session.uri.trim('/').split('/').getOrNull(1).orEmpty()
        val range = session.headers.entries.firstOrNull { it.key.equals("range", true) }?.value
        val started = System.currentTimeMillis()

        if (target.substringBefore('?').endsWith(".m3u8", ignoreCase = true)) {
            val fetched = fetchUpstream(target, entry.stream.headers, range)
            if (CastHlsRelay.looksLikeHlsPlaylist(fetched.body)) {
                val rewritten = rewrite(entry, String(fetched.body, Charsets.UTF_8), target, lanIp, token)
                return playlistResponse(rewritten)
            }
            return binaryResponse(fetched)
        }

        return try {
            val (response, bytesHint) = streamBinaryUpstream(target, entry.stream.headers, range)
            Log.i(
                TAG,
                "segment ${target.takeLast(56)} ${if (bytesHint >= 0) "${bytesHint}B" else "chunked"} " +
                    "${System.currentTimeMillis() - started}ms ${response.mimeType}",
            )
            response
        } catch (e: Exception) {
            Log.w(TAG, "segment failed ${target.takeLast(64)}: ${e.message}")
            throw e
        }
    }

    private fun rewrite(
        entry: RelaySession,
        body: String,
        upstreamPlaylistUrl: String,
        lanIp: String,
        token: String,
    ): String = CastHlsRelay.rewritePlaylist(body, upstreamPlaylistUrl) { absolute ->
        entry.relayUrl(absolute, lanIp, listeningPort, token)
    }

    private fun playlistResponse(body: String): Response {
        val response = newFixedLengthResponse(Response.Status.OK, HLS_MIME, body)
        response.addHeader("Cache-Control", "no-cache")
        response.addHeader("Access-Control-Allow-Origin", "*")
        return response
    }

    private data class Fetched(val url: String, val body: ByteArray, val contentType: String?)

    private fun fetchFirstPlaylist(urls: List<String>, headers: Map<String, String>): Fetched? {
        var lastError: Exception? = null
        for (url in urls) {
            try {
                val fetched = fetchUpstream(url, headers)
                if (CastHlsRelay.looksLikeHlsPlaylist(fetched.body)) {
                    Log.i(TAG, "upstream playlist OK ${fetched.body.size}B <- ${url.takeLast(72)}")
                    return fetched
                }
                Log.w(TAG, "upstream not HLS ${fetched.body.size}B <- ${url.takeLast(72)}")
            } catch (e: Exception) {
                lastError = e
                Log.w(TAG, "upstream try failed ${url.takeLast(72)}: ${e.message}")
            }
        }
        if (lastError != null) Log.w(TAG, "all playlist candidates failed: ${lastError.message}")
        return null
    }

    private fun relayHeaders(stored: Map<String, String>, targetUrl: String): Map<String, String> {
        CookieManager.getInstance().flush()
        val out = CastUpstreamHeaders.forRelay(stored).toMutableMap()
        CookieManager.getInstance().getCookie(targetUrl)?.takeIf { it.isNotBlank() }?.let { out["Cookie"] = it }
        return out
    }

    private fun fetchUpstream(
        url: String,
        headers: Map<String, String>,
        range: String? = null,
    ): Fetched {
        val conn = openUpstream(url, relayHeaders(headers, url), range)
        try {
            val code = conn.responseCode
            val stream = if (code in 200..299 || code == HttpURLConnection.HTTP_PARTIAL) {
                conn.inputStream
            } else {
                conn.errorStream
            }
            val bytes = stream?.readBytes() ?: ByteArray(0)
            if (code !in 200..299 && code != HttpURLConnection.HTTP_PARTIAL) {
                val headerKeys = relayHeaders(headers, url).keys.sorted().joinToString(",")
                throw IllegalStateException("upstream $code for ${url.take(120)} hdr=[$headerKeys]")
            }
            return Fetched(url, bytes, conn.contentType)
        } finally {
            conn.disconnect()
        }
    }

    private fun streamBinaryUpstream(
        url: String,
        headers: Map<String, String>,
        range: String?,
    ): Pair<Response, Long> {
        val conn = openUpstream(url, relayHeaders(headers, url), range)
        val code = conn.responseCode
        if (code !in 200..299 && code != HttpURLConnection.HTTP_PARTIAL) {
            val err = conn.errorStream?.readBytes()?.size ?: 0
            conn.disconnect()
            throw IllegalStateException("upstream $code ($err B err)")
        }
        val mime = segmentMime(url, conn.contentType)
        val length = conn.contentLengthLong
        val input = conn.inputStream
        val status = if (code == HttpURLConnection.HTTP_PARTIAL) {
            Response.Status.PARTIAL_CONTENT
        } else {
            Response.Status.OK
        }
        val response = if (length >= 0) {
            newFixedLengthResponse(status, mime, input, length)
        } else {
            newChunkedResponse(status, mime, input)
        }
        response.addHeader("Accept-Ranges", "bytes")
        conn.getHeaderField("Content-Range")?.let { response.addHeader("Content-Range", it) }
        return response to length
    }

    private fun openUpstream(
        url: String,
        headers: Map<String, String>,
        range: String?,
    ): HttpURLConnection =
        (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 45_000
            instanceFollowRedirects = true
            headers.forEach { (k, v) -> setRequestProperty(k, v) }
            if (!range.isNullOrBlank()) setRequestProperty("Range", range)
        }

    private fun segmentMime(url: String, upstreamContentType: String?): String {
        val fromUpstream = upstreamContentType?.substringBefore(';')?.trim()?.ifEmpty { null }
        if (fromUpstream != null && fromUpstream != OCTET_MIME) return fromUpstream
        val path = url.substringBefore('?').lowercase()
        return when {
            path.endsWith(".ts") -> "video/mp2t"
            path.endsWith(".mp4") -> "video/mp4"
            path.endsWith(".aac") -> "audio/aac"
            else -> OCTET_MIME
        }
    }

    private fun binaryResponse(fetched: Fetched): Response {
        val mime = fetched.contentType?.substringBefore(';')?.trim()?.ifEmpty { OCTET_MIME } ?: OCTET_MIME
        return newFixedLengthResponse(
            Response.Status.OK,
            mime,
            ByteArrayInputStream(fetched.body),
            fetched.body.size.toLong(),
        )
    }

    companion object {
        private const val TAG = "KpvCastRelay"
        const val DEFAULT_PORT = 8767
        private const val HLS_MIME = "application/vnd.apple.mpegurl"
        private const val OCTET_MIME = "application/octet-stream"

        @Volatile
        private var instance: CastRelayServer? = null

        val listeningPort: Int
            get() = instance?.listeningPort ?: DEFAULT_PORT

        @Synchronized
        fun ensureStarted(): CastRelayServer? {
            instance?.let { return it }
            return runCatching {
                val server = CastRelayServer(DEFAULT_PORT)
                server.start(SOCKET_READ_TIMEOUT, false)
                instance = server
                Log.i(TAG, "Cast relay listening on $DEFAULT_PORT")
                server
            }.getOrElse {
                Log.w(TAG, "Cast relay failed to start: ${it.message}")
                null
            }
        }

        @Synchronized
        fun stop() {
            instance?.clearAll()
            instance?.stop()
            instance = null
        }

        fun register(stream: ResolvedStream): String? {
            val server = ensureStarted() ?: return null
            return server.register(stream)
        }

        fun removeToken(token: String?) {
            if (token.isNullOrBlank()) return
            instance?.removeToken(token)
        }
    }
}
