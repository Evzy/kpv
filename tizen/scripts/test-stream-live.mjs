import assert from "node:assert/strict";
import {
  isStreamLive,
  sortCategoriesLiveFirst,
  sortChannelsLiveFirst,
} from "../../scripts/stream-live.mjs";

assert.equal(isStreamLive({ always_live: 1 }, 100), true);
assert.equal(isStreamLive({ always_live: 0, starts_at: 10, ends_at: 20 }, 15), true);
assert.equal(isStreamLive({ always_live: 0, starts_at: 10, ends_at: 20 }, 25), false);

const sorted = sortChannelsLiveFirst([
  { name: "b", isLive: false },
  { name: "a", isLive: true },
]);
assert.deepEqual(sorted.map((c) => c.name), ["a", "b"]);

const cats = sortCategoriesLiveFirst([
  { name: "cold", channels: [{ isLive: false }] },
  { name: "hot", channels: [{ isLive: true }, { isLive: false }] },
]);
assert.deepEqual(cats.map((c) => c.name), ["hot", "cold"]);

console.log("stream-live tests ok");
