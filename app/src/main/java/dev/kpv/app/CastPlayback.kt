package dev.kpv.app

import android.app.Activity
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.ViewGroup
import android.widget.Toast
import com.google.android.gms.cast.MediaStatus
import com.google.android.gms.cast.framework.media.RemoteMediaClient
import java.lang.ref.WeakReference

/**
 * The channel playing on the TV: its sources, which one is on, and automatic fallback when the
 * receiver errors or stalls. Re-resolving needs a WebView, so it runs inside whichever KPV screen
 * is open ([attachHost]); with none open, a pending switch waits for the next one.
 */
object CastPlayback {

    data class Item(
        val title: String,
        val streamId: Long,
        val streamUri: String,
        val iframeUrl: String,
        val sources: List<StreamSource>,
    )

    private const val TAG = "KpvCastPlayback"
    private const val TICK_MS = 5_000L
    private const val LOAD_GRACE_MS = 5_000L

    private val handler = Handler(Looper.getMainLooper())

    var item: Item? = null
        private set

    val sourceIndex: Int get() = policy?.index ?: 0
    val canSwitchSources: Boolean get() = (item?.sources?.size ?: 0) > 1

    private var policy: CastFallback? = null
    private var watching = false
    private var loadedAtMs = 0L
    private var appContext: Context? = null
    private var client: RemoteMediaClient? = null
    private var resolver: StreamResolver? = null
    private var pending: CastFallback.Action.Load? = null
    private var inFlight: CastFallback.Action.Load? = null
    private var hostActivity: WeakReference<Activity>? = null
    private var hostContainer: WeakReference<ViewGroup>? = null

    private val callback = object : RemoteMediaClient.Callback() {
        override fun onStatusUpdated() = evaluate()
    }

    private val tick = object : Runnable {
        override fun run() {
            evaluate()
            if (item != null) handler.postDelayed(this, TICK_MS)
        }
    }

    /** Sends an already-resolved stream to the TV and starts watching it. */
    fun start(context: Context, item: Item, sourceIndex: Int, stream: ResolvedStream): Boolean {
        if (!CastController.loadStream(context, stream, item.title)) return false
        cancelResolve()
        pending = null
        appContext = context.applicationContext
        this.item = item
        policy = CastFallback(maxOf(1, item.sources.size), sourceIndex)
        watching = true
        watchClient()
        return true
    }

    /** User picked a source on the control screen. */
    fun selectSource(index: Int) {
        val item = item ?: return
        val policy = policy ?: return
        if (index !in item.sources.indices) return
        policy.select(index)
        watching = true
        cancelResolve()
        toast(appContext?.getString(R.string.source_switching, item.sources[index].label))
        pending = CastFallback.Action.Load(index, fresh = false)
        resolvePending()
    }

    fun attachHost(activity: Activity, container: ViewGroup) {
        hostActivity = WeakReference(activity)
        hostContainer = WeakReference(container)
        resolvePending()
    }

    fun detachHost(activity: Activity) {
        if (hostActivity?.get() !== activity) return
        hostActivity = null
        hostContainer = null
        if (resolver != null) {
            cancelResolve()
            pending = inFlight
        }
    }

    fun clear() {
        cancelResolve()
        pending = null
        item = null
        policy = null
        watching = false
        client?.unregisterCallback(callback)
        client = null
        handler.removeCallbacks(tick)
    }

    private fun watchClient() {
        loadedAtMs = SystemClock.elapsedRealtime()
        val current = CastController.remoteMediaClient()
        if (current !== client) {
            client?.unregisterCallback(callback)
            current?.registerCallback(callback)
            client = current
        }
        handler.removeCallbacks(tick)
        handler.postDelayed(tick, TICK_MS)
    }

    private fun evaluate() {
        val policy = policy ?: return
        if (!watching || resolver != null || pending != null) return
        // The previous item's status (possibly an error) lingers until the receiver takes the load.
        if (SystemClock.elapsedRealtime() - loadedAtMs < LOAD_GRACE_MS) return
        val client = CastController.remoteMediaClient() ?: return
        val action = policy.onStatus(receiverState(client), SystemClock.elapsedRealtime()) ?: return
        perform(action)
    }

    private fun receiverState(client: RemoteMediaClient): CastFallback.ReceiverState {
        val contentId = client.mediaInfo?.contentId
        if (contentId != null && contentId != CastController.loadedUrl) return CastFallback.ReceiverState.IDLE
        return when (client.playerState) {
            MediaStatus.PLAYER_STATE_PLAYING -> CastFallback.ReceiverState.PLAYING
            MediaStatus.PLAYER_STATE_PAUSED -> CastFallback.ReceiverState.PAUSED
            MediaStatus.PLAYER_STATE_BUFFERING -> CastFallback.ReceiverState.BUFFERING
            MediaStatus.PLAYER_STATE_LOADING -> CastFallback.ReceiverState.LOADING
            MediaStatus.PLAYER_STATE_IDLE ->
                if (client.idleReason == MediaStatus.IDLE_REASON_ERROR) {
                    CastFallback.ReceiverState.ERROR
                } else {
                    CastFallback.ReceiverState.IDLE
                }
            else -> CastFallback.ReceiverState.LOADING
        }
    }

    private fun perform(action: CastFallback.Action) {
        val item = item ?: return
        when (action) {
            CastFallback.Action.GiveUp -> {
                Log.i(TAG, "No source left for ${item.title}")
                watching = false
                toast(appContext?.getString(R.string.cast_gave_up, item.title))
            }
            is CastFallback.Action.Load -> {
                Log.i(TAG, "Fallback for ${item.title}: source ${action.index} fresh=${action.fresh}")
                val label = item.sources.getOrNull(action.index)?.label
                toast(
                    if (action.fresh || label == null) {
                        appContext?.getString(R.string.cast_reconnecting, item.title)
                    } else {
                        appContext?.getString(R.string.cast_trying_source, label)
                    },
                )
                pending = action
                resolvePending()
            }
        }
    }

    private fun resolvePending() {
        val load = pending ?: return
        val item = item ?: return
        val activity = hostActivity?.get()
        val container = hostContainer?.get()
        if (activity == null || container == null || activity.isFinishing || resolver != null) return
        pending = null
        inFlight = load
        val source = item.sources.getOrNull(load.index)
        resolver = StreamResolver(
            activity,
            container,
            source?.streamUri ?: item.streamUri,
            (source?.iframeUrl ?: item.iframeUrl).takeIf { it.startsWith("http") },
            castMode = true,
        ) { stream ->
            resolver = null
            inFlight = null
            if (this.item !== item) return@StreamResolver
            val context = appContext ?: return@StreamResolver
            if (stream != null && CastController.loadStream(context, stream, item.title)) {
                watchClient()
                return@StreamResolver
            }
            policy?.onLoadFailed()?.let { perform(it) }
        }.also { it.start() }
    }

    private fun cancelResolve() {
        resolver?.cancel()
        resolver = null
        inFlight = null
    }

    private fun toast(text: String?) {
        val context = appContext ?: return
        if (text != null) Toast.makeText(context, text, Toast.LENGTH_SHORT).show()
    }
}
