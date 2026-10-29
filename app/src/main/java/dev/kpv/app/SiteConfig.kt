package dev.kpv.app

import android.content.Context
import android.net.Uri
import dev.kpv.app.sites.SiteKind
import dev.kpv.app.sites.SiteList

/** The top listed site drives the home screen; API and embed hosts are resolved from it and its catalog API. */
object SiteConfig {

    private const val PREFS = "kpv_site_config"
    private const val KEY_API = "resolved_api"
    private const val KEY_API_SITE = "resolved_api_site"

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

    fun rememberApi(api: String) {
        val a = normalizeOrigin(api)
        if (a.isEmpty()) return
        resolvedApi = a
        appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_API, a)
            .putString(KEY_API_SITE, cachedSite)
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

    /** API bases to try for `{base}/api/streams` on [origin] (subdomain first, then same origin). */
    fun apiCandidatesFor(origin: String): List<String> {
        val site = normalizeOrigin(origin)
        if (site.isEmpty()) return emptyList()
        val uri = Uri.parse(site)
        val scheme = uri.scheme ?: "https"
        val host = uri.host ?: return listOf(site)
        val out = linkedSetOf<String>()
        if (!host.startsWith("api.")) out += "$scheme://api.$host"
        out += site
        return out.toList()
    }

    /** API bases for the top site, the remembered API first. */
    fun apiCandidates(): List<String> =
        (listOfNotNull(resolvedApi.takeIf { it.isNotEmpty() }) + apiCandidatesFor(cachedSite)).distinct()

    /** Homepage of the listed site that owns [url]'s host, else the top site's. */
    fun refererFor(url: String): String {
        val host = Uri.parse(url).host ?: return siteReferer
        val site = SiteList.all().firstOrNull { entry ->
            val siteHost = Uri.parse(entry.origin).host ?: return@firstOrNull false
            host == siteHost || host.endsWith(".$siteHost")
        }
        return site?.let { "${it.origin}/" } ?: siteReferer
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

    private fun origins(): List<String> =
        (listOf(cachedSite, resolvedApi, resolvedEmbed) + SiteList.all().map { it.origin })
            .filter { it.isNotEmpty() }
            .distinct()

    private fun load() {
        val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val top = SiteList.top()
        cachedSite = top?.origin.orEmpty()
        val apiBelongsToTop = top?.kind == SiteKind.API && prefs.getString(KEY_API_SITE, null) == cachedSite
        resolvedApi = if (apiBelongsToTop) normalizeOrigin(prefs.getString(KEY_API, null).orEmpty()) else ""
        if (resolvedApi.isEmpty() && (prefs.contains(KEY_API) || prefs.contains(KEY_API_SITE))) {
            prefs.edit().remove(KEY_API).remove(KEY_API_SITE).apply()
        }
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
}
