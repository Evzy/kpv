/* global window */
const StreamLive = (() => {
  function isStreamLive(stream, nowSec) {
    const now = Number(nowSec) || Math.floor(Date.now() / 1000);
    const always = stream.always_live === 1 || stream.always_live === true;
    if (always) return true;
    const start = Number(stream.starts_at) || 0;
    const end = Number(stream.ends_at) || 0;
    if (start > 0 && end > 0) return now >= start && now <= end;
    if (stream.isLive === true || stream.is_live === true) return true;
    return false;
  }

  const PINNED_TAGS = ["premier league"];

  function isPinned(ch) {
    return PINNED_TAGS.indexOf(String(ch.tag || "").trim().toLowerCase()) >= 0;
  }

  /** Pinned leagues lead their category; live channels lead within each group. */
  function sortChannelsLiveFirst(channels) {
    const groups = [[], [], [], []];
    for (const ch of channels) {
      groups[(isPinned(ch) ? 0 : 2) + (ch.isLive ? 0 : 1)].push(ch);
    }
    return groups[0].concat(groups[1], groups[2], groups[3]);
  }

  function sortCategoriesLiveFirst(categories) {
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

  return { isStreamLive, sortChannelsLiveFirst, sortCategoriesLiveFirst };
})();
