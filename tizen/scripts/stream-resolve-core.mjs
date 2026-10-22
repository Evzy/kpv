/** Node-testable mirror of stream URL picking (no Site/fetch). */

export function isHls(url) {
  return /\.m3u8(\?|$)/i.test(url || "");
}

export function pickHlsFromPayload(data) {
  const d = data && (data.data || data);
  if (!d) return "";
  const top = (d.m3u8 || "").trim();
  if (top.startsWith("http") && isHls(top)) return top;
  for (const src of d.sources || []) {
    const url = (src.data || src.url || "").trim();
    if (url.startsWith("http") && isHls(url)) return url;
  }
  return "";
}

export function pickEmbedFromPayload(data) {
  const d = data && (data.data || data);
  if (!d) return "";
  let iframePick = "";
  let defaultPick = "";
  for (const src of d.sources || []) {
    const url = (src.data || src.url || "").trim();
    if (!url.startsWith("http")) continue;
    const type = String(src.type || "").toLowerCase();
    if (type.includes("iframe") || type.includes("embed") || url.includes("/embed/")) {
      if (!iframePick) iframePick = url;
      if (src.default) defaultPick = url;
    }
  }
  return defaultPick || iframePick;
}
