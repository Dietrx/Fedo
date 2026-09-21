# DevTools-Sonden (ohne Tooling reproduzierbar)

Jede Datei ist ein Schnipsel zum Einfügen in die **Konsole der DevTools** auf der jeweiligen Seite
(`F12` → Console → einfügen → Enter). Sie brauchen weder Playwright noch die Extension und zeigen in
Sekunden, ob ein Datenweg aus `scraper/RESEARCH.md` heute noch so funktioniert.

| Datei | Seite | Zeigt |
|---|---|---|
| `tiktok-network-capture.js` | tiktok.com/foryou | fängt `item_list`-Antworten ab (ein `fetch`-Wrapper) und listet Items mit Untertitel-Spur, Sprache, Dauer |
| `tiktok-item-from-fiber.js` | tiktok.com/foryou | liest das Item des gerade spielenden Videos aus dem React-State (der Weg, den `scraper/main-world.ts` nutzt) |
| `tiktok-captions-fetch.js` | tiktok.com/foryou | holt die WebVTT-Datei des aktiven Videos und zeigt Cues und Latenz |
| `tiktok-comments.js` | tiktok.com (beliebig) | ruft die Kommentar-API ohne Signatur auf und zeigt die Top-Kommentare |
| `x-graphql-capture.js` | x.com/home (**eingeloggt**) | fängt GraphQL-Antworten ab und zeigt die Tweet-Entitäten — **der Schritt, der in der Recherche-Sitzung nicht möglich war** |
| `x-syndication-fetch.js` | beliebig | holt einen Tweet über die öffentliche Syndication-API (kein Login) |

Alle Sonden sind reine Lesezugriffe im eigenen Browser; sie senden nichts an Dritte.
