package dev.kpv.app

sealed class BrowseItem {
    data class Header(val title: String) : BrowseItem()
    data class Row(val channels: List<ChannelListing>) : BrowseItem()
    data class Channel(val listing: ChannelListing) : BrowseItem()
}

fun orderBrowseCategories(categories: List<StreamCategory>): List<StreamCategory> {
    val regular = categories.filter { !it.name.contains("24/7", ignoreCase = true) }
    val live247 = categories.filter { it.name.contains("24/7", ignoreCase = true) }
    return regular + live247
}

fun flattenForBrowse(categories: List<StreamCategory>, television: Boolean): List<BrowseItem> {
    val items = ArrayList<BrowseItem>()
    for (category in orderBrowseCategories(categories)) {
        items += BrowseItem.Header(category.name)
        if (television) {
            category.channels.forEach { items += BrowseItem.Channel(it) }
        } else {
            items += BrowseItem.Row(category.channels)
        }
    }
    return items
}
