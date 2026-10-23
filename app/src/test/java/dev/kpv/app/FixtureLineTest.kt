package dev.kpv.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant
import java.util.TimeZone

class FixtureLineTest {
    private val melbourne = TimeZone.getTimeZone("Australia/Melbourne")
    private val now = at("2026-10-23T00:38:30Z")

    private fun at(iso: String) = Instant.parse(iso).epochSecond

    private fun line(
        title: String = "",
        startsAt: Long = 0L,
        endsAt: Long = 0L,
        alwaysLive: Boolean = false,
    ) = FixtureLine.timeLine(
        ChannelListing(title, "", "x", "", "", startsAt = startsAt, endsAt = endsAt, alwaysLive = alwaysLive),
        now,
        melbourne,
    )

    @Test
    fun upcomingUsesDeviceTimezone() {
        assertEquals("Today 7:30 PM", line(startsAt = at("2026-10-23T08:30:00Z")))
        assertEquals("Tomorrow 3:00 AM", line(startsAt = at("2026-10-23T16:00:00Z")))
        assertEquals("Mon 3:00 AM", line(startsAt = at("2026-10-25T16:00:00Z")))
        assertEquals("6 Nov 3:00 AM", line(startsAt = at("2026-11-05T16:00:00Z")))
    }

    @Test
    fun startedEvents() {
        assertEquals("Live · Score TBC", line(title = "A at B", startsAt = at("2026-10-23T00:15:00Z")))
        assertEquals(
            "Live · started 11:15 AM",
            line(title = "2026 European Championship | Day 2", startsAt = at("2026-10-23T00:15:00Z")),
        )
        assertEquals("Ended", line(title = "A at B", startsAt = 1L, endsAt = 2L))
    }

    @Test
    fun noLineForChannelsWithoutSchedule() {
        assertNull(line(alwaysLive = true, startsAt = 1L))
        assertNull(line())
    }

    @Test
    fun splitTeams() {
        assertEquals("A" to "B", FixtureLine.splitTeams("A vs. B"))
        assertEquals("New England Patriots" to "Chicago Bears", FixtureLine.splitTeams("New England Patriots at Chicago Bears"))
        assertNull(FixtureLine.splitTeams("TNA Impact"))
    }
}
