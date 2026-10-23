package dev.kpv.app

import android.content.Context
import dev.kpv.app.CategoryLayout.Prefs
import org.json.JSONArray
import org.json.JSONObject

/** Persists the user's category order/hidden items and the last loaded sports/leagues. */
object CategoryPrefsStore {

    private const val PREFS = "kpv_browse"
    private const val KEY_PREFS = "category_prefs"
    private const val KEY_KNOWN = "known_categories"

    fun load(context: Context): Prefs = decode(prefs(context).getString(KEY_PREFS, null))

    fun save(context: Context, value: Prefs) {
        prefs(context).edit().putString(KEY_PREFS, encode(value)).apply()
    }

    fun reset(context: Context) {
        prefs(context).edit().remove(KEY_PREFS).apply()
    }

    fun rememberKnown(context: Context, sports: List<CategoryLayout.Sport>) {
        prefs(context).edit().putString(KEY_KNOWN, encodeKnown(sports)).apply()
    }

    fun loadKnown(context: Context): List<CategoryLayout.Sport> =
        decodeKnown(prefs(context).getString(KEY_KNOWN, null))

    fun encode(value: Prefs): String = JSONObject().apply {
        put("sportOrder", value.sportOrder?.let { JSONArray(it) } ?: JSONObject.NULL)
        put("leagueOrder", JSONObject().apply { value.leagueOrder.forEach { (k, v) -> put(k, JSONArray(v)) } })
        put("hidden", JSONArray(value.hidden))
    }.toString()

    fun decode(raw: String?): Prefs {
        val root = raw?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return Prefs()
        val leagueOrder = root.optJSONObject("leagueOrder")?.let { obj ->
            obj.keys().asSequence().associateWith { strings(obj.optJSONArray(it)) }
        }.orEmpty()
        return Prefs(
            sportOrder = root.optJSONArray("sportOrder")?.let(::strings),
            leagueOrder = leagueOrder,
            hidden = strings(root.optJSONArray("hidden")),
        )
    }

    fun encodeKnown(sports: List<CategoryLayout.Sport>): String = JSONArray().apply {
        for (s in sports) {
            put(JSONObject().put("name", s.name).put("leagues", JSONArray(s.leagues.map { it.name })))
        }
    }.toString()

    fun decodeKnown(raw: String?): List<CategoryLayout.Sport> {
        val arr = raw?.let { runCatching { JSONArray(it) }.getOrNull() } ?: return emptyList()
        return (0 until arr.length()).mapNotNull { i ->
            val o = arr.optJSONObject(i) ?: return@mapNotNull null
            CategoryLayout.Sport(
                o.optString("name"),
                strings(o.optJSONArray("leagues")).map { CategoryLayout.League(it, emptyList()) },
            )
        }
    }

    private fun strings(arr: JSONArray?): List<String> =
        if (arr == null) emptyList() else (0 until arr.length()).map { arr.optString(it) }

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
