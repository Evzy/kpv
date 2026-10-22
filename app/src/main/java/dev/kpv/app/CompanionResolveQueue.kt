package dev.kpv.app

import android.os.Handler
import android.os.Looper
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * One WebView resolve at a time; blocks the HTTP worker thread until done or timeout.
 */
class CompanionResolveQueue(private val mainHandler: Handler = Handler(Looper.getMainLooper())) {

    @Volatile
    private var host: CompanionHost? = null

    @Volatile
    private var activeResolver: StreamResolver? = null

    fun bindHost(h: CompanionHost?) {
        host = h
    }

    fun hasLiveHost(): Boolean = host?.isHostAlive() == true

    fun resolve(uri: String, embedHint: String?, timeoutMs: Long = 45_000L): ResolvedStream? {
        val h = host ?: return null
        if (!h.isHostAlive()) return null

        val latch = CountDownLatch(1)
        val result = AtomicReference<ResolvedStream?>(null)

        mainHandler.post {
            if (!h.isHostAlive()) {
                latch.countDown()
                return@post
            }
            activeResolver?.cancel()
            val embed = embedHint?.takeIf { it.startsWith("http") }
            activeResolver = StreamResolver(
                context = h.resolveContainer.context,
                container = h.resolveContainer,
                streamUri = uri,
                catalogEmbedUrl = embed,
            ) { stream ->
                activeResolver = null
                result.set(stream)
                latch.countDown()
            }.also { it.start() }
        }

        val ok = latch.await(timeoutMs, TimeUnit.MILLISECONDS)
        if (!ok) {
            mainHandler.post { activeResolver?.cancel(); activeResolver = null }
        }
        return result.get()
    }

    fun cancelAll() {
        mainHandler.post {
            activeResolver?.cancel()
            activeResolver = null
        }
    }
}
