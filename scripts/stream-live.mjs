/** Same live rules as the catalog API (always_live + schedule window). */

export function isStreamLive(stream, nowSec) {
  const now = Number(nowSec) || Math.floor(Date.now() / 1000);
  const always = stream.always_live === 1 || stream.always_live === true;
  if (always) return true;
  const start = Number(stream.starts_at) || 0;
  const end = Number(stream.ends_at) || 0;
  if (start > 0 && end > 0) return now >= start && now <= end;
  if (stream.isLive === true || stream.is_live === true) return true;
  return false;
}

export function withLiveFlags(stream, nowSec) {
  return { ...stream, isLive: isStreamLive(stream, nowSec) };
}

export function sortChannelsLiveFirst(channels) {
  const live = [];
  const rest = [];
  for (const ch of channels) {
    if (ch.isLive) live.push(ch);
    else rest.push(ch);
  }
  return live.concat(rest);
}

export function sortCategoriesLiveFirst(categories) {
  const withSorted = categories.map((cat) => ({
    ...cat,
    channels: sortChannelsLiveFirst(cat.channels || []),
  }));
  const withLive = [];
  const without = [];
  for (const cat of withSorted) {
    if ((cat.channels || []).some((c) => c.isLive)) withLive.push(cat);
    else without.push(cat);
  }
  return withLive.concat(without);
}
