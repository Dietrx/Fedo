# AI-Dev (Path 2)
Aufgabe: `AnalysisInput` → `AnalysisResult` (Scores 0..1 pro Signal aus contracts/signals.ts).
- Schnittstelle: `Analyzer` in contracts/modules.ts
- **Kein `chrome.*` und kein `document`** hier, alles muss in Node laufen
- Testen: `npm run dev:ai` (Mock) bzw. `npm run dev:ai -- --jev` (echte API, braucht `.env`)
- Offene Punkte: Jev gegen echtes Guthaben testen + Fragen in `questions.ts` justieren, STT für Video-Audio, Vision-Zweig für `synthetic_media`
- Formulierung: Techniken beschreiben, nie Meinungen oder Absichten bewerten

## Aufbau (Stand: lokale Engine)
- `state.ts`: Rohdaten → gewichtete Textsegmente (`buildSegments`) bzw. Text-State für Jev (`buildState`)
- `lexicon.ts`: **Deklaration** – welche Formulierung (EN+DE) für welches Signal zählt, mit Gewicht
- `engine.ts`: Scoring (Cue-Treffer × Quellgewicht → noisy-OR → Kontextregeln) + Evidence-Zitat
- `assess.ts`: `SEVERITY` pro Signal → Gesamt-Intensität `none|low|medium|high`
- `explain.ts`: neutraler „Why am I seeing this?“-Text
- `mock.ts`: Offline-Analyzer = lokale Engine
- `jev.ts` + `questions.ts`: Jev über die OpenRouter **Decisions API** (`JEV_API_URL=https://openrouter.ai/api/alpha/decisions`), eine Noul-Frage pro Signal → Wahrscheinlichkeit. Evidence kommt lokal, Fehler/Timeout → lokale Engine
- Regressionstests: `npx tsx ai/dev/eval.ts` (Fälle in `ai/dev/cases.ts`). Falsch bewerteter Post → Fall ergänzen, dann Lexikon anpassen
- `llm.ts`: Alternative mit beliebigem Chat-Modell. Aktiv, wenn `JEV_API_URL` auf `/chat/completions` endet
  (Modell wechseln: `...#google/gemini-2.5-flash` an die URL hängen). Fehler/Timeout → lokale Engine.
