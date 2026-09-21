// tiktok.com/foryou → DevTools console. Shows the item object behind the currently playing video (React state).
(() => {
  const video = [...document.querySelectorAll("video")].find((v) => !v.paused);
  const article = video?.closest('article,[data-e2e="recommend-list-item-container"]') || document.querySelector("article");
  if (!article) return console.warn("no article found");
  const key = Object.keys(article).find((k) => k.startsWith("__reactFiber$"));
  if (!key) return console.warn("no React fiber on the article (wrong world? the console must run in the page context)");
  let fiber = article[key];
  const t0 = performance.now();
  for (let depth = 0; fiber && depth < 6; depth++, fiber = fiber.return) {
    let hook = fiber.memoizedState;
    for (let i = 0; hook && i < 60; i++, hook = hook.next) {
      const ref = hook.memoizedState?.current;
      const cand = ref && typeof ref === "object" && "value" in ref ? ref.value : ref;
      if (cand && typeof cand === "object" && cand.id && cand.author && cand.video) {
        console.log(`found: fiber depth ${depth}, hook ${i}, ${(performance.now() - t0).toFixed(2)} ms`);
        console.log({ id: cand.id, author: typeof cand.author === "string" ? cand.author : cand.author.uniqueId, desc: cand.desc, lang: cand.textLanguage, captions: cand.video.claInfo?.captionInfos, stats: cand.stats, playAddr: cand.video.playAddr });
        window.fedoItem = cand;
        return;
      }
    }
  }
  console.warn("item not found — hook structure changed? (research 2026-09-21: depth 2, hook 10)");
})();
