# START HERE: Onboarding for devs and Claude

> **To Claude:** This file explains everything you need to work on this project.
> Read it completely and then follow section **"First steps for Claude"**.

---

## 1. What is this about?

**Fedo Shield** is a Chrome extension for a 5-hour hackathon. It flags persuasion and manipulation techniques
live in the X and TikTok feed, e.g. fear framing, us vs. them, unsupported claims or AI slop.

**Principle:** We describe **techniques**, we do not judge opinions and we do not claim intentions.
So "Fear framing 91 %" instead of "POLITICAL MANIPULATION DETECTED".

**Demo goal:** A juror opens x.com or TikTok, scrolls, and the analysis values appear live under every post.
For videos they change while the person is speaking.

Tech: Chrome extension (Manifest V3), TypeScript, esbuild. The analysis is done by Jev (TypeSafe) in cloud mode and by a local rule engine otherwise.

---

## 2. Architecture

```
 x.com / tiktok.com (Content Script)            Background Service Worker
┌───────────────────────────────┐             ┌──────────────────────────────┐
│ PATH 1  scraper/              │  FeedItem   │ PATH 2  ai/                  │
│ DOM → FeedItem                ├────────────►│ FeedItem → Jev → Result      │
│                               │             │                              │
│ PATH 3  ui/                   │◄────────────┤                              │
│ Result → overlay on post      │ Analysis-   └──────────────────────────────┘
└───────────────────────────────┘ Result
        ▲ wired up in extension/src/ (glue, deliberately thin)
        ▲ all types in contracts/ (the ONLY shared interface)
```

Flow for one post:
1. The **scraper** detects a new post and calls `sink.onItem(item, anchorElement)`.
2. The **glue** shows `{ status: "pending" }` and sends the post to the background.
3. The **AI** returns an `AnalysisResult` via `analyze({ kind: "post", item })`.
4. The **UI** displays the result with `render(item.id, anchorElement, { status: "done", result })`.

Videos work the same way, only with `{ kind: "transcript", item, transcript }`. The AI then sets `partial: true`,
and the UI shows a LIVE badge. The scores are updated continuously.

---

## 3. Roles: who works where?

| Role | Folder | Delivers (see `contracts/modules.ts`) | Test in isolation with |
|---|---|---|---|
| **Scraper dev** | `scraper/` | `createScraper(platform)` → calls `sink.onItem(item, anchor)` | `npm run dev:scraper` + x.com |
| **AI dev** | `ai/` | `createAnalyzer(config)` → `analyze(input): Promise<AnalysisResult>` | `npm run dev:ai` |
| **UI dev** | `ui/` | `createOverlay()` → `render(itemId, anchor, state)` + popup | `npm run dev:ui` |

Everyone works **only in their own folder**. Nobody has to wait for the others:
mock AI, sample data (`contracts/fixtures.ts`) and dedicated test environments are already there.

---

## 4. The interface: `contracts/`

| File | Content |
|---|---|
| `types.ts` | `FeedItem`, `TranscriptChunk`, `AnalysisInput`, `Signal`, `AnalysisResult`, `OverlayState`, `Settings`, `SIGNAL_KEYS` |
| `modules.ts` | the three interfaces `Scraper`, `Analyzer`, `OverlayRenderer` |
| `signals.ts` | per signal: `label` + `description` (for the UI), `question` (for the AI/Jev) |
| `fixtures.ts` | sample posts and results for testing in isolation (adding to it is allowed) |
| `messages.ts` | messaging between content script and background (only for the glue) |

**Rules for `contracts/`:**
- Do not change it on your own. If you need something, **propose the change**. The human agrees it with the team.
- Prefer **adding new fields as optional** over renaming or deleting existing ones.
- Contract changes go directly to `main` as a separate, small PR. Afterwards everyone gets the change via `git pull --rebase origin main`.
- Exception: adding **new fixtures** to `fixtures.ts` is okay without coordination.

---

## 5. Hard rules (apply to everyone)

1. Work **only in the folder of your role**.
2. **Never** import directly from another path, only from `@contracts` and npm packages.
   `npm run check:boundaries` checks this, and so does the CI.
3. `extension/src/` (glue) stays thin. Only touch it when it is really necessary, and then let the team know.
4. Before every push `npm run check` must be green (typecheck + boundaries + build).
5. Do not commit API keys. They belong in `.env` (which is in `.gitignore`), template: `.env.example`.

---

## 6. Setup

```bash
git clone https://github.com/Dietrx/Fedo && cd Fedo
npm install
cp .env.example .env         # optional, without .env the local rule engine runs
npm run build                # builds the extension into dist/
```

Load the extension in Chrome: `chrome://extensions` → top right **Developer mode** → **Load unpacked** → select the `dist/` folder.
After every rebuild click ↻ in `chrome://extensions` and reload the tab.

| Command | Purpose |
|---|---|
| `npm run build` | Build the extension into `dist/` |
| `npm run dev` | Watch build |
| `npm run dev:scraper` | Watch build with forced mock AI |
| `npm run dev:ai` | AI harness in Node (`npm run dev:ai -- --jev` for the real API) |
| `npm run dev:ui` | UI playground at http://localhost:8000 |
| `npm run check` | Typecheck + boundaries + build |

---

## 7. Git workflow

