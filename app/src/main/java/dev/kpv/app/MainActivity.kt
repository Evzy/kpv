package dev.kpv.app

import android.content.Intent
import android.os.Bundle
import android.util.TypedValue
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import dev.kpv.app.update.AppUpdateFlow
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.core.view.updatePadding
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
class MainActivity : AppCompatActivity() {

    private val updateFlow = AppUpdateFlow(this)

    companion object {
        private const val REQUEST_PLAY = 1
        private const val REQUEST_SETTINGS = 2
    }

    private lateinit var root: FrameLayout
    private lateinit var loaderHost: FrameLayout
    private lateinit var resolveHost: FrameLayout
    private lateinit var catalogView: CatalogBrowseView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var status: TextView
    private lateinit var settingsButton: ImageButton
    private var castButton: KpvMediaRouteButton? = null

    private var catalogLoader: CatalogLoader? = null
    private var resolver: StreamResolver? = null
    private var selected: ChannelListing? = null
    private var autoRetried = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        TvHelper.applyScreenOrientation(this)
        PhoneSystemBars.enableEdgeToEdge(this)

        catalogView = CatalogBrowseView(this, ::playChannel)
        swipeRefresh = SwipeRefreshLayout(this).apply {
            setColorSchemeColors(ContextCompat.getColor(this@MainActivity, R.color.kpv_accent))
            setProgressBackgroundColorSchemeColor(
                ContextCompat.getColor(this@MainActivity, R.color.kpv_surface_elevated),
            )
            isEnabled = !TvHelper.isTelevision(this@MainActivity)
            addView(
                catalogView,
                ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                ),
            )
            setOnRefreshListener { refreshCatalog() }
        }
        status = TextView(this).apply {
            setTextColor(ContextCompat.getColor(this@MainActivity, R.color.kpv_text_secondary))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            gravity = Gravity.CENTER
            setPadding(dp(16), dp(8), dp(16), dp(8))
            text = "Loading channels…"
        }

        loaderHost = FrameLayout(this).apply {
            isClickable = false
            isFocusable = false
            importantForAccessibility = android.view.View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }
        resolveHost = FrameLayout(this).apply {
            isClickable = false
            isFocusable = false
            importantForAccessibility = android.view.View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }

        settingsButton = ImageButton(this).apply {
            isFocusable = true
            setImageResource(R.drawable.ic_settings)
            contentDescription = getString(R.string.settings)
            setBackgroundResource(R.drawable.bg_settings_button)
            val pad = dp(10)
            setPadding(pad, pad, pad, pad)
            minimumWidth = dp(48)
            minimumHeight = dp(48)
            scaleType = android.widget.ImageView.ScaleType.CENTER_INSIDE
            setOnClickListener { openSettings() }
        }

        val topBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(ContextCompat.getColor(this@MainActivity, R.color.kpv_surface))
            val side = dp(16)
            setPadding(side, dp(8), side, dp(8))
            elevation = dp(6).toFloat()
            addView(
                TextView(this@MainActivity).apply {
                    text = getString(R.string.header_with_version, BuildConfig.VERSION_NAME)
                    setTextColor(ContextCompat.getColor(this@MainActivity, R.color.kpv_text_primary))
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
                },
                LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f),
            )
            if (!TvHelper.isTelevision(this@MainActivity)) {
                castButton = CastUi.attachRouteButton(
                    this@MainActivity,
                    this,
                    getString(R.string.cast),
                ).apply {
                    visibility = android.view.View.GONE
                    layoutParams = LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                    ).apply { marginEnd = dp(8) }
                }
            }
            addView(settingsButton, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ))
        }

        val mainColumn = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(topBar, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ))
            addView(swipeRefresh, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f,
            ))
        }

        root = FrameLayout(this).apply {
            setBackgroundColor(ContextCompat.getColor(this@MainActivity, R.color.kpv_bg))
            addView(mainColumn, FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ))
            addView(loaderHost, FrameLayout.LayoutParams(1, 1, Gravity.BOTTOM or Gravity.START))
            addView(resolveHost, FrameLayout.LayoutParams(1, 1, Gravity.BOTTOM or Gravity.END))
            addView(status, FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM,
            ))
        }
        setContentView(root)
        PhoneSystemBars.listen(this, root) { insets, view ->
            val bars = PhoneSystemBars.systemBarInsets(insets)
            topBar.updatePadding(top = bars.top + dp(8))
            view.updatePadding(
                left = bars.left,
                right = bars.right,
                bottom = bars.bottom,
            )
        }
        catalogView.visibility = android.view.View.GONE
        if (!TvHelper.isTelevision(this)) {
            CastController.init(this, ContextCompat.getMainExecutor(this)) {
                runOnUiThread { updateCastButtonVisibility() }
            }
        }
        loadCatalog(initial = true)
        if (savedInstanceState == null) {
            updateFlow.check(userInitiated = false)
        }
    }

    private var catalogReady = false

    override fun onResume() {
        super.onResume()
        updateFlow.onResume()
    }

    // On TV the grid's section headers aren't focusable, so D-pad up from the top row
    // would otherwise never leave the list to reach the settings button.
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (
            event.action == KeyEvent.ACTION_DOWN &&
            event.keyCode == KeyEvent.KEYCODE_DPAD_UP &&
            TvHelper.isTelevision(this)
        ) {
            val focused = currentFocus
            if (focused != null && focused.isDescendantOf(catalogView)) {
                // RecyclerView may hand back a same-row card (or the focused one) instead of null.
                val next = focused.focusSearch(View.FOCUS_UP)
                val movesUpInList = next != null && next !== focused &&
                    next.isDescendantOf(catalogView) && next.screenTop() < focused.screenTop()
                if (!movesUpInList && !catalogView.canScrollVertically(-1)) {
                    settingsButton.requestFocus()
                    return true
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }

    private fun View.screenTop(): Int {
        val loc = IntArray(2)
        getLocationOnScreen(loc)
        return loc[1]
    }

    private fun View.isDescendantOf(ancestor: View): Boolean {
        var v: View? = this
        while (v != null) {
            if (v === ancestor) return true
            v = v.parent as? View
        }
        return false
    }

    private fun refreshCatalog() {
        if (resolver != null) {
            swipeRefresh.isRefreshing = false
            return
        }
        loadCatalog(initial = false)
    }

    private fun openSettings() {
        @Suppress("DEPRECATION")
        startActivityForResult(Intent(this, SettingsActivity::class.java), REQUEST_SETTINGS)
    }

    private fun loadCatalog(initial: Boolean) {
        if (SiteConfig.siteUrl().isBlank()) {
            status.visibility = android.view.View.VISIBLE
            status.text = "Set a site URL in settings (gear icon)."
            catalogView.visibility = android.view.View.GONE
            swipeRefresh.isRefreshing = false
            return
        }
        catalogLoader?.cancel()
        if (initial) {
            catalogView.visibility = android.view.View.GONE
            status.visibility = android.view.View.VISIBLE
            status.text = "Loading channels…"
        } else {
            swipeRefresh.isRefreshing = true
        }
        catalogLoader = CatalogLoader(this, loaderHost) { result ->
            catalogLoader = null
            if (result == null) {
                catalogReady = false
                runOnUiThread {
                    swipeRefresh.isRefreshing = false
                    updateCastButtonVisibility()
                    if (initial) {
                        status.text = "Couldn't load channels. Pull down to refresh."
                    } else {
                        status.text = "Couldn't refresh. Pull down to try again."
                        status.visibility = android.view.View.VISIBLE
                    }
                }
                return@CatalogLoader
            }
            catalogReady = true
            // Build the browse list off the UI thread so the first frame stays smooth.
            Thread {
                val items = flattenForBrowse(result, TvHelper.isTelevision(this))
                runOnUiThread {
                    if (isFinishing) return@runOnUiThread
                    catalogView.setItems(items)
                    catalogView.visibility = android.view.View.VISIBLE
                    swipeRefresh.isRefreshing = false
                    status.visibility = android.view.View.GONE
                    updateCastButtonVisibility()
                }
            }.start()
        }.also { it.start() }
    }

    private fun playChannel(channel: ChannelListing) {
        if (resolver != null) return
        selected = channel
        autoRetried = false
        catalogView.setLoadingStream(channel.streamUri)
        catalogView.isEnabled = false
        status.visibility = android.view.View.GONE
        val iframe = channel.playerIframeUrl.takeIf { it.startsWith("http") }
        resolver = StreamResolver(
            this,
            resolveHost,
            channel.streamUri,
            iframe,
            castMode = CastController.isConnected(),
        ) { stream ->
            resolver = null
            catalogView.setLoadingStream(null)
            catalogView.isEnabled = true
            if (stream == null) {
                status.visibility = android.view.View.VISIBLE
                status.text = "Couldn't start ${channel.title}. Try again."
            } else {
                status.visibility = android.view.View.GONE
                if (CastController.isConnected() &&
                    CastController.loadStream(this, stream, channel.title)
                ) {
                    Toast.makeText(
                        this,
                        getString(R.string.cast_playing_on_tv, channel.title),
                        Toast.LENGTH_SHORT,
                    ).show()
                } else {
                    @Suppress("DEPRECATION")
                    startActivityForResult(PlayerActivity.intent(this, stream, channel.title), REQUEST_PLAY)
                }
            }
        }.also { it.start() }
    }

    private fun updateCastButtonVisibility() {
        castButton?.visibility =
            if (catalogReady && !TvHelper.isTelevision(this)) {
                android.view.View.VISIBLE
            } else {
                android.view.View.GONE
            }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_SETTINGS) {
            if (resultCode == RESULT_OK) {
                SiteConfig.reload()
                loadCatalog(initial = true)
            }
            return
        }
        if (requestCode != REQUEST_PLAY) return
        val channel = selected ?: return
        if (resultCode == PlayerActivity.RESULT_PLAYBACK_FAILED && !autoRetried) {
            autoRetried = true
            status.visibility = android.view.View.VISIBLE
            status.text = "Stream dropped, reconnecting…"
            playChannel(channel)
            return
        }
        autoRetried = false
        if (resultCode == PlayerActivity.RESULT_PLAYBACK_FAILED) {
            status.visibility = android.view.View.VISIBLE
            status.text = "${channel.title} stopped. Pick another stream."
        } else {
            status.visibility = android.view.View.GONE
        }
    }

    override fun onDestroy() {
        catalogLoader?.cancel()
        resolver?.cancel()
        if (isFinishing) {
            CastController.onHostDestroyed(applicationContext)
        }
        super.onDestroy()
    }

    private fun dp(value: Int): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()
}
