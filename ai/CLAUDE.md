# AI-Dev (Path 2)
Aufgabe: `AnalysisInput` → `AnalysisResult` (Scores 0..1 pro Signal aus contracts/signals.ts).
- Schnittstelle: `Analyzer` in contracts/modules.ts
- **Kein `chrome.*` und kein `document`** hier, alles muss in Node laufen
- Testen: `npm run dev:ai` (Mock) bzw. `npm run dev:ai -- --jev` (echte API, braucht `.env`)
- Offene Punkte: Jev gegen echtes Guthaben testen + Fragen in `questions.ts` justieren, Video-Frames statt nur Standbild, Video-Frames statt nur Standbild für `synthetic_media`
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
- `tone.ts`: Ironie/Satire/Memes. Jev beantwortet im selben Request drei Kontextfragen (Humor? Sarkasmus? reale Gruppe als Ziel?). Verspielter Humor ohne reale Zielgruppe → Signale gedämpft; Humor GEGEN eine Gruppe → nicht gedämpft, max. `medium`; Sarkasmus → nur in der Erklärung benannt. Nur im Jev-Modus, die lokale Engine kann keinen Ton lesen
- Video mit Ton: `stt.ts` (Speech-to-Text, vom Glue über `fedo/transcribe` aufgerufen) → Glue baut `TranscriptChunk`s → `live.ts`. `transcript.ts` räumt das Transkript auf: bei Untertiteln UND STT für dasselbe Video zählen nur die Untertitel (sortiert, ohne Doppelte), zerschnittene STT-Sätze und satzzeichenlose Untertitel-Schnipsel werden zu Sätzen zusammengesetzt. Tests: `npx tsx ai/dev/test-transcript.ts`. Im Jev-Modus wird jeder fertige Satz einzeln bewertet (pro Video gecacht) → Zitate + `timeline`. Ende-zu-Ende in Node: `npx tsx ai/dev/run-stt.ts <16kHz.wav> [--jev]` (Testdatei: `say -o /tmp/s.wav --data-format=LEI16@16000 "text"`)
- `coverage.ts`: setzt `result.coverage` (`insufficient` < 4 echte Wörter, `text_only` bei ungesehenen Medien) für alle Analyzer. Lokale Engine meldet `source: "local"`
- Bilder: `vision.ts` schickt `media[].url` (Bilder) bzw. `posterUrl` (Video-Standbild) an ein multimodales Chat-Modell (eigene `VISION_*`-Config, sonst STT-Endpoint + Key; Modell-Default `gemini-3.1-flash-lite`, ~1 s). Liefert Text im Bild, eine neutrale Beschreibung und ein gedeckeltes „Anzeichen für KI-Generierung". `with-vision.ts` hängt das an jeden API-Analyzer: Bildtext läuft durch die normale Textbewertung (Großbuchstaben-Memes werden normalisiert), `synthetic_media` wird gesetzt, `source: "combined"`, max. 4 s Wartezeit, 1 Retry. Nie im Offline-Modus. Test: `npx tsx ai/dev/run-vision.ts <bild|https-url> [--text "..."]`
- Regressionstests: `npx tsx ai/dev/eval.ts` (Fälle in `ai/dev/cases.ts`). Falsch bewerteter Post → Fall ergänzen, dann Lexikon anpassen
- `llm.ts`: Alternative mit beliebigem Chat-Modell. Aktiv, wenn `JEV_API_URL` auf `/chat/completions` endet
  (Modell wechseln: `...#google/gemini-2.5-flash` an die URL hängen). Fehler/Timeout → lokale Engine.
