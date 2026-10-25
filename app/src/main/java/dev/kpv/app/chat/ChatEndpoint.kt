package dev.kpv.app.chat

import android.content.Context
import dev.kpv.app.SiteConfig
import dev.kpv.app.SiteHttp
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.URI
import java.util.concurrent.TimeUnit

/** Finds the chat WebSocket host in the site's own scripts (it is not exposed by the API). */
object ChatEndpoint {

    const val DEFAULT = "wss://ws.television.st/chat"

    private const val PREFS = "kpv_chat"
    private const val KEY_ENDPOINT = "endpoint"
    private const val MAX_SCRIPTS = 15

    private val CHAT_SOCKET = Regex("wss://[^\"'`\\s$?]+/chat")
    private val SCRIPT_URL = Regex("[\"'`]((?:https?://[^\"'`()\\s]+)?/[^\"'`()\\s]*\\.js)[\"'`]")

    @Volatile
    private var resolvedThisRun: String? = null

    fun findInScript(js: String): String? = CHAT_SOCKET.find(js)?.value

    fun scriptUrls(html: String, base: String): List<String> {
        val baseUri = URI(base.trimEnd('/') + "/")
        return SCRIPT_URL.findAll(html)
            .mapNotNull { runCatching { baseUri.resolve(it.groupValues[1]).toString() }.getOrNull() }
            .distinct()
            .toList()
    }

    fun socketUrl(base: String, streamId: Long, reconnect: Boolean): String =
        "$base?channel=$streamId" + if (reconnect) "&reconnect=true" else ""

    /** Blocking; call off the main thread. */
    fun resolve(context: Context, http: OkHttpClient): String {
        resolvedThisRun?.let { return it }
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val client = http.newBuilder()
            .readTimeout(20, TimeUnit.SECONDS)
            .callTimeout(30, TimeUnit.SECONDS)
            .build()
        val found = runCatching { discover(client) }.getOrNull()
        if (found != null) prefs.edit().putString(KEY_ENDPOINT, found).apply()
        val endpoint = found ?: prefs.getString(KEY_ENDPOINT, null) ?: DEFAULT
        resolvedThisRun = endpoint
        return endpoint
    }

    private fun discover(http: OkHttpClient): String? {
        val site = SiteConfig.siteUrl().ifEmpty { return null }
        val html = fetch(http, SiteConfig.homeUrl) ?: return null
        findInScript(html)?.let { return it }
        for (url in scriptUrls(html, site).take(MAX_SCRIPTS)) {
            findInScript(fetch(http, url) ?: continue)?.let { return it }
        }
        return null
    }

    private fun fetch(http: OkHttpClient, url: String): String? {
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", SiteHttp.USER_AGENT)
            .header("Referer", SiteConfig.siteReferer)
            .build()
        return http.newCall(request).execute().use { response ->
            if (response.isSuccessful) response.body?.string() else null
        }
    }
}
