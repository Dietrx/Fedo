# Fedo Shield: Notes for Claude

Chrome extension (MV3, TypeScript, esbuild) that flags persuasion techniques in the X/TikTok feed.
Three devs work in parallel. **The complete guide is in `START_HERE.md`.**

| Role | Folder | Delivers (see contracts/modules.ts) | Testing |
|---|---|---|---|
| Scraper dev | `scraper/` | `createScraper()` → `sink.onItem(item, anchor)` | `npm run dev:scraper` + x.com |
| AI dev | `ai/` | `createAnalyzer()` → `analyze(input)` | `npm run dev:ai` |
| UI dev | `ui/` | `createOverlay()` → `render(itemId, anchor, state)` | `npm run dev:ui` |

## Rules
- Work **only in the folder of your role**. Never import directly from another path, only from `@contracts`.
- `contracts/` is the shared interface: **do not change it on your own.** If you need something,
  propose the change (new fields optional). The human agrees it with the team.
- `extension/src/` (glue) stays thin. Only touch it when it is really necessary, and then let people know.
- Before every commit: `npm run check` (typecheck + boundaries + build) must be green.
- Branches: `scraper/...`, `ai/...`, `ui/...`. Small PRs, merge often.
- After merging to `main`: add an entry at the top of `UPDATE.md` (what changed,
  what do the others have to do). A template is commented out at the end of the file.
