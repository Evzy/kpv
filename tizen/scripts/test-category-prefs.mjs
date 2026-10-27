// Home-screen layout: league rows under each sport, user order, hidden sports/leagues.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const src = (name) => readFileSync(path.join(root, "js", name), "utf8");

const store = new Map();
const ctx = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
};
vm.createContext(ctx);
vm.runInContext(
  `${src("stream-live.js")}\n${src("category-prefs.js")}\n` +
    "globalThis.CategoryPrefs = CategoryPrefs; globalThis.StreamLive = StreamLive;",
  ctx,
);
const { CategoryPrefs: P, StreamLive } = ctx;
const plain = (v) => JSON.parse(JSON.stringify(v));
const names = (list) => Array.from(list, (x) => x.name);

const ch = (title, tag, isLive = false) => ({ title, tag, isLive });
const catalog = [
  {
    name: "Football",
    channels: [ch("Liga live", "LaLiga", true), ch("MLS", "MLS"), ch("EPL", "Premier League"), ch("Liga 2", "LaLiga")],
  },
  { name: "Darts", channels: [ch("Day 2", "Darts")] },
  { name: "Misc", channels: [ch("No tag", ""), ch("Tagged", "Cup")] },
];

const sports = P.group(catalog);
assert.deepEqual(names(sports), ["Football", "Darts", "Misc"]);
assert.deepEqual(names(sports[0].leagues), ["Premier League", "LaLiga", "MLS"], "Premier League first by default");
assert.deepEqual(names(sports[0].leagues[1].channels.map((c) => ({ name: c.title }))), ["Liga live", "Liga 2"]);
assert.deepEqual(names(sports[2].leagues), ["Other", "Cup"], "empty tag goes to Other");

{
  const layout = P.arrange(sports, P.empty());
  assert.deepEqual(names(layout), ["Football", "Darts", "Misc"]);
  assert.equal(layout[0].showLeagues, true);
  assert.equal(layout[1].showLeagues, false, "single league has no heading");
}

{
  let prefs = P.empty();
  prefs = P.moveSport(sports, prefs, "Darts", -1);
  assert.deepEqual(plain(prefs.sportOrder), ["Darts", "Football", "Misc"]);
  assert.equal(P.moveSport(sports, prefs, "Darts", -1), prefs, "top item can't move up");
  prefs = P.moveLeague(sports, prefs, "Football", "MLS", -1);
  assert.deepEqual(plain(prefs.leagueOrder.Football), ["Premier League", "MLS", "LaLiga"]);
  prefs = P.toggleHidden(prefs, P.leagueKey("Football", "Premier League"));
  prefs = P.toggleHidden(prefs, "Misc");

  const layout = P.arrange(sports, prefs);
  assert.deepEqual(names(layout), ["Darts", "Football"]);
  assert.deepEqual(names(layout[1].leagues), ["MLS", "LaLiga"]);

  const rows = Array.from(P.editorRows(sports, prefs), (r) => `${r.kind}:${r.label}${r.hidden ? " (hidden)" : ""}`);
  assert.deepEqual(rows, [
    "live_now:Live now",
    "sport:Darts",
    "sport:Football",
    "league:Premier League (hidden)",
    "league:MLS",
    "league:LaLiga",
    "sport:Misc (hidden)",
    "league:Other",
    "league:Cup",
  ]);

  prefs = P.toggleHidden(prefs, "Misc");
  assert.deepEqual(names(P.arrange(sports, prefs)), ["Darts", "Football", "Misc"], "unhide");

  const withNew = P.group(catalog.concat([{ name: "Rugby", channels: [ch("A v B", "NRL")] }]));
  assert.deepEqual(names(P.arrange(withNew, prefs)), ["Darts", "Football", "Misc", "Rugby"], "new sport goes last");

  P.save(prefs);
  assert.deepEqual(plain(P.load()), plain(prefs));
  P.reset();
  assert.deepEqual(plain(P.load()), plain(P.empty()));
}

{
  const allHidden = P.toggleHidden(P.toggleHidden(P.toggleHidden(P.empty(), "Football"), "Darts"), "Misc");
  assert.equal(P.arrange(sports, allHidden).length, 0);
}

{
  const live = (title, tag, uri, alwaysLive = false) => ({ title, tag, uri, isLive: true, alwaysLive });
  const liveCatalog = [
    { name: "Basketball", channels: [live("Dal v Mia", "NBA", "nba/dal-mia"), ch("Later", "NBA")] },
    { name: "24/7", channels: [live("News", "TV", "tv/news", true)] },
    { name: "Football", channels: [live("Arsenal v Spurs", "Premier League", "epl/ars-tot")] },
    { name: "Dupes", channels: [live("Dal v Mia again", "NBA", "nba/dal-mia")] },
  ];
  const liveSports = P.group(liveCatalog);
  const titles = (layout) => Array.from(layout[0].leagues[0].channels, (c) => c.title);

  let prefs = P.empty();
  let layout = P.withLiveNow(P.arrange(liveSports, prefs), prefs);
  assert.deepEqual(names(layout), ["Live now", "Basketball", "24/7", "Football", "Dupes"]);
  assert.equal(layout[0].showLeagues, false);
  assert.deepEqual(titles(layout), ["Dal v Mia", "Arsenal v Spurs"], "live events only, no 24/7, no duplicates");

  prefs = P.toggleHidden(prefs, "Football");
  layout = P.withLiveNow(P.arrange(liveSports, prefs), prefs);
  assert.deepEqual(titles(layout), ["Dal v Mia"], "hidden categories stay out of Live now");

  const liveKey = P.editorRows(liveSports, prefs)[0].key;
  prefs = P.toggleHidden(prefs, liveKey);
  assert.deepEqual(names(P.withLiveNow(P.arrange(liveSports, prefs), prefs)), ["Basketball", "24/7", "Dupes"]);
  assert.equal(P.editorRows(liveSports, prefs)[0].hidden, true);

  const quiet = P.arrange(P.group([{ name: "Darts", channels: [ch("Day 2", "Darts")] }]), P.empty());
  assert.deepEqual(names(P.withLiveNow(quiet, P.empty())), ["Darts"], "no Live now when nothing is live");
  assert.equal(P.editorRows([], P.empty()).length, 0, "no rows before the catalog loads");
}

{
  P.rememberKnown(sports);
  const known = P.loadKnown();
  assert.deepEqual(names(known), ["Football", "Darts", "Misc"]);
  assert.deepEqual(names(known[0].leagues), ["Premier League", "LaLiga", "MLS"]);
}

{
  const order = StreamLive.sortChannelsLiveFirst([ch("later", "Premier League"), ch("live", "LaLiga", true)]);
  assert.deepEqual(Array.from(order, (c) => c.title), ["live", "later"], "channel sort is live-first only");
}

{
  const flat = readFileSync(path.join(here, "build-flat.mjs"), "utf8");
  assert.match(flat, /"category-prefs\.js"/);
  assert.match(flat, /"category-editor\.js"/);
}

console.log("test-category-prefs: PASS");
