const embedUrl = "https://taifood-blog.asia/embed/247-cows";
const referer = "https://taifood-blog.asia/embed/247-cows";

const page = await fetch(embedUrl, { headers: { Referer: "https://ppv.tj/" } });
const html = await page.text();
const m = html.match(/window\['ZpQw9XkLmN8c3vR3'\]='([^']+)'/);
const blob = m ? m[1] : "";
console.log("blob len", blob.length);

const attempts = [
  { ct: "application/octet-stream", body: blob },
  { ct: "text/plain", body: blob },
  { ct: "application/json", body: JSON.stringify(blob) },
  { ct: "application/json", body: JSON.stringify({ data: blob }) },
  { ct: "application/json", body: JSON.stringify({ path: "/embed/247-cows" }) },
];

for (const a of attempts) {
  const res = await fetch("https://taifood-blog.asia/fetch", {
    method: "POST",
    headers: {
      Referer: referer,
      Origin: "https://taifood-blog.asia",
      "Content-Type": a.ct,
      Accept: "*/*",
    },
    body: a.body,
  });
  const text = await res.text();
  console.log("\n", a.ct, res.status, text.slice(0, 250).replace(/\s+/g, " "));
  const m3 = text.match(/https?:[^"'\\s]+\.m3u8/gi);
  if (m3) console.log("M3U8", m3[0]);
}
