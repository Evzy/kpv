const embedUrl = "https://taifood-blog.asia/embed/247-cows";
let html = await fetch(embedUrl, { headers: { Referer: "https://ppv.tj/" } }).then((r) => r.text());
html = html.replace(
  /location\.protocol\s*\+\s*"\/\/"\s*\+\s*location\.host/g,
  '"https://taifood-blog.asia"',
);
if (!/<base\s/i.test(html)) {
  html = html.replace(/<head/i, '<head><base href="https://taifood-blog.asia/">');
}
console.log("rewrote host ref", !html.includes('location.protocol+"//"+location.host'));
console.log("size", html.length);
