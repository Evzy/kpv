package dev.kpv.app

import android.util.Log
import fi.iki.elonen.NanoHTTPD
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class CastRelayServer private constructor(port: Int) : NanoHTTPD(port) {

    private data class Session(val stream: ResolvedStream, val masterUrl: String)

    private val sessions = ConcurrentHashMap<String, Session>()

    fun register(stream: ResolvedStream): String {
        val token = UUID.randomUUID().toString().replace("-", "")
        sessions[token] = Session(stream, stream.url)
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

        return try {
            when {
                segments.getOrNull(2) == "master.m3u8" -> serveMaster(entry, lanIp, token)
                segments.getOrNull(2) == "p" -> serveProxy(entry, session, lanIp, token)
                else -> newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "not found")
            }
        } catch (e: Exception) {
            Log.w(TAG, "relay error: ${e.message}")
            newFixedLengthResponse(Response.Status.INTERNAL_ERROR, MIME_PLAINTEXT, e.message ?: "error")
        }
    }

    private fun serveMaster(entry: Session, lanIp: String, token: String): Response {
        val fetched = fetchUpstream(entry.masterUrl, entry.stream.headers)
        if (CastHlsRelay.looksLikeHlsPlaylist(fetched.body)) {
            val rewritten = CastHlsRelay.rewritePlaylist(
                String(fetched.body, Charsets.UTF_8),
                entry.masterUrl,
                lanIp,
                listeningPort,
                token,
            )
            return newFixedLengthResponse(
                Response.Status.OK,
                HLS_MIME,
                rewritten,
            )
        }
        return binaryResponse(fetched)
    }

    private fun serveProxy(
        entry: Session,
        session: IHTTPSession,
        lanIp: String,
        token: String,
    ): Response {
        val target = session.parameters["u"]?.firstOrNull()
            ?: CastHlsRelay.decodeProxyTarget(session.queryParameterString)
            ?: return newFixedLengthResponse(Response.Status.BAD_REQUEST, MIME_PLAINTEXT, "missing u")
        if (!target.startsWith("http://", ignoreCase = true) &&
            !target.startsWith("https://", ignoreCase = true)
        ) {
            return newFixedLengthResponse(Response.Status.BAD_REQUEST, MIME_PLAINTEXT, "bad url")
        }
        val fetched = fetchUpstream(target, entry.stream.headers)
        if (CastHlsRelay.looksLikeHlsPlaylist(fetched.body)) {
            val rewritten = CastHlsRelay.rewritePlaylist(
                String(fetched.body, Charsets.UTF_8),
                target,
                lanIp,
                listeningPort,
                token,
            )
            return newFixedLengthResponse(Response.Status.OK, HLS_MIME, rewritten)
        }
        return binaryResponse(fetched)
    }

    private data class Fetched(val body: ByteArray, val contentType: String?)

    private fun fetchUpstream(url: String, headers: Map<String, String>): Fetched {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 30_000
            instanceFollowRedirects = true
            headers.forEach { (k, v) -> setRequestProperty(k, v) }
        }
        try {
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val bytes = stream?.readBytes() ?: ByteArray(0)
            if (code !in 200..299) {
                throw IllegalStateException("upstream $code")
            }
            return Fetched(bytes, conn.contentType)
        } finally {
            conn.disconnect()
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
