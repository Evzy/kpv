const TV_UA =
  "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/4.0 Chrome/108.0.5359.1 TV Safari/537.36";
const url = "https://taifood-blog.asia/embed/247-cows";
for (const ua of [TV_UA, "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0"]) {
  const res = await fetch(url, {
    headers: { Referer: "https://ppv.tj/", "User-Agent": ua },
  });
  const html = await res.text();
  console.log("\nUA", ua.slice(0, 40), "...", res.status, html.length);
  console.log("has bundle-jw", html.includes("bundle-jw"));
  console.log("has wasm", html.includes("gasm.wasm"));
  console.log("has m3u8", /\.m3u8/.test(html));
}
