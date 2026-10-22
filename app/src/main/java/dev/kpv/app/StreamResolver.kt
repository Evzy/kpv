package dev.kpv.app

import android.annotation.SuppressLint
import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.MotionEvent
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class ResolvedStream(val url: String, val headers: Map<String, String>)

/**
 * Loads the site's embedded player in an invisible WebView and captures the HLS playlist it requests.
 */
class StreamResolver(
    private val context: Context,
    private val container: ViewGroup,
    private val streamUri: String,
    private val catalogEmbedUrl: String? = null,
    private val onDone: (ResolvedStream?) -> Unit,
) {
    companion object {
        private const val TIMEOUT_MS = 30_000L
        private const val NUDGE_INTERVAL_MS = 1_500L
        private val PLAYLIST_PATTERN = Regex("\\.m3u8(\\?|$)|[?&/]m3u8", RegexOption.IGNORE_CASE)

        private const val AUTOPLAY_JS = """
            (function() {
              try {
                document.querySelectorAll('video').forEach(function(v) {
                  v.muted = true;
                  if (v.play) { var p = v.play(); if (p && p.catch) p.catch(function() {}); }
                });
                if (window.jwplayer) {
                  try { var j = window.jwplayer(); j.setMute && j.setMute(true); j.play && j.play(); } catch (e) {}
                }
                var selectors = ['.jw-display-icon-container', '.vjs-big-play-button', '.plyr__control--overlaid',
                                 '[aria-label="Play"]', '.play-button', '#play'];
                for (var i = 0; i < selectors.length; i++) {
                  var el = document.querySelector(selectors[i]);
                  if (el) { el.click(); break; }
                }
              } catch (e) {}
            })();
        """
    }

    private val handler = Handler(Looper.getMainLooper())
    private var webView: WebView? = null
    private var embedHost: String? = null
    private var userAgent: String? = null
    @Volatile private var finished = false

    private val timeout = Runnable { finish(null) }
    private val nudge = object : Runnable {
        override fun run() {
            val view = webView ?: return
            view.evaluateJavascript(AUTOPLAY_JS, null)
            tapCentre(view)
            handler.postDelayed(this, NUDGE_INTERVAL_MS)
        }
    }

    fun start() {
        handler.postDelayed(timeout, TIMEOUT_MS)
        val fromCatalog = catalogEmbedUrl?.takeIf { it.startsWith("http") }
        if (fromCatalog != null) {
            SiteConfig.noteEmbedOriginFromPlayerUrl(fromCatalog)
            handler.post { if (!finished) loadEmbed(fromCatalog) }
            return
        }
        Thread {
            val embedUrl = runCatching { fetchEmbedUrl() }.getOrNull()
                ?: SiteConfig.embedUrl(streamUri)
            handler.post { if (!finished) loadEmbed(embedUrl) }
        }.start()
    }

    fun cancel() {
        finished = true
        cleanUp()
    }

    private fun fetchEmbedUrl(): String? {
        for (apiBase in SiteConfig.apiCandidates()) {
            val body = SiteHttp.openJsonGet(SiteConfig.streamApiUrl(streamUri, apiBase)) ?: continue
            val parsed = parseEmbedFromStreamJson(body) ?: continue
            SiteConfig.rememberApi(apiBase)
            return parsed
        }
        return null
    }

    private fun parseEmbedFromStreamJson(body: String): String? = runCatching {
        val data = JSONObject(body).getJSONObject("data")
        val sources = data.optJSONArray("sources") ?: return null
        var first: String? = null
        for (i in 0 until sources.length()) {
            val source = sources.getJSONObject(i)
            val url = source.optString("data").takeIf { it.startsWith("http") } ?: continue
            if (source.optBoolean("default")) {
                SiteConfig.noteEmbedOriginFromPlayerUrl(url)
                return url
            }
            if (first == null) first = url
        }
        first?.let { SiteConfig.noteEmbedOriginFromPlayerUrl(it) }
        first
    }.getOrNull()

    @SuppressLint("SetJavaScriptEnabled")
    private fun loadEmbed(embedUrl: String) {
        embedHost = Uri.parse(embedUrl).host
        val view = WebView(context).apply {
            alpha = 0f
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.setSupportMultipleWindows(false)
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, true)
        // shouldInterceptRequest runs off the main thread, where WebView methods throw.
        userAgent = view.settings.userAgentString

        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                // Ad scripts try to hijack the top-level page; keep it on the player.
                return request.isForMainFrame && request.url.host != embedHost
            }

            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val url = request.url.toString()
                if (!finished && PLAYLIST_PATTERN.containsMatchIn(url)) {
                    val headers = buildHeaders(url, request.requestHeaders)
                    handler.post { finish(ResolvedStream(url, headers)) }
                }
                return null
            }

            override fun onPageFinished(view: WebView, url: String) {
                handler.removeCallbacks(nudge)
                handler.postDelayed(nudge, NUDGE_INTERVAL_MS)
            }
        }

        // Keep the view tiny so it never covers the settings bar or catalog touches.
        container.addView(view, FrameLayout.LayoutParams(320, 240))
        webView = view
        view.loadUrl(embedUrl, mapOf("Referer" to SiteConfig.siteReferer))
    }

    private fun buildHeaders(url: String, requestHeaders: Map<String, String>): Map<String, String> {
        val headers = requestHeaders.toMutableMap()
        val referer = headers.entries.firstOrNull { it.key.equals("Referer", true) }?.value
            ?: "https://$embedHost/"
        headers["Referer"] = referer
        if (headers.keys.none { it.equals("Origin", true) }) {
            val ref = Uri.parse(referer)
            headers["Origin"] = "${ref.scheme}://${ref.host}"
        }
        userAgent?.let { headers["User-Agent"] = it }
        CookieManager.getInstance().getCookie(url)?.let { headers["Cookie"] = it }
        return headers
    }

    private fun tapCentre(view: WebView) {
        val x = view.width / 2f
        val y = view.height / 2f
        val time = SystemClock.uptimeMillis()
        val down = MotionEvent.obtain(time, time, MotionEvent.ACTION_DOWN, x, y, 0)
        val up = MotionEvent.obtain(time, time + 50, MotionEvent.ACTION_UP, x, y, 0)
        view.dispatchTouchEvent(down)
        view.dispatchTouchEvent(up)
        down.recycle()
        up.recycle()
    }

    private fun finish(result: ResolvedStream?) {
        if (finished) return
        finished = true
        cleanUp()
        onDone(result)
    }

    private fun cleanUp() {
        handler.removeCallbacks(timeout)
        handler.removeCallbacks(nudge)
        webView?.let {
            it.stopLoading()
            container.removeView(it)
            it.destroy()
        }
        webView = null
    }
}
