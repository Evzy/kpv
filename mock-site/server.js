/**
 * Minimal catalog + embed mock for the KPV Android app.
 * All channels share one HLS test stream (configurable below).
 *
 * Usage: node server.js
 * Default: http://0.0.0.0:8765
 */

const http = require("http");
const zlib = require("zlib");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 8765);
const HOST = process.env.HOST || "0.0.0.0";

/** One poster for every channel (optional). Otherwise each channel gets a fast local SVG poster. */
const MOCK_POSTER = process.env.MOCK_POSTER || "";

function posterHue(uri) {
  let h = 0;
  for (let i = 0; i < uri.length; i++) h = (h * 31 + uri.charCodeAt(i)) >>> 0;
  return h % 360;
}

function posterFor(req, uri) {
  if (MOCK_POSTER) return MOCK_POSTER;
  return `${baseUrl(req)}/poster/${encodeURIComponent(uri)}`;
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Tiny solid PNG — fast over LAN and works with Android Glide. */
function solidPng(w, h, r, g, b) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rowSize = 1 + w * 3;
  const raw = Buffer.alloc(rowSize * h);
  for (let y = 0; y < h; y++) {
    const off = y * rowSize;
    raw[off] = 0;
    for (let x = 0; x < w; x++) {
      raw[off + 1 + x * 3] = r;
      raw[off + 2 + x * 3] = g;
      raw[off + 3 + x * 3] = b;
    }
  }
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const posterCache = new Map();

function posterPng(uri) {
  if (posterCache.has(uri)) return posterCache.get(uri);
  const hue = posterHue(uri);
  const r = 40 + (hue % 120);
  const g = 50 + ((hue * 2) % 100);
  const b = 60 + ((hue * 3) % 90);
  const png = solidPng(160, 90, r, g, b);
  posterCache.set(uri, png);
  return png;
}

/** Cow live HLS for mock playback (override with COW_HLS env if needed). */
/** TV-friendly test HLS (MPEG-TS). Override with COW_HLS env if needed. */
const COW_HLS =
  process.env.COW_HLS ||
  "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

function baseUrl(req) {
  const host = req.headers.host || `127.0.0.1:${PORT}`;
  return `http://${host}`;
}

/** Single source of truth — titles, slugs, and cowtegories. */
const MOCK_CHANNELS = [
  { category: "Pasture Premier", name: "Hereford Homestretch", uri: "cow-hereford-homestretch", tag: "Prime pasture" },
  { category: "Pasture Premier", name: "Charolais vs Brahman", uri: "cow-charolais-brahman", tag: "Moojor league" },
  { category: "Pasture Premier", name: "Shorthorn Showtime", uri: "cow-shorthorn-showtime", tag: "College cows" },
  { category: "Dairy Division", name: "Udderly Live", uri: "cow-udderly-live", tag: "Barn cam" },
  { category: "Dairy Division", name: "Cud Chew Cinema", uri: "cow-cud-chew-cinema", tag: "Barn cam" },
  { category: "Dairy Division", name: "Silage Side Quest", uri: "cow-silage-side-quest", tag: "Barn cam" },
  { category: "24/7 Grazing", name: "Bessie 24/7", uri: "cow-bessie-247", tag: "24/7 moo" },
  { category: "24/7 Grazing", name: "Holstein Highlights", uri: "cow-holstein-highlights", tag: "24/7 moo" },
  { category: "24/7 Grazing", name: "Angus After Dark", uri: "cow-angus-after-dark", tag: "24/7 moo" },
  { category: "24/7 Grazing", name: "Jersey Jump Cam", uri: "cow-jersey-jump-cam", tag: "24/7 moo" },
  { category: "24/7 Grazing", name: "Highland Hay TV", uri: "cow-highland-hay-tv", tag: "24/7 moo" },
  { category: "24/7 Grazing", name: "Longhorn Lounge", uri: "cow-longhorn-lounge", tag: "24/7 moo" },
  { category: "24/7 Grazing", name: "Guernsey Grazing", uri: "cow-guernsey-grazing", tag: "24/7 moo" },
];

const CHANNEL_BY_URI = Object.fromEntries(MOCK_CHANNELS.map((c) => [c.uri, c]));

function streamEntry(req, channel) {
  return {
    id: channel.uri.length + 1000,
    name: channel.name,
    tag: channel.tag,
    source_tag: channel.tag,
    poster: posterFor(req, channel.uri),
    blurhash: "",
    colors: ["#12151E", "#12151E"],
    uri_name: channel.uri,
    starts_at: 0,
    ends_at: 0,
    always_live: channel.tag.includes("24/7") ? 1 : 0,
    locale: "en",
    category_name: channel.category,
    iframe: "",
    substreams: [],
    viewers: String(Math.floor(Math.random() * 5)),
  };
}

function catalog(req) {
  const origin = baseUrl(req);
  const embed = (uri) => `${origin}/embed/${uri}`;
  const withIframe = (entry) => ({ ...entry, iframe: embed(entry.uri_name) });

  const categoryOrder = ["Pasture Premier", "Dairy Division", "24/7 Grazing"];
  const streams = categoryOrder.map((category, index) => {
    const items = MOCK_CHANNELS.filter((c) => c.category === category).map((c) =>
      withIframe(streamEntry(req, c)),
    );
    return {
      category,
      id: category === "24/7 Grazing" ? 14 : index + 1,
      always_live: category === "24/7 Grazing",
      streams: items,
    };
  });

  return { success: true, timestamp: Date.now(), streams };
}

function streamDetail(req, uri) {
  const origin = baseUrl(req);
  const channel = CHANNEL_BY_URI[uri];
  const name = channel?.name ?? uri.replace(/-/g, " ");
  const tag = channel?.tag ?? "Mock cow";
  return {
    success: true,
    data: {
      id: 3663,
      name,
      poster: posterFor(req, uri),
      tag,
      source_tag: tag,
      description: "Mock stream (cows)",
      m3u8: COW_HLS,
      source_type: "playlist",
      sources: [
        {
          name: "Direct HLS",
          default: false,
          type: "hls",
          data: COW_HLS,
        },
        {
          name: "External Player Frame",
          default: true,
          type: "iframe",
          data: `${origin}/embed/${uri}`,
        },
      ],
      substreams: [],
      uri,
      viewers: 1,
    },
  };
}

function homePage(req) {
  const origin = baseUrl(req);
  const cat = catalog(req);
  const sections = cat.streams
    .map((block) => {
      const cards = block.streams
        .map(
          (s) =>
            `<a class="card" href="/live/${s.uri_name}"><img src="${s.poster}" alt=""/><span class="t">${s.name}</span><span class="g">${s.tag}</span></a>`,
        )
        .join("");
      return `<section><h2>${block.category}</h2><div class="row">${cards}</div></section>`;
    })
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>KPV Mock</title>
<style>
  body{background:#010208;color:#e5e7eb;font-family:system-ui,sans-serif;margin:0;padding:20px}
  h2{font-size:22px;margin:28px 0 12px}
  .row{display:flex;gap:10px;overflow-x:auto;padding-bottom:8px}
  .card{display:block;width:176px;flex:0 0 auto;background:#12151e;border-radius:10px;padding:6px;text-decoration:none;color:inherit}
  .card img{width:100%;height:99px;object-fit:cover;border-radius:6px;background:#1a1f2b}
  .t{display:block;font-weight:700;font-size:14px;margin-top:8px}
  .g{display:block;font-size:12px;color:#9ca3af;margin-top:2px}
</style></head><body>
<p style="color:#9ca3af">KPV cow mock — every moo is the same stream. API: ${origin}/api/streams</p>
${sections}
</body></html>`;
}

function embedPage(req) {
  const hls = COW_HLS.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>html,body{margin:0;height:100%;background:#000}video{width:100%;height:100%;object-fit:contain}</style>
</head><body>
<video id="v" autoplay muted playsinline controls></video>
<script>
(function() {
  var src = '${hls}';
  var v = document.getElementById('v');
  v.src = src;
  v.play().catch(function(){});
})();
</script>
</body></html>`;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" });
    return res.end();
  }

  const posterMatch = url.pathname.match(/^\/poster\/(.+)$/);
  if (posterMatch) {
    const uri = decodeURIComponent(posterMatch[1]);
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    });
    return res.end(posterPng(uri));
  }

  if (url.pathname === "/api/streams") {
    return sendJson(res, 200, catalog(req));
  }

  const streamMatch = url.pathname.match(/^\/api\/streams\/(.+)$/);
  if (streamMatch) {
    return sendJson(res, 200, streamDetail(req, decodeURIComponent(streamMatch[1])));
  }

  if (url.pathname === "/playlist/cows.m3u8") {
    res.writeHead(302, { Location: COW_HLS, "Access-Control-Allow-Origin": "*" });
    return res.end();
  }

  const embedMatch = url.pathname.match(/^\/embed\/(.+)$/);
  if (embedMatch) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(embedPage(req));
  }

  if (url.pathname === "/" || url.pathname === "") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(homePage(req));
  }

  if (url.pathname.startsWith("/live/")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(`<html><body style="background:#010208;color:#fff"><p>Mock stream page ${url.pathname}</p></body></html>`);
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, HOST, () => {
  console.log(`KPV mock site listening on http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}`);
  console.log(`Cow HLS upstream: ${COW_HLS}`);
  console.log("In the app settings, set Site URL to http://<this-machine-lan-ip>:8765");
});
