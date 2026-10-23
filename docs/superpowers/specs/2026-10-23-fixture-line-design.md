# Fixture line: start time and live score under each channel title

## Goal

Every event card (Tizen TV app and Android app, phone and TV) shows a second line under the
title with the event's start time in the device's own timezone, or the live score once it has
started. 24/7 channels keep their existing tag line.

## Line format

| Situation | Line |
|---|---|
| Not started, today | `Today 7:30 PM` |
| Not started, tomorrow | `Tomorrow 3:00 AM` |
| Not started, later | `Sat 3:00 AM` (weekday within 6 days, else `24 Oct 3:00 AM`) |
| Live, score found | `NE 0 – 3 CHI · Q2 5:12` |
| Live, team sport, no score found | `Live · Score TBC` |
| Live, not a two-team title | `Live · started 7:30 PM` |
| Finished (ESPN `post`) | `Final · NE 21 – 24 CHI` |
| Past `ends_at`, no ESPN result | `Ended` |
| `always_live` or no `starts_at` | existing tag (`ch.tag` or `Live`) |

- Times use the device clock and timezone (`Date` locale formatting on Tizen,
  `java.time` + system zone on Android). 12-hour clock with AM/PM.
- Teams appear in title order (left team first), using ESPN `team.abbreviation`.
- Status detail is ESPN `status.type.shortDetail` (e.g. `Q2 5:12`, `45'`, `Half`).
- "Live" means `starts_at <= now` and not `always_live`, using the device clock as now.
- The line sits between the title and the existing tag line (league name stays visible);
  cards grow by one 18px line.

## Scores source

ESPN public scoreboard, no key:
`https://site.api.espn.com/apis/site/v2/sports/<path>/scoreboard?limit=300`

ESPN's default scoreboard is the current day or week and always includes in-progress games
(date ranges return 400). ESPN allows any origin; Tizen `config.xml` already allows `*`.

Site tag to ESPN path:

| Tag | Path |
|---|---|
| NFL | `football/nfl` |
| College Football | `football/college-football` |
| Canadian Football | `football/cfl` |
| NBA | `basketball/nba` |
| NBL | `basketball/nbl` |
| NHL | `hockey/nhl` |
| AFL | `australian-football/afl` |
| NRL | `rugby-league/3` |
| Premier League | `soccer/eng.1` |
| LaLiga | `soccer/esp.1` |
| Serie A | `soccer/ita.1` |
| Bundesliga | `soccer/ger.1` |
| Ligue 1 | `soccer/fra.1` |
| Eredivisie | `soccer/ned.1` |
| MLS | `soccer/usa.1` |
| Liga MX | `soccer/mex.1` |
| Allsvenskan | `soccer/swe.1` |

Tag matching is case-insensitive. Unknown tags get no score lookup (team titles show
`Live · Score TBC`).

## Matching

- Title split on ` at `, ` vs. `, ` vs ` (case-insensitive) into two teams. No split means
  not a two-team title.
- Normalise: lowercase, strip accents, drop punctuation, drop standalone `fc`, `cf`, `sc`,
  `afc`, collapse spaces.
- A title team matches an ESPN competitor when its normalised name equals, or contains, or is
  contained in any of `displayName`, `shortDisplayName`, `name`, `location` (normalised,
  non-empty, at least 3 characters for containment). Containment is whole-word and skips
  `location`, so `Los Angeles Rams` cannot match the Chargers.
- An ESPN event matches when both title teams match different competitors.
- Only events whose ESPN `status.type.state` is `in` or `post` produce a score.

## Flow

1. Catalog loads as today; cards render immediately with the time-based line.
2. For live two-team events with a mapped tag, fetch one scoreboard per league in parallel
   (5 s timeout each). Failures are silent.
3. Update each live card's line in place: score if matched, else `Live · Score TBC`.

## Refresh

- Tizen: the menu page reloads when returning from `watch.html`, and Refresh reloads the
  catalog, so both refetch.
- Android: pull-to-refresh reloads the catalog (and scores). Returning to `MainActivity` from
  the player (`onResume` after the first load) refetches scores only and rebinds lines.

## Components

- Tizen `tizen/js/fixture-line.js`: pure formatting (`timeLine`, `scoreLine`, `splitTeams`).
- Tizen `tizen/js/live-scores.js`: tag map, ESPN fetch, matching, `apply(categories)`.
- Android `FixtureLine.kt`, `LiveScores.kt`: same responsibilities.
- `ChannelListing` gains `startsAt`, `alwaysLive`; card binders show the line.

## Testing

- Saved ESPN scoreboard fixture plus channel samples, no network.
- Tizen: `tizen/scripts/test-fixture-line.mjs` (vm-loaded, in `test:tizen`); packaging test
  covers the new scripts.
- Android: JVM unit tests for formatting and matching.

## Out of scope

Scores on the player screen, periodic refresh while idle on the menu, a spoiler toggle.
