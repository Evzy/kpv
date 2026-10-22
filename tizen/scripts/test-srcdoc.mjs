const embedUrl = "https://embed.example.com/embed/sample-channel";
let html = await fetch(embedUrl, { headers: { Referer: "https://example.com/" } }).then((r) => r.text());
html = html.replace(
  /location\.protocol\s*\+\s*"\/\/"\s*\+\s*location\.host/g,
  '"https://embed.example.com"',
);
if (!/<base\s/i.test(html)) {
  html = html.replace(/<head/i, '<head><base href="https://embed.example.com/">');
}
console.log("rewrote host ref", !html.includes('location.protocol+"//"+location.host'));
console.log("size", html.length);
