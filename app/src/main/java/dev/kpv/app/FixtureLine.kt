package dev.kpv.app

import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

/** Card line under the title: start time in the device's timezone, or the live score. */
object FixtureLine {
    data class Side(val abbr: String, val score: String)

    data class Score(val state: String, val detail: String, val left: Side, val right: Side)

    private val DAYS = arrayOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
    private val MONTHS = arrayOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
    private val TEAM_SPLIT = Regex("""\s+(?:at|vs\.?)\s+""", RegexOption.IGNORE_CASE)
    private const val DAY_MS = 86_400_000L

    fun splitTeams(title: String): Pair<String, String>? {
        val parts = title.split(TEAM_SPLIT)
        if (parts.size != 2) return null
        val left = parts[0].trim()
        val right = parts[1].trim()
        return if (left.isNotEmpty() && right.isNotEmpty()) left to right else null
    }

    fun hasStarted(channel: ChannelListing, nowSec: Long): Boolean =
        !channel.alwaysLive && channel.startsAt in 1..nowSec

    /** Null for 24/7 channels and listings without a start time. */
    fun timeLine(channel: ChannelListing, nowSec: Long, zone: TimeZone = TimeZone.getDefault()): String? {
        if (channel.alwaysLive || channel.startsAt <= 0L) return null
        val start = calendar(channel.startsAt, zone)
        if (channel.startsAt > nowSec) return "${dayLabel(start, calendar(nowSec, zone))} ${clock(start)}"
        if (channel.endsAt > 0L && nowSec > channel.endsAt) return "Ended"
        return if (splitTeams(channel.title) != null) "Live · Score TBC" else "Live · started ${clock(start)}"
    }

    fun scoreLine(score: Score): String {
        val line = "${score.left.abbr} ${score.left.score} – ${score.right.score} ${score.right.abbr}"
        return when {
            score.state == "post" -> "Final · $line"
            score.detail.isNotBlank() -> "$line · ${score.detail}"
            else -> line
        }
    }

    private fun calendar(sec: Long, zone: TimeZone): Calendar =
        Calendar.getInstance(zone, Locale.US).apply { timeInMillis = sec * 1000L }

    private fun clock(c: Calendar): String {
        val h = c.get(Calendar.HOUR_OF_DAY)
        val hour12 = if (h % 12 == 0) 12 else h % 12
        return String.format(Locale.US, "%d:%02d %s", hour12, c.get(Calendar.MINUTE), if (h < 12) "AM" else "PM")
    }

    private fun dayLabel(start: Calendar, now: Calendar): String {
        val days = localDay(start) - localDay(now)
        return when {
            days == 0L -> "Today"
            days == 1L -> "Tomorrow"
            days in 2L..6L -> DAYS[start.get(Calendar.DAY_OF_WEEK) - 1]
            else -> "${start.get(Calendar.DAY_OF_MONTH)} ${MONTHS[start.get(Calendar.MONTH)]}"
        }
    }

    /** Day number of the calendar's local date, unaffected by daylight-saving offsets. */
    private fun localDay(c: Calendar): Long {
        val utc = Calendar.getInstance(TimeZone.getTimeZone("UTC"), Locale.US).apply {
            clear()
            set(c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH))
        }
        return utc.timeInMillis / DAY_MS
    }
}
