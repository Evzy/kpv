package dev.kpv.app

import android.app.Activity
import android.net.Uri
import android.widget.Toast
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
    private val onGiveUp: () -> Unit,
) {
    @Volatile private var cancelled = false
    private val sites = SiteList.all()
    private val wanted = SiteEvent(target.title, target.startsAt, target.streamUri)
    private var dialog: AlertDialog? = null

    fun start() = trySite(target.siteIndex + 1)

    fun cancel() {
        cancelled = true
        dialog?.dismiss()
        dialog = null
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
            val channels = runCatching { SiteAdapters.events(entry) }.getOrNull().orEmpty()
                .filter { (_, channel) -> playable(channel) }
                .associate { it }
            val result = MatchFinder.find(wanted, channels.keys.toList())
            activity.runOnUiThread {
                if (cancelled || activity.isFinishing) return@runOnUiThread
                when (result) {
                    MatchResult.None -> trySite(index + 1)
                    is MatchResult.Match -> play(index, channels.getValue(result.event), name)
                    is MatchResult.Unsure -> pick(index, name, result.candidates.map { channels.getValue(it) })
                }
            }
        }.start()
    }

    /** Channels without their own embed fall back to the top site's API in [StreamResolver]. */
    private fun playable(channel: ChannelListing) =
        channel.playerIframeUrl.startsWith("http") || channel.sourcesPage.isNotEmpty() || channel.siteIndex == 0

    private fun pick(index: Int, name: String, channels: List<ChannelListing>) {
        val rows = channels.map { if (it.tag.isBlank()) it.title else "${it.title} · ${it.tag}" }
        dialog = AlertDialog.Builder(activity)
            .setTitle(activity.getString(R.string.other_sites_pick, name))
            .setItems(rows.toTypedArray()) { _, which -> play(index, channels[which], name) }
            .setPositiveButton(R.string.other_sites_next) { _, _ -> trySite(index + 1) }
            .setNegativeButton(android.R.string.cancel) { _, _ -> onGiveUp() }
            .setOnCancelListener { onGiveUp() }
            .setOnDismissListener { dialog = null }
            .show()
    }

    private fun play(index: Int, channel: ChannelListing, name: String) {
        Thread {
            val ready = runCatching { SiteAdapters.withSources(channel) }.getOrNull()
            activity.runOnUiThread {
                if (cancelled || activity.isFinishing) return@runOnUiThread
                if (ready == null) {
                    trySite(index + 1)
                } else {
                    Toast.makeText(activity, activity.getString(R.string.other_sites_found, name), Toast.LENGTH_SHORT).show()
                    onPlay(ready)
                }
            }
        }.start()
    }
}
