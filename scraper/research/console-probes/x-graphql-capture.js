// x.com/home (EINGELOGGT) → DevTools-Konsole, dann scrollen. Fängt GraphQL-Antworten (fetch UND XHR) ab.
// Ziel: 1) bestätigen, welche Operation die Timeline liefert (HomeTimeline / HomeLatestTimeline),
//       2) eine echte Antwort als Fixture sichern: `copy(JSON.stringify(fedoGraphql[0].json))` → in
//          scraper/test/fixtures/x-graphql-timeline.json einsetzen (vorher persönliche Daten prüfen).
(() => {
  const captured = [];
  window.fedoGraphql = captured;
  const record = (url, text, via) => {
    try {
      const json = JSON.parse(text);
      const op = url.match(/graphql\/[^/]+\/([A-Za-z_]+)/)?.[1];
      const tweets = [];
      const walk = (o, d) => {
        if (!o || typeof o !== "object" || d > 30) return;
        if (o.__typename === "TweetWithVisibilityResults" && o.tweet) return walk(o.tweet, d + 1);
        if (o.rest_id && o.legacy && typeof o.legacy.full_text === "string") { tweets.push(o); return; }
        for (const v of Object.values(o)) walk(v, d + 1);
      };
      walk(json, 0);
      captured.push({ op, via, tweets: tweets.length, bytes: text.length, json });
      console.log(`GraphQL ${op} via ${via}: ${tweets.length} tweets, ${Math.round(text.length / 1024)} KB`);
      if (tweets[0]) {
        const t = tweets[0];
        console.log("Beispiel:", { id: t.rest_id, user: t.core?.user_results?.result?.legacy?.screen_name ?? t.core?.user_results?.result?.core?.screen_name, note: !!t.note_tweet, quoted: !!t.quoted_status_result, media: t.legacy.extended_entities?.media?.map((m) => m.type), views: t.views?.count, lang: t.legacy.lang, birdwatch: !!t.birdwatch_pivot });
      }
    } catch {}
  };
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input?.url;
    const p = origFetch.apply(this, arguments);
    if (/\/i\/api\/graphql\//.test(url || "")) p.then((r) => r.clone().text().then((t) => record(url, t, "fetch")).catch(() => {}));
    return p;
  };
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, url) {
    if (/\/i\/api\/graphql\//.test(String(url))) this.addEventListener("load", () => record(String(url), this.responseText, "xhr"));
    return origOpen.apply(this, arguments);
  };
  console.log("fedo: GraphQL-Wrapper installiert — jetzt scrollen; Ergebnisse in window.fedoGraphql");
})();
