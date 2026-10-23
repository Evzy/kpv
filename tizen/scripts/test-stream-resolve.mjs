import assert from "node:assert/strict";
import { pickEmbedFromPayload, pickHlsFromPayload } from "./stream-resolve-core.mjs";

const apiSample = {
  data: {
    m3u8: "",
    sources: [
      { type: "iframe", default: true, data: "https://taifood-blog.asia/embed/247-cows" },
      { type: "hls", data: "https://cdn.example/live/index.m3u8" },
    ],
  },
};

assert.equal(pickHlsFromPayload(apiSample), "https://cdn.example/live/index.m3u8");
assert.equal(
  pickEmbedFromPayload(apiSample),
  "https://taifood-blog.asia/embed/247-cows",
);

const embedOnly = {
  data: {
    m3u8: "",
    sources: [{ type: "iframe", data: "https://taifood-blog.asia/embed/247-cows" }],
  },
};
assert.equal(pickHlsFromPayload(embedOnly), "");
assert.equal(pickEmbedFromPayload(embedOnly), "https://taifood-blog.asia/embed/247-cows");

const topLevel = { data: { m3u8: "https://x.test/play.m3u8", sources: [] } };
assert.equal(pickHlsFromPayload(topLevel), "https://x.test/play.m3u8");

console.log("test-stream-resolve: PASS");
