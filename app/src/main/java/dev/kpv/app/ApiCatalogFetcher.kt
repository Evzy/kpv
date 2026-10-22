package dev.kpv.app

import org.json.JSONObject

/** Catalog via `{api}/api/streams`, trying likely API hosts for the configured site. */
object ApiCatalogFetcher {

    fun fetch(): List<StreamCategory>? {
        SiteConfig.beginCatalogFetch()
        for (apiBase in SiteConfig.apiCandidates()) {
            val body = SiteHttp.openJsonGet(SiteConfig.streamsApiUrl(apiBase)) ?: continue
            val categories = parse(body) ?: continue
            SiteConfig.rememberApi(apiBase)
            return categories
        }
        return null
    }

    private fun parse(body: String): List<StreamCategory>? {
        val root = JSONObject(body)
        val nowSec = root.optLong("timestamp", System.currentTimeMillis() / 1000L)
        val blocks = root.optJSONArray("streams") ?: return null
        val categories = ArrayList<StreamCategory>(blocks.length())
        for (i in 0 until blocks.length()) {
            val block = blocks.getJSONObject(i)
            val name = block.optString("category")
            if (name.isBlank()) continue
            val streams = block.optJSONArray("streams") ?: continue
            val channels = ArrayList<ChannelListing>(streams.length())
            for (j in 0 until streams.length()) {
                val stream = streams.getJSONObject(j)
                val uri = stream.optString("uri_name")
                if (uri.isBlank()) continue
                val iframe = stream.optString("iframe")
                if (iframe.startsWith("http")) {
                    SiteConfig.noteEmbedOriginFromPlayerUrl(iframe)
                }
                channels += ChannelListing(
                    title = stream.optString("name", uri),
                    tag = stream.optString("tag"),
                    streamUri = uri,
                    pageUrl = SiteConfig.livePageUrl(uri),
                    posterUrl = stream.optString("poster"),
                    playerIframeUrl = iframe,
                    isLive = StreamLive.isLive(stream, nowSec),
                )
            }
            if (channels.isNotEmpty()) categories += StreamCategory(name, channels)
        }
        return StreamLive.sortCategories(categories).takeIf { it.isNotEmpty() }
    }
}
