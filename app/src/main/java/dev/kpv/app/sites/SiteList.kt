package dev.kpv.app.sites

import android.content.Context
import dev.kpv.app.SiteConfig

/** The user's ordered sites; the first one feeds the home screen. */
object SiteList {
    private const val PREFS = "kpv_site_config"
    private const val KEY_SITES = "sites"
    private const val KEY_LEGACY_SITE = "site_origin"
    private const val KEY_API = "resolved_api"
    private const val KEY_API_SITE = "resolved_api_site"

    private lateinit var appContext: Context
    @Volatile private var cached: List<SiteEntry> = emptyList()

    fun init(context: Context) {
        appContext = context.applicationContext
        val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        cached = SiteListCodec.decode(prefs.getString(KEY_SITES, null))
        if (cached.isEmpty()) {
            val legacy = SiteListCodec.normalize(prefs.getString(KEY_LEGACY_SITE, null).orEmpty())
            if (legacy.isNotEmpty()) {
                cached = listOf(SiteEntry(legacy, SiteKind.API))
                val edit = prefs.edit().putString(KEY_SITES, SiteListCodec.encode(cached)).remove(KEY_LEGACY_SITE)
                if (!prefs.getString(KEY_API, null).isNullOrBlank()) edit.putString(KEY_API_SITE, legacy)
                edit.apply()
            }
        }
    }

    fun all(): List<SiteEntry> = cached

    fun top(): SiteEntry? = cached.firstOrNull()

    fun save(list: List<SiteEntry>) {
        cached = list
        appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_SITES, SiteListCodec.encode(list))
            .apply()
        SiteConfig.reload()
    }
}
