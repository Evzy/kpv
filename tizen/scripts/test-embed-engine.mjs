/**
 * Node smoke test (no browser): fetch embed, run same transforms as embed-engine.js
 * Usage: node scripts/test-embed-engine.mjs [embedUrl]
 */
const embedUrl = process.argv[2] || "https://embed.example.com/embed/sample-channel";

function embedOrigin(url) {
  return new URL(url).origin;
}

function stripHeavyAds(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (block) => {
    if (block.length > 40_000) return block;
    if (/aclib\.runPop|adexchangeclear\.com|suurl5\.php|wpnxiswpuyrfn\.icu/i.test(block)) {
      return "";
    }
    return block;
  });
}

function prepareHtml(rawHtml, url) {
  const origin = embedOrigin(url);
  let html = stripHeavyAds(rawHtml);
  html = html.replace(
    /location\.protocol\s*\+\s*"\/\/"\s*\+\s*location\.host/g,
    `"${origin}"`,
  );
  if (!/<base[\s>]/i.test(html)) {
    html = html.replace(/<head/i, `<head><base href="${origin}/">`);
  }
  html = html.replace(/<\/body>/i, "<script>/* kpv hook */</script></body>");
  return html;
}

const res = await fetch(embedUrl, {
  headers: { Accept: "text/html", Referer: "https://example.com/" },
});
console.log("HTTP", res.status, embedUrl);
if (!res.ok) process.exit(1);
const raw = await res.text();
const html = prepareHtml(raw, embedUrl);
const checks = {
  rawBytes: raw.length,
  preparedBytes: html.length,
  hasBundleJw: /bundle-jw/.test(html),
  hasBase: /<base href="https:\/\/embed.example.com\//.test(html),
  hostRewrite: !html.includes('location.protocol+"//"+location.host'),
  strippedAdblock: !/aclib\.runPop/.test(html),
  stillHasZpQw: /ZpQw9XkLmN8c3vR3/.test(html),
};
console.log(JSON.stringify(checks, null, 2));
const ok =
  checks.hasBundleJw &&
  checks.hasBase &&
  checks.hostRewrite &&
  checks.strippedAdblock &&
  checks.stillHasZpQw;
console.log(ok ? "\nPASS — run browser test: npm run test:sniff" : "\nFAIL — engine HTML looks wrong");
process.exit(ok ? 0 : 1);
