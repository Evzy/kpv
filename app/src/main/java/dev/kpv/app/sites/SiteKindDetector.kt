package dev.kpv.app.sites

import dev.kpv.app.ApiCatalogFetcher
import dev.kpv.app.SiteHttp

data class Probe(val kind: SiteKind, val listed: Int, val hasSources: Boolean)

/** Tries every parser on a site and picks the one that reads it best. */
object SiteKindDetector {

    private const val SOURCES_BONUS = 1_000

    fun choose(probes: List<Probe>): SiteKind? {
        val best = probes
            .map { it to score(it) }
            .filter { it.second > 0 }
            .sortedWith(compareByDescending<Pair<Probe, Int>> { it.second }.thenBy { it.first.kind.ordinal })
            .firstOrNull()
        return best?.first?.kind
    }

    /** Blocking; call off the main thread. */
    fun detect(origin: String): SiteKind? = choose(listOf(probeApi(origin), probeEventPages(origin)))

    private fun score(probe: Probe): Int =
        if (probe.listed == 0) 0 else probe.listed + if (probe.hasSources) SOURCES_BONUS else 0

    private fun probeApi(origin: String): Probe {
        val channels = runCatching { ApiCatalogFetcher.fetch(origin) }.getOrNull()?.flatMap { it.channels }.orEmpty()
        val hasSources = channels.any { it.playerIframeUrl.startsWith("http") || it.sources.isNotEmpty() }
        return Probe(SiteKind.API, channels.size, hasSources)
    }

    private fun probeEventPages(origin: String): Probe {
        val html = SiteHttp.openTextGet("$origin/", "$origin/") ?: return Probe(SiteKind.EVENT_PAGES, 0, false)
        val now = System.currentTimeMillis()
        val listed = EventPagesParser.parseEvents(html, origin).filter { EventPagesParser.isListed(it, now) }
        val sample = listed.minByOrNull { if (now in it.startMs..it.endMs) 0 else 1 }
        val hasSources = sample?.let { event ->
            SiteHttp.openTextGet(event.pageUrl, "$origin/")?.let { EventPagesParser.parseSources(it, event.pageUrl).isNotEmpty() }
        } == true
        return Probe(SiteKind.EVENT_PAGES, listed.size, hasSources)
    }
}