- A separate branch per task: `scraper/...`, `ai/...` or `ui/...` (e.g. `ui/overlay-design`)
- Small PRs, **merge every 1–2 hours**, so that the real assembly on x.com gets tested early
- Before that `git pull --rebase origin main`
- Because everyone works only in their own folder, there are practically no merge conflicts
- **After merging to `main`: add an entry at the top of `UPDATE.md`** (what changed,
  what do the others have to do). That way everyone sees at a glance what the latest state is.

---

## 8. Details per role

### 🕷️ Scraper dev: `scraper/`
**Task:** Extract posts and videos from x.com and tiktok.com as `FeedItem` and pass them to the sink.

- `index.ts`: `createScraper()` and `detectPlatform()` (only public entry point)
- `observe.ts`: MutationObserver helpers, hashtag extraction, `hash()`, `debug()`
- `platforms/x.ts`: X via `article[data-testid="tweet"]` (already works)
- `platforms/tiktok.ts`: TikTok via `data-e2e` selectors (**best effort, verify in DevTools!**)

**Testing:** `npm run dev:scraper`, then load `dist/` in Chrome, open x.com, scroll.
The console shows `[fedo:scraper] NEW POST {...}`, and the mock overlay appears under every post.

**Open items (roughly by priority):**
1. Make X extraction robust: quote posts, reposts, alt texts, video posters
2. Verify the TikTok selectors on the current tiktok.com
3. Read TikTok captions/subtitles and pass them to `sink.onTranscript({ itemId, text, isFinal, t, source: "captions" })`
4. Detect the currently visible/playing video (IntersectionObserver)
5. Optional: intercept X GraphQL `HomeTimeline` responses (fetch patch in the MAIN world) for cleaner data
6. Optional: `sink.onItemRemoved(itemId)` when X/TikTok removes posts from the virtual scrolling

### 🧠 AI dev: `ai/`
**Task:** `AnalysisInput` → `AnalysisResult` with scores 0..1 per signal (list in `contracts/signals.ts`).

- `index.ts`: `createAnalyzer(config)` (only public entry point): picks the analyzer and wraps it with vision, live-video handling and `coverage`
- `jev.ts` + `questions.ts`: Jev (TypeSafe) via the OpenRouter Decisions API, one yes/no question per signal, every sentence scored separately for the evidence quote
- `engine.ts` + `lexicon.ts`: the local rule engine (offline analyzer, evidence provider, fallback when the API fails)
- `assess.ts` / `explain.ts` / `tone.ts`: overall level, the neutral "why" text, humor/sarcasm handling
- `vision.ts` + `with-vision.ts`: text inside images, video posters, signs of AI-generated media
- `stt.ts`, `live.ts`, `transcript.ts`, `timeline.ts`: speech-to-text and the live video path
- `dev/`: harnesses and regression cases (`eval.ts`, `cases.ts`, `run-fixtures.ts`, `run-stt.ts`, `run-vision.ts`, `fetch-live.ts`)

Details per file: `ai/CLAUDE.md`.

**Important:** No `chrome.*` and no `document` in `ai/`. Everything must run in Node.

**Testing:** `npm run eval` (regression cases, local engine) · `npx tsx ai/dev/eval.ts --jev` (same cases against the real API,
needs `JEV_API_URL` + `JEV_API_KEY` in `.env`) · `npm run dev:ai` (fixtures).
In the extension you enable Jev with `FEDO_ANALYZER=jev` in `.env` followed by `npm run build`, then "Cloud" in the popup.

**Open items:**
1. Analyse video frames while the video plays (today: speech plus one still frame)
2. More real-feed calibration, especially German and TikTok language
3. Re-deliver an image result that arrives after the text result (the glue caches one result per post)

### 🎨 UI dev: `ui/`
**Task:** Overlay per post, popup and all visuals.

- `index.ts`: `createOverlay()` renders into a Shadow DOM (X's CSS cannot interfere)
- `styles.ts`: the CSS of the overlay
- `popup/`: extension popup (on/off, sensitivity)
- `playground/`: fake X feed for development

**States you have to display** (`OverlayState` in `contracts/types.ts`):
`pending` (loading), `done` (result, live/video when `result.partial === true`), `error`.
Labels and descriptions of the signals come from `SIGNALS` in `contracts/signals.ts`.

**Testing:** `npm run dev:ui` → http://localhost:8000. There are the buttons "Replay" (pending → done)
and "Simulate live video" (scores grow live). For new test cases add entries to `contracts/fixtures.ts`.

**Open items:**
1. Polish the design: colors, animations on appearance, transition pending → done
2. Live video view: e.g. a side panel for TikTok with changing bars and timestamps ("00:04 ⚠ Fear framing")
3. "Why?" panel: explanation, evidence quotes, note "techniques, not opinions"
4. Make the popup nicer, possibly statistics (how many posts flagged)
5. Make sure the overlay does not break the layout on the real x.com

---

## 9. First steps for Claude

1. **Ask for the role**: scraper, AI or UI. This only applies if it has not been stated yet.
2. Read the `CLAUDE.md` in the folder of that role and the files in `contracts/`.
3. Check whether `node_modules/` exists. If not, `npm install`.
4. If the dev is on `main`: propose a branch `<role>/<topic>`.
5. Start the test environment of the role (see section 3) so that results are visible right away.
6. Ask what should be worked on, or propose the next open item from section 8.
7. Stick to the hard rules (section 5). If a task would need a change outside your own
   folder or to `contracts/`: **do not do it yourself**, but explain to the dev what would have to be
   changed, so that it can be agreed with the team.
