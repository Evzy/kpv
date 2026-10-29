package dev.kpv.app.sites

import dev.kpv.app.SiteHttp
import dev.kpv.app.chat.TwitchIrc
import java.net.URI
import java.util.concurrent.ConcurrentHashMap

/** Finds the Twitch chat a match page embeds, directly or through its chat frame. */
object SiteChat {

    private val IFRAME = Regex("<iframe\\b[^>]*>", RegexOption.IGNORE_CASE)
    private val SRC = Regex("\\bsrc\\s*=\\s*[\"']([^\"']+)[\"']", RegexOption.IGNORE_CASE)
    private val frameChannels = ConcurrentHashMap<String, String>()

    fun chatFrameUrl(html: String, pageUrl: String): String? =
        IFRAME.findAll(html)
            .map { it.value }
            .firstOrNull { it.contains("chat", ignoreCase = true) }
            ?.let { SRC.find(it)?.groupValues?.get(1) }
            ?.let { runCatching { URI(pageUrl).resolve(it.trim()).toString() }.getOrNull() }

    /** Blocking; call off the main thread. Returns "" when the page has no Twitch chat. */
    fun twitchChannel(html: String, pageUrl: String): String {
        TwitchIrc.findChannel(html)?.let { return it }
        val frame = chatFrameUrl(html, pageUrl) ?: return ""
        TwitchIrc.findChannel(frame)?.let { return it }
        frameChannels[frame]?.let { return it }
        val channel = SiteHttp.openTextGet(frame, pageUrl)?.let(TwitchIrc::findChannel) ?: return ""
        frameChannels[frame] = channel
        return channel
    }
}
