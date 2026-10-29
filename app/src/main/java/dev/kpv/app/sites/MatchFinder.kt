package dev.kpv.app.sites

import kotlin.math.abs

data class SiteEvent(val title: String, val startsAtSec: Long, val ref: String)

sealed interface MatchResult {
    data class Match(val event: SiteEvent) : MatchResult
    data class Unsure(val candidates: List<SiteEvent>) : MatchResult
    data object None : MatchResult
}

/** Finds the same match on another site by team names on both sides and start time. */
object MatchFinder {

    private const val TIME_WINDOW_SEC = 3 * 3600L
    private val SEPARATORS = Regex("""\s+(?:vs\.?|v|@|-)\s+""", RegexOption.IGNORE_CASE)
    private val FILLER = setOf("fc", "cf", "sc", "afc", "the", "club", "and")

    fun find(target: SiteEvent, candidates: List<SiteEvent>): MatchResult {
        if (candidates.isEmpty()) return MatchResult.None
        val sides = sides(target.title) ?: return MatchResult.Unsure(candidates)
        val scored = candidates.map { it to score(sides, it) }
        val full = scored.filter { (event, s) -> s == 2 && timesClose(target, event) }.map { it.first }
        if (full.size == 1) return MatchResult.Match(full[0])
        val partial = scored.filter { it.second >= 1 }.map { it.first }
        return MatchResult.Unsure(partial + candidates.filter { it !in partial })
    }

    private fun score(target: Pair<Set<String>, Set<String>>, candidate: SiteEvent): Int {
        val other = sides(candidate.title) ?: return 0
        val straight = overlap(target.first, other.first) + overlap(target.second, other.second)
        val swapped = overlap(target.first, other.second) + overlap(target.second, other.first)
        return maxOf(straight, swapped)
    }

    private fun overlap(a: Set<String>, b: Set<String>): Int = if (a.any { it in b }) 1 else 0

    private fun timesClose(a: SiteEvent, b: SiteEvent): Boolean =
        a.startsAtSec <= 0 || b.startsAtSec <= 0 || abs(a.startsAtSec - b.startsAtSec) <= TIME_WINDOW_SEC

    private fun sides(title: String): Pair<Set<String>, Set<String>>? {
        val parts = title.split(SEPARATORS)
        if (parts.size != 2) return null
        val left = words(parts[0])
        val right = words(parts[1])
        return if (left.isEmpty() || right.isEmpty()) null else left to right
    }

    private fun words(side: String): Set<String> =
        side.lowercase()
            .replace(Regex("""\(.*?\)|\[.*?]"""), " ")
            .split(Regex("""[^a-z0-9]+"""))
            .filter { it.length >= 3 && it !in FILLER }
            .toSet()
}
