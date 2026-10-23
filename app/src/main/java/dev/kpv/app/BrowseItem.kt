package dev.kpv.app

sealed class BrowseItem {
    data class Header(val title: String, val collapsed: Boolean = false) : BrowseItem()
    data class Row(val channels: List<ChannelListing>) : BrowseItem()
    data class Channel(val listing: ChannelListing) : BrowseItem()
}

fun flattenForBrowse(
    categories: List<StreamCategory>,
    television: Boolean,
    collapsed: Set<String> = emptySet(),
): List<BrowseItem> {
    val items = ArrayList<BrowseItem>()
    for (category in categories) {
        val isCollapsed = category.name in collapsed
        items += BrowseItem.Header(category.name, isCollapsed)
        if (isCollapsed) continue
        if (television) {
            category.channels.forEach { items += BrowseItem.Channel(it) }
        } else {
            items += BrowseItem.Row(category.channels)
        }
    }
    return items
}
