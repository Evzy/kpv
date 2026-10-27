/* global document, window, WebSocket */
/** Read-only live chat for one stream, drawn bottom-right over the player. */
const ChatOverlay = (() => {
  const ENDPOINT = "wss://ws.television.st/chat";
  const PREFILL_LIMIT = 5;
  const MAX_VISIBLE = 5;
  const MAX_PENDING = 20;
  const PACE_MS = 350;
  const LIFETIME_MS = 8000;
  const RECONNECT_MS = 5000;
  const ENTITIES = { "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };

  function plainText(html) {
    return String(html)
      .replace(/<[^>]*>/g, " ")
      .replace(/&#(\d+);/g, (m, n) => {
        const code = Number(n);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
      })
      .replace(/&(lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m])
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  }

  function toMessage(obj) {
    if (!obj || typeof obj !== "object" || !("message" in obj) || Number(obj.private) === 1) return null;
    const username = String(obj.username || "").trim();
    const text = plainText(obj.message || "");
    if (!username || !text) return null;
    const hex = String(obj.color || "").trim().replace(/^#/, "");
    return {
      id: String(obj.uuid || "") || `${username}:${text}`,
      username,
      text,
      color: /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex}` : null,
    };
  }

  /** One WebSocket frame → displayable messages (prefill keeps the last few). */
  function parse(frame) {
    let root;
    try {
      root = JSON.parse(frame);
    } catch (_) {
      return [];
    }
    if (!root || typeof root !== "object") return [];
    if (Array.isArray(root.prefill)) {
      return root.prefill.map(toMessage).filter(Boolean).slice(-PREFILL_LIMIT);
    }
    const one = toMessage(root);
    return one ? [one] : [];
  }

  function socketUrl(streamId, reconnect) {
    return `${ENDPOINT}?channel=${streamId}${reconnect ? "&reconnect=true" : ""}`;
  }

  /** Overlay bound to `streamId`; hidden until `toggle()`, and only connected while shown. */
  function create(streamId) {
    const box = document.createElement("div");
    box.className = "chat-overlay hidden";
    box.setAttribute("aria-live", "polite");
    document.body.appendChild(box);

    let socket = null;
    let shown = false;
    let reconnectTimer = 0;
    let paceTimer = 0;
    const pending = [];
    const seen = new Set();

    function addLine(msg) {
      const line = document.createElement("div");
      line.className = "chat-line";
      const name = document.createElement("span");
      name.className = "chat-name";
      name.textContent = `${msg.username}: `;
      if (msg.color) name.style.color = msg.color;
      line.appendChild(name);
      line.appendChild(document.createTextNode(msg.text));
      box.appendChild(line);
      while (box.children.length > MAX_VISIBLE) box.removeChild(box.firstChild);
      window.setTimeout(() => {
        line.classList.add("chat-line--gone");
        window.setTimeout(() => line.remove(), 300);
      }, LIFETIME_MS);
    }

    function drain() {
      paceTimer = 0;
      const msg = pending.shift();
      if (!msg) return;
      addLine(msg);
      if (pending.length) paceTimer = window.setTimeout(drain, PACE_MS);
    }

    function enqueue(messages) {
      for (const m of messages) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        pending.push(m);
      }
      while (pending.length > MAX_PENDING) pending.shift();
      if (!paceTimer && pending.length) drain();
    }

    function connect(reconnect) {
      reconnectTimer = 0;
      let ws;
      try {
        ws = new WebSocket(socketUrl(streamId, reconnect));
      } catch (_) {
        scheduleReconnect();
        return;
      }
      socket = ws;
      ws.onopen = () => ws.send(JSON.stringify({ session_id: "" }));
      ws.onmessage = (e) => {
        if (socket === ws) enqueue(parse(e.data));
      };
      ws.onclose = () => {
        if (socket === ws) scheduleReconnect();
      };
    }

    function scheduleReconnect() {
      socket = null;
      if (!shown || reconnectTimer) return;
      reconnectTimer = window.setTimeout(() => connect(true), RECONNECT_MS);
    }

    function disconnect() {
      window.clearTimeout(reconnectTimer);
      window.clearTimeout(paceTimer);
      reconnectTimer = 0;
      paceTimer = 0;
      const ws = socket;
      socket = null;
      if (ws) {
        try {
          ws.close();
        } catch (_) {
          /* already closed */
        }
      }
      pending.length = 0;
      seen.clear();
      box.innerHTML = "";
    }

    function toggle() {
      shown = !shown;
      box.classList.toggle("hidden", !shown);
      if (shown) connect(false);
      else disconnect();
      return shown;
    }

    function stop() {
      shown = false;
      box.classList.add("hidden");
      disconnect();
    }

    return { toggle, stop, isShown: () => shown, element: box };
  }

  return { parse, plainText, socketUrl, create };
})();
