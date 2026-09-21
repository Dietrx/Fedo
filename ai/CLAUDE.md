# AI-Dev (Path 2)
Aufgabe: `AnalysisInput` → `AnalysisResult` (Scores 0..1 pro Signal aus contracts/signals.ts).
- Schnittstelle: `Analyzer` in contracts/modules.ts
- **Kein `chrome.*` und kein `document`** hier, alles muss in Node laufen
- Testen: `npm run dev:ai` (Mock) bzw. `npm run dev:ai -- --jev` (echte API, braucht `.env`)
- Offene Punkte: Jev gegen echtes Guthaben testen + Fragen in `questions.ts` justieren, STT für Video-Audio (braucht `chrome.tabCapture` → Glue/Scraper, nicht in `ai/`), Vision-Zweig für `synthetic_media`
- Formulierung: Techniken beschreiben, nie Meinungen oder Absichten bewerten

## Aufbau (Stand: lokale Engine)
- `state.ts`: Rohdaten → gewichtete Textsegmente (`buildSegments`) bzw. Text-State für Jev (`buildState`)
- `lexicon.ts`: **Deklaration** – welche Formulierung (EN+DE) für welches Signal zählt, mit Gewicht
- `engine.ts`: Scoring (Cue-Treffer × Quellgewicht → noisy-OR → Kontextregeln) + Evidence-Zitat
- `assess.ts`: `SEVERITY` pro Signal → Gesamt-Intensität `none|low|medium|high`
- `explain.ts`: neutraler „Why am I seeing this?“-Text
- `mock.ts`: Offline-Analyzer = lokale Engine
- `jev.ts` + `questions.ts`: Jev über die OpenRouter **Decisions API** (`JEV_API_URL=https://openrouter.ai/api/alpha/decisions`), eine Noul-Frage pro Signal → Wahrscheinlichkeit. Evidence kommt lokal, Fehler/Timeout → lokale Engine
- `live.ts` + `timeline.ts`: Live-Video. Wrapper um jeden Analyzer: pro Video max. 1 Request gleichzeitig und alle 750 ms, nur das neueste Transkript wird analysiert (nichts läuft rückwärts), dazu `timeline` (Satz-für-Satz lokal bewertet, mit Zeitstempel). Simulator: `npx tsx ai/dev/run-live.ts [--jev]`
- Echte Posts testen: `npx tsx ai/dev/fetch-live.ts /tmp/live.json` (Bluesky + Mastodon, ohne Login; Datei NICHT committen), dann `npx tsx ai/dev/run-live-sample.ts /tmp/live.json [--jev]`
- Jev bewertet zusätzlich jeden Satz einzeln (parallel): liefert das Evidence-Zitat und dämpft Signale, die sich in keinem Satz lokalisieren lassen
- Regressionstests: `npx tsx ai/dev/eval.ts` (Fälle in `ai/dev/cases.ts`). Falsch bewerteter Post → Fall ergänzen, dann Lexikon anpassen
- `llm.ts`: Alternative mit beliebigem Chat-Modell. Aktiv, wenn `JEV_API_URL` auf `/chat/completions` endet
  (Modell wechseln: `...#google/gemini-2.5-flash` an die URL hängen). Fehler/Timeout → lokale Engine.
