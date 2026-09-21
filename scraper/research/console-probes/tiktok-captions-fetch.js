// tiktok.com/foryou → DevTools console, AFTER tiktok-item-from-fiber.js (needs window.fedoItem).
(async () => {
  const it = window.fedoItem;
  const info = it?.video?.claInfo?.captionInfos?.[0];
  if (!info) return console.warn("this video has no subtitle track (claInfo.captionInfos empty) — STT fallback needed");
  const url = info.url || info.urlList?.[0];
  const t0 = performance.now();
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  const text = await res.text();
  const cues = (text.match(/-->/g) || []).length;
  console.log(`VTT: HTTP ${res.status}, ${Math.round(performance.now() - t0)} ms, ${text.length} bytes, ${cues} cues, language ${info.language}, auto=${info.isAutoGen}`);
  console.log(text.slice(0, 400));
})();
