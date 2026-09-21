// tiktok.com/foryou → DevTools-Konsole, NACH tiktok-item-from-fiber.js (braucht window.fedoItem).
(async () => {
  const it = window.fedoItem;
  const info = it?.video?.claInfo?.captionInfos?.[0];
  if (!info) return console.warn("dieses Video hat keine Untertitel-Spur (claInfo.captionInfos leer) — STT-Fallback nötig");
  const url = info.url || info.urlList?.[0];
  const t0 = performance.now();
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  const text = await res.text();
  const cues = (text.match(/-->/g) || []).length;
  console.log(`VTT: HTTP ${res.status}, ${Math.round(performance.now() - t0)} ms, ${text.length} Bytes, ${cues} Cues, Sprache ${info.language}, auto=${info.isAutoGen}`);
  console.log(text.slice(0, 400));
})();
