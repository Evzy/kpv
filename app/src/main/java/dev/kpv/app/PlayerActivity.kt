package dev.kpv.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.ui.PlayerView

class PlayerActivity : Activity() {

    companion object {
        private const val EXTRA_URL = "url"
        private const val EXTRA_HEADER_NAMES = "header_names"
        private const val EXTRA_HEADER_VALUES = "header_values"
        const val RESULT_PLAYBACK_FAILED = RESULT_FIRST_USER

        fun intent(context: Context, stream: ResolvedStream): Intent =
            Intent(context, PlayerActivity::class.java)
                .putExtra(EXTRA_URL, stream.url)
                .putExtra(EXTRA_HEADER_NAMES, stream.headers.keys.toTypedArray())
                .putExtra(EXTRA_HEADER_VALUES, stream.headers.values.toTypedArray())
    }

    private lateinit var playerView: PlayerView
    private var player: ExoPlayer? = null

    @OptIn(UnstableApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        TvHelper.applyScreenOrientation(this)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val url = intent.getStringExtra(EXTRA_URL) ?: return finish()
        val names = intent.getStringArrayExtra(EXTRA_HEADER_NAMES).orEmpty()
        val values = intent.getStringArrayExtra(EXTRA_HEADER_VALUES).orEmpty()
        val headers = names.zip(values).toMap().toMutableMap()
        val userAgent = headers.remove("User-Agent")

        val dataSource = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setDefaultRequestProperties(headers)
            .apply { if (userAgent != null) setUserAgent(userAgent) }
        val mediaSource = HlsMediaSource.Factory(dataSource).createMediaSource(MediaItem.fromUri(url))

        val exoPlayer = ExoPlayer.Builder(this).build().apply {
            setMediaSource(mediaSource)
            playWhenReady = true
            addListener(object : Player.Listener {
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
        setContentView(playerView)
        playerView.requestFocus()
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
        player?.release()
        player = null
        super.onDestroy()
    }
}
