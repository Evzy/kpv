package dev.kpv.app

import org.json.JSONObject

/** One playable version of a stream (main broadcast or an alternative feed). */
data class StreamSource(val label: String, val streamUri: String, val iframeUrl: String)

object StreamSources {

    /** Main source then `substreams`; empty when the stream has no alternatives. */
    fun fromJson(stream: JSONObject): List<StreamSource> {
        val subs = stream.optJSONArray("substreams") ?: return emptyList()
        val sources = ArrayList<StreamSource>(subs.length() + 1)
        sources += source(stream, sources.size)
        for (i in 0 until subs.length()) {
            val sub = subs.optJSONObject(i) ?: continue
            if (sub.optString("uri_name").isBlank()) continue
            sources += source(sub, sources.size)
        }
        return if (sources.size > 1) sources else emptyList()
    }

    private fun source(obj: JSONObject, index: Int): StreamSource {
        val label = obj.optString("source_tag").trim().ifEmpty { if (index == 0) "Main" else "Source ${index + 1}" }
        return StreamSource(label, obj.optString("uri_name"), obj.optString("iframe"))
    }
}

object SourceQueue {

    /** Next source to try after [current], wrapping around, skipping [tried]; null when none are left. */
    fun next(size: Int, current: Int, tried: Set<Int>): Int? =
        (1 until size).map { (current + it) % size }.firstOrNull { it !in tried }
}
