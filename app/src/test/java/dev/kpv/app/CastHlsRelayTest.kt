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
        ) { "http://192.168.1.10:8767/cast/abc123/r/1" }
        assertEquals("http://192.168.1.10:8767/cast/abc123/r/1", out)
    }

    @Test
    fun rewriteLine_extInfUri_rewritten() {
        val line = "#EXT-X-MEDIA:URI=\"audio.m3u8\",TYPE=AUDIO"
        val out = CastHlsRelay.rewriteLine(
            line,
            "https://cdn.example.com/v/",
        ) { abs ->
            assertEquals("https://cdn.example.com/v/audio.m3u8", abs)
            "http://10.0.0.5:8767/cast/tok/r/2"
        }
        assertTrue(out.contains("URI=\"http://10.0.0.5:8767/cast/tok/r/2\""))
    }

    @Test
    fun singleVariantPlaylistUrl_picksLineAfterStreamInf() {
        val body = """
            #EXTM3U
            #EXT-X-STREAM-INF:BANDWIDTH=800000
            720p/index.m3u8
        """.trimIndent()
        assertEquals(
            "https://cdn.example.com/live/720p/index.m3u8",
            CastHlsRelay.singleVariantPlaylistUrl(body, "https://cdn.example.com/live/master.m3u8"),
        )
    }

    @Test
    fun isRelayablePlaylistUrl_rejectsIndexMaster() {
        assertEquals(false, CastHlsRelay.isRelayablePlaylistUrl("https://cdn/x/index.m3u8"))
        assertEquals(true, CastHlsRelay.isRelayablePlaylistUrl("https://cdn/tracks-v1/mono.ts.m3u8"))
    }

    @Test
    fun castEntryFetchCandidates_keepsSignedUrlOnly() {
        val signed = "https://cdn.example/secure/x/0/1/foxfooty/index.m3u8"
        assertEquals(listOf(signed), CastHlsRelay.castEntryFetchCandidates(signed))
    }

    @Test
    fun castEntryFetchCandidates_addsTrackUrlsForUnsignedIndexMaster() {
        val index = "https://cdn.example/live/foxfooty/index.m3u8"
        val candidates = CastHlsRelay.castEntryFetchCandidates(index)
        assertTrue(candidates.any { it.contains("tracks-v1v1/mono.ts.m3u8") })
    }

    @Test
    fun preferVideoMediaPlaylistUrl_swapsAudioTrackPath() {
        val audio = "https://cdn/foxfooty/tracks-v1a1/mono.ts.m3u8"
        assertEquals(
            "https://cdn/foxfooty/tracks-v1v1/mono.ts.m3u8",
            CastHlsRelay.preferVideoMediaPlaylistUrl(audio),
        )
    }

    @Test
    fun bestVariantPlaylistUrl_prefersVideoCodec() {
        val body = """
            #EXTM3U
            #EXT-X-STREAM-INF:BANDWIDTH=96000,CODECS="mp4a.40.2"
            https://cdn/audio/tracks-v1a1/mono.ts.m3u8
            #EXT-X-STREAM-INF:BANDWIDTH=2800000,CODECS="avc1.640028,mp4a.40.2"
            https://cdn/video/tracks-v1v1/mono.ts.m3u8
        """.trimIndent()
        assertEquals(
            "https://cdn/video/tracks-v1v1/mono.ts.m3u8",
            CastHlsRelay.bestVariantPlaylistUrl(body, "https://cdn/master.m3u8"),
        )
    }

    @Test
    fun singleVariantPlaylistUrl_nullForMediaPlaylist() {
        val body = """
            #EXTM3U
            #EXTINF:6.0,
            seg.ts
        """.trimIndent()
        assertEquals(null, CastHlsRelay.singleVariantPlaylistUrl(body, "https://cdn.example.com/live.m3u8"))
    }

    @Test
    fun resolveAgainstBase_absoluteUnchanged() {
        assertEquals(
            "https://other.example/seg.ts",
            CastHlsRelay.resolveAgainstBase("https://other.example/seg.ts", "https://cdn.example.com/"),
        )
    }
}
