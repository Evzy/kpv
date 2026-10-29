package dev.kpv.app.sites

import org.junit.Assert.assertEquals
import org.junit.Test

class SiteListCodecTest {
    private val a = SiteEntry("https://api-site.example", SiteKind.API)
    private val b = SiteEntry("https://events.example", SiteKind.EVENT_PAGES)

    @Test fun normalizeAddsSchemeAndTrimsSlash() {
        assertEquals("https://events.example", SiteListCodec.normalize(" events.example/ "))
        assertEquals("http://x.example", SiteListCodec.normalize("http://x.example/"))
    }

    @Test fun encodeDecodeRoundTrip() {
        assertEquals(listOf(a, b), SiteListCodec.decode(SiteListCodec.encode(listOf(a, b))))
    }

    @Test fun decodeBadJsonIsEmpty() {
        assertEquals(emptyList<SiteEntry>(), SiteListCodec.decode("not json"))
        assertEquals(emptyList<SiteEntry>(), SiteListCodec.decode(null))
    }

    @Test fun decodeUnknownKindSkipsEntry() {
        val json = """[{"origin":"https://a.example","kind":"MYSTERY"},{"origin":"https://events.example","kind":"EVENT_PAGES"}]"""
        assertEquals(listOf(b), SiteListCodec.decode(json))
    }

    @Test fun addReplacesSameOriginInPlace() {
        val updated = SiteListCodec.add(listOf(a, b), SiteEntry("https://api-site.example", SiteKind.EVENT_PAGES))
        assertEquals(listOf(SiteEntry("https://api-site.example", SiteKind.EVENT_PAGES), b), updated)
    }

    @Test fun addAppendsNewOrigin() {
        assertEquals(listOf(a, b), SiteListCodec.add(listOf(a), b))
    }

    @Test fun moveSwapsAndClampsAtEnds() {
        assertEquals(listOf(b, a), SiteListCodec.move(listOf(a, b), 1, -1))
        assertEquals(listOf(a, b), SiteListCodec.move(listOf(a, b), 0, -1))
        assertEquals(listOf(a, b), SiteListCodec.move(listOf(a, b), 1, 1))
    }

    @Test fun removeDropsIndex() {
        assertEquals(listOf(b), SiteListCodec.remove(listOf(a, b), 0))
    }
}
