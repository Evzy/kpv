package dev.kpv.app.chat

import android.content.Context
import android.os.Handler
import android.os.Looper
import dev.kpv.app.SiteHttp
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit

/** Read-only connection to the site's chat for one stream. Main-thread API; messages arrive on main. */
class LiveChatClient(
    context: Context,
    private val onMessages: (List<ChatMessage>) -> Unit,
) {

    private val appContext = context.applicationContext
    private val main = Handler(Looper.getMainLooper())
    private var socket: WebSocket? = null
    private var streamId = 0L
    /** Bumped on every start/stop so callbacks from older sockets are ignored. */
    private var generation = 0
    private val reconnect = Runnable { connect(reconnecting = true) }

    fun start(streamId: Long) {
        stop()
        if (streamId <= 0L) return
        this.streamId = streamId
        connect(reconnecting = false)
    }

    fun stop() {
        generation++
        main.removeCallbacks(reconnect)
        socket?.cancel()
        socket = null
        streamId = 0L
    }

    private fun connect(reconnecting: Boolean) {
        val gen = generation
        val id = streamId
        Thread {
            val endpoint = ChatEndpoint.resolve(appContext, http)
            main.post {
                if (gen != generation) return@post
                val request = Request.Builder()
                    .url(ChatEndpoint.socketUrl(endpoint, id, reconnecting))
                    .header("User-Agent", SiteHttp.USER_AGENT)
                    .build()
                socket = http.newWebSocket(request, Listener(gen))
            }
        }.apply { isDaemon = true }.start()
    }

    private inner class Listener(private val gen: Int) : WebSocketListener() {

        override fun onOpen(webSocket: WebSocket, response: Response) {
            webSocket.send("""{"session_id":""}""")
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            val messages = ChatMessageParser.parse(text)
            if (messages.isEmpty()) return
            main.post { if (gen == generation) onMessages(messages) }
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = scheduleReconnect()

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = scheduleReconnect()

        private fun scheduleReconnect() {
            main.post {
                if (gen != generation) return@post
                socket = null
                main.removeCallbacks(reconnect)
                main.postDelayed(reconnect, RECONNECT_DELAY_MS)
            }
        }
    }

    private companion object {
        const val RECONNECT_DELAY_MS = 5_000L

        val http: OkHttpClient by lazy {
            OkHttpClient.Builder()
                .connectTimeout(12, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .pingInterval(30, TimeUnit.SECONDS)
                .build()
        }
    }
}
