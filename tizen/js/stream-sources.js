/** Alternative versions of a stream (main broadcast plus the catalog's `substreams`). */
const StreamSources = (() => {
  function source(obj, index) {
    const tag = String(obj.source_tag || "").trim();
    return {
      label: tag || (index === 0 ? "Main" : `Source ${index + 1}`),
      uri: String(obj.uri_name || ""),
      iframe: String(obj.iframe || ""),
    };
  }

  /** Main source then substreams; empty when the stream has no alternatives. */
  function fromStream(stream) {
    const subs = Array.isArray(stream && stream.substreams) ? stream.substreams : [];
    if (!subs.length) return [];
    const out = [source(stream, 0)];
    for (const sub of subs) {
      if (!sub || !String(sub.uri_name || "").trim()) continue;
      out.push(source(sub, out.length));
    }
    return out.length > 1 ? out : [];
  }

  /** Next index after `current`, wrapping, skipping `tried` (a Set); null when none are left. */
  function next(size, current, tried) {
    for (let step = 1; step < size; step += 1) {
      const i = (current + step) % size;
      if (!tried.has(i)) return i;
    }
    return null;
  }

  return { fromStream, next };
})();
