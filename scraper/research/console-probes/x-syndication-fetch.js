// Beliebige Seite → DevTools-Konsole. Öffentliche Syndication-API (die X-Embeds nutzen), kein Login nötig.
(async (id = prompt("Tweet-ID?", "20")) => {
  const token = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
  const t0 = performance.now();
  const res = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${token}`);
  const json = await res.json().catch(() => null);
  console.log(`HTTP ${res.status}, ${Math.round(performance.now() - t0)} ms`);
  console.log(json && { user: json.user?.screen_name, text: json.text, lang: json.lang, likes: json.favorite_count, media: json.mediaDetails?.map((m) => m.type), quoted: json.quoted_tweet?.text });
  window.fedoSyndication = json;
})();
