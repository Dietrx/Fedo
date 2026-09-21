# AI-Dev (Path 2)
Aufgabe: `AnalysisInput` → `AnalysisResult` (Scores 0..1 pro Signal aus contracts/signals.ts).
- Schnittstelle: `Analyzer` in contracts/modules.ts
- **Kein `chrome.*` und kein `document`** hier, alles muss in Node laufen
- Testen: `npm run dev:ai` (Mock) bzw. `npm run dev:ai -- --jev` (echte API, braucht `.env`)
- Offene Punkte: `callJev()` in `jev.ts` an die echte TypeSafe-API anpassen, STT für Video-Audio, Vision-Zweig für `synthetic_media`
- Formulierung: Techniken beschreiben, nie Meinungen oder Absichten bewerten

## Aufbau (Stand: lokale Engine)
- `state.ts`: Rohdaten → gewichtete Textsegmente (`buildSegments`) bzw. Text-State für Jev (`buildState`)
- `lexicon.ts`: **Deklaration** – welche Formulierung (EN+DE) für welches Signal zählt, mit Gewicht
- `engine.ts`: Scoring (Cue-Treffer × Quellgewicht → noisy-OR → Kontextregeln) + Evidence-Zitat
- `assess.ts`: `SEVERITY` pro Signal → Gesamt-Intensität `none|low|medium|high`
- `explain.ts`: neutraler „Why am I seeing this?“-Text
- `mock.ts`: Offline-Analyzer = lokale Engine. `jev.ts`: Jev-Scores + lokale Evidence, Fallback auf lokal bei Fehler
- Regressionstests: `npx tsx ai/dev/eval.ts` (Fälle in `ai/dev/cases.ts`). Falsch bewerteter Post → Fall ergänzen, dann Lexikon anpassen
- `llm.ts`: echtes Sprachmodell über OpenAI-kompatible API (OpenRouter). Aktiv, wenn in `.env` steht:
  `FEDO_ANALYZER=jev`, `JEV_API_URL=https://openrouter.ai/api/v1/chat/completions`, `JEV_API_KEY=sk-or-...`
  (Modell wechseln: `...#google/gemini-2.5-flash` an die URL hängen). Fehler/Timeout → lokale Engine.
