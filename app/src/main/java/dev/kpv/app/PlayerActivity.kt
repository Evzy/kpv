package dev.kpv.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.KeyEvent
import android.view.WindowManager
import android.widget.FrameLayout
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
import androidx.mediarouter.app.MediaRouteButton
import com.google.android.gms.cast.framework.CastButtonFactory
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.cast.framework.SessionManagerListener
import androidx.core.content.ContextCompat

class PlayerActivity : Activity() {

    companion object {
        private const val EXTRA_URL = "url"
        private const val EXTRA_HEADER_NAMES = "header_names"
        private const val EXTRA_HEADER_VALUES = "header_values"
        private const val EXTRA_TITLE = "title"
        const val RESULT_PLAYBACK_FAILED = RESULT_FIRST_USER

        fun intent(context: Context, stream: ResolvedStream, title: String = "KPV"): Intent =
            Intent(context, PlayerActivity::class.java)
                .putExtra(EXTRA_URL, stream.url)
                .putExtra(EXTRA_HEADER_NAMES, stream.headers.keys.toTypedArray())
                .putExtra(EXTRA_HEADER_VALUES, stream.headers.values.toTypedArray())
                .putExtra(EXTRA_TITLE, title)
    }

    private lateinit var playerView: PlayerView
    private var player: ExoPlayer? = null
    private lateinit var resolvedStream: ResolvedStream
    private var streamTitle: String = "KPV"
    private var castButton: MediaRouteButton? = null
    private var castSessionListener: SessionManagerListener<CastSession>? = null
    private var playbackReady = false

    @OptIn(UnstableApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        TvHelper.applyScreenOrientation(this)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val url = intent.getStringExtra(EXTRA_URL) ?: return finish()
        val names = intent.getStringArrayExtra(EXTRA_HEADER_NAMES).orEmpty()
        val values = intent.getStringArrayExtra(EXTRA_HEADER_VALUES).orEmpty()
        val headers = names.zip(values).toMap()
        streamTitle = intent.getStringExtra(EXTRA_TITLE) ?: "KPV"
        resolvedStream = ResolvedStream(url, headers)
        val headersForPlayer = headers.toMutableMap()
        val userAgent = headersForPlayer.remove("User-Agent")

        val dataSource = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setDefaultRequestProperties(headersForPlayer)
            .apply { if (userAgent != null) setUserAgent(userAgent) }
        val mediaSource = HlsMediaSource.Factory(dataSource).createMediaSource(MediaItem.fromUri(url))

        val exoPlayer = ExoPlayer.Builder(this).build().apply {
            setMediaSource(mediaSource)
            playWhenReady = true
            addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(playbackState: Int) {
                    if (playbackState == Player.STATE_READY) {
                        playbackReady = true
                        castButton?.visibility = android.view.View.VISIBLE
                    }
                }

                override fun onPlayerError(error: PlaybackException) {
                    if (error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
                        seekToDefaultPosition()
                        prepare()
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

        val root = FrameLayout(this).apply {
            addView(
                playerView,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT,
                ),
            )
            if (!TvHelper.isTelevision(this@PlayerActivity)) {
                val cast = CastUi.mediaRouteButton(this@PlayerActivity).apply {
                    contentDescription = getString(R.string.cast)
                    visibility = android.view.View.GONE
                }
                CastButtonFactory.setUpMediaRouteButton(this@PlayerActivity, cast)
                castButton = cast
                val margin = (16 * resources.displayMetrics.density).toInt()
                addView(
                    cast,
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
        }
        setContentView(root)
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

    private fun handOffToCastIfReady() {
        if (!playbackReady || !CastController.isConnected()) return
        player?.pause()
        if (CastController.loadStream(this, resolvedStream, streamTitle)) {
            Toast.makeText(this, getString(R.string.cast_playing_on_tv, streamTitle), Toast.LENGTH_SHORT).show()
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean =
        playerView.dispatchKeyEvent(event) || super.dispatchKeyEvent(event)

    override fun onStart() {
        super.onStart()
        player?.play()
    }

    override fun onStop() {
        player?.pause()
        super.onStop()
    }

    override fun onDestroy() {
        castSessionListener?.let { listener ->
            runCatching {
                CastContext.getSharedInstance(this).sessionManager
                    .removeSessionManagerListener(listener, CastSession::class.java)
            }
        }
        player?.release()
        player = null
        super.onDestroy()
    }
}
