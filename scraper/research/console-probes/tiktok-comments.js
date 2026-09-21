// tiktok.com (beliebige Seite) → DevTools-Konsole. Kommentar-API ohne Signatur-Parameter (funktionierte am 2026-09-21).
(async (awemeId = window.fedoItem?.id || prompt("Video-ID (aweme_id)?")) => {
  const t0 = performance.now();
  const res = await fetch(`/api/comment/list/?aid=1988&aweme_id=${awemeId}&count=20&cursor=0`, { credentials: "include" });
  const json = await res.json();
  console.log(`HTTP ${res.status}, ${Math.round(performance.now() - t0)} ms, ${json.comments?.length} von insgesamt ${json.total} Kommentaren, has_more=${json.has_more}`);
  console.table((json.comments || []).map((c) => ({ likes: c.digg_count, replies: c.reply_comment_total, lang: c.comment_language, user: c.user?.unique_id, text: (c.text || "").slice(0, 80) })));
  window.fedoComments = json;
})();
