# Scraper-Dev (Path 1)
Aufgabe: Posts/Videos aus dem DOM (oder Netzwerk) von x.com und tiktok.com als `FeedItem` extrahieren.
- Schnittstelle: `Scraper` in contracts/modules.ts, Datenform: `FeedItem` in contracts/types.ts
- Einstieg: `index.ts` (Factory), Plattformen in `platforms/`, Helfer in `observe.ts`
- Testen: `npm run dev:scraper`, dann `dist/` in Chrome laden, Feed scrollen, Konsole zeigt `[fedo:scraper] NEW POST`
- Offene Punkte: X-GraphQL-Interception (HomeTimeline), TikTok-Selektoren prüfen, Captions → `sink.onTranscript()`, aktives Video erkennen
