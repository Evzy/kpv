package dev.kpv.app

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class StreamSourcesTest {

    @Test
    fun mainSourceFirstThenSubstreams() {
        val stream = JSONObject(
            """{"uri_name":"nba/2026-10-26/dal-mia","source_tag":"NBA TV",
               "iframe":"https://e.example/embed/nba/2026-10-26/dal-mia",
               "substreams":[{"uri_name":"nba/2026-10-26/dal-mia/away","source_tag":"KFAA-TV (Away)",
                              "iframe":"https://e.example/embed/nba/2026-10-26/dal-mia/away"}]}""",
        )
        assertEquals(
            listOf(
                StreamSource("NBA TV", "nba/2026-10-26/dal-mia", "https://e.example/embed/nba/2026-10-26/dal-mia"),
                StreamSource("KFAA-TV (Away)", "nba/2026-10-26/dal-mia/away", "https://e.example/embed/nba/2026-10-26/dal-mia/away"),
            ),
            StreamSources.fromJson(stream),
        )
    }

    @Test
    fun noSubstreamsMeansNoSources() {
        assertEquals(emptyList<StreamSource>(), StreamSources.fromJson(JSONObject("""{"uri_name":"x","substreams":[]}""")))
        assertEquals(emptyList<StreamSource>(), StreamSources.fromJson(JSONObject("""{"uri_name":"x"}""")))
    }

    @Test
    fun fallbackLabelsAndSkipsBlankUris() {
        val stream = JSONObject(
            """{"uri_name":"a","substreams":[{"uri_name":""},{"uri_name":"b"},{"uri_name":"c","source_tag":" "}]}""",
        )
        assertEquals(listOf("Main", "Source 2", "Source 3"), StreamSources.fromJson(stream).map { it.label })
        assertEquals(listOf("a", "b", "c"), StreamSources.fromJson(stream).map { it.streamUri })
    }

    @Test
    fun queueTriesInOrderAfterCurrentAndWraps() {
        assertEquals(2, SourceQueue.next(size = 4, current = 1, tried = setOf(1)))
        assertEquals(0, SourceQueue.next(size = 4, current = 3, tried = setOf(3)))
        assertEquals(3, SourceQueue.next(size = 4, current = 1, tried = setOf(1, 2)))
        assertEquals(0, SourceQueue.next(size = 4, current = 1, tried = setOf(1, 2, 3)))
        assertNull(SourceQueue.next(size = 4, current = 1, tried = setOf(0, 1, 2, 3)))
        assertNull(SourceQueue.next(size = 1, current = 0, tried = setOf(0)))
    }
}
