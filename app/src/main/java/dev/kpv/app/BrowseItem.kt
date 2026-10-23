package dev.kpv.app

sealed class BrowseItem {
    /** [key] is what collapse state is stored under; [level] 0 = sport, 1 = league. */
    data class Header(
        val key: String,
        val title: String,
        val collapsed: Boolean = false,
        val level: Int = 0,
    ) : BrowseItem()

    data class Row(val channels: List<ChannelListing>) : BrowseItem()
    data class Channel(val listing: ChannelListing) : BrowseItem()
}

fun flattenForBrowse(
    sports: List<CategoryLayout.Sport>,
    television: Boolean,
    collapsed: Set<String> = emptySet(),
): List<BrowseItem> {
    val items = ArrayList<BrowseItem>()
    for (sport in sports) {
        val sportCollapsed = sport.name in collapsed
        items += BrowseItem.Header(sport.name, sport.name, sportCollapsed)
        if (sportCollapsed) continue
        for (league in sport.leagues) {
            if (sport.showLeagues) {
                val key = CategoryLayout.leagueKey(sport.name, league.name)
                val leagueCollapsed = key in collapsed
                items += BrowseItem.Header(key, league.name, leagueCollapsed, level = 1)
                if (leagueCollapsed) continue
            }
            if (television) {
                league.channels.forEach { items += BrowseItem.Channel(it) }
            } else {
                items += BrowseItem.Row(league.channels)
            }
        }
    }
    return items
}
