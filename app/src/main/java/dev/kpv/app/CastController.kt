package dev.kpv.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.Toast
import com.google.android.gms.cast.MediaInfo
import com.google.android.gms.cast.MediaLoadRequestData
import com.google.android.gms.cast.MediaMetadata
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.cast.framework.SessionManagerListener
import com.google.android.gms.cast.framework.media.RemoteMediaClient
import com.google.android.gms.tasks.Task
import java.util.concurrent.Executor

object CastController {

    private const val TAG = "KpvCast"

    @Volatile
    private var castContext: CastContext? = null

    @Volatile
    private var appContext: Context? = null

    @Volatile
    private var activeToken: String? = null

    private var sessionListenerRegistered = false

    private val sessionListener = object : SessionManagerListener<CastSession> {
        override fun onSessionStarting(session: CastSession) = Unit
        override fun onSessionStarted(session: CastSession, sessionId: String) = Unit
        override fun onSessionStartFailed(session: CastSession, error: Int) = Unit
        override fun onSessionEnding(session: CastSession) = Unit
        // The receiver can keep playing after the phone-side session drops (e.g. an output route
        // change), so the relay outlives the session and is stopped by the idle watchdog instead.
        override fun onSessionEnded(session: CastSession, error: Int) {
            Log.i(TAG, "Cast session ended error=$error; relay kept until the TV goes idle")
            CastPlayback.clear()
        }
        override fun onSessionResuming(session: CastSession, sessionId: String) = Unit
        override fun onSessionResumed(session: CastSession, wasSuspended: Boolean) = Unit
        override fun onSessionResumeFailed(session: CastSession, error: Int) = Unit
        override fun onSessionSuspended(session: CastSession, reason: Int) = Unit
    }

    fun init(context: Context, executor: Executor = Executor { it.run() }, onReady: (() -> Unit)? = null) {
        if (TvHelper.isTelevision(context)) return
        if (castContext != null) {
            onReady?.invoke()
            return
        }
        val task: Task<CastContext> = CastContext.getSharedInstance(context.applicationContext, executor)
        task.addOnSuccessListener { ctx ->
            appContext = context.applicationContext
            castContext = ctx
            if (!sessionListenerRegistered) {
                ctx.sessionManager.addSessionManagerListener(sessionListener, CastSession::class.java)
                sessionListenerRegistered = true
            }
            onReady?.invoke()
        }
        task.addOnFailureListener { e ->
            Log.w(TAG, "Cast init failed: ${e.message}")
        }
    }

    fun isReady(): Boolean = castContext != null

    fun isConnected(): Boolean =
        castContext?.sessionManager?.currentCastSession?.isConnected == true

    fun remoteMediaClient(): RemoteMediaClient? =
        castContext?.sessionManager?.currentCastSession?.remoteMediaClient

    /** Relay URL of the last stream sent to the TV. */
    @Volatile
    var loadedUrl: String? = null
        private set

    fun loadStream(context: Context, stream: ResolvedStream, title: String): Boolean {
        val ip = LanAddress.primaryIpv4()
        if (ip == null) {
            Toast.makeText(context, R.string.cast_no_wifi, Toast.LENGTH_LONG).show()
            return false
        }
        if (!isConnected()) return false
        CastRelayServer.ensureStarted()
        CastRelayForegroundService.start(context.applicationContext, title)
        val token = CastRelayServer.register(stream) ?: run {
            Toast.makeText(context, R.string.cast_relay_failed, Toast.LENGTH_LONG).show()
            return false
        }
        activeToken?.let { CastRelayServer.removeToken(it) }
        activeToken = token
        scheduleIdleCheck()
        val url = CastHlsRelay.masterRelayUrl(ip, CastRelayServer.listeningPort, token)
        val metadata = MediaMetadata(MediaMetadata.MEDIA_TYPE_GENERIC).apply {
            putString(MediaMetadata.KEY_TITLE, title)
            putString(MediaMetadata.KEY_SUBTITLE, context.getString(R.string.app_name))
        }
        val mediaInfo = MediaInfo.Builder(url)
            .setStreamType(MediaInfo.STREAM_TYPE_LIVE)
            .setContentType("application/vnd.apple.mpegurl")
            .setMetadata(metadata)
            .build()
        val client = castContext?.sessionManager?.currentCastSession?.remoteMediaClient
        if (client == null) {
            Toast.makeText(context, R.string.cast_session_lost, Toast.LENGTH_LONG).show()
            return false
        }
        loadedUrl = url
        client.load(MediaLoadRequestData.Builder().setMediaInfo(mediaInfo).build())
            .setResultCallback { result ->
                if (!result.status.isSuccess) {
                    Log.w(TAG, "Cast load failed: ${result.status} code=${result.status.statusCode}")
                    Toast.makeText(context, R.string.cast_load_failed, Toast.LENGTH_LONG).show()
                } else {
                    Log.i(TAG, "Cast load OK for $title")
                }
            }
        Log.i(TAG, "Cast load request $title -> $url upstream=${stream.url.takeLast(72)} headers=${stream.headers.keys}")
        return true
    }

    fun releaseRelay(contextOverride: Context? = null) {
        mainHandler.removeCallbacks(idleCheck)
        activeToken?.let { CastRelayServer.removeToken(it) }
        activeToken = null
        val ctx = contextOverride ?: appContext
        ctx?.let { CastRelayForegroundService.stop(it) }
    }

    fun shutdown(context: Context) {
        releaseRelay(context.applicationContext)
        CastRelayServer.stop()
    }

    /** Leaves an in-use relay running when the activity goes away; the idle watchdog stops it later. */
    fun onHostDestroyed(context: Context) {
        if (activeToken == null) shutdown(context)
    }

    private val mainHandler = Handler(Looper.getMainLooper())

    private val idleCheck = object : Runnable {
        override fun run() {
            if (activeToken == null) return
            val idleMs = System.currentTimeMillis() - CastRelayServer.lastRequestAtMs
            // A paused receiver stops fetching but still needs the relay when it resumes.
            val paused = remoteMediaClient()?.isPaused == true
            if (idleMs >= RELAY_IDLE_TIMEOUT_MS && !paused) {
                Log.i(TAG, "TV idle for ${idleMs / 1000}s; stopping cast relay")
                appContext?.let { shutdown(it) } ?: releaseRelay()
            } else {
                mainHandler.postDelayed(this, IDLE_CHECK_INTERVAL_MS)
            }
        }
    }

    private fun scheduleIdleCheck() {
        mainHandler.removeCallbacks(idleCheck)
        mainHandler.postDelayed(idleCheck, IDLE_CHECK_INTERVAL_MS)
    }

    private const val RELAY_IDLE_TIMEOUT_MS = 90_000L
    private const val IDLE_CHECK_INTERVAL_MS = 15_000L
}
