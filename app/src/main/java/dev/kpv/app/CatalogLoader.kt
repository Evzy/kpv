package dev.kpv.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import dev.kpv.app.sites.SiteAdapters
import dev.kpv.app.sites.SiteKind
import dev.kpv.app.sites.SiteList

/**
 * Loads the channel catalog. Uses the site's streams API first (same data as the homepage),
 * with a slow homepage scrape only if the API fails.
 */
class CatalogLoader(
    private val context: Context,
    private val container: ViewGroup,
    private val onDone: (List<StreamCategory>?) -> Unit,
) {
    private val handler = Handler(Looper.getMainLooper())
    private var homepageLoader: HomepageCatalogLoader? = null
    private var finished = false

    @Volatile
    private var apiReturned = false

    private val homepageKick = Runnable {
        if (!finished && !apiReturned && homepageLoader == null) {
            startHomepageFallback()
        }
    }

    fun start() {
        apiReturned = false
        val top = SiteList.top()
        val scrapeFallback = top?.kind == SiteKind.API
        Thread {
            val categories = top?.let { SiteAdapters.catalog(it) }
            apiReturned = true
            handler.removeCallbacks(homepageKick)
            handler.post {
                if (finished) return@post
                if (categories != null) {
                    finish(categories)
                } else if (!scrapeFallback) {
                    finish(null)
                } else if (homepageLoader == null) {
                    startHomepageFallback()
                }
            }
        }.start()
        // If the API hangs, still try the homepage (some sites only work via scrape).
        if (scrapeFallback) handler.postDelayed(homepageKick, 10_000L)
        handler.postDelayed({ if (!finished) finish(null) }, 50_000L)
    }

    fun cancel() {
        finished = true
        handler.removeCallbacks(homepageKick)
        handler.removeCallbacksAndMessages(null)
        homepageLoader?.cancel()
        homepageLoader = null
    }

    private fun startHomepageFallback() {
        if (finished || homepageLoader != null) return
        homepageLoader = HomepageCatalogLoader(context, container) { result ->
            homepageLoader = null
            if (!finished) finish(result)
        }.also { it.start() }
    }

    private fun finish(result: List<StreamCategory>?) {
        if (finished) return
        finished = true
        handler.removeCallbacks(homepageKick)
        homepageLoader?.cancel()
        homepageLoader = null
        onDone(result)
    }
}
