import assert from "node:assert/strict";
import {
  freshSlugForVersion,
  listMainJsCandidates,
  mainJsPath,
  slugVersion,
} from "./lib/bundle-cache-logic.mjs";

assert.equal(slugVersion("v1.0.27"), "1.0.27");
assert.equal(slugVersion(" 1.0.27-beta "), "1.0.27-beta");

const slugA = freshSlugForVersion("1.0.27", 1_700_000_000_000, "aaaaaa");
const slugB = freshSlugForVersion("1.0.27", 1_700_000_000_001, "bbbbbb");
assert.match(slugA, /^1\.0\.27-[0-9a-z]+-[0-9a-z]+$/);
assert.notEqual(slugA, slugB);

const paths = listMainJsCandidates({
  cachedVer: "1.0.22",
  slug: "1.0.27-abc",
});
assert.equal(paths[0], "documents/kpv-hot-cache/1.0.27-abc/main.js");
assert.equal(paths[1], mainJsPath("1.0.22"));
assert.equal(paths[2], "documents/kpv-hot-cache/main.js");

console.log("test-bundle-cache-logic: ok");
