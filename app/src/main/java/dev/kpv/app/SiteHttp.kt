package dev.kpv.app

import java.net.HttpURLConnection
import java.net.URL

object SiteHttp {

    const val USER_AGENT =
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

    fun openJsonGet(url: String, referer: String = SiteConfig.siteReferer): String? =
        get(url, referer, "application/json")

    fun openTextGet(url: String, referer: String): String? = get(url, referer, "text/html,*/*")

    private fun get(url: String, referer: String, accept: String): String? = runCatching {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = 12_000
        connection.readTimeout = 20_000
        connection.setRequestProperty("Accept", accept)
        connection.setRequestProperty("Referer", referer)
        connection.setRequestProperty("Origin", referer.trimEnd('/'))
        connection.setRequestProperty("User-Agent", USER_AGENT)
        try {
            if (connection.responseCode !in 200..299) return@runCatching null
            connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }.getOrNull()
}
