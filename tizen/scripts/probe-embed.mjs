const base = "https://api.ppv.tj";
const uri = "247-cows";
const paths = [
  `/api/streams/${uri}`,
  `/api/streams/${uri}/play`,
  `/api/streams/${uri}/token`,
  `/api/streams/${uri}/hls`,
  `/api/streams/${uri}/manifest`,
  `/api/play/${uri}`,
  `/api/embed/${uri}`,
];
const headers = { Accept: "application/json", Referer: "https://ppv.tj/" };
for (const p of paths) {
  try {
    const res = await fetch(base + p, { headers });
    const text = await res.text();
    console.log(res.status, p, text.slice(0, 180).replace(/\s+/g, " "));
    if (/m3u8/i.test(text)) console.log("  ^ has m3u8");
  } catch (e) {
    console.log("ERR", p, e.message);
  }
}
