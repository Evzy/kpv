package dev.kpv.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CastLiveWindowTest {

    private val base = "https://cdn.example.com/live/index.m3u8"

    private fun upstream(firstSeq: Int, count: Int, extraHeader: String = ""): String = buildString {
        appendLine("#EXTM3U")
        appendLine("#EXT-X-VERSION:3")
        appendLine("#EXT-X-TARGETDURATION:5")
        appendLine("#EXT-X-MEDIA-SEQUENCE:$firstSeq")
        if (extraHeader.isNotEmpty()) appendLine(extraHeader)
        for (seq in firstSeq until firstSeq + count) {
            appendLine("#EXTINF:4.004,")
            appendLine("seg$seq.ts")
        }
    }

    private fun segments(playlist: String): List<String> =
        playlist.lines().filter { it.isNotBlank() && !it.startsWith("#") }

    private fun mediaSequence(playlist: String): Int =
        playlist.lines().first { it.startsWith("#EXT-X-MEDIA-SEQUENCE:") }.substringAfter(':').toInt()

    private val allReady: (String) -> Boolean = { true }

    @Test
    fun firstRefresh_listsReadyPrefix() {
        val window = CastHlsRelay.LiveWindow(maxSegments = 7)
        val out = window.update(upstream(100, 4), base) { !it.endsWith("seg103.ts") }
        assertEquals(
            listOf(
                "https://cdn.example.com/live/seg100.ts",
                "https://cdn.example.com/live/seg101.ts",
                "https://cdn.example.com/live/seg102.ts",
            ),
            segments(out),
        )
        assertEquals(100, mediaSequence(out))
    }

    @Test
    fun keepsSegmentsUpstreamDropped_upToMax() {
        val window = CastHlsRelay.LiveWindow(maxSegments = 7)
        window.update(upstream(100, 4), base, allReady)
        window.update(upstream(102, 4), base, allReady)
        val out = window.update(upstream(105, 4), base, allReady)
        assertEquals((102..108).map { "https://cdn.example.com/live/seg$it.ts" }, segments(out))
        assertEquals(102, mediaSequence(out))
    }

    @Test
    fun stopsAtFirstSegmentNotDownloaded() {
        val window = CastHlsRelay.LiveWindow(maxSegments = 7)
        window.update(upstream(100, 4), base, allReady)
        val out = window.update(upstream(102, 4), base) { !it.endsWith("seg104.ts") }
        assertEquals((100..103).map { "https://cdn.example.com/live/seg$it.ts" }, segments(out))
    }

    @Test
    fun keepsTagsBeforeEachSegment() {
        val window = CastHlsRelay.LiveWindow(maxSegments = 7)
        val body = """
            #EXTM3U
            #EXT-X-TARGETDURATION:5
            #EXT-X-MEDIA-SEQUENCE:7
            #EXT-X-PROGRAM-DATE-TIME:2026-10-27T03:15:27.434Z
            #EXTINF:4.004,
            a.ts
            #EXT-X-DISCONTINUITY
            #EXTINF:4.004,
            b.ts
        """.trimIndent()
        val out = window.update(body, base, allReady)
        assertTrue(out.contains("#EXT-X-PROGRAM-DATE-TIME:2026-10-27T03:15:27.434Z\n#EXTINF:4.004,\nhttps://cdn.example.com/live/a.ts"))
        assertTrue(out.contains("#EXT-X-DISCONTINUITY\n#EXTINF:4.004,\nhttps://cdn.example.com/live/b.ts"))
        assertEquals(1, out.lines().count { it.startsWith("#EXT-X-TARGETDURATION") })
    }

    @Test
    fun sequenceGoingBackwards_resetsWindow() {
        val window = CastHlsRelay.LiveWindow(maxSegments = 7)
        window.update(upstream(100, 4), base, allReady)
        val out = window.update(upstream(5, 3), base, allReady)
        assertEquals((5..7).map { "https://cdn.example.com/live/seg$it.ts" }, segments(out))
        assertEquals(5, mediaSequence(out))
    }

    @Test
    fun sequenceJumpingPastWindow_resetsWindow() {
        val window = CastHlsRelay.LiveWindow(maxSegments = 7)
        window.update(upstream(100, 4), base, allReady)
        val out = window.update(upstream(200, 4), base, allReady)
        assertEquals((200..203).map { "https://cdn.example.com/live/seg$it.ts" }, segments(out))
    }

    @Test
    fun nothingReadyYet_keepsPreviousWindow() {
        val window = CastHlsRelay.LiveWindow(maxSegments = 7)
        window.update(upstream(100, 4), base, allReady)
        val out = window.update(upstream(101, 4), base) { false }
        assertEquals((100..103).map { "https://cdn.example.com/live/seg$it.ts" }, segments(out))
    }

    @Test
    fun vodPlaylist_passesThrough() {
        val window = CastHlsRelay.LiveWindow(maxSegments = 2)
        val body = upstream(0, 4) + "#EXT-X-ENDLIST\n"
        val out = window.update(body, base) { false }
        assertEquals(body, out)
    }

    @Test
    fun missingMediaSequence_startsAtZero() {
        val window = CastHlsRelay.LiveWindow(maxSegments = 7)
        val body = "#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXTINF:4.0,\na.ts\n#EXTINF:4.0,\nb.ts\n"
        val out = window.update(body, base, allReady)
        assertEquals(0, mediaSequence(out))
        assertEquals(2, segments(out).size)
    }
}
