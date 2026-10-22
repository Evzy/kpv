package dev.kpv.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CastHlsRelayTest {

    @Test
    fun rewriteLine_relativePlaylist_becomesProxyUrl() {
        val line = "720p/index.m3u8"
        val out = CastHlsRelay.rewriteLine(
            line,
            "https://cdn.example.com/live/",
            "192.168.1.10",
            8767,
            "abc123",
        )
        assertTrue(out.contains("/cast/abc123/p?u="))
        assertTrue(out.contains(encode("https://cdn.example.com/live/720p/index.m3u8")))
    }

    @Test
    fun rewriteLine_extInfUri_rewritten() {
        val line = "#EXT-X-MEDIA:URI=\"audio.m3u8\",TYPE=AUDIO"
        val out = CastHlsRelay.rewriteLine(
            line,
            "https://cdn.example.com/v/",
            "10.0.0.5",
            8767,
            "tok",
        )
        assertTrue(out.contains("URI=\"http://10.0.0.5:8767/cast/tok/p?u="))
    }

    @Test
    fun resolveAgainstBase_absoluteUnchanged() {
        assertEquals(
            "https://other.example/seg.ts",
            CastHlsRelay.resolveAgainstBase("https://other.example/seg.ts", "https://cdn.example.com/"),
        )
    }

    private fun encode(url: String): String =
        java.net.URLEncoder.encode(url, Charsets.UTF_8)
}
