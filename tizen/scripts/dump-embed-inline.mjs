const res = await fetch("https://embed.example.com/embed/sample-channel", {
  headers: { Referer: "https://example.com/" },
});
const html = await res.text();
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
console.log("inline scripts", scripts.length);
for (let i = 0; i < scripts.length; i++) {
  const s = scripts[i];
  if (s.length < 20) continue;
  if (/fetch|247|cows|embed|jw|wasm|gasm/i.test(s)) {
    console.log("\n--- script", i, "len", s.length);
    console.log(s.slice(0, 1200));
  }
}
