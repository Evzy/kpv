package dev.kpv.app

import org.json.JSONObject

/** Catalog via `{api}/api/streams`, trying likely API hosts for the configured site. */
object ApiCatalogFetcher {

    fun fetch(origin: String = SiteConfig.siteUrl()): List<StreamCategory>? {
        val isTop = origin == SiteConfig.siteUrl()
        if (isTop) SiteConfig.beginCatalogFetch()
        val candidates = if (isTop) SiteConfig.apiCandidates() else SiteConfig.apiCandidatesFor(origin)
        for (apiBase in candidates) {
            val body = SiteHttp.openJsonGet(SiteConfig.streamsApiUrl(apiBase), referer = "$origin/") ?: continue
            val categories = runCatching { parse(body, origin, isTop) }.getOrNull() ?: continue
            if (isTop) SiteConfig.rememberApi(apiBase)
            return categories
        }
        return null
    }

    private fun parse(body: String, origin: String, isTop: Boolean): List<StreamCategory>? {
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
                if (isTop && iframe.startsWith("http")) {
                    SiteConfig.noteEmbedOriginFromPlayerUrl(iframe)
                }
                channels += ChannelListing(
                    title = stream.optString("name", uri),
                    tag = stream.optString("tag"),
                    streamUri = uri,
                    pageUrl = "$origin/live/$uri",
                    posterUrl = stream.optString("poster"),
                    playerIframeUrl = iframe,
                    isLive = StreamLive.isLive(stream, nowSec),
                    startsAt = stream.optLong("starts_at", 0L),
                    endsAt = stream.optLong("ends_at", 0L),
                    alwaysLive = stream.optInt("always_live", 0) == 1 || stream.optBoolean("always_live", false),
                    streamId = stream.optLong("id", 0L),
                    sources = StreamSources.fromJson(stream),
                )
            }
            if (channels.isNotEmpty()) categories += StreamCategory(name, channels)
        }
        return StreamLive.sortCategories(categories).takeIf { it.isNotEmpty() }
    }
}
