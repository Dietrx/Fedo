// tiktok.com/foryou → DevTools-Konsole. Zeigt das Item-Objekt hinter dem gerade spielenden Video (React-State).
(() => {
  const video = [...document.querySelectorAll("video")].find((v) => !v.paused);
  const article = video?.closest('article,[data-e2e="recommend-list-item-container"]') || document.querySelector("article");
  if (!article) return console.warn("kein Artikel gefunden");
  const key = Object.keys(article).find((k) => k.startsWith("__reactFiber$"));
  if (!key) return console.warn("kein React-Fiber am Artikel (falsche Welt? Konsole muss im Seitenkontext laufen)");
  let fiber = article[key];
  const t0 = performance.now();
  for (let depth = 0; fiber && depth < 6; depth++, fiber = fiber.return) {
    let hook = fiber.memoizedState;
    for (let i = 0; hook && i < 60; i++, hook = hook.next) {
      const ref = hook.memoizedState?.current;
      const cand = ref && typeof ref === "object" && "value" in ref ? ref.value : ref;
      if (cand && typeof cand === "object" && cand.id && cand.author && cand.video) {
        console.log(`gefunden: Fiber-Tiefe ${depth}, Hook ${i}, ${(performance.now() - t0).toFixed(2)} ms`);
        console.log({ id: cand.id, author: typeof cand.author === "string" ? cand.author : cand.author.uniqueId, desc: cand.desc, lang: cand.textLanguage, captions: cand.video.claInfo?.captionInfos, stats: cand.stats, playAddr: cand.video.playAddr });
        window.fedoItem = cand;
        return;
      }
    }
  }
  console.warn("Item nicht gefunden — Hook-Struktur geändert? (Recherche 2026-09-21: Tiefe 2, Hook 10)");
})();
