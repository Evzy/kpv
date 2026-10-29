package dev.kpv.app.chat

import android.os.Handler
import android.os.Looper
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit
import kotlin.random.Random

/** Anonymous read-only connection to one Twitch channel's chat. Main-thread API; messages arrive on main. */
class TwitchChatClient(private val onMessages: (List<ChatMessage>) -> Unit) {

    private val main = Handler(Looper.getMainLooper())
    private var socket: WebSocket? = null
    private var channel = ""
    /** Bumped on every start/stop so callbacks from older sockets are ignored. */
    private var generation = 0
    private val reconnect = Runnable { connect() }

    fun start(channel: String) {
        stop()
        if (channel.isBlank()) return
        this.channel = channel.lowercase()
        connect()
    }

    fun stop() {
        generation++
        main.removeCallbacks(reconnect)
        socket?.cancel()
        socket = null
        channel = ""
    }

    private fun connect() {
        val request = Request.Builder().url(TwitchIrc.SOCKET_URL).build()
        socket = http.newWebSocket(request, Listener(generation, channel))
    }

    private inner class Listener(private val gen: Int, private val channel: String) : WebSocketListener() {

        override fun onOpen(webSocket: WebSocket, response: Response) {
            webSocket.send("CAP REQ :twitch.tv/tags")
            webSocket.send("PASS SCHMOOPIIE")
            webSocket.send("NICK justinfan${Random.nextInt(10_000, 99_999)}")
            webSocket.send("JOIN #$channel")
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            val messages = ArrayList<ChatMessage>()
            for (line in text.split("\r\n")) {
                if (line.startsWith("PING")) {
                    webSocket.send("PONG" + line.removePrefix("PING"))
                    continue
                }
                TwitchIrc.parseLine(line)?.let(messages::add)
            }
            if (messages.isNotEmpty()) main.post { if (gen == generation) onMessages(messages) }
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
                .pingInterval(60, TimeUnit.SECONDS)
                .build()
        }
    }
}
