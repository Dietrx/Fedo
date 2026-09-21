# Fedo Shield: Hinweise für Claude

Chrome-Extension (MV3, TypeScript, esbuild), die im X/TikTok-Feed Überzeugungstechniken markiert.
Drei Devs arbeiten parallel. **Frag zu Beginn, welcher Dev du bist, falls es nicht gesagt wurde.**

| Rolle | Ordner | Liefert (siehe contracts/modules.ts) | Testen |
|---|---|---|---|
| Scraper-Dev | `scraper/` | `createScraper()` → `sink.onItem(item, anchor)` | `npm run dev:scraper` + x.com |
| AI-Dev | `ai/` | `createAnalyzer()` → `analyze(input)` | `npm run dev:ai` |
| UI-Dev | `ui/` | `createOverlay()` → `render(itemId, anchor, state)` | `npm run dev:ui` |

## Regeln
- Arbeite **nur im Ordner deiner Rolle**. Importiere nie direkt aus einem anderen Path, nur aus `@contracts`.
- `contracts/` ist die gemeinsame Schnittstelle: **nicht eigenmächtig ändern.** Wenn du etwas brauchst,
  schlag die Änderung vor (neue Felder optional). Der Mensch spricht das mit dem Team ab.
- `extension/src/` (Glue) bleibt dünn. Nur anfassen, wenn es wirklich nötig ist, und dann Bescheid sagen.
- Vor jedem Commit: `npm run check` (Typecheck + Boundaries + Build) muss grün sein.
- Branches: `scraper/...`, `ai/...`, `ui/...`. Kleine PRs, oft mergen.
