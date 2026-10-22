import assert from "node:assert/strict";
import { pickEmbedFromPayload, pickHlsFromPayload } from "./stream-resolve-core.mjs";

const apiSample = {
  data: {
    m3u8: "",
    sources: [
      { type: "iframe", default: true, data: "https://embed.example.com/embed/sample-channel" },
      { type: "hls", data: "https://cdn.example/live/index.m3u8" },
    ],
  },
};

assert.equal(pickHlsFromPayload(apiSample), "https://cdn.example/live/index.m3u8");
assert.equal(
  pickEmbedFromPayload(apiSample),
  "https://embed.example.com/embed/sample-channel",
);

const embedOnly = {
  data: {
    m3u8: "",
    sources: [{ type: "iframe", data: "https://embed.example.com/embed/sample-channel" }],
  },
};
assert.equal(pickHlsFromPayload(embedOnly), "");
assert.equal(pickEmbedFromPayload(embedOnly), "https://embed.example.com/embed/sample-channel");

const topLevel = { data: { m3u8: "https://x.test/play.m3u8", sources: [] } };
assert.equal(pickHlsFromPayload(topLevel), "https://x.test/play.m3u8");

console.log("test-stream-resolve: PASS");
