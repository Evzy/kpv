package dev.kpv.app.sites

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SiteChatTest {

    @Test
    fun findsChatFrameAndResolvesItAgainstThePage() {
        val html = """
            <iframe id="stream-player" src="/embed?abc" allowfullscreen></iframe>
            <iframe src="/chat.html" title="Live Chat" allowfullscreen></iframe>
        """.trimIndent()
        assertEquals("https://example.com/chat.html", SiteChat.chatFrameUrl(html, "https://example.com/nba-1.html"))
    }

    @Test
    fun noChatFrameMeansNoUrl() {
        assertNull(SiteChat.chatFrameUrl("<iframe src=\"/embed?abc\"></iframe>", "https://example.com/a.html"))
    }

    @Test
    fun twitchEmbedOnThePageNeedsNoFetch() {
        val html = """<iframe src="https://www.twitch.tv/embed/Chan_1/chat?parent=example.com"></iframe>"""
        assertEquals("chan_1", SiteChat.twitchChannel(html, "https://example.com/a.html"))
    }
}
