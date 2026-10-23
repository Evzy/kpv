/** Card line under the title: start time in the TV's timezone, or the live score. */
const FixtureLine = (() => {
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const TEAM_SPLIT = /\s+(?:at|vs\.?)\s+/i;
  const DAY_MS = 86400000;

  function clock(d) {
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
  }

  function midnight(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  function dayLabel(start, now) {
    const days = Math.round((midnight(start) - midnight(now)) / DAY_MS);
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    if (days > 1 && days < 7) return DAYS[start.getDay()];
    return `${start.getDate()} ${MONTHS[start.getMonth()]}`;
  }

  function splitTeams(title) {
    const parts = String(title || "").split(TEAM_SPLIT);
    if (parts.length !== 2) return null;
    const left = parts[0].trim();
    const right = parts[1].trim();
    return left && right ? [left, right] : null;
  }

  function hasStarted(ch, nowSec) {
    return !ch.alwaysLive && ch.startsAt > 0 && ch.startsAt <= nowSec;
  }

  /** Null for 24/7 channels and listings without a start time. */
  function timeLine(ch, nowSec) {
    if (ch.alwaysLive || !(ch.startsAt > 0)) return null;
    const start = new Date(ch.startsAt * 1000);
    if (ch.startsAt > nowSec) return `${dayLabel(start, new Date(nowSec * 1000))} ${clock(start)}`;
    if (ch.endsAt > 0 && nowSec > ch.endsAt) return "Ended";
    return splitTeams(ch.title) ? "Live · Score TBC" : `Live · started ${clock(start)}`;
  }

  function scoreLine(s) {
    const line = `${s.left.abbr} ${s.left.score} – ${s.right.score} ${s.right.abbr}`;
    if (s.state === "post") return `Final · ${line}`;
    return s.detail ? `${line} · ${s.detail}` : line;
  }

  return { timeLine, scoreLine, splitTeams, hasStarted };
})();
