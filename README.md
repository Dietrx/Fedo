# 🛡️ Fedo Shield

> **Neu im Projekt?** Sag deinem Claude: *„Lies START_HERE.md, ich bin der <Scraper|AI|UI>-Dev.“*

Chrome-Extension, die live im Feed Überzeugungs- und Manipulationstechniken markiert
(Fear Framing, Us vs. Them, unbelegte Behauptungen, AI Slop, …) und im Popup zeigt, was der eigene Feed
einem serviert („Feed Diet“). Sie bewertet **Techniken**, nicht Meinungen. **X läuft, TikTok ist experimentell.**
Demo-Ablauf und Fallbacks: `DEMO.md`.

```
 x.com / tiktok.com                     Background Service Worker
┌──────────────────────────┐            ┌─────────────────────────┐
│ PATH 1  scraper/         │  FeedItem  │ PATH 2  ai/             │
│ DOM → FeedItem           ├───────────►│ FeedItem → Jev → Result │
│                          │            │                         │
│ PATH 3  ui/              │◄───────────┤                         │
│ Result → Overlay im Post │ Analysis-  └─────────────────────────┘
└──────────────────────────┘ Result
          ▲ alles verdrahtet in extension/src (Glue, bewusst dünn)
          ▲ alle Typen in contracts/ (die einzige gemeinsame Schnittstelle)
```

## Quickstart

```bash
npm install
cp .env.example .env     # optional, Standard ist der Mock-Analyzer
npm run build            # → dist/
```

Chrome → `chrome://extensions` → Developer Mode → **Load unpacked** → `dist/` auswählen → x.com öffnen.

## Die drei Paths

Jeder arbeitet **nur in seinem Ordner**. `npm run check:boundaries` (läuft auch in der CI) schlägt fehl,
wenn ein Path direkt aus einem anderen importiert. Erlaubt sind nur der eigene Ordner, `@contracts` und npm-Pakete.

| Path | Ordner | Liefert | Arbeitet ohne die anderen via |
|---|---|---|---|
| **1 · Scraper** | `scraper/` | `createScraper(platform): Scraper` → ruft `sink.onItem(item, anchorElement)` | `npm run dev:scraper`: Extension mit Mock-AI; Console zeigt `[fedo:scraper] NEW POST` |
| **2 · AI** | `ai/` | `createAnalyzer(config): Analyzer` → `analyze(input): Promise<AnalysisResult>` | `npm run dev:ai`: jagt die Fixture-Posts in Node durch den Analyzer, kein Browser nötig |
| **3 · UI** | `ui/` | `createOverlay(): OverlayRenderer` → `render(itemId, anchor, state)` + Popup | `npm run dev:ui`: Fake-Feed mit Fixture-Ergebnissen auf http://localhost:8000 |

### Path 1: Scraper (`scraper/`)
- `platforms/x.ts`: X-Posts über `article[data-testid="tweet"]` + MutationObserver (funktioniert schon)
- `platforms/tiktok.ts`: TikTok-Selektoren (best effort, **im DevTools prüfen**)
- `video.ts`: hört das laufende Video ab (`captureStream()` → 8-s-WAV-Stücke → `sink.onAudio()`), plattformübergreifend
- Nächste Schritte: GraphQL-`HomeTimeline`-Interception (MAIN-World-Fetch-Patch), TikTok-Captions → `sink.onTranscript()`

### Path 2: AI (`ai/`)
- `mock.ts`: Keyword-Heuristik, damit Scraper und UI sofort echte Ergebnisse sehen
- `jev.ts`: **Skelett**. Nur `callJev()` muss an die echte TypeSafe-Jev-API angepasst werden, dann `FEDO_ANALYZER=jev` in `.env`
- `state.ts`: baut aus einem Post den kompakten Text-State für Jev
- Regel: kein `chrome.*`, kein `document`, damit alles in Node testbar bleibt
- `stt.ts`: Sprache → Text für Video-Audio (Whisper-artig oder Chat-Modell mit `input_audio`), Konfiguration über `STT_*` in `.env`
- Nächste Schritte: Vision/Deepfake-Zweig für `synthetic_media`

### Path 3: UI (`ui/`)
- `index.ts` + `styles.ts`: Overlay in Shadow DOM (X-CSS kann nicht reinfunken), Zustände `pending` / `done` / `error`, „Why?“-Panel, `LIVE`-Badge für Videos
- `popup/`: Extension-Popup (an/aus, Sensitivität)
- `playground/`: Fake-Feed zum Entwickeln, der Button „Simulate live video“ zeigt wachsende Scores

## Die Schnittstelle: `contracts/`

| Datei | Inhalt |
|---|---|
| `types.ts` | `FeedItem`, `TranscriptChunk`, `AnalysisInput`, `Signal`, `AnalysisResult`, `OverlayState`, `SIGNAL_KEYS` |
| `modules.ts` | die drei Interfaces `Scraper`, `Analyzer`, `OverlayRenderer` |
| `signals.ts` | Label, Beschreibung (UI) und Jev-Frage (AI) pro Signal |
| `fixtures.ts` | Beispiel-Posts und -Ergebnisse, damit jeder isoliert arbeiten kann |
| `messages.ts` | Content ⇄ Background Messaging (nur für den Glue) |

**Regeln für `contracts/`:** Änderungen kurz im Team absprechen. Neue Felder lieber **optional hinzufügen**
als bestehende umbenennen oder löschen. Contract-Änderungen als eigenen kleinen PR direkt auf `main`, damit alle schnell rebasen.

## Git-Workflow (Vorschlag)
- Branches: `scraper/...`, `ai/...`, `ui/...`
- Kleine PRs, oft mergen. Weil jeder nur in seinem Ordner arbeitet, gibt es praktisch keine Merge-Konflikte
- Vor dem Push: `npm run check` (Typecheck + Boundaries + Build)

## Scripts

| Befehl | Zweck |
|---|---|
| `npm run build` | Extension nach `dist/` bauen |
| `npm run dev` | Watch-Build (danach Extension in `chrome://extensions` neu laden) |
| `npm run dev:scraper` | Watch-Build, erzwingt Mock-AI |
| `npm run dev:ai` | AI-Harness in Node (`-- --jev` für echte API) |
| `npm run dev:ui` | UI-Playground auf :8000 |
| `npm run check` | Typecheck + Boundaries + Build |
