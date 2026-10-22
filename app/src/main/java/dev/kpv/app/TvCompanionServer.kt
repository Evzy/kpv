package dev.kpv.app

import fi.iki.elonen.NanoHTTPD
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

class TvCompanionServer(
    port: Int,
    private val resolveQueue: CompanionResolveQueue,
) : NanoHTTPD(port) {

    private val worker = Executors.newSingleThreadExecutor { r ->
        Thread(r, "kpv-companion-http").apply { isDaemon = true }
    }

    @Volatile
    private var prefetchRunning = AtomicBoolean(false)

    private val prefetchDone = AtomicInteger(0)
    private val prefetchTotal = AtomicInteger(0)

    override fun serve(session: IHTTPSession): Response {
        return try {
            worker.submit<Response> { handle(session) }.get()
        } catch (e: Exception) {
            jsonError(500, e.message ?: "error")
        }
    }

    private fun handle(session: IHTTPSession): Response {
        val path = session.uri.substringBefore('?')
        val method = session.method

        if (!SiteConfig.isCompanionEnabled()) {
            return jsonError(503, "Companion mode is off on the phone.")
        }

        if (path == "/health") {
            return json(200, JSONObject().put("ok", true))
        }

        if (path == "/pair" && method == Method.POST) {
            return handlePair(session)
        }

        val token = bearerToken(session)
        val paired = CompanionPairing.isValidToken(token)

        if (path == "/info") {
            val ip = LanAddress.primaryIpv4()
            val body = JSONObject()
                .put("name", "KPV Companion")
                .put("companionMode", true)
                .put("pairingRequired", !paired)
                .put("pairedDevices", CompanionPairing.pairedDeviceCount())
                .put("siteUrl", SiteConfig.siteUrl())
                .put("port", listeningPort)
                .put("lanIp", ip ?: JSONObject.NULL)
                .put(
                    "baseUrl",
                    if (ip != null) "http://$ip:$listeningPort" else JSONObject.NULL,
                )
            if (paired) {
                body.put(
                    "prefetch",
                    JSONObject()
                        .put("running", prefetchRunning.get())
                        .put("done", prefetchDone.get())
                        .put("total", prefetchTotal.get()),
                )
            }
            return json(if (paired) 200 else 401, body)
        }

        if (!paired) {
            return jsonError(401, "TV not paired. Enter the PIN from the phone in KPV TV settings.")
        }

        if (SiteConfig.siteUrl().isBlank()) {
            return jsonError(503, "Set site URL in KPV settings on the phone.")
        }

        if (path == "/resolve" && method == Method.GET) {
            return handleResolve(session)
        }

        if (path == "/prepare" && method == Method.GET) {
            return handlePrepare(session)
        }

        if (path == "/api/streams" && method == Method.GET) {
            val body = SiteHttp.openJsonGet(SiteConfig.streamsApiUrl()) ?: return jsonError(502, "upstream catalog failed")
            return rawJson(200, body)
        }

        if (path.startsWith("/api/streams/") && method == Method.GET) {
            val uri = path.removePrefix("/api/streams/").trimStart('/').trimEnd('/')
            if (uri.isEmpty()) return jsonError(400, "missing uri")
            return handleStreamDetail(uri, session)
        }

        if (path == "/catalog/playback" && method == Method.GET) {
            return handleCatalogPlayback()
        }

        if (path == "/prefetch" && method == Method.POST) {
            return startPrefetch()
        }

        return jsonError(404, "not found")
    }

    private fun bearerToken(session: IHTTPSession): String? {
        val auth = headerValue(session, "authorization")
        if (auth.startsWith("Bearer ", ignoreCase = true)) {
            return auth.substring(7).trim()
        }
        return session.parameters["token"]?.firstOrNull()?.trim()?.takeIf { it.isNotEmpty() }
    }

    private fun headerValue(session: IHTTPSession, name: String): String {
        val raw = session.headers[name.lowercase()]
            ?: session.headers[name]
            ?: return ""
        return when (raw) {
            is List<*> -> raw.firstOrNull()?.toString().orEmpty().trim()
            else -> raw.toString().trim()
        }
    }

    private fun handlePair(session: IHTTPSession): Response {
        val map = HashMap<String, String>()
        runCatching { session.parseBody(map) }
        val raw = map["postData"] ?: ""
        val pin = runCatching {
            JSONObject(raw).optString("pin")
        }.getOrDefault("").ifBlank {
            session.parameters["pin"]?.firstOrNull().orEmpty()
        }
        if (pin.isBlank()) return jsonError(400, "pin required")
        val label = runCatching { JSONObject(raw).optString("device", "TV") }.getOrDefault("TV")
        val token = CompanionPairing.pairWithPin(pin, label)
            ?: return jsonError(403, "Invalid or expired PIN. Check companion mode on the phone.")
        return json(
            200,
            JSONObject()
                .put("token", token)
                .put("device", label),
        )
    }

    private fun handleResolve(session: IHTTPSession): Response {
        if (!resolveQueue.hasLiveHost()) {
            return jsonError(
                503,
                "Keep KPV open on the phone channel list (not Settings) while the TV plays.",
            )
        }
        val params = session.parameters
        val uri = params["uri"]?.firstOrNull()?.trim().orEmpty()
        if (uri.isEmpty()) return jsonError(400, "uri required")
        val embed = params["embed"]?.firstOrNull()?.trim().orEmpty()
        val resolved = resolveForUri(uri, embed.ifBlank { null })
            ?: return jsonError(
                504,
                "Could not capture .m3u8 from embed — try the same channel on the phone first, then retry on TV.",
            )
        val referer = resolved.headers["Referer"] ?: resolved.headers.entries
            .firstOrNull { it.key.equals("Referer", true) }?.value.orEmpty()
        val body = JSONObject()
            .put("uri", uri)
            .put("m3u8", resolved.url)
            .put("url", resolved.url)
            .put("hls", resolved.url)
            .put("referer", referer)
        return json(200, body)
    }

    private fun handleStreamDetail(uri: String, session: IHTTPSession): Response {
        val resolve = session.parameters["resolve"]?.firstOrNull() == "1"
        val refresh = session.parameters["refresh"]?.firstOrNull() == "1"
        val body = SiteHttp.openJsonGet(SiteConfig.streamApiUrl(uri))
            ?: return jsonError(502, "upstream stream failed")
        val existing = StreamJson.pickM3u8(body)
        if (existing != null && !refresh) {
            return rawJson(200, body)
        }
        if (!resolve) {
            return rawJson(200, body)
        }
        val embed = StreamJson.pickEmbed(body)
        val resolved = resolveForUri(uri, embed) ?: return jsonError(504, "resolve failed")
        val merged = StreamJson.mergeM3u8(body, resolved.url)
        return rawJson(200, merged)
    }

    private fun handleCatalogPlayback(): Response {
        CatalogCache.toPlaybackJson()?.let { return json(200, it) }
        val body = SiteHttp.openJsonGet(SiteConfig.streamsApiUrl())
            ?: return jsonError(503, "Open KPV on the phone and wait for channels to load first.")
        return rawJson(200, body)
    }

    private fun startPrefetch(): Response {
        if (!prefetchRunning.compareAndSet(false, true)) {
            return json(409, JSONObject().put("message", "prefetch already running"))
        }
        prefetchDone.set(0)
        Thread {
            try {
                val categories = ApiCatalogFetcher.fetch().orEmpty()
                val channels = categories.flatMap { it.channels }
                prefetchTotal.set(channels.size)
                for (ch in channels) {
                    val apiBody = SiteHttp.openJsonGet(SiteConfig.streamApiUrl(ch.streamUri))
                    val fromApi = apiBody?.let { StreamJson.pickM3u8(it) }
                    if (fromApi != null) {
                        prefetchDone.incrementAndGet()
                        continue
                    }
                    val embed = ch.playerIframeUrl.takeIf { it.startsWith("http") }
                        ?: StreamJson.pickEmbed(apiBody.orEmpty())
                        ?: SiteConfig.embedUrl(ch.streamUri)
                    resolveForUri(ch.streamUri, embed)
                    prefetchDone.incrementAndGet()
                }
            } finally {
                prefetchRunning.set(false)
            }
        }.start()
        return json(202, JSONObject().put("started", true))
    }

    private fun handlePrepare(session: IHTTPSession): Response {
        val params = session.parameters
        val uri = params["uri"]?.firstOrNull()?.trim().orEmpty()
        if (uri.isEmpty()) return jsonError(400, "uri required")
        val embed = params["embed"]?.firstOrNull()?.trim().orEmpty()
        Thread {
            runCatching { resolveForUri(uri, embed.ifBlank { null }) }
        }.start()
        return json(202, JSONObject().put("uri", uri).put("preparing", true))
    }

    /** Resolve one stream by uri: site API .m3u8 first, else WebView sniff (no phone-side cache). */
    private fun resolveForUri(uri: String, embedHint: String?): ResolvedStream? {
        val apiBody = SiteHttp.openJsonGet(SiteConfig.streamApiUrl(uri))
        val fromApi = apiBody?.let { StreamJson.pickM3u8(it) }
        if (fromApi != null) {
            val embed = embedHint?.takeIf { it.startsWith("http") }
                ?: apiBody.let { StreamJson.pickEmbed(it) }
                ?: SiteConfig.embedUrl(uri)
            return ResolvedStream(fromApi, mapOf("Referer" to embed))
        }

        val embed = embedHint?.takeIf { it.startsWith("http") }
            ?: apiBody?.let { StreamJson.pickEmbed(it) }
            ?: SiteConfig.embedUrl(uri)
        val resolved = resolveQueue.resolve(uri, embed) ?: return null
        val referer = resolved.headers.entries.firstOrNull { it.key.equals("Referer", true) }?.value
            ?: embed
        return resolved.copy(headers = mapOf("Referer" to referer))
    }

    private fun json(status: Response.Status, obj: JSONObject): Response =
        newFixedLengthResponse(status, "application/json", obj.toString())

    private fun json(statusCode: Int, obj: JSONObject): Response {
        val status = when (statusCode) {
            200 -> Response.Status.OK
            202 -> Response.Status.OK
            409 -> Response.Status.CONFLICT
            else -> Response.Status.lookup(statusCode) ?: Response.Status.INTERNAL_ERROR
        }
        return json(status, obj)
    }

    private fun rawJson(statusCode: Int, body: String): Response =
        newFixedLengthResponse(
            Response.Status.lookup(statusCode) ?: Response.Status.OK,
            "application/json",
            body,
        )

    private fun jsonError(code: Int, message: String): Response =
        json(code, JSONObject().put("error", message))

    fun shutdownServer() {
        worker.shutdownNow()
        stop()
    }
}
