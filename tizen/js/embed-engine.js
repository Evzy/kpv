/* global window */
/**
 * Fetch catalog-site embed HTML and prepare it for same-origin blob iframe (TV sniff).
 */
const EmbedEngine = (() => {
  function embedOrigin(url) {
    try {
      return new URL(url).origin;
    } catch (_) {
      return "";
    }
  }

  function stripHeavyAds(html) {
    return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (block) => {
      // Main JW bootstrap is one huge inline script that also mentions ad config — never drop it.
      if (block.length > 40_000) return block;
      if (/aclib\.runPop|adexchangeclear\.com|suurl5\.php|wpnxiswpuyrfn\.icu/i.test(block)) {
        return "";
      }
      return block;
    });
  }

  function injectKpvHook(html) {
    const hook = `<script>(function(){
  var n=0;
  var t=setInterval(function(){
    n++;
    if(n>110){ clearInterval(t); return; }
    try{
      document.querySelectorAll("video").forEach(function(v){
        v.muted=true;
        try{ v.play(); }catch(e){}
      });
      if(window.jwplayer){
        var j=jwplayer();
        try{ j.setMute&&j.setMute(true); j.play&&j.play(); }catch(e){}
        var pl=j.getPlaylist&&j.getPlaylist();
        var f=pl&&pl[0]&&pl[0].file;
        if(f&&/\\.m3u8/i.test(f)&&parent.kpvOnSniffed){
          parent.kpvOnSniffed(f);
          clearInterval(t);
        }
      }
    }catch(e){}
  },800);
})();<\/script>`;
    if (/<\/body>/i.test(html)) {
      return html.replace(/<\/body>/i, `${hook}</body>`);
    }
    return html + hook;
  }

  function prepareHtml(rawHtml, embedUrl) {
    const origin = embedOrigin(embedUrl);
    let html = stripHeavyAds(rawHtml);
    html = html.replace(
      /location\.protocol\s*\+\s*"\/\/"\s*\+\s*location\.host/g,
      `"${origin}"`,
    );
    if (!/<base[\s>]/i.test(html)) {
      html = html.replace(/<head/i, `<head><base href="${origin}/">`);
    }
    return injectKpvHook(html);
  }

  async function fetchPreparedDocument(embedUrl, referer) {
    const res = await fetch(embedUrl, {
      headers: {
        Accept: "text/html,*/*",
        Referer: referer || embedUrl,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.text();
    return { raw, html: prepareHtml(raw, embedUrl) };
  }

  function mountInFrame(frame, html) {
    if (!frame) throw new Error("no frame");
    if (frame._kpvBlobUrl) {
      try {
        URL.revokeObjectURL(frame._kpvBlobUrl);
      } catch (_) {
        /* ignore */
      }
      frame._kpvBlobUrl = null;
    }
    if (window.URL && URL.createObjectURL) {
      frame._kpvBlobUrl = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
      frame.removeAttribute("srcdoc");
      frame.src = frame._kpvBlobUrl;
      return "blob";
    }
    frame.removeAttribute("src");
    frame.srcdoc = html;
    return "srcdoc";
  }

  return {
    embedOrigin,
    stripHeavyAds,
    injectKpvHook,
    prepareHtml,
    fetchPreparedDocument,
    mountInFrame,
  };
})();
