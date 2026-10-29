package dev.kpv.app

import android.content.Context
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.Toast
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.ui.PlayerView
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.cast.framework.SessionManagerListener
import androidx.core.content.ContextCompat
import androidx.core.view.updatePadding
import dev.kpv.app.chat.ChatOverlayView
import dev.kpv.app.chat.LiveChatClient

class PlayerActivity : AppCompatActivity() {

    companion object {
        private const val EXTRA_URL = "url"
        private const val EXTRA_HEADER_NAMES = "header_names"
        private const val EXTRA_HEADER_VALUES = "header_values"
        private const val EXTRA_TITLE = "title"
        private const val EXTRA_STREAM_ID = "stream_id"
        /** Lifts chat clear of the controller's seek bar while it is showing. */
        private const val CHAT_LIFT_DP = 64f
        const val RESULT_PLAYBACK_FAILED = RESULT_FIRST_USER

        private const val EXTRA_SOURCE_LABELS = "source_labels"
        private const val EXTRA_SOURCE_URIS = "source_uris"
        private const val EXTRA_SOURCE_IFRAMES = "source_iframes"
        private const val EXTRA_SOURCE_INDEX = "source_index"

        private const val EXTRA_STREAM_URI = "stream_uri"
        private const val EXTRA_IFRAME_URL = "iframe_url"

        fun intent(
            context: Context,
            stream: ResolvedStream,
            channel: CastPlayback.Item,
            sourceIndex: Int = 0,
        ): Intent =
            Intent(context, PlayerActivity::class.java)
                .putExtra(EXTRA_URL, stream.url)
                .putExtra(EXTRA_HEADER_NAMES, stream.headers.keys.toTypedArray())
                .putExtra(EXTRA_HEADER_VALUES, stream.headers.values.toTypedArray())
                .putExtra(EXTRA_TITLE, channel.title)
                .putExtra(EXTRA_STREAM_ID, channel.streamId)
                .putExtra(EXTRA_STREAM_URI, channel.streamUri)
                .putExtra(EXTRA_IFRAME_URL, channel.iframeUrl)
                .putExtra(EXTRA_SOURCE_LABELS, channel.sources.map { it.label }.toTypedArray())
                .putExtra(EXTRA_SOURCE_URIS, channel.sources.map { it.streamUri }.toTypedArray())
                .putExtra(EXTRA_SOURCE_IFRAMES, channel.sources.map { it.iframeUrl }.toTypedArray())
                .putExtra(EXTRA_SOURCE_INDEX, sourceIndex)
    }

    private lateinit var playerView: PlayerView
    private var player: ExoPlayer? = null
    private lateinit var resolvedStream: ResolvedStream
    private var streamTitle: String = "KPV"
    private var castButton: KpvMediaRouteButton? = null
    private var castSessionListener: SessionManagerListener<CastSession>? = null
    private var playbackReady = false
    private var streamId = 0L
    private var chatButton: ImageButton? = null
    private var chatOverlay: ChatOverlayView? = null
    private var chatClient: LiveChatClient? = null
    private var chatOn = false
    private var sources: List<StreamSource> = emptyList()
    private var sourceIndex = 0
    /** Sources that failed since playback last reached READY, so error fallback stops after one round. */
    private val failedSources = mutableSetOf<Int>()
    private var sourcesButton: ImageButton? = null
    private var sourceResolver: StreamResolver? = null
    private lateinit var resolveHost: FrameLayout

