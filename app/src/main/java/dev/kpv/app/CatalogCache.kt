package dev.kpv.app

import org.json.JSONArray
import org.json.JSONObject

/** Last catalog loaded on the phone — TV companion reads this instead of re-fetching the API. */
object CatalogCache {

    @Volatile
    private var categories: List<StreamCategory>? = null

    fun set(cats: List<StreamCategory>) {
        categories = cats
    }

    fun get(): List<StreamCategory>? = categories

    fun clear() {
        categories = null
    }

    fun toPlaybackJson(): JSONObject? {
        val cats = categories ?: return null
        val blocks = JSONArray()
        for (cat in cats) {
            val streams = JSONArray()
            for (ch in cat.channels) {
                val embed = ch.playerIframeUrl.takeIf { it.startsWith("http") }
                    ?: SiteConfig.embedUrl(ch.streamUri)
                streams.put(
                    JSONObject()
                        .put("uri_name", ch.streamUri)
                        .put("name", ch.title)
                        .put("tag", ch.tag)
                        .put("poster", ch.posterUrl)
                        .put("iframe", embed)
                        .put("m3u8", "")
                        .put("referer", embed),
                )
            }
            blocks.put(
                JSONObject()
                    .put("category", cat.name)
                    .put("streams", streams),
            )
        }
        return JSONObject().put("streams", blocks)
    }
}
