package dev.kpv.app

/**
 * Decides when a cast stream has failed and what to load next: the same source with a freshly
 * resolved link once, then each untried source in turn. Steady playback forgets earlier failures.
 */
class CastFallback(private val sourceCount: Int, startIndex: Int) {

    enum class ReceiverState { PLAYING, PAUSED, BUFFERING, LOADING, IDLE, ERROR }

    sealed interface Action {
        data class Load(val index: Int, val fresh: Boolean) : Action
        data object GiveUp : Action
    }

    var index: Int = startIndex
        private set

    private val tried = mutableSetOf(startIndex)
    private var refreshed = false
    private var bufferingSinceMs: Long? = null
    private var playingSinceMs: Long? = null

    fun select(newIndex: Int) {
        index = newIndex
        tried.clear()
        tried += newIndex
        refreshed = false
        resetTimers()
    }

    fun onStatus(state: ReceiverState, nowMs: Long): Action? {
        when (state) {
            ReceiverState.PLAYING -> {
                bufferingSinceMs = null
                val since = playingSinceMs ?: nowMs.also { playingSinceMs = it }
                if (nowMs - since >= STEADY_PLAYBACK_MS) {
                    tried.clear()
                    tried += index
                    refreshed = false
                }
            }
            ReceiverState.BUFFERING -> {
                playingSinceMs = null
                val since = bufferingSinceMs ?: nowMs.also { bufferingSinceMs = it }
                if (nowMs - since >= BUFFERING_LIMIT_MS) return fail()
            }
            ReceiverState.ERROR -> return fail()
            ReceiverState.PAUSED, ReceiverState.LOADING, ReceiverState.IDLE -> resetTimers()
        }
        return null
    }

    /** The replacement link couldn't be resolved or loaded. */
    fun onLoadFailed(): Action = fail()

    private fun fail(): Action {
        resetTimers()
        if (!refreshed) {
            refreshed = true
            return Action.Load(index, fresh = true)
        }
        val next = SourceQueue.next(sourceCount, index, tried) ?: return Action.GiveUp
        tried += next
        index = next
        refreshed = false
        return Action.Load(next, fresh = false)
    }

    private fun resetTimers() {
        bufferingSinceMs = null
        playingSinceMs = null
    }

    companion object {
        const val BUFFERING_LIMIT_MS = 20_000L
        const val STEADY_PLAYBACK_MS = 30_000L
    }
}
