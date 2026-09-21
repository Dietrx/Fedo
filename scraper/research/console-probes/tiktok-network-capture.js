// tiktok.com/foryou → DevTools-Konsole. Danach ein paar Videos weiterscrollen (Pfeil runter) und `fedoItems` ansehen.
(() => {
  const items = new Map();
  window.fedoItems = items;
  const orig = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input?.url;
    const p = orig.apply(this, arguments);
    if (/\/api\/(?:[\w-]+\/)*item_list\//.test(url || "")) {
      const t = performance.now();
      p.then((r) => r.clone().json().then((j) => {
        for (const it of j.itemList || []) items.set(it.id, it);
        console.table((j.itemList || []).map((it) => ({
          id: it.id,
          handle: typeof it.author === "string" ? it.author : it.author?.uniqueId,
          sec: it.video?.duration,
          lang: it.textLanguage,
          captions: (it.video?.claInfo?.captionInfos || []).map((c) => `${c.language}${c.isAutoGen ? "(auto)" : ""}`).join(",") || "-",
          noCaptionReason: it.video?.claInfo?.noCaptionReason ?? "-",
          stickers: (it.stickersOnItem || []).flatMap((s) => s.stickerText || []).join(" | ") || "-",
          likes: it.stats?.diggCount,
          comments: it.stats?.commentCount,
          ad: it.isAd,
        })));
        console.log(`item_list: ${j.itemList?.length} items, ${Math.round(performance.now() - t)} ms after the request started; total seen: ${items.size}`);
      }).catch(() => {}));
    }
    return p;
  };
  console.log("fedo: fetch wrapper installed — scroll to trigger /api/recommend/item_list/");
})();
