package dev.kpv.app.sites

import dev.kpv.app.ApiCatalogFetcher
import dev.kpv.app.ChannelListing
import dev.kpv.app.SiteHttp
import dev.kpv.app.StreamCategory

/** Reads a site with the parser chosen for it. Blocking; call off the main thread. */
object SiteAdapters {

    fun catalog(entry: SiteEntry): List<StreamCategory>? = when (entry.kind) {
        SiteKind.API -> ApiCatalogFetcher.fetch(entry.origin)
        SiteKind.EVENT_PAGES -> {
            val html = SiteHttp.openTextGet("${entry.origin}/", "${entry.origin}/")
            html?.let { EventPagesParser.toCatalog(EventPagesParser.parseEvents(it, entry.origin), System.currentTimeMillis()) }
                ?.takeIf { it.isNotEmpty() }
        }
    }

    fun events(entry: SiteEntry): List<Pair<SiteEvent, ChannelListing>>? {
        val index = SiteList.all().indexOf(entry).coerceAtLeast(0)
        val channels = catalog(entry)?.flatMap { it.channels } ?: return null
        return channels.distinctBy { it.streamUri }.map { channel ->
            SiteEvent(channel.title, channel.startsAt, channel.streamUri) to channel.copy(siteIndex = index)
        }
    }

    fun withSources(channel: ChannelListing): ChannelListing? {
        if (channel.sourcesPage.isEmpty()) return channel
        val origin = SiteList.all().getOrNull(channel.siteIndex)?.origin ?: return null
        val html = SiteHttp.openTextGet(channel.sourcesPage, "$origin/") ?: return null
        val sources = EventPagesParser.parseSources(html, channel.sourcesPage)
        return when {
            sources.isEmpty() -> null
            sources.size == 1 -> channel.copy(playerIframeUrl = sources[0].iframeUrl, sources = emptyList(), sourcesPage = "")
            else -> channel.copy(playerIframeUrl = sources[0].iframeUrl, sources = sources, sourcesPage = "")
        }
    }
}
