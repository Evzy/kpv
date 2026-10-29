package dev.kpv.app.sites

/** How KPV reads a site; chosen by [SiteKindDetector] when the site is added. */
enum class SiteKind { API, EVENT_PAGES }

data class SiteEntry(val origin: String, val kind: SiteKind)
