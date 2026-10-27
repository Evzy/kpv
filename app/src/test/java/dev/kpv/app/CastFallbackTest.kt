package dev.kpv.app

import dev.kpv.app.CastFallback.Action
import dev.kpv.app.CastFallback.ReceiverState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CastFallbackTest {

    @Test
    fun receiverErrorRefreshesTheSameSourceFirst() {
        val policy = CastFallback(sourceCount = 3, startIndex = 1)
        assertEquals(Action.Load(1, fresh = true), policy.onStatus(ReceiverState.ERROR, 0))
    }

    @Test
    fun secondFailureMovesToTheNextSource() {
        val policy = CastFallback(sourceCount = 3, startIndex = 1)
        policy.onStatus(ReceiverState.ERROR, 0)
        assertEquals(Action.Load(2, fresh = false), policy.onStatus(ReceiverState.ERROR, 1_000))
        assertEquals(2, policy.index)
    }

    @Test
    fun givesUpWhenEverySourceHasFailed() {
        val policy = CastFallback(sourceCount = 2, startIndex = 0)
        policy.onStatus(ReceiverState.ERROR, 0)
        assertEquals(Action.Load(1, fresh = false), policy.onStatus(ReceiverState.ERROR, 1))
        assertEquals(Action.Load(1, fresh = true), policy.onStatus(ReceiverState.ERROR, 2))
        assertEquals(Action.GiveUp, policy.onStatus(ReceiverState.ERROR, 3))
    }

    @Test
    fun singleSourceRefreshesOnceThenGivesUp() {
        val policy = CastFallback(sourceCount = 1, startIndex = 0)
        assertEquals(Action.Load(0, fresh = true), policy.onStatus(ReceiverState.ERROR, 0))
        assertEquals(Action.GiveUp, policy.onStatus(ReceiverState.ERROR, 1))
    }

    @Test
    fun shortBufferingIsIgnored() {
        val policy = CastFallback(sourceCount = 2, startIndex = 0)
        assertNull(policy.onStatus(ReceiverState.BUFFERING, 0))
        assertNull(policy.onStatus(ReceiverState.BUFFERING, 19_000))
        assertNull(policy.onStatus(ReceiverState.PLAYING, 19_500))
        assertNull(policy.onStatus(ReceiverState.BUFFERING, 25_000))
        assertNull(policy.onStatus(ReceiverState.BUFFERING, 44_000))
    }

    @Test
    fun longBufferingTriggersFallback() {
        val policy = CastFallback(sourceCount = 2, startIndex = 0)
        policy.onStatus(ReceiverState.BUFFERING, 0)
        assertEquals(Action.Load(0, fresh = true), policy.onStatus(ReceiverState.BUFFERING, 20_000))
    }

    @Test
    fun pausingClearsTheBufferingTimer() {
        val policy = CastFallback(sourceCount = 2, startIndex = 0)
        policy.onStatus(ReceiverState.BUFFERING, 0)
        policy.onStatus(ReceiverState.PAUSED, 10_000)
        assertNull(policy.onStatus(ReceiverState.BUFFERING, 25_000))
    }

    @Test
    fun steadyPlaybackForgetsEarlierFailures() {
        val policy = CastFallback(sourceCount = 2, startIndex = 0)
        policy.onStatus(ReceiverState.ERROR, 0)
        policy.onStatus(ReceiverState.ERROR, 1)
        policy.onStatus(ReceiverState.PLAYING, 10_000)
        policy.onStatus(ReceiverState.PLAYING, 40_000)
        assertEquals(Action.Load(1, fresh = true), policy.onStatus(ReceiverState.ERROR, 50_000))
        assertEquals(Action.Load(0, fresh = false), policy.onStatus(ReceiverState.ERROR, 50_001))
    }

    @Test
    fun loadingAndOtherIdleStatesDoNothing() {
        val policy = CastFallback(sourceCount = 2, startIndex = 0)
        assertNull(policy.onStatus(ReceiverState.LOADING, 0))
        assertNull(policy.onStatus(ReceiverState.IDLE, 60_000))
    }

    @Test
    fun manualPickStartsAFreshRound() {
        val policy = CastFallback(sourceCount = 3, startIndex = 0)
        policy.onStatus(ReceiverState.ERROR, 0)
        policy.select(2)
        assertEquals(2, policy.index)
        assertEquals(Action.Load(2, fresh = true), policy.onStatus(ReceiverState.ERROR, 1))
        assertEquals(Action.Load(0, fresh = false), policy.onStatus(ReceiverState.ERROR, 2))
    }

    @Test
    fun resolveFailureCountsAsAFailure() {
        val policy = CastFallback(sourceCount = 2, startIndex = 0)
        assertEquals(Action.Load(0, fresh = true), policy.onStatus(ReceiverState.ERROR, 0))
        assertEquals(Action.Load(1, fresh = false), policy.onLoadFailed())
    }
}
