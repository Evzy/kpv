/* global FixtureLine */
/** Live scores from ESPN's public scoreboard, matched to event titles by team names. */
const LiveScores = (() => {
  const BASE = "https://site.api.espn.com/apis/site/v2/sports/";
  const TIMEOUT_MS = 5000;
  const LEAGUES = {
    nfl: "football/nfl",
    "college football": "football/college-football",
    "canadian football": "football/cfl",
    nba: "basketball/nba",
    nbl: "basketball/nbl",
    nhl: "hockey/nhl",
    afl: "australian-football/afl",
    nrl: "rugby-league/3",
    "premier league": "soccer/eng.1",
    laliga: "soccer/esp.1",
    "serie a": "soccer/ita.1",
    bundesliga: "soccer/ger.1",
    "ligue 1": "soccer/fra.1",
    eredivisie: "soccer/ned.1",
    mls: "soccer/usa.1",
    "liga mx": "soccer/mex.1",
    allsvenskan: "soccer/swe.1",
  };
  const NOISE = { fc: true, cf: true, sc: true, afc: true };

  function leaguePath(tag) {
    return LEAGUES[String(tag || "").trim().toLowerCase()] || "";
  }

  function scoreboardUrl(path) {
    return `${BASE}${path}/scoreboard?limit=300`;
  }

  function norm(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((w) => w && !NOISE[w])
      .join(" ");
  }

  function containsWords(hay, needle) {
    return ` ${hay} `.includes(` ${needle} `);
  }

  /** `location` only matches exactly, so "Los Angeles Rams" can't match the Chargers. */
  function teamMatches(name, team) {
    const n = norm(name);
    if (!n) return false;
    if (norm(team.location) === n) return true;
    for (const field of [team.displayName, team.shortDisplayName, team.name]) {
      const f = norm(field);
      if (!f) continue;
      if (f === n) return true;
      if (f.length >= 3 && n.length >= 3 && (containsWords(f, n) || containsWords(n, f))) return true;
    }
    return false;
  }

  function side(c) {
    return { abbr: (c.team && c.team.abbreviation) || "", score: c.score || "0" };
  }

  function scoreFor(title, events) {
    const teams = FixtureLine.splitTeams(title);
    if (!teams) return null;
    for (const ev of events || []) {
      const type = (ev.status && ev.status.type) || {};
      if (type.state !== "in" && type.state !== "post") continue;
      const sides = ((ev.competitions || [])[0] || {}).competitors || [];
      const left = sides.find((c) => teamMatches(teams[0], c.team || {}));
      const right = sides.find((c) => c !== left && teamMatches(teams[1], c.team || {}));
      if (left && right) {
        return { state: type.state, detail: type.shortDetail || "", left: side(left), right: side(right) };
      }
    }
    return null;
  }

  function getJson(url) {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url);
      xhr.timeout = TIMEOUT_MS;
      xhr.onload = () => {
        try {
          resolve(xhr.status >= 200 && xhr.status < 300 ? JSON.parse(xhr.responseText) : null);
        } catch (_) {
          resolve(null);
        }
      };
      xhr.onerror = () => resolve(null);
      xhr.ontimeout = () => resolve(null);
      xhr.send();
    });
  }

  /** Map of channel → score line for started team events ESPN has a result for. */
  async function lookup(channels, nowSec) {
    const byLeague = {};
    for (const ch of channels) {
      const path = leaguePath(ch.tag);
      if (!path || !FixtureLine.hasStarted(ch, nowSec) || !FixtureLine.splitTeams(ch.title)) continue;
      (byLeague[path] = byLeague[path] || []).push(ch);
    }
    const lines = new Map();
    await Promise.all(
      Object.keys(byLeague).map(async (path) => {
        const data = await getJson(scoreboardUrl(path));
        const events = (data && data.events) || [];
        for (const ch of byLeague[path]) {
          const s = scoreFor(ch.title, events);
          if (s) lines.set(ch, FixtureLine.scoreLine(s));
        }
      }),
    );
    return lines;
  }

  return { lookup, leaguePath, scoreFor, scoreboardUrl };
})();
