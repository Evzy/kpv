package dev.kpv.app

import org.json.JSONObject

object StreamJson {

    fun pickEmbed(body: String): String? = runCatching {
        val data = JSONObject(body).getJSONObject("data")
        val sources = data.optJSONArray("sources") ?: return null
        var first: String? = null
        for (i in 0 until sources.length()) {
            val source = sources.getJSONObject(i)
            val url = source.optString("data").takeIf { it.startsWith("http") } ?: continue
            if (source.optBoolean("default")) return url
            if (first == null) first = url
        }
        first
    }.getOrNull()

    fun pickM3u8(body: String): String? = runCatching {
        val data = JSONObject(body).getJSONObject("data")
        val top = data.optString("m3u8")
        if (top.startsWith("http") && isPlaylist(top)) return top
        val sources = data.optJSONArray("sources") ?: return null
        for (i in 0 until sources.length()) {
            val source = sources.getJSONObject(i)
            val url = source.optString("data").takeIf { it.startsWith("http") } ?: continue
            if (isPlaylist(url)) return url
        }
        null
    }.getOrNull()

    fun mergeM3u8(body: String, m3u8: String): String = runCatching {
        val root = JSONObject(body)
        val data = root.optJSONObject("data") ?: JSONObject().also { root.put("data", it) }
        data.put("m3u8", m3u8)
        root.toString()
    }.getOrElse { body }

    fun isPlaylist(url: String): Boolean =
        Regex("\\.m3u8(\\?|$)", RegexOption.IGNORE_CASE).containsMatchIn(url)
}