    @OptIn(UnstableApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        TvHelper.applyScreenOrientation(this)
        PhoneSystemBars.enableEdgeToEdge(this)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val url = intent.getStringExtra(EXTRA_URL) ?: return finish()
        val names = intent.getStringArrayExtra(EXTRA_HEADER_NAMES).orEmpty()
        val values = intent.getStringArrayExtra(EXTRA_HEADER_VALUES).orEmpty()
        val headers = names.zip(values).toMap()
        streamTitle = intent.getStringExtra(EXTRA_TITLE) ?: "KPV"
        streamId = intent.getLongExtra(EXTRA_STREAM_ID, 0L)
        sources = readSources()
        sourceIndex = intent.getIntExtra(EXTRA_SOURCE_INDEX, 0).coerceIn(0, maxOf(0, sources.lastIndex))
        resolvedStream = ResolvedStream(url, headers)

        val exoPlayer = ExoPlayer.Builder(this).build().apply {
            setMediaSource(mediaSourceFor(resolvedStream))
            playWhenReady = true
            addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(playbackState: Int) {
                    if (playbackState == Player.STATE_READY) {
                        playbackReady = true
                        failedSources.clear()
                        castButton?.visibility = View.VISIBLE
                    }
                }

                override fun onPlayerError(error: PlaybackException) {
                    if (error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
                        seekToDefaultPosition()
                        prepare()
                    } else if (sources.size > 1) {
                        if (sourceResolver != null) return
                        failedSources += sourceIndex
                        val next = SourceQueue.next(sources.size, sourceIndex, failedSources)
                        if (next != null) {
                            Toast.makeText(
                                this@PlayerActivity,
                                getString(R.string.source_failed_trying, sources[sourceIndex].label, sources[next].label),
                                Toast.LENGTH_SHORT,
                            ).show()
                        }
                        switchSource(next, failedSources.toSet(), afterError = true)
                    } else {
                        setResult(RESULT_PLAYBACK_FAILED)
                        finish()
                    }
                }
            })
            prepare()
        }
        player = exoPlayer

        playerView = PlayerView(this).apply {
            this.player = exoPlayer
            keepScreenOn = true
            controllerShowTimeoutMs = 3_000
        }

        val television = TvHelper.isTelevision(this)
        val density = resources.displayMetrics.density
        val margin = (16 * density).toInt()
        val topBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val root = FrameLayout(this).apply {
            addView(
                playerView,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT,
                ),
            )
            resolveHost = FrameLayout(this@PlayerActivity).apply {
                isClickable = false
                isFocusable = false
                importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
            }
            addView(resolveHost, FrameLayout.LayoutParams(1, 1, Gravity.BOTTOM or Gravity.START))
            if (sources.size > 1) {
                sourcesButton = createTopButton(topBar, R.drawable.ic_sources, getString(R.string.sources)) {
                    showSourcePicker()
                }
            }
            if (streamId > 0L) {
                val overlay = ChatOverlayView(this@PlayerActivity, television).apply { visibility = View.GONE }
                chatOverlay = overlay
                addView(
                    overlay,
                    FrameLayout.LayoutParams(chatOverlayWidth(television), FrameLayout.LayoutParams.WRAP_CONTENT,
                        Gravity.BOTTOM or Gravity.END).apply {
                        marginEnd = margin
                        bottomMargin = (24 * density).toInt()
                    },
                )
                chatButton = createTopButton(topBar, R.drawable.ic_chat, getString(R.string.chat_show)) { toggleChat() }
            }
            if (!television) {
                castButton = CastUi.attachRouteButton(
                    this@PlayerActivity,
                    topBar,
                    getString(R.string.cast),
                ).apply {
                    visibility = View.GONE
                    (layoutParams as LinearLayout.LayoutParams).marginStart = (8 * density).toInt()
                }
            }
            addView(
                topBar,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    Gravity.TOP or Gravity.END,
                ).apply {
                    topMargin = margin
                    marginEnd = margin
                },
            )
        }
        setContentView(root)
        PhoneSystemBars.listen(this, root) { insets, view ->
            val bars = PhoneSystemBars.systemBarInsets(insets)
            view.updatePadding(bottom = bars.bottom)
            val lp = topBar.layoutParams as FrameLayout.LayoutParams
            lp.topMargin = margin + bars.top
            lp.marginEnd = margin + bars.right
            topBar.layoutParams = lp
            chatOverlay?.let { overlay ->
                val olp = overlay.layoutParams as FrameLayout.LayoutParams
                olp.marginEnd = margin + bars.right
                overlay.layoutParams = olp
            }
        }
        if (chatButton != null || sourcesButton != null) {
            @Suppress("DEPRECATION")
            playerView.setControllerVisibilityListener(PlayerView.ControllerVisibilityListener { visibility ->
                onControllerVisibilityChanged(visibility == View.VISIBLE)
            })
        }
        playerView.requestFocus()

        if (!TvHelper.isTelevision(this)) {
            bindCastHandoff()
        }
    }

    private fun bindCastHandoff() {
        CastController.init(this, ContextCompat.getMainExecutor(this)) {
            runOnUiThread {
                val castContext = runCatching { CastContext.getSharedInstance(this) }.getOrNull() ?: return@runOnUiThread
                val listener = object : SessionManagerListener<CastSession> {
                    override fun onSessionStarting(session: CastSession) = Unit
                    override fun onSessionStarted(session: CastSession, sessionId: String) {
                        handOffToCastIfReady()
                    }

                    override fun onSessionStartFailed(session: CastSession, error: Int) = Unit
                    override fun onSessionEnding(session: CastSession) = Unit
                    override fun onSessionEnded(session: CastSession, error: Int) = Unit
                    override fun onSessionResuming(session: CastSession, sessionId: String) = Unit
                    override fun onSessionResumed(session: CastSession, wasSuspended: Boolean) {
                        handOffToCastIfReady()
                    }

                    override fun onSessionResumeFailed(session: CastSession, error: Int) = Unit
                    override fun onSessionSuspended(session: CastSession, reason: Int) = Unit
                }
                castSessionListener = listener
                castContext.sessionManager.addSessionManagerListener(listener, CastSession::class.java)
            }
        }
    }

    private fun createTopButton(parent: LinearLayout, icon: Int, description: String, onClick: () -> Unit): ImageButton {
        val density = resources.displayMetrics.density
        val size = (44 * density).toInt()
        val pad = (10 * density).toInt()
        return ImageButton(this).apply {
            setImageResource(icon)
            setBackgroundResource(R.drawable.bg_player_icon_button)
            scaleType = ImageView.ScaleType.FIT_CENTER
            setPadding(pad, pad, pad, pad)
            contentDescription = description
            isFocusable = true
            visibility = View.GONE
            setOnClickListener { onClick() }
            parent.addView(this, LinearLayout.LayoutParams(size, size).apply { marginStart = (8 * density).toInt() })
        }
    }

    private fun readSources(): List<StreamSource> {
        val labels = intent.getStringArrayExtra(EXTRA_SOURCE_LABELS).orEmpty()
        val uris = intent.getStringArrayExtra(EXTRA_SOURCE_URIS).orEmpty()
        val iframes = intent.getStringArrayExtra(EXTRA_SOURCE_IFRAMES).orEmpty()
        if (labels.size != uris.size || labels.size != iframes.size) return emptyList()
        return labels.indices.map { StreamSource(labels[it], uris[it], iframes[it]) }
    }

    @OptIn(UnstableApi::class)
    private fun mediaSourceFor(stream: ResolvedStream): HlsMediaSource {
        val headers = stream.headers.toMutableMap()
        val userAgent = headers.remove("User-Agent")
        val dataSource = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setDefaultRequestProperties(headers)
            .apply { if (userAgent != null) setUserAgent(userAgent) }
        return HlsMediaSource.Factory(dataSource).createMediaSource(MediaItem.fromUri(stream.url))
    }

    private fun showSourcePicker() {
        val labels = sources.map { it.label }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle(R.string.sources)
            .setSingleChoiceItems(labels, sourceIndex) { dialog, which ->
                dialog.dismiss()
                if (which != sourceIndex) switchSource(which, setOf(sourceIndex), afterError = false)
            }
            .show()
    }

    /**
     * Resolves [index] and swaps playback to it, falling through to the next untried source on
     * failure. After a playback error with nothing left the player closes; after a manual pick the
     * current source keeps playing.
     */
    private fun switchSource(index: Int?, tried: Set<Int>, afterError: Boolean) {
        if (index == null) {
            if (afterError) {
                setResult(RESULT_PLAYBACK_FAILED)
                finish()
            } else {
                Toast.makeText(this, R.string.source_none_loaded, Toast.LENGTH_SHORT).show()
            }
            return
        }
        val source = sources[index]
        if (!afterError && tried.size == 1) {
            Toast.makeText(this, getString(R.string.source_switching, source.label), Toast.LENGTH_SHORT).show()
        }
        sourceResolver?.cancel()
        sourceResolver = StreamResolver(
            this,
            resolveHost,
            source.streamUri,
            source.iframeUrl.takeIf { it.startsWith("http") },
        ) { stream ->
            sourceResolver = null
            if (isFinishing || isDestroyed) return@StreamResolver
            if (stream != null) {
                sourceIndex = index
                resolvedStream = stream
                player?.apply {
                    setMediaSource(mediaSourceFor(stream))
                    prepare()
                    play()
                }
                return@StreamResolver
            }
            if (afterError) failedSources += index
            val nowTried = tried + index
            val next = SourceQueue.next(sources.size, index, nowTried)
            if (next != null) {
                Toast.makeText(
                    this,
                    getString(R.string.source_failed_trying, source.label, sources[next].label),
                    Toast.LENGTH_SHORT,
                ).show()
            }
            switchSource(next, nowTried, afterError)
        }.also { it.start() }
    }

    private fun chatOverlayWidth(television: Boolean): Int {
        val metrics = resources.displayMetrics
        val fraction = when {
            television -> 0.32f
            metrics.widthPixels < metrics.heightPixels -> 0.75f
            else -> 0.40f
        }
        return maxOf((metrics.widthPixels * fraction).toInt(), (240 * metrics.density).toInt())
            .coerceAtMost(metrics.widthPixels)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        chatOverlay?.let { overlay ->
            val lp = overlay.layoutParams
            lp.width = chatOverlayWidth(TvHelper.isTelevision(this))
            overlay.layoutParams = lp
        }
    }

    private fun onControllerVisibilityChanged(visible: Boolean) {
        for (button in listOfNotNull(sourcesButton, chatButton)) {
            if (!visible && button.hasFocus()) playerView.requestFocus()
            button.visibility = if (visible) View.VISIBLE else View.GONE
        }
        chatOverlay?.animate()
            ?.translationY(if (visible) -CHAT_LIFT_DP * resources.displayMetrics.density else 0f)
            ?.setDuration(200L)
            ?.start()
    }

    private fun toggleChat() {
        chatOn = !chatOn
        chatButton?.apply {
            isSelected = chatOn
            contentDescription = getString(if (chatOn) R.string.chat_hide else R.string.chat_show)
        }
        chatOverlay?.visibility = if (chatOn) View.VISIBLE else View.GONE
        if (chatOn) startChat() else stopChat()
    }

    private fun startChat() {
        val overlay = chatOverlay ?: return
        val client = chatClient ?: LiveChatClient(this) { overlay.add(it) }.also { chatClient = it }
        client.start(streamId)
    }

    private fun stopChat() {
        chatClient?.stop()
        chatOverlay?.clear()
    }

    private fun handOffToCastIfReady() {
        if (!playbackReady || !CastController.isConnected()) return
        player?.pause()
        val channel = CastPlayback.Item(
            title = streamTitle,
            streamId = streamId,
            streamUri = intent.getStringExtra(EXTRA_STREAM_URI).orEmpty(),
            iframeUrl = intent.getStringExtra(EXTRA_IFRAME_URL).orEmpty(),
            sources = sources,
        )
        if (CastPlayback.start(this, channel, sourceIndex, resolvedStream)) {
            Toast.makeText(this, getString(R.string.cast_playing_on_tv, streamTitle), Toast.LENGTH_SHORT).show()
            finish()
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean =
        playerView.dispatchKeyEvent(event) || super.dispatchKeyEvent(event)

    override fun onStart() {
        super.onStart()
        player?.play()
        if (chatOn) startChat()
    }

    override fun onStop() {
        player?.pause()
        stopChat()
        super.onStop()
    }

    override fun onDestroy() {
        castSessionListener?.let { listener ->
            runCatching {
                CastContext.getSharedInstance(this).sessionManager
                    .removeSessionManagerListener(listener, CastSession::class.java)
            }
        }
        chatClient?.stop()
        chatClient = null
        sourceResolver?.cancel()
        sourceResolver = null
        player?.release()
        player = null
        super.onDestroy()
    }
}
