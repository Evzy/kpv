# Ordered site list and cross-site fallback (Android)

## Goal

Replace the single site address in settings with an ordered list of sites. The top site supplies
the home screen catalog. When every source of a stream fails, a **Try other sites** button looks
for the same match on the lower sites. The user enters every site address in the app; no site address or site name is built into the app, its strings or its tests (fixtures saved from real sites use a placeholder domain).

Scope: Android app (phone, Android TV, casting). Out of scope: Samsung TV (Tizen) app, the
event site's TV guide and 24/7 channels, merging catalogs across sites.

## Site types

| Type | Catalog | Sources of a match | Playback |
| --- | --- | --- | --- |
| API (current site) | `{api}/api/streams` (homepage scrape fallback) — unchanged | `substreams` — unchanged | `StreamResolver` on the embed |
| Event pages | `EVENTS_DATA` array in the homepage script: `title`, `href` (e.g. `nba-1.html`), `start`, `end` (ISO UTC), `bg`, `category` | Match page buttons `<button class="stream-btn" data-url="/embed?nba1h">Hawks Broadcast</button>` | `StreamResolver` with the embed URL (`{origin}/embed?nba1h`) as the catalog embed |

The event-pages catalog keeps events that are live or start within the next 24 h, dropping those ended
more than 30 min ago (the site's own rule). Events are grouped by `category`; `bg` is the poster.
Live = `start <= now <= end`. Sources are read when a match is played (one small page fetch), not
for the whole catalog.

## Components

- **`SiteList`** (replaces the address part of `SiteConfig`): ordered `List<SiteEntry(origin, kind)>`
  in shared prefs as JSON. Migration: an existing `site_origin` becomes the only entry, kind API.
  `SiteConfig` keeps per-site resolved API/embed origins and allowed hosts keyed by origin;
  `isAllowedHost` accepts hosts of every listed site plus learned embed hosts.
- **`SiteKindDetector`**: when a site is added, every parser is tried against it and the one that
  works best is saved on that site's entry (its `kind`); playback and fallback then always use it.
  - Each parser returns a probe result: events found, how many are live or upcoming, and whether
    a sample event yields at least one source (API: a stream with an `iframe` or `substreams`;
    Event pages: the first live/upcoming event's page has a feed button or embed iframe).
  - Score = 0 when nothing parses; otherwise live/upcoming events, plus a large bonus when the
    sample has sources. Highest score wins; ties go to API (richer data: sources, chat, scores).
  - All parsers score 0 → "Not a site KPV recognises" and the site isn't added.
  - The settings row shows the chosen parser and has a **Re-check** button that reruns detection
    (for when a site changes layout).
  - Adding a parser later means adding one probe; the detector needs no other change.
- **`SiteAdapter`** interface:
  - `loadCatalog(host): List<StreamCategory>?` — what the home screen shows (top site only).
  - `listEvents(): List<SiteEvent>` — lightweight `{title, startsAt, category, ref}` for matching.
  - `sourcesFor(event): List<StreamSource>` — the playable sources of one match.
  - `ApiSiteAdapter` wraps today's `CatalogLoader`/`ApiCatalogFetcher`/`StreamSources`.
  - `EventPagesSiteAdapter` uses `EventPagesParser` (pure: `parseEvents(html)`, `parseSources(html, origin)`).
- **`MatchFinder`** (pure): `find(target: SiteEvent, candidates): Result` = `Match(event)` |
  `Unsure(liveCandidates)` | `None`.
  - Split titles on ` vs `, ` v `, ` @ `, ` - ` into two sides; lowercase, strip punctuation and
    filler words (fc, cf, sc, the, club, &).
  - A side matches when it shares a significant word (≥ 3 letters) with a candidate side, in
    either order of sides.
  - Confident match: both sides match, start times within 3 h when both are known, and exactly one
    candidate qualifies. One side matching, or several qualifying → `Unsure`. Titles without two
    sides (channels like "Fox Footy") never auto-match → `Unsure`.
- **`OtherSitesFallback`** (UI flow on `MainActivity` and `CastControlsActivity`): walks sites
  below the one the stream came from, in order. Per site: `listEvents` → `MatchFinder`.
  `Match` → `sourcesFor` → play (or `CastPlayback.start` when casting) with the normal source
  fallback. `Unsure` → dialog of that site's live events (plus "Next site"); picking plays it.
  `None` → next site. No sites left → toast "No other site has this match".

## Where the button appears

- Home screen status bar, after a stream has failed on every source (the existing "Couldn't
  start …" / "… stopped" messages), as a **Try other sites** button. Only when the list has more
  than one site.
- Cast control screen, after `CastPlayback` gives up (all sources failed on the TV).

## Settings UI

The address field becomes a list (same style as the category editor): each row shows the address
and type (API / Event pages) with Up, Down and Remove; an **Add site** row takes an address and
runs detection. At least one site must remain. Changing the top site reloads the catalog.

## Error handling

- Detection or fetch failures show a toast and change nothing.
- An event-pages match with no `stream-btn` buttons falls back to the page's first
  `iframe[src*="/embed"]` as a single source; none → treated as a failed source.
- Fallback lookups run off the main thread with a spinner/status line; cancelling (back) stops them.

## Testing

- Unit: `EventPagesParser` against saved real pages (domain replaced by `events.example`) (homepage `EVENTS_DATA`, `nba-1.html` buttons),
  `MatchFinder` with real pairs ("Atlanta Hawks vs Miami Heat" ↔ "Hawks vs Heat",
  "Manchester City vs Brighton & Hove Albion" ↔ "Man City v Brighton", swapped home/away, time
  window, ambiguous doubles), `SiteList` ordering and migration, `SiteKindDetector` decisions on
  sample bodies.
- Device: on the phone, add the event-pages site, confirm its embed resolves and plays (main
  risk: the obfuscated embed), force a fallback from the current site and from the cast screen.
