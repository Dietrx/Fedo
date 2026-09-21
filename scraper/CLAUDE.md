# Scraper-Dev (Path 1)
Task: extract posts/videos from x.com and tiktok.com as `FeedItem` and deliver spoken text afterwards via `sink.onTranscript()`.
- Interface: `Scraper` in contracts/modules.ts, data shape: `FeedItem` in contracts/types.ts
- **Read `RESEARCH.md` first** (measurements, data paths, architecture, coverage, open points).
- Entry point: `index.ts` (factory), platforms in `platforms/`, helpers in `observe.ts`, bridge MAIN↔isolated in `bridge.ts` + `main-world.ts`, transcript in `transcript/`, local STT server in `companion/`
- Testing: `npm run test:scraper` (mappers against real/synthetic payloads) · `npm run dev:scraper`, then load `dist/` in Chrome, scroll the feed, the console shows `[fedo:scraper] NEW VIDEO` / `NEW POST` · DevTools probes in `research/console-probes/`
- Open points: verify X logged in (feed DOM, GraphQL), real extension on tiktok.com (CSP/LNA point), comment retrieval as soon as a field exists — details in `RESEARCH.md` §16
