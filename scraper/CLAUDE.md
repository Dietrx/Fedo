# Scraper-Dev (Path 1)
Aufgabe: Posts/Videos von x.com und tiktok.com als `FeedItem` extrahieren und gesprochenen Text über `sink.onTranscript()` nachreichen.
- Schnittstelle: `Scraper` in contracts/modules.ts, Datenform: `FeedItem` in contracts/types.ts
- **Lies zuerst `RESEARCH.md`** (Messungen, Datenwege, Architektur, Coverage, offene Punkte).
- Einstieg: `index.ts` (Factory), Plattformen in `platforms/`, Helfer in `observe.ts`, Bridge MAIN↔isolated in `bridge.ts` + `main-world.ts`, Transcript in `transcript/`, lokaler STT-Server in `companion/`
- Testen: `npm run test:scraper` (Mapper gegen echte/synthetische Payloads) · `npm run dev:scraper`, dann `dist/` in Chrome laden, Feed scrollen, Konsole zeigt `[fedo:scraper] NEW VIDEO` / `NEW POST` · DevTools-Sonden in `research/console-probes/`
- Offene Punkte: X eingeloggt verifizieren (Feed-DOM, GraphQL), echte Extension auf tiktok.com (CSP/LNA-Punkt), Kommentar-Abruf sobald ein Feld existiert — Details in `RESEARCH.md` §16
