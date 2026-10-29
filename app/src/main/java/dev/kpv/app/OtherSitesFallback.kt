package dev.kpv.app

import android.app.Activity
import android.net.Uri
import androidx.appcompat.app.AlertDialog
import dev.kpv.app.sites.MatchFinder
import dev.kpv.app.sites.MatchResult
import dev.kpv.app.sites.SiteAdapters
import dev.kpv.app.sites.SiteEvent
import dev.kpv.app.sites.SiteList

/** Looks for [target] on each site below the one it came from, in list order. */
class OtherSitesFallback(
    private val activity: Activity,
    private val target: ChannelListing,
    private val onPlay: (ChannelListing) -> Unit,
    private val onStatus: (String) -> Unit,
) {
    @Volatile private var cancelled = false
    private val sites = SiteList.all()
    private val wanted = SiteEvent(target.title, target.startsAt, target.streamUri)

    fun start() = trySite(target.siteIndex + 1)

    fun cancel() {
        cancelled = true
    }

    private fun trySite(index: Int) {
        if (cancelled) return
        val entry = sites.getOrNull(index)
        if (entry == null) {
            onStatus(activity.getString(R.string.other_sites_none))
            return
        }
        val name = Uri.parse(entry.origin).host ?: entry.origin
        onStatus(activity.getString(R.string.other_sites_searching, name))
        Thread {
            val events = runCatching { SiteAdapters.events(entry) }.getOrNull().orEmpty()
            val result = MatchFinder.find(wanted, events.map { it.first })
            activity.runOnUiThread {
                if (cancelled || activity.isFinishing) return@runOnUiThread
                when (result) {
                    MatchResult.None -> trySite(index + 1)
                    is MatchResult.Match -> play(events.first { it.first == result.event }.second, name)
                    is MatchResult.Unsure -> pick(index, name, result.candidates.map { c -> events.first { it.first == c }.second })
                }
            }
        }.start()
    }

    private fun pick(index: Int, name: String, channels: List<ChannelListing>) {
        AlertDialog.Builder(activity)
            .setTitle(activity.getString(R.string.other_sites_pick, name))
            .setItems(channels.map { it.title }.toTypedArray()) { _, which -> play(channels[which], name) }
            .setPositiveButton(R.string.other_sites_next) { _, _ -> trySite(index + 1) }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun play(channel: ChannelListing, name: String) {
        Thread {
            val ready = runCatching { SiteAdapters.withSources(channel) }.getOrNull()
            activity.runOnUiThread {
                if (cancelled || activity.isFinishing) return@runOnUiThread
                if (ready == null) {
                    trySite(channel.siteIndex + 1)
                } else {
                    onStatus(activity.getString(R.string.other_sites_found, name))
                    onPlay(ready)
                }
            }
        }.start()
    }
}
