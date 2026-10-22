package dev.kpv.app.update

object ReleaseVersionCompare {
    enum class VersusInstalled {
        UNKNOWN,
        UP_TO_DATE,
        UPDATE_AVAILABLE,
        INSTALLED_NEWER,
    }

    fun compare(remoteTag: String, installedVersionName: String): VersusInstalled {
        val remote = parseNumericCore(remoteTag) ?: return VersusInstalled.UNKNOWN
        val installed = parseNumericCore(installedVersionName) ?: return VersusInstalled.UNKNOWN
        val cmp = compareTriple(remote, installed)
        return when {
            cmp > 0 -> VersusInstalled.UPDATE_AVAILABLE
            cmp < 0 -> VersusInstalled.INSTALLED_NEWER
            else -> VersusInstalled.UP_TO_DATE
        }
    }

    private fun parseNumericCore(raw: String): List<Int>? {
        var s = raw.trim()
        if (s.startsWith('v', ignoreCase = true)) {
            s = s.substring(1)
        }
        val core = s.substringBefore('-', s)
        val parts = core.split('.').mapNotNull { p -> p.toIntOrNull() }
        if (parts.isEmpty()) return null
        return listOf(
            parts.getOrElse(0) { 0 },
            parts.getOrElse(1) { 0 },
            parts.getOrElse(2) { 0 },
        )
    }

    private fun compareTriple(remote: List<Int>, installed: List<Int>): Int {
        for (i in 0..2) {
            val a = remote[i]
            val b = installed[i]
            if (a != b) return a - b
        }
        return 0
    }
}
