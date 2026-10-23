/* global localStorage */
/** Home-screen layout: leagues under each sport, the user's sport/league order, hidden items. */
const CategoryPrefs = (() => {
  const LS_PREFS = "kpv_category_prefs";
  const LS_KNOWN = "kpv_known_categories";
  const SEP = " › ";
  const OTHER = "Other";
  const DEFAULT_FIRST_LEAGUES = ["premier league"];

  function leagueKey(sport, league) {
    return sport + SEP + league;
  }

  function empty() {
    return { sportOrder: null, leagueOrder: {}, hidden: [] };
  }

  function read(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch (_) {
      return null;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {
      /* storage unavailable */
    }
  }

  function load() {
    const p = read(LS_PREFS) || {};
    return {
      sportOrder: Array.isArray(p.sportOrder) ? p.sportOrder : null,
      leagueOrder: p.leagueOrder && typeof p.leagueOrder === "object" ? p.leagueOrder : {},
      hidden: Array.isArray(p.hidden) ? p.hidden : [],
    };
  }

  function save(prefs) {
    write(LS_PREFS, prefs);
  }

  function reset() {
    try {
      localStorage.removeItem(LS_PREFS);
    } catch (_) {
      /* storage unavailable */
    }
  }

  function defaultLeagueOrder(leagues) {
    const first = leagues.filter((l) => DEFAULT_FIRST_LEAGUES.indexOf(l.name.toLowerCase()) >= 0);
    return first.concat(leagues.filter((l) => first.indexOf(l) < 0));
  }

  /** Catalog categories → `[{ name, leagues: [{ name, channels }] }]` in default order. */
  function group(categories) {
    return categories.map((cat) => {
      const byName = new Map();
      for (const ch of cat.channels || []) {
        const name = String(ch.tag || "").trim() || OTHER;
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push(ch);
      }
      const leagues = [];
      byName.forEach((channels, name) => leagues.push({ name, channels }));
      return { name: cat.name, leagues: defaultLeagueOrder(leagues) };
    });
  }

  /** Saved names first in saved order; anything unsaved after, in its default order. */
  function ordered(items, savedNames) {
    if (!Array.isArray(savedNames)) return items.slice();
    const saved = items
      .filter((i) => savedNames.indexOf(i.name) >= 0)
      .sort((a, b) => savedNames.indexOf(a.name) - savedNames.indexOf(b.name));
    return saved.concat(items.filter((i) => savedNames.indexOf(i.name) < 0));
  }

  function orderAll(sports, prefs) {
    return ordered(sports, prefs.sportOrder).map((s) => ({
      name: s.name,
      leagues: ordered(s.leagues, prefs.leagueOrder[s.name]),
    }));
  }

  function isHidden(prefs, key) {
    return prefs.hidden.indexOf(key) >= 0;
  }

  /** What the home screen shows; league headings only when a sport has 2+ visible leagues. */
  function arrange(sports, prefs) {
    const out = [];
    for (const s of orderAll(sports, prefs)) {
      if (isHidden(prefs, s.name)) continue;
      const leagues = s.leagues.filter((l) => !isHidden(prefs, leagueKey(s.name, l.name)));
      if (!leagues.length) continue;
      out.push({ name: s.name, leagues, showLeagues: leagues.length > 1 });
    }
    return out;
  }

  /** Customize list: every sport (hidden too), then its leagues when it has more than one. */
  function editorRows(sports, prefs) {
    const rows = [];
    for (const s of orderAll(sports, prefs)) {
      rows.push({ kind: "sport", sport: s.name, key: s.name, label: s.name, hidden: isHidden(prefs, s.name) });
      if (s.leagues.length < 2) continue;
      for (const l of s.leagues) {
        const key = leagueKey(s.name, l.name);
        rows.push({ kind: "league", sport: s.name, league: l.name, key, label: l.name, hidden: isHidden(prefs, key) });
      }
    }
    return rows;
  }

  function swap(list, name, dir) {
    const i = list.indexOf(name);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return false;
    list[i] = list[j];
    list[j] = name;
    return true;
  }

  /** Returns `prefs` unchanged when the item is already at that end. */
  function moveSport(sports, prefs, sport, dir) {
    const order = orderAll(sports, prefs).map((s) => s.name);
    if (!swap(order, sport, dir)) return prefs;
    return { sportOrder: order, leagueOrder: prefs.leagueOrder, hidden: prefs.hidden };
  }

  function moveLeague(sports, prefs, sport, league, dir) {
    const s = orderAll(sports, prefs).filter((x) => x.name === sport)[0];
    if (!s) return prefs;
    const order = s.leagues.map((l) => l.name);
    if (!swap(order, league, dir)) return prefs;
    const leagueOrder = Object.assign({}, prefs.leagueOrder);
    leagueOrder[sport] = order;
    return { sportOrder: prefs.sportOrder, leagueOrder, hidden: prefs.hidden };
  }

  function toggleHidden(prefs, key) {
    const hidden = prefs.hidden.filter((k) => k !== key);
    if (hidden.length === prefs.hidden.length) hidden.push(key);
    return { sportOrder: prefs.sportOrder, leagueOrder: prefs.leagueOrder, hidden };
  }

  function rememberKnown(sports) {
    write(
      LS_KNOWN,
      sports.map((s) => ({ name: s.name, leagues: s.leagues.map((l) => l.name) })),
    );
  }

  /** Last loaded sports/leagues (no channels), for the customize list. */
  function loadKnown() {
    const raw = read(LS_KNOWN);
    if (!Array.isArray(raw)) return [];
    return raw.map((s) => ({
      name: String(s.name),
      leagues: (Array.isArray(s.leagues) ? s.leagues : []).map((n) => ({ name: String(n), channels: [] })),
    }));
  }

  return {
    leagueKey,
    empty,
    load,
    save,
    reset,
    group,
    arrange,
    editorRows,
    moveSport,
    moveLeague,
    toggleHidden,
    rememberKnown,
    loadKnown,
  };
})();
