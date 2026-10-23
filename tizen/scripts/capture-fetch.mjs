import puppeteer from "puppeteer";

const embed = "https://taifood-blog.asia/embed/247-cows";
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
const posts = [];
page.on("request", (req) => {
  if (req.url().includes("/fetch") && req.method() === "POST") {
    posts.push({ url: req.url(), headers: req.headers(), body: req.postData() });
  }
});
await page.goto(embed, { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 5000));
let m3u8 = "";
try {
  m3u8 = await page.evaluate(() => {
    try {
      return jwplayer().getPlaylist()[0].file;
    } catch (e) {
      return String(e);
    }
  });
} catch (e) {
  m3u8 = String(e);
}
console.log("POST /fetch captures:", JSON.stringify(posts, null, 2));
console.log("playlist:", m3u8);
await browser.close();
