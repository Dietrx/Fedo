# AI-Dev (Path 2)
Aufgabe: `AnalysisInput` → `AnalysisResult` (Scores 0..1 pro Signal aus contracts/signals.ts).
- Schnittstelle: `Analyzer` in contracts/modules.ts
- **Kein `chrome.*` und kein `document`** hier, alles muss in Node laufen
- Testen: `npm run dev:ai` (Mock) bzw. `npm run dev:ai -- --jev` (echte API, braucht `.env`)
- Offene Punkte: `callJev()` in `jev.ts` an die echte TypeSafe-API anpassen, STT für Video-Audio, Vision-Zweig für `synthetic_media`
- Formulierung: Techniken beschreiben, nie Meinungen oder Absichten bewerten
