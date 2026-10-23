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
