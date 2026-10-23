// Card line under the title: start time in the TV's timezone, or the ESPN live score.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

process.env.TZ = "Australia/Melbourne";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const fixture = readFileSync(
  path.resolve(root, "..", "app", "src", "test", "resources", "espn-scoreboard.json"),
  "utf8",
);
const src = (name) => readFileSync(path.join(root, "js", name), "utf8");

const requests = [];
class XMLHttpRequest {
  open(method, url) {
    this.url = url;
  }
  send() {
    requests.push(this.url);
    setTimeout(() => {
      if (this.url.includes("/football/nfl/")) {
        this.status = 200;
        this.responseText = fixture;
        this.onload();
      } else {
        this.onerror();
      }
    }, 0);
  }
}

const ctx = { XMLHttpRequest, setTimeout, clearTimeout, console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(
  `${src("fixture-line.js")}\n${src("live-scores.js")}\n` +
    "globalThis.FixtureLine = FixtureLine; globalThis.LiveScores = LiveScores;",
  ctx,
);
const { FixtureLine, LiveScores } = ctx;

const at = (iso) => Math.floor(Date.parse(iso) / 1000);
const NOW = at("2026-10-23T00:38:30Z");
const line = (ch) => FixtureLine.timeLine({ title: "", tag: "", startsAt: 0, endsAt: 0, alwaysLive: false, ...ch }, NOW);

assert.equal(line({ startsAt: at("2026-10-23T08:30Z") }), "Today 7:30 PM");
assert.equal(line({ startsAt: at("2026-10-23T16:00Z") }), "Tomorrow 3:00 AM");
assert.equal(line({ startsAt: at("2026-10-25T16:00Z") }), "Mon 3:00 AM");
assert.equal(line({ startsAt: at("2026-11-05T16:00Z") }), "6 Nov 3:00 AM");
assert.equal(line({ title: "A at B", startsAt: at("2026-10-23T00:15Z") }), "Live · Score TBC");
assert.equal(
  line({ title: "2026 European Championship | Day 2", startsAt: at("2026-10-23T00:15Z") }),
  "Live · started 11:15 AM",
);
assert.equal(line({ title: "A at B", startsAt: 1, endsAt: 2 }), "Ended");
assert.equal(line({ alwaysLive: true, startsAt: 1 }), null);
assert.equal(line({}), null);

const events = JSON.parse(fixture).events;
const score = (title) => {
  const s = LiveScores.scoreFor(title, events);
  return s ? FixtureLine.scoreLine(s) : null;
};
assert.equal(score("New England Patriots at Chicago Bears"), "NE 0 – 3 CHI · 5:11 - 1st");
assert.equal(score("Chicago Bears vs. New England Patriots"), "CHI 3 – 0 NE · 5:11 - 1st");
assert.equal(score("VfB Stuttgart vs. Borussia Mönchengladbach"), "Final · STU 2 – 1 MGL");
assert.equal(score("Pittsburgh Steelers at New Orleans Saints"), null, "not started on ESPN");
assert.equal(score("Los Angeles Rams at Chicago Bears"), null, "one side unmatched");

assert.equal(LiveScores.leaguePath("Premier League"), "soccer/eng.1");
assert.equal(LiveScores.leaguePath(" nfl "), "football/nfl");
assert.equal(LiveScores.leaguePath("Darts"), "");

{
  const started = at("2026-10-23T00:15Z");
  const nfl = { title: "New England Patriots at Chicago Bears", tag: "NFL", startsAt: started };
  const cfl = { title: "Montreal Alouettes at Toronto Argonauts", tag: "Canadian Football", startsAt: started };
  const darts = { title: "Darts | Day 2", tag: "Darts", startsAt: started };
  const later = { title: "San Francisco 49ers at Atlanta Falcons", tag: "NFL", startsAt: NOW + 3600 };
  const lines = await LiveScores.lookup([nfl, cfl, darts, later], NOW);
  assert.equal(lines.size, 1);
  assert.equal(lines.get(nfl), "NE 0 – 3 CHI · 5:11 - 1st");
  assert.deepEqual(
    requests.slice().sort(),
    [
      "https://site.api.espn.com/apis/site/v2/sports/football/cfl/scoreboard?limit=300",
      "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=300",
    ],
    "one request per league with started team events",
  );
}

{
  const cat = { console };
  vm.createContext(cat);
  vm.runInContext(
    `const Site = { noteEmbedFromUrl() {} };\n${src("stream-live.js")}\n${src("catalog.js")}\n` +
      "globalThis.Catalog = Catalog; globalThis.StreamLive = StreamLive;",
    cat,
  );
  const [first] = cat.Catalog.parse({
    timestamp: NOW,
    streams: [
      {
        category: "Ice Hockey",
        streams: [{ uri_name: "a", name: "A vs. B", tag: "NHL", starts_at: 100, ends_at: 200, always_live: 0 }],
      },
    ],
  });
  const order = cat.StreamLive.sortChannelsLiveFirst([
    { title: "MLS later", tag: "MLS", isLive: false },
    { title: "LaLiga live", tag: "LaLiga", isLive: true },
    { title: "EPL later", tag: "Premier League", isLive: false },
    { title: "EPL live", tag: "Premier League", isLive: true },
  ]);
  assert.deepEqual(
    Array.from(order, (c) => c.title),
    ["EPL live", "EPL later", "LaLiga live", "MLS later"],
    "Premier League first, live first within each group",
  );
  const ch = first.channels[0];
  assert.equal(ch.startsAt, 100);
  assert.equal(ch.endsAt, 200);
  assert.equal(ch.alwaysLive, false);
}

{
  const order = readFileSync(path.join(here, "build-flat.mjs"), "utf8");
  assert.match(order, /"stream-live\.js",\s*"fixture-line\.js",\s*"live-scores\.js",/, "main.js bundles both");
}

console.log("test-fixture-line: PASS");
