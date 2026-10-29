package dev.kpv.app.sites

import org.json.JSONArray
import org.json.JSONObject

object SiteListCodec {

    fun normalize(raw: String): String {
        val trimmed = raw.trim().trimEnd('/')
        if (trimmed.isEmpty()) return ""
        return if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) trimmed else "https://$trimmed"
    }

    fun encode(list: List<SiteEntry>): String =
        JSONArray().apply {
            list.forEach { put(JSONObject().put("origin", it.origin).put("kind", it.kind.name)) }
        }.toString()

    fun decode(json: String?): List<SiteEntry> {
        if (json.isNullOrBlank()) return emptyList()
        val array = runCatching { JSONArray(json) }.getOrNull() ?: return emptyList()
        return (0 until array.length()).mapNotNull { i ->
            val obj = array.optJSONObject(i) ?: return@mapNotNull null
            val origin = normalize(obj.optString("origin"))
            val kind = runCatching { SiteKind.valueOf(obj.optString("kind")) }.getOrNull()
            if (origin.isEmpty() || kind == null) null else SiteEntry(origin, kind)
        }
    }

    fun add(list: List<SiteEntry>, entry: SiteEntry): List<SiteEntry> {
        val index = list.indexOfFirst { it.origin == entry.origin }
        return if (index >= 0) list.toMutableList().also { it[index] = entry } else list + entry
    }

    fun remove(list: List<SiteEntry>, index: Int): List<SiteEntry> =
        list.filterIndexed { i, _ -> i != index }

    fun move(list: List<SiteEntry>, index: Int, dir: Int): List<SiteEntry> {
        val target = index + dir
        if (index !in list.indices || target !in list.indices) return list
        return list.toMutableList().also { it[index] = list[target]; it[target] = list[index] }
    }
}
