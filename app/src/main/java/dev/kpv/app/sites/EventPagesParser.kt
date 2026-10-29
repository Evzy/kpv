package dev.kpv.app.sites

import dev.kpv.app.ChannelListing
import dev.kpv.app.StreamCategory
import dev.kpv.app.StreamLive
import dev.kpv.app.StreamSource
import org.json.JSONArray
import java.net.URI
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

data class PageEvent(
    val title: String,
    val pageUrl: String,
    val startMs: Long,
    val endMs: Long,
    val posterUrl: String,
    val category: String,
)

/** Sites that list matches in an `EVENTS_DATA` script array, with a page of embed feeds per match. */
object EventPagesParser {

    private const val ENDED_GRACE_MS = 30 * 60_000L
    private const val UPCOMING_WINDOW_MS = 24 * 3_600_000L
    private val EVENTS_START = Regex("""EVENTS_DATA\s*=\s*\[""")
    private val FEED_BUTTON = Regex(
        """<button[^>]*class="[^"]*stream-btn[^"]*"[^>]*data-url="([^"]+)"[^>]*>([^<]*)</button>""",
        RegexOption.IGNORE_CASE,
    )
    private val EMBED_IFRAME = Regex("""<iframe[^>]*\ssrc="([^"]*/embed[^"]*)"""", RegexOption.IGNORE_CASE)

    fun parseEvents(html: String, origin: String): List<PageEvent> {
        val json = eventsArray(html) ?: return emptyList()
        val array = runCatching { JSONArray(json) }.getOrNull() ?: return emptyList()
        return (0 until array.length()).mapNotNull { i ->
            val obj = array.optJSONObject(i) ?: return@mapNotNull null
            val title = obj.optString("title").trim()
            val href = obj.optString("href").trim()
            val start = parseInstant(obj.optString("start"))
            val end = parseInstant(obj.optString("end"))
            if (title.isEmpty() || href.isEmpty() || start == null || end == null) return@mapNotNull null
            PageEvent(
                title = title,
                pageUrl = resolve("$origin/", href),
                startMs = start,
                endMs = end,
                posterUrl = obj.optString("bg"),
                category = obj.optString("category").ifBlank { "Events" },
            )
        }
    }

    fun parseSources(html: String, pageUrl: String): List<StreamSource> {
        val buttons = FEED_BUTTON.findAll(html).map { m ->
            val url = resolve(pageUrl, m.groupValues[1].replace("&amp;", "&"))
            val label = m.groupValues[2].trim().ifEmpty { "Feed" }
            StreamSource(label, url, url)
        }.distinctBy { it.iframeUrl }.toList()
        if (buttons.isNotEmpty()) return buttons
        val iframe = EMBED_IFRAME.find(html)?.groupValues?.get(1) ?: return emptyList()
        val url = resolve(pageUrl, iframe.replace("&amp;", "&"))
        return listOf(StreamSource("Main", url, url))
    }

    fun isListed(event: PageEvent, nowMs: Long): Boolean =
        nowMs - event.endMs <= ENDED_GRACE_MS && event.startMs - nowMs <= UPCOMING_WINDOW_MS

    fun toCatalog(events: List<PageEvent>, nowMs: Long): List<StreamCategory> {
        val listed = events.filter { isListed(it, nowMs) }
        val categories = listed.groupBy { it.category }.map { (name, group) ->
            StreamCategory(name, group.sortedBy { it.startMs }.map { toListing(it, nowMs) })
        }
        return StreamLive.sortCategories(categories)
    }

    private fun toListing(event: PageEvent, nowMs: Long) = ChannelListing(
        title = event.title,
        tag = event.category,
        streamUri = event.pageUrl,
        pageUrl = event.pageUrl,
        posterUrl = event.posterUrl,
        isLive = nowMs in event.startMs..event.endMs,
        startsAt = event.startMs / 1000,
        endsAt = event.endMs / 1000,
        sourcesPage = event.pageUrl,
    )

    /** The `[...]` after `EVENTS_DATA =`, matched by bracket depth outside string literals. */
    private fun eventsArray(html: String): String? {
        val start = EVENTS_START.find(html)?.let { it.range.last } ?: return null
        var depth = 0
        var quote: Char? = null
        var i = start
        while (i < html.length) {
            val c = html[i]
            if (quote != null) {
                if (c == '\\') i++ else if (c == quote) quote = null
            } else when (c) {
                '"', '\'' -> quote = c
                '[' -> depth++
                ']' -> if (--depth == 0) return html.substring(start, i + 1)
            }
            i++
        }
        return null
    }

    /** ISO UTC times like `2026-10-29T00:00:00Z` (minSdk 21 has no java.time). */
    private fun parseInstant(raw: String): Long? = runCatching {
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC"); isLenient = false }
            .parse(raw.trim().replace(Regex("""\.\d+Z$"""), "Z"))!!.time
    }.getOrNull()

    private fun resolve(base: String, ref: String): String =
        runCatching { URI(base).resolve(ref).toString() }.getOrDefault(ref)
}
