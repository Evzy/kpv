package dev.kpv.app

import android.annotation.SuppressLint
import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import org.json.JSONArray
import org.json.JSONObject

/** Fallback: scrape the homepage when the streams API is unreachable. */
class HomepageCatalogLoader(
    private val context: Context,
    private val container: ViewGroup,
    private val onDone: (List<StreamCategory>?) -> Unit,
) {
    companion object {
        private const val TIMEOUT_MS = 40_000L

        private const val EXTRACT_JS = """
            (function() {
              function parseAnchor(a, seen) {
                var href = a.getAttribute('href');
                if (!href) return null;
                var path = href.split('?')[0];
                var match = path.match(/\\/live\\/(.+)$/);
                if (!match) return null;
                var uri = match[1];
                if (!uri || seen[uri]) return null;
                seen[uri] = true;
                var lines = (a.innerText || '').split('\\n')
                  .map(function(s) { return s.trim(); })
                  .filter(Boolean);
                var title = lines[0] || uri;
                var tag = '';
                for (var i = 1; i < lines.length; i++) {
                  if (lines[i].indexOf('●') !== -1) continue;
                  if (/^\\d+ day/.test(lines[i])) continue;
                  tag = lines[i];
                  break;
                }
                var img = a.querySelector('img');
                var poster = img ? (img.currentSrc || img.src || img.getAttribute('data-src') || '') : '';
                return {
                  title: title,
                  tag: tag,
                  streamUri: uri,
                  pageUrl: location.origin + '/live/' + uri,
                  posterUrl: poster
                };
              }

              function collectCategories() {
                var categories = [];
                var headers = Array.prototype.slice.call(document.querySelectorAll('h2, h3'));
                for (var i = 0; i < headers.length; i++) {
                  var name = headers[i].innerText.trim().replace(/\\s*24\\/7\\s*${'$'}/i, '').trim();
                  if (!name || name === 'Jump to category') continue;
                  var seen = {};
                  var channels = [];
                  var el = headers[i];
                  while (true) {
                    el = el.nextElementSibling;
                    if (!el) break;
                    if (el.tagName === 'H2' || el.tagName === 'H3') break;
                    el.querySelectorAll('a[href*="/live/"]').forEach(function(a) {
                      var item = parseAnchor(a, seen);
                      if (item) channels.push(item);
                    });
                  }
                  if (channels.length) categories.push({ name: name, channels: channels });
                }
                if (!categories.length) {
                  var seen = {};
                  var channels = [];
                  document.querySelectorAll('a[href*="/live/"]').forEach(function(a) {
                    var item = parseAnchor(a, seen);
                    if (item) channels.push(item);
                  });
                  if (channels.length) categories.push({ name: 'All streams', channels: channels });
                }
                return categories;
              }

              function deliver() {
                if (window.CatalogBridge) CatalogBridge.onCategories(JSON.stringify(collectCategories()));
              }

              var steps = 0;
              function scrollAndCollect() {
                window.scrollTo(0, document.body.scrollHeight);
                steps++;
                if (steps < 8) setTimeout(scrollAndCollect, 200);
                else setTimeout(deliver, 400);
              }
              scrollAndCollect();
            })();
        """
    }

    private val handler = Handler(Looper.getMainLooper())
    private var webView: WebView? = null
    private var finished = false
    private val timeout = Runnable { finish(null) }

    fun start() {
        handler.postDelayed(timeout, TIMEOUT_MS)
        handler.post { loadHomepage() }
    }

    fun cancel() {
        finished = true
        cleanUp()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun loadHomepage() {
        val view = WebView(context).apply {
            alpha = 0f
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
        }
        view.addJavascriptInterface(CatalogBridge(), "CatalogBridge")
        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val host = request.url.host ?: return request.isForMainFrame
                return request.isForMainFrame && !SiteConfig.isAllowedHost(host)
            }

            override fun onPageFinished(view: WebView, url: String) {
                if (finished || !isHomepage(url)) return
                handler.postDelayed({ view.evaluateJavascript(EXTRACT_JS, null) }, 300)
            }
        }
        container.addView(view, FrameLayout.LayoutParams(1, 1))
        webView = view
        view.loadUrl(SiteConfig.homeUrl)
    }

    private fun isHomepage(url: String): Boolean {
        val uri = Uri.parse(url)
        val host = uri.host ?: return false
        if (!SiteConfig.isAllowedHost(host)) return false
        val path = uri.path ?: return true
        return path.isEmpty() || path == "/"
    }

    private inner class CatalogBridge {
        @JavascriptInterface
        fun onCategories(json: String) {
            handler.post {
                if (finished) return@post
                finish(parseCategoriesJson(json))
            }
        }
    }

    private fun parseCategoriesJson(json: String): List<StreamCategory>? {
        if (json.isBlank()) return null
        val array = JSONArray(json)
        val categories = ArrayList<StreamCategory>(array.length())
        for (i in 0 until array.length()) {
            val item = array.getJSONObject(i)
            val channels = item.getJSONArray("channels").toChannelList()
            if (channels.isNotEmpty()) categories += StreamCategory(item.getString("name"), channels)
        }
        return categories.takeIf { it.isNotEmpty() }
    }

    private fun JSONArray.toChannelList(): List<ChannelListing> {
        val channels = ArrayList<ChannelListing>(length())
        for (i in 0 until length()) {
            channels += getJSONObject(i).toListing()
        }
        return channels
    }

    private fun JSONObject.toListing() = ChannelListing(
        title = getString("title"),
        tag = optString("tag"),
        streamUri = getString("streamUri"),
        pageUrl = getString("pageUrl"),
        posterUrl = optString("posterUrl"),
    )

    private fun finish(result: List<StreamCategory>?) {
        if (finished) return
        finished = true
        cleanUp()
        onDone(result)
    }

    private fun cleanUp() {
        handler.removeCallbacks(timeout)
        webView?.let {
            it.stopLoading()
            container.removeView(it)
            it.destroy()
        }
        webView = null
    }
}
