package dev.kpv.app

import android.content.Context
import android.net.Uri
import java.util.Properties

/** User picks the site URL; API and embed hosts are resolved from that site and its catalog API. */
object SiteConfig {

    private const val PREFS = "kpv_site_config"
    private const val KEY_SITE = "site_origin"
    private const val KEY_API = "resolved_api"
    private const val KEY_COMPANION = "companion_enabled"
    private const val KEY_COMPANION_PORT = "companion_port"

    private lateinit var appContext: Context
    private var cachedSite: String = ""
    private var resolvedApi: String = ""
    private var resolvedEmbed: String = ""
    private val extraAllowedHosts = linkedSetOf<String>()

    val siteOrigin: String get() = cachedSite
    val apiOrigin: String get() = resolvedApi.ifEmpty { cachedSite }
    val embedOrigin: String get() = resolvedEmbed.ifEmpty { apiOrigin }

    fun init(context: Context) {
        appContext = context.applicationContext
        load()
    }

    fun reload() {
        load()
    }

    fun siteUrl(): String = cachedSite

    fun isCompanionEnabled(): Boolean =
        appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_COMPANION, false)

    fun setCompanionEnabled(enabled: Boolean) {
        appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_COMPANION, enabled)
            .apply()
    }

    fun companionPort(): Int {
        val p = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getInt(KEY_COMPANION_PORT, TvCompanion.defaultPort())
        return if (p in 1024..65535) p else TvCompanion.defaultPort()
    }

    fun saveSite(site: String) {
        val s = normalizeOrigin(site)
        appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_SITE, s)
            .remove(KEY_API)
            .apply()
        cachedSite = s
        clearResolvedEndpoints()
    }

    fun rememberApi(api: String) {
        val a = normalizeOrigin(api)
        if (a.isEmpty()) return
        resolvedApi = a
        appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_API, a)
            .apply()
    }

    fun noteEmbedOriginFromPlayerUrl(playerUrl: String) {
        val origin = originFromPlayerUrl(playerUrl) ?: return
        resolvedEmbed = origin
        Uri.parse(origin).host?.let { rememberAllowedHost(it) }
    }

    fun rememberAllowedHost(host: String) {
        if (host.isNotBlank()) extraAllowedHosts += host
    }

    fun beginCatalogFetch() {
        resolvedEmbed = ""
        extraAllowedHosts.clear()
    }

    /** API bases to try for `{base}/api/streams` (subdomain first, then same origin). */
    fun apiCandidates(): List<String> {
        val site = cachedSite
        if (site.isEmpty()) return emptyList()
        val uri = Uri.parse(site)
        val scheme = uri.scheme ?: "https"
        val host = uri.host ?: return listOf(site)
        val out = linkedSetOf<String>()
        if (resolvedApi.isNotEmpty()) out += resolvedApi
        if (!host.startsWith("api.")) out += "$scheme://api.$host"
        out += site
        return out.toList()
    }

    val homeUrl: String get() = "$cachedSite/"
    val siteReferer: String get() = homeUrl

    fun streamsApiUrl(apiBase: String = apiOrigin): String = "${normalizeOrigin(apiBase)}/api/streams"

    fun streamApiUrl(streamUri: String, apiBase: String = apiOrigin): String {
        val path = streamUri.split("/").joinToString("/") { Uri.encode(it) }
        return "${normalizeOrigin(apiBase)}/api/streams/$path"
    }

    fun livePageUrl(streamUri: String): String = "$cachedSite/live/$streamUri"

    fun embedUrl(streamUri: String): String = "$embedOrigin/embed/$streamUri"

    fun isAllowedHost(host: String?): Boolean {
        if (host.isNullOrBlank()) return false
        val bare = host.substringBefore(':')
        if (extraAllowedHosts.any { bare == it || bare.endsWith(".$it") }) return true
        return origins().any { origin ->
            val allowed = Uri.parse(origin).host ?: return@any false
            bare == allowed || bare.endsWith(".$allowed")
        }
    }

    private fun origins(): List<String> = listOf(cachedSite, resolvedApi, resolvedEmbed).filter { it.isNotEmpty() }.distinct()

    private fun load() {
        val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        cachedSite = normalizeOrigin(prefs.getString(KEY_SITE, null).orEmpty())
        if (cachedSite.isEmpty()) {
            runCatching {
                Properties().apply {
                    appContext.assets.open("site.config.properties").use { load(it) }
                }.opt("site_origin")
            }.getOrNull()?.let { cachedSite = normalizeOrigin(it) }
        }
        resolvedApi = normalizeOrigin(prefs.getString(KEY_API, null).orEmpty())
        clearResolvedEndpoints(keepApi = resolvedApi.isNotEmpty())
    }

    private fun clearResolvedEndpoints(keepApi: Boolean = false) {
        if (!keepApi) resolvedApi = ""
        resolvedEmbed = ""
        extraAllowedHosts.clear()
    }

    private fun normalizeOrigin(raw: String): String = raw.trim().trimEnd('/')

    private fun originFromPlayerUrl(playerUrl: String): String? {
        if (!playerUrl.startsWith("http")) return null
        val uri = Uri.parse(playerUrl)
        val scheme = uri.scheme ?: return null
        val host = uri.host ?: return null
        return normalizeOrigin("$scheme://$host")
    }

    private fun Properties.opt(key: String): String = getProperty(key)?.trim().orEmpty()
}
