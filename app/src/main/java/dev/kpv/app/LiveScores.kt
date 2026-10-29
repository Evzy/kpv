package dev.kpv.app

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.Normalizer
import java.util.concurrent.ConcurrentHashMap

/** Live scores from ESPN's public scoreboard, matched to event titles by team names. */
object LiveScores {
    private const val BASE = "https://site.api.espn.com/apis/site/v2/sports/"
    private const val TIMEOUT_MS = 5_000
    private val LEAGUES = mapOf(
        "nfl" to "football/nfl",
        "college football" to "football/college-football",
        "canadian football" to "football/cfl",
        "nba" to "basketball/nba",
        "nbl" to "basketball/nbl",
        "nhl" to "hockey/nhl",
        "afl" to "australian-football/afl",
        "nrl" to "rugby-league/3",
        "premier league" to "soccer/eng.1",
        "laliga" to "soccer/esp.1",
        "serie a" to "soccer/ita.1",
        "bundesliga" to "soccer/ger.1",
        "ligue 1" to "soccer/fra.1",
        "eredivisie" to "soccer/ned.1",
        "mls" to "soccer/usa.1",
        "liga mx" to "soccer/mex.1",
        "allsvenskan" to "soccer/swe.1",
        "mlb" to "baseball/mlb",
        "wnba" to "basketball/wnba",
    )
    /** Sites that tag by sport rather than league; every listed league is checked. */
    private val SPORTS = mapOf(
        "basketball" to listOf("basketball/nba", "basketball/wnba", "basketball/nbl"),
        "hockey" to listOf("hockey/nhl"),
        "ice hockey" to listOf("hockey/nhl"),
        "baseball" to listOf("baseball/mlb"),
        "american football" to listOf("football/nfl", "football/college-football"),
        "football" to listOf("football/nfl", "football/college-football"),
        "soccer" to listOf(
            "soccer/eng.1", "soccer/esp.1", "soccer/ita.1", "soccer/ger.1", "soccer/fra.1",
            "soccer/usa.1", "soccer/uefa.champions", "soccer/uefa.europa",
        ),
    )
    private val NOISE = setOf("fc", "cf", "sc", "afc")
    private val ACCENTS = Regex("\\p{Mn}+")
    private val NON_ALNUM = Regex("[^a-z0-9]+")

    /** Latest score lines by stream URI. */
    @Volatile
    var lines: Map<String, String> = emptyMap()
        private set

    fun leaguePath(tag: String): String = LEAGUES[tag.trim().lowercase()].orEmpty()

    fun leaguePaths(tag: String): List<String> {
        val key = tag.trim().lowercase()
        return LEAGUES[key]?.let(::listOf) ?: SPORTS[key].orEmpty()
    }

    fun scoreboardUrl(path: String): String = "$BASE$path/scoreboard?limit=300"

    fun lineFor(channel: ChannelListing, nowSec: Long): String? =
        lines[channel.streamUri] ?: FixtureLine.timeLine(channel, nowSec)

    /** Blocking (one request per league, in parallel); call off the main thread. */
    fun refresh(
        categories: List<StreamCategory>,
        nowSec: Long,
        fetch: (String) -> String? = ::httpGet,
    ): Map<String, String> {
        val byLeague = categories.asSequence()
            .flatMap { it.channels.asSequence() }
            .filter { FixtureLine.hasStarted(it, nowSec) && FixtureLine.splitTeams(it.title) != null }
            .flatMap { channel -> leaguePaths(channel.tag).asSequence().map { it to channel } }
            .groupBy({ it.first }, { it.second })
        val found = ConcurrentHashMap<String, String>()
        byLeague.map { (path, channels) ->
            Thread {
                val events = fetch(scoreboardUrl(path))
                    ?.let { runCatching { JSONObject(it).optJSONArray("events") }.getOrNull() }
                    ?: return@Thread
                for (channel in channels) {
                    scoreFor(channel.title, events)?.let { found.putIfAbsent(channel.streamUri, FixtureLine.scoreLine(it)) }
                }
            }.apply { start() }
        }.forEach { it.join() }
        lines = found.toMap()
        return lines
    }

    fun scoreFor(title: String, events: JSONArray): FixtureLine.Score? {
        val (leftName, rightName) = FixtureLine.splitTeams(title) ?: return null
        for (i in 0 until events.length()) {
            val event = events.optJSONObject(i) ?: continue
            val type = event.optJSONObject("status")?.optJSONObject("type") ?: continue
            val state = type.optString("state")
            if (state != "in" && state != "post") continue
            val sides = event.optJSONArray("competitions")?.optJSONObject(0)?.optJSONArray("competitors") ?: continue
            val competitors = (0 until sides.length()).mapNotNull { sides.optJSONObject(it) }
            val left = competitors.firstOrNull { teamMatches(leftName, it.optJSONObject("team")) } ?: continue
            val right = competitors.firstOrNull {
                it !== left && teamMatches(rightName, it.optJSONObject("team"))
            } ?: continue
            return FixtureLine.Score(state, type.optString("shortDetail"), side(left), side(right))
        }
        return null
    }

    private fun side(competitor: JSONObject) = FixtureLine.Side(
        abbr = competitor.optJSONObject("team")?.optString("abbreviation").orEmpty(),
        score = competitor.optString("score").ifEmpty { "0" },
    )

    /** `location` only matches exactly, so "Los Angeles Rams" can't match the Chargers. */
    private fun teamMatches(name: String, team: JSONObject?): Boolean {
        if (team == null) return false
        val n = norm(name)
        if (n.isEmpty()) return false
        if (norm(team.optString("location")) == n) return true
        for (key in listOf("displayName", "shortDisplayName", "name")) {
            val f = norm(team.optString(key))
            if (f.isEmpty()) continue
            if (f == n) return true
            if (f.length >= 3 && n.length >= 3 && (containsWords(f, n) || containsWords(n, f))) return true
        }
        return false
    }

    private fun containsWords(hay: String, needle: String) = " $hay ".contains(" $needle ")

    private fun norm(s: String): String =
        Normalizer.normalize(s, Normalizer.Form.NFD)
            .replace(ACCENTS, "")
            .lowercase()
            .replace(NON_ALNUM, " ")
            .split(' ')
            .filter { it.isNotEmpty() && it !in NOISE }
            .joinToString(" ")

    private fun httpGet(url: String): String? = runCatching {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = TIMEOUT_MS
        connection.readTimeout = TIMEOUT_MS
        connection.setRequestProperty("Accept", "application/json")
        try {
            if (connection.responseCode !in 200..299) return@runCatching null
            connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }.getOrNull()
}
