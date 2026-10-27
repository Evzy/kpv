package dev.kpv.app

/** Home-screen layout: leagues under each sport, the user's sport/league order, hidden items. */
object CategoryLayout {
    data class League(val name: String, val channels: List<ChannelListing>)

    /** [showLeagues] is true when the home screen should give each league its own heading. */
    data class Sport(val name: String, val leagues: List<League>, val showLeagues: Boolean = false)

    data class Prefs(
        val sportOrder: List<String>? = null,
        val leagueOrder: Map<String, List<String>> = emptyMap(),
        val hidden: List<String> = emptyList(),
    )

    enum class Kind { LIVE_NOW, SPORT, LEAGUE }

    data class EditorRow(
        val kind: Kind,
        val sport: String,
        val league: String?,
        val key: String,
        val label: String,
        val hidden: Boolean,
    )

    const val OTHER = "Other"
    const val LIVE_NOW = "Live now"
    /** Hidden-list key for Live now; cannot collide with a sport name from the catalog. */
    const val LIVE_NOW_KEY = "\u0000live-now"
    private const val SEP = " › "
    private val DEFAULT_FIRST_LEAGUES = setOf("premier league")

    fun leagueKey(sport: String, league: String) = "$sport$SEP$league"

    /** Catalog categories → sports with their leagues, in default order. */
    fun group(categories: List<StreamCategory>): List<Sport> = categories.map { cat ->
        val leagues = cat.channels
            .groupBy { it.tag.trim().ifEmpty { OTHER } }
            .map { (name, channels) -> League(name, channels) }
        val (first, rest) = leagues.partition { it.name.lowercase() in DEFAULT_FIRST_LEAGUES }
        Sport(cat.name, first + rest)
    }

    /** Saved names first in saved order; anything unsaved after, in its default order. */
    private fun <T> ordered(items: List<T>, saved: List<String>?, name: (T) -> String): List<T> {
        if (saved == null) return items
        val (known, rest) = items.partition { name(it) in saved }
        return known.sortedBy { saved.indexOf(name(it)) } + rest
    }

    private fun orderAll(sports: List<Sport>, prefs: Prefs): List<Sport> =
        ordered(sports, prefs.sportOrder) { it.name }.map { s ->
            s.copy(leagues = ordered(s.leagues, prefs.leagueOrder[s.name]) { it.name })
        }

    fun arrange(sports: List<Sport>, prefs: Prefs): List<Sport> =
        orderAll(sports, prefs).mapNotNull { s ->
            if (s.name in prefs.hidden) return@mapNotNull null
            val leagues = s.leagues.filter { leagueKey(s.name, it.name) !in prefs.hidden }
            if (leagues.isEmpty()) null else Sport(s.name, leagues, showLeagues = leagues.size > 1)
        }

    /** Prepends Live now: on-air events (not 24/7) from the visible [layout], unless hidden or empty. */
    fun withLiveNow(layout: List<Sport>, prefs: Prefs): List<Sport> {
        if (LIVE_NOW_KEY in prefs.hidden) return layout
        val live = layout.asSequence()
            .flatMap { it.leagues.asSequence() }
            .flatMap { it.channels.asSequence() }
            .filter { it.isLive && !it.alwaysLive }
            .distinctBy { it.streamUri }
            .toList()
        if (live.isEmpty()) return layout
        return listOf(Sport(LIVE_NOW, listOf(League(LIVE_NOW, live)))) + layout
    }

    /** Customize list: Live now, every sport (hidden too), then its leagues when it has more than one. */
    fun editorRows(sports: List<Sport>, prefs: Prefs): List<EditorRow> = buildList {
        if (sports.isNotEmpty()) {
            add(EditorRow(Kind.LIVE_NOW, LIVE_NOW, null, LIVE_NOW_KEY, LIVE_NOW, LIVE_NOW_KEY in prefs.hidden))
        }
        for (s in orderAll(sports, prefs)) {
            add(EditorRow(Kind.SPORT, s.name, null, s.name, s.name, s.name in prefs.hidden))
            if (s.leagues.size < 2) continue
            for (l in s.leagues) {
                val key = leagueKey(s.name, l.name)
                add(EditorRow(Kind.LEAGUE, s.name, l.name, key, l.name, key in prefs.hidden))
            }
        }
    }

    /** Returns [prefs] unchanged when the sport is already at that end. */
    fun moveSport(sports: List<Sport>, prefs: Prefs, sport: String, dir: Int): Prefs {
        val order = orderAll(sports, prefs).map { it.name }.toMutableList()
        return if (swap(order, sport, dir)) prefs.copy(sportOrder = order) else prefs
    }

    fun moveLeague(sports: List<Sport>, prefs: Prefs, sport: String, league: String, dir: Int): Prefs {
        val s = orderAll(sports, prefs).firstOrNull { it.name == sport } ?: return prefs
        val order = s.leagues.map { it.name }.toMutableList()
        if (!swap(order, league, dir)) return prefs
        return prefs.copy(leagueOrder = prefs.leagueOrder + (sport to order))
    }

    fun toggleHidden(prefs: Prefs, key: String): Prefs =
        prefs.copy(hidden = if (key in prefs.hidden) prefs.hidden - key else prefs.hidden + key)

    private fun swap(list: MutableList<String>, name: String, dir: Int): Boolean {
        val i = list.indexOf(name)
        val j = i + dir
        if (i < 0 || j !in list.indices) return false
        list[i] = list[j]
        list[j] = name
        return true
    }
}
