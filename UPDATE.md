# UPDATE.md — What is on `main` right now?

> **What is this file for?** So that everyone on the team can see what the latest state is
> without having to read the git log. **The newest entry is at the top.**

**Rules:**
- Whoever merges into `main` adds a new entry at the top.
- An entry answers two questions: *What changed?* and *What do I need to do now?*
- Insert new entries at the top, do not rewrite old ones — the file is also a history.

---

## 2026-09-21 · `chore/jury-ready` · All paths · Repository prepared for the jury: English docs, security audit, anonymised fixture

**What changed:**
- **Everything is in English now:** `README.md` (rewritten for a reader who has never seen the project), `DEMO.md` (rewritten, limits updated),
  `START_HERE.md`, `UPDATE.md`, all `CLAUDE.md` files, `scraper/RESEARCH.md` and the console probes (translated 1:1, facts untouched).
  German remains only where it is data: `ai/lexicon.ts` patterns and German test cases.
- **Security audit of the full git history (all branches):** no API key, token, cookie, `.env` or `dist/` was ever committed.
- **`scraper/test/fixtures/tiktok-capture.json` anonymised:** real creator handles, nicknames, account id and 21 signed CDN URLs replaced.
  Field names and structure are unchanged, the 17 scraper tests pass before and after.
- `docs/overview.jpg`: README screenshot taken from the UI playground (synthetic posts only). `.gitignore`: `brag-output/`.
- Outdated facts fixed: `START_HERE.md` no longer calls `jev.ts` a skeleton; `DEMO.md` no longer says "text only".

**What you need to do:**
- `git pull --rebase origin main`. If you have local edits in one of the translated files, expect a conflict there: keep the English version and re-apply your change.
- New `UPDATE.md` entries in English, please.
- **Noah:** your glue fix `94c294e` (keep the overlay alive on settings change) is still only on `integrate/video-stt`, not on `main`.

**Good to know:** commit author e-mail addresses are public in the git metadata of a public repository. Changing that would mean rewriting history, which we did not do.

---

## 2026-09-21 · `ai/more-sensitive` · AI · More sensitive scoring: more `medium`/`high`

**What changed** (`ai/` only):
- Level thresholds lowered (`high` from 0.78 instead of 0.82, `medium` from 0.48 instead of 0.55), further techniques count more strongly, sentence plausibility check
  and humor dampening slightly looser. Measured on 328 real posts: `high` 3 → 11, `medium` 34 → 36, `low` 106 → 93.
- **Deliberately NOT loosened:** the false-alarm guards (too little text, pattern-based signals need local confirmation). Checked: the posts just below
  the display threshold are almost only neutral news reports (NYT, Spiegel), link pointers, hashtag-only posts and jokes. A looser variant immediately set a
  neutral news report to `medium` in the test and marked an absurd joke as "dehumanizing" → discarded.
- Evals: 15/15 local, 20/20 Jev (two expectations adjusted: the insult tweet and the sarcastic government criticism may now be `high`).

**What you need to do:**
- `git pull --rebase origin main`, `npm run build`, ↻, reload the tab.
- **For the demo, if more chips should be visible:** in the popup move the "Sensitivity" slider to the right (it then shows from 30–40 % instead of from 50 %). This only changes the display, not the overall level.

---

## 2026-09-21 · `fix/video-finishing` · Scraper (Video) + Glue + AI · Videos no longer get stuck at "finishing…", image posts without text are waited for

**What changed:**
- **"finishing…" forever (cause in `scraper/video.ts`):** The end signal (`ended: true`) got lost when (1) the last audio piece was silent or < 0.5 s
  (most videos end like that), (2) the video was paused / scrolled away (arrived as `ended: false`, although the contract says "video ended OR capture stopped"),
  (3) the video loops (TikTok always, X for short clips: `ended` never fires, the recording ran until the 3-min limit), (4) the 3-min limit kicked in.
  Now an empty closing piece goes out in all of these cases; a time jump backwards counts as the end.
- **Glue (`extension/src/content.ts`):** no countdown without a known video length (it ran to "finishing…" after 6 s); a transcription that is still running
  can no longer set an already finished video back to "Listening" (`entry.closed`).
- **Faster:** first audio window 4 s instead of 8 s → first scores after ~5–6 s instead of ~10 s.
- **AI:** Posts that consist ONLY of an image now fully wait for the image recognition (previously "Not enough text to assess" after 4 s). Plus diagnostics
  in the service worker log: `[fedo:ai] vision x:123: 1 image(s), 83 words in image, synthetic 0.1 (1437 ms)` or `… no answer after … ms` / `… skipped, no fetchable image URL`.

**What you need to do:**
- `git pull --rebase origin main`, `npm run build`, ↻ in chrome://extensions **and then reload the X/TikTok tab** (otherwise "Analysis unavailable": the old
  content script no longer has a connection to the reloaded worker).
- **Check the popup: Analysis = Cloud.** In "Local" there is deliberately no image recognition and no Jev. After "Load unpacked" it is back on Local.
- **UI dev / Scraper dev: please take a look**, the changes in `scraper/video.ts` and `content.ts` came from the AI dev and can only be verified in the browser.

---

## 2026-09-21 · `ui/card-top5-apple` · UI · Top-right card open by default, top-5 bars on clean posts too, calmer look; dashboard follows suit

**What changed** (`ui/` only, pushed directly to `main` – Franz's decision, time pressure before the demo; **Noah, please take a look**):
- **The top-right card is expanded on its own.** Collapsing it (arrow at the top right) applies to all following posts until the page is reloaded (it is not saved).
- **Always a ranking of the five strongest techniques as bars** – also for "No strong signals", then small and grey (e.g. 2 %). "Show all 14" shows the rest.
  Below the threshold = grey and **still counts nowhere** (`visible()`, `bumpStats`, log counting, strip labels, slop cover unchanged; dashboard metrics identical).
- **"Not enough text to assess" deliberately shows NO bars** (contract: with `coverage: "insufficient"` never look clean).
- **Tapping a technique** expands what it means (`SIGNALS[key].description`) and the research line (`RESEARCH` from `contracts/signals.ts`, unused until now).
- **Look:** overall level as the title + one neutral overall bar + one sentence ("Persuasion techniques · 2 of 14 above 50%"), sans-serif for text, mono only for numbers,
  one collapse button instead of two, `local · 4 ms` small in the footer, card 340 px. Tags (Topic, text only, countdown, "Dimmed · Show") sit next to the author.
  Video progress, ETA, Calm mode, live timeline, slop cover, four themes: functionally unchanged.
- **`ui/log.ts`:** stores the ranked top 5 per post regardless of the score (previously: only ≥ 30 %) → the dashboard page shows the same bars. Old entries stay as they are.
- **Dashboard page:** same row look (rank, grey below 50 %), no dot-grid background, no corner brackets, less uppercase mono.
- **New: first UI tests** `ui/test/pin.test.ts` (10 tests, without DOM): `node --import tsx --test ui/test/*.test.ts`.

**What you need to do:**
- `git pull --rebase origin main`, `npm run build`, ↻ in chrome://extensions.
- **Noah:** in case you are working on `ui/index.ts` in parallel – `renderView()`/`panel()`/`row()` have been restructured (new parameter `ViewCtx`), the click wiring now lives in `wire()`.
  Your glue fix `94c294e` (do not recreate the overlay on settings changes) is not on `main` yet; without it the "collapsed" state is lost on every popup change.
- **AI dev:** nothing. Idea for later (purely additive): `overall.drivers` with the shares per technique, then the card can show exactly how the overall number adds up.

**Good to know:** On a completely clean post all values are at the minimum value → the five rows shown are then always the same first five (fixed order so that nothing jumps).
Contrasts of all new texts measured in all four themes (≥ 4.5:1), click targets ≥ 24 px; hover colours only calculated from the tokens, not measured with a real pointer.

---

## 2026-09-21 · `ai/faster-media` · AI + Scraper (X) · Images are now recognised reliably, image + speech-to-text ~2.5× faster

**What changed:**
- **Cause of "images are only recognised sometimes" (Scraper, `scraper/platforms/x.ts`):** X only inserts `<img>`/`<video>` once the medium has loaded,
  and the GraphQL replay for the first screen page arrives a moment AFTER the first scan. The post was read immediately → often `media: []` → the AI
  knew nothing about the image. Now: if a post visibly has a media container but neither a GraphQL record nor an element, it is re-checked for up to 2.5 s (every 250 ms)
  before `onItem` comes. Posts without media and posts with a GraphQL record are there immediately, unchanged.
- **Faster (measured, 3–4 runs each):** image 2.4–4.2 s → 0.9–1.9 s, speech-to-text 2.7 s → 1.1 s per 8-s piece. Model is now `google/gemini-3.1-flash-lite`
  (same OCR, same AI-image verdicts on the test images, same transcript). X photos are requested as the 680-px variant (`name=small`).
- More robust: one immediate second attempt on errors; a post waits at most 4 s (previously 6 s) for the image.
- Proven: the provider can load real `pbs.twimg.com` URLs (4 real X images tested).

**What you need to do:**
- `git pull --rebase origin main`; set `STT_MODEL=google/gemini-3.1-flash-lite` in `.env` (or delete the line → default); `npm run build`; ↻
- **Scraper dev (Franz): please take a quick look**, the change in `x.ts` came from the AI dev because it was blocking the image recognition. Can only be verified in the browser.

**Good to know:** If an image still does not come through, the service worker log says `[fedo:ai] vision failed → text only: …`. The post result is cached per post in the glue,
so an image that arrived too late is not delivered afterwards.

---

## 2026-09-21 · `ai/vision` · AI (+3 optional config fields) · Images are seen: text in the image, video still frame, signs of AI images

**What changed:**
- Until now everything in the image was invisible (Jev only reads text). Now `media[].url`, or for videos `posterUrl`, goes to a multimodal model
  (Gemini 2.5 Flash via OpenRouter, the same endpoint as speech-to-text). Scraper and glue did NOT have to be changed for this.
  - **Text in the image** (memes, overlaid headlines, screenshots) runs through the normal scoring incl. quotes. A meme with no post text at all is now scored.
  - **`synthetic_media`** is finally delivered: "visible signs of AI generation/editing", deliberately cautious (max. 90 %, `evidence` = the visible feature).
    Test: known Midjourney image 80 %, real press photo 10 %.
  - The result then has `source: "combined"`, for pure image posts `coverage: "full"`. The explanation has its own sentence for the image ("indication, not proof").
- Runs in parallel to the text analysis; a post waits at most 6 s for the image, otherwise the text result comes. Only in cloud mode, never in "local".
- **Outside of `ai/` (small, optional):** `AnalyzerConfig.visionApiUrl/Key/Model` in `contracts/modules.ts`, pass-through in `scripts/build.mjs`, template in `.env.example`.

**What you need to do:**
- `git pull --rebase origin main`, `npm run build`, ↻. No new `.env` line needed if `STT_API_URL` already points to `…/chat/completions`.
- **UI dev:** `synthetic_media` can now be ≥ 50 %; `evidence` there is not a quote from the post but the visible feature in the image → show it without quotation marks if needed.
  The "text only" tag disappears on image posts as soon as the image has been seen (`coverage: "full"`).

**Good to know:** For videos only ONE still frame (poster) is looked at, not the running picture. No deepfake forensics. In cloud mode image URLs go to OpenRouter/Google.

---

## 2026-09-21 · `ai/transcript-sources` · AI · Robust against two transcript sources at the same time (subtitles + STT)

**What changed** (`ai/` only, builds on `integrate/video-stt` #16):
- In the integrated state, TWO sources deliver text for the same video on TikTok: the scraper (subtitle file, possibly Whisper) via
  `onTranscript` and the audio recording (captureStream → Gemini) via `onAudio`. In the glue both end up in one list → everything duplicated,
  out of order in time, and on top of that the text is also in `item.captions`.
- `ai/transcript.ts` cleans up: if subtitle chunks are there, only they count (exact + free); sorted by time, duplicates removed;
  `item.captions` is then not counted a second time.
- Auto-subtitles without punctuation are grouped into readable units (otherwise: one endless sentence, empty timeline).
- Tests without network: `npx tsx ai/dev/test-transcript.ts`. Evals 15/15 local, 20/20 Jev.

**What you need to do:**
- `git pull --rebase origin main`, `npm run build`, ↻
- **Glue/Scraper (please coordinate, saves money + latency):** If subtitle chunks arrive for a video, `onAudio`→STT is no longer needed.
  Proposal: in the glue ignore `onAudio` as soon as `entry.transcript` has a chunk with `source: "captions"`. The AI copes with both,
  but currently every subtitled video is additionally transcribed at a cost.

**Good to know:** Regarding the AI alignment from #15: `political_content` remains the only "topic instead of technique" key (SEVERITY 0) → `TOPIC_KEYS` fits.

---

## 2026-09-21 · `main @ f68c853` · UI · `political_content` = topic instead of signal (alignment with AI), loading effects

**What changed:**
- **Alignment UI ↔ AI:** `ai/assess.ts` treats `political_content` as a *topic* (SEVERITY 0, not in `overall`, timeline, explanation).
  The UI showed it as a label and counted the post as "with signals" (4 of 24 eval posts). Now: a muted "political topic" tag,
  counts nowhere as a signal (row, top-right panel, per-post dashboard, dashboard page, popup readouts). List of topic keys: `TOPIC_KEYS` in `ui/theme.ts`.
- Otherwise everything fits: `overall` levels, `timeline`, `partial`, `source`, `COUNT_FROM 0.5` = UI threshold 0.5, every labelled result has `evidence`.
  Slop cover (≥ 85 %) triggered on 1/24 posts (Growth Guru, `possible_ai_slop` 96) – not oversensitive.
- **Loading effects:** skeleton pills + animated dots during the analysis, "Still analyzing · 4s" from 3 s, "Taking longer than usual" from 12 s,
  a creeping progress line when the API is slow, crossfade in the panel when the post changes, shimmer skeletons in dashboard + popup, "Updated" pulse in the dashboard.

**What you need to do:**
- `git pull --rebase origin main`, `npm run build`, ↻.
- **AI dev:** if further keys become "topic instead of technique" (SEVERITY 0), please say so briefly → update `TOPIC_KEYS` in `ui/theme.ts` accordingly.
  The explanation text ends with "…not whether the message is true…" – the UI additionally shows "Techniques, not opinions" below it; if that feels redundant, I'll drop the footnote, let me know.

**Good to know:** The UI's own check script (`npx tsx ui/dev/contract-coverage.ts`) must not import `ai/` (boundaries) – the alignment with real
AI results was run once locally; for larger AI changes please run `npm run dev:ai` and cross-check in the playground.

---

## 2026-09-21 · `main @ 35d0149` · UI · Fixed panel at the top right instead of a row under every post

**What changed:**
- **New default layout "Top right":** a fixed panel at the top right (`fedo-hud`, Shadow DOM) that, while scrolling, always shows the currently visible
  post – author, overall level, progress line while the AI is working, labels, "Details ›" (the per-post dashboard expands inside the panel),
  button **Dashboard ↗**. Nothing is shown in the feed itself any more. The alternative "Under post" (the row) remains: popup → "Show results".
- Visible post = `IntersectionObserver` over the anchor elements (`article`) that the scraper delivers; works on every site on which
  `onItem(item, anchor)` provides an anchor.

**What you need to do:**
- `git pull --rebase origin main`, `npm run build`, ↻ in chrome://extensions.
- **Felix (Glue, 1 entry in `extension/manifest.json`):**
  `"web_accessible_resources": [{ "resources": ["dashboard.html"], "matches": ["https://x.com/*", "https://twitter.com/*", "https://www.tiktok.com/*"] }]`
  – so that the dashboard button in the panel can open the page from the content script. Without the entry the button shows "Use the Fedo icon"
  (popup → Open dashboard always works).
- **Scraper dev:** `onItemRemoved(itemId)` is now more important: the panel only follows anchors that are still in the DOM.

**Good to know:** The playground (`npm run dev:ui`) has a layout dropdown for comparing.

---

## 2026-09-21 · `main @ ec9b14b` · UI (+2 lines of Glue) · Analysis dashboard, per-post log, contract alignment

**What changed:**
- **New extension page `dashboard.html`** (popup → "Open dashboard"): time windows Today / 7 days / All, readouts (analyzed, with signals,
  Heavy use, AI slop) with a 7-day sparkline, technique ranking + category distribution, sources with the most signals, post list with
  search, filters (platform / level / slop only), click filter on technique or source, expandable details, "Open post ↗", Export JSON, Reset.
- **`ui/log.ts`:** the overlay writes one entry per fully analyzed post to `chrome.storage.local` (`fedo.ui.log`, max. 500).
  Author/text are read **best effort from the `article` DOM** (X: `User-Name` / `tweetText`, TikTok: `data-e2e`), because `render()` does not receive a `FeedItem`.
- **Glue (2 lines, `scripts/build.mjs`):** copy `dashboard.html` + bundle `ui/dashboard/dashboard.ts` → `dist/dashboard.js`. Nothing else outside `ui/`.
- **Adaptability:** unknown signal groups render neutrally instead of breaking. `npx tsx ui/dev/contract-coverage.ts` checks the UI against
  `contracts/` (labels, groups, levels, fixtures, `OverlayRenderer`, messages) and lists which contract fields the UI does not read yet.
- The per-post panel now shows `source` (mock / jev / …) next to the latency – handy for live testing.

**What you need to do:**
- `git pull --rebase origin main`, `npm run build`, click ↻ in chrome://extensions, then scroll on x.com and click "Open dashboard" in the popup.
- **Felix, please test whether this works for you:** (1) `scripts/build.mjs` addition okay? (2) Does the dashboard run cleanly with real analyses
  (author/text correct from the DOM)? (3) **Contract proposal, purely additive:** `OverlayRenderer.render(itemId, anchor, state, item?: FeedItem)`
  as an optional 4th parameter – the glue has the `FeedItem` in hand in `onItem` anyway. Then author, text, `isRepost`, `createdAt`,
  `quotedText` in the dashboard are exact instead of guessed from the DOM. The UI runs with and without the parameter.
- **AI dev:** nothing to do; the dashboard uses `overall`, `signals[].evidence`, `explanation`, `timeline`, `source`.
- **Scraper dev:** keep calling `onItemRemoved(itemId)`; the log is unaffected by it (it only counts finished analyses).

**Good to know:** Outside the extension (opening the file directly) `dashboard.html` shows demo data – good for review, not real.
Post links into the dashboard are checked for `http(s)` (extension page = privileged).

---

## 2026-09-21 · `main @ ba4deab` · Scraper · TikTok reads item JSON + subtitles, local speech-to-text, transcript channel live

**What changed:**
- New MAIN-world script `scraper/main-world.ts` (manifest: second `content_scripts` entry with `"world": "MAIN"`,
  build: entry `dist/main-world.js`). It reads the TikTok item JSON and X GraphQL responses from fetch/XHR and passes them
  on to the scraper — the TikTok For You DOM carries no video ID, which is why this route is needed.
- TikTok adapter rewritten: real IDs (`tiktok:<id>`), author, text, hashtags, media, creation time, subtitles in `item.captions`.
  `onItem` comes **before** the video plays. `onItemRemoved` is called when TikTok recycles the article (UI dev's request).
- `sink.onTranscript` is running: platform subtitles (WebVTT) in step with playback, and for videos **without** subtitles local
  speech-to-text via `whisper-server` (no `chrome.tabCapture` needed — the open question from the `ai/live-video` entry).
  First chunk ~1 s after video start, one job at a time, aborted when scrolling on.
- X: GraphQL/syndication mapper with cache (fixture-tested), DOM path unchanged. Not yet verified live while logged in.
- Tests: `npm run test:scraper` (17 tests, node:test + tsx, no new dependency).
  Docs: `scraper/RESEARCH.md` (measurements, data routes per field, coverage table, open points).

**What you need to do:**
- `git pull --rebase origin main`, `npm run build` + click ↻ in chrome://extensions (the manifest has changed → really reload the extension)
- For video transcripts without subtitles: `bash scraper/companion/whisper-server.sh` in a separate terminal
  (needs `brew install whisper-cpp` + model, hints are in the script). Without the server there are transcripts only for videos with subtitles.

**Good to know:**
- **AI dev:** For videos with subtitles the text arrives in `item.captions` AND as `onTranscript` chunks (RESEARCH.md §10).
  Recommendation: for `kind: "transcript"` leave out the `captions` field in the state if `transcript[0].source === "captions"`.
- **Team:** Proposal for the next contract extension (its own small PR): four optional fields `language`, `stats`,
  `stickerTexts`, `communityNote` (types in RESEARCH.md §9.2).
- **Glue (`extension/src/background.ts`):** caches `kind: "post"` per `item.id`, a second `onItem` with more data gets
  swallowed. Proposal: discard the cache entry if a second `onItem` with the same ID brings longer text.
- Open: check X live while logged in (probe in `scraper/research/console-probes/`), real extension on tiktok.com —
  if the console shows an error with `127.0.0.1`, the fallback route from RESEARCH.md §12 applies.

---

## 2026-09-21 · `ai/irony-and-memes` · AI · Irony, satire and memes are recognised

**What changed:**
- Tested on 183 further real posts (The Onion, Postillon, dril, meme/satire/rant hashtags). Problem: Jev read everything literally
  ("like an insane animal" → Dehumanizing, satire headlines → Sensationalism).
- Now three context questions in the same request (no extra latency): Humor? Sarcasm? A real group as the target?
  - Humor without a real target group → signals dampened (Onion, Postillon, cat memes end up at `none`).
  - Humor at the expense of a real group → NOT dampened, but at most `medium`. "It was just a joke" hate speech is not recognised as humor by Jev in the first place → stays `high`.
  - Sarcasm → scores stay (it is still persuasion), the explanation starts with "The author uses sarcasm…".
- Result on the humor sample: none 89 → 121, medium 23 → 14. News sample without regression. Evals 15/15 local, 20/20 Jev.

**What you need to do:**
- `git pull --rebase origin main`, `npm run build`, ↻
- **UI dev:** `explanation` can now start with a tone hint ("This reads as humor or satire…") → clearly visible in the "Why?" panel.

**Good to know:** Tone recognition only exists in Jev mode. The local fallback engine keeps reading literally.

---

## 2026-09-21 · `main @ e6fc253` · UI · Design system, four themes, slop cover, live tracker, dashboard popup

**What changed:**
- **In the feed only one calm row per post now** (28 px, no box): `LIVE · up to 3 labels with category dot · +N · Details ›`.
  Above it a 2-px progress line that fills while the AI is working. Clicking the row opens the per-post dashboard
  (explanation, `overall`, meters with evidence, for videos the `timeline` as a log with timestamps).
- **Colour = category** (political violet · rhetoric orange · credibility amber · synthetic teal, from `SIGNALS[key].group`),
  **never "bad"**. Red exists only for LIVE and the pending dot.
- **Four themes:** light / dark (automatically follows the host) + one colour-blind-safe variant each (Okabe-Ito + shape symbols ◆ ▲ ● ■).
- **AI slop cover:** `possible_ai_slop` or `synthetic_media` ≥ 85 % → full-width cover over the post, dismissible via ×.
- **Popup = dashboard:** on/off, readout (analyzed / with signals / distribution by group), Appearance (System · Light · Dark),
  colour-blind switch, slop cover switch, sensitivity, "Open x.com". Settings apply **immediately**, no feed reload.
- New files in `ui/`: `theme.ts` (tokens), `prefs.ts` (UI-owned prefs + counters in `chrome.storage.local` under `fedo.ui.*`).
- **No contract, no glue changed.** Design system (tokens, previews, guidelines): https://claude.ai/artifact/3yqsB8zBs3oKGnTpt4y11Y

**What you need to do:**
- `git pull --rebase origin main`, `npm run build`, click ↻ in chrome://extensions
- **AI dev:** `evidence` per signal, `explanation` and `timeline` are what make the dashboard and the live log good – please keep filling them.
  `possible_ai_slop` ≥ 0.85 now triggers the cover: please only score that high in really clear cases.
- **Scraper dev:** the anchor (`article`) gets `position: relative` if it is `static` (for the cover). Please call `onItemRemoved`
  so that overlay + cover disappear together with the post.

**Good to know:** `npm run dev:ui` now has a theme dropdown, threshold slider, live simulation and a slop test post.
The cover is on by default (popup → "Cover AI slop posts").

---

## 2026-09-21 · `ai/video-integration` · AI · Video pipeline (captureStream → STT → analysis) adapted + tested on the AI side

**What changed** (`ai/` only, builds on `video-stt`):
- Tested end to end in Node (`npx tsx ai/dev/run-stt.ts <wav> --jev`): STT ~1.3 s per 8-s piece (Gemini 2.5 Flash via OpenRouter),
  word-accurate; music/noise → empty transcript, nothing made up. After that Jev ~0.5 s → the display is approx. 10 s behind the video.
- Sentences that get cut apart at the 8-s audio boundaries ("… Not us. The" | "newcomers get …") are put back together by `ai/transcript.ts`.
- Jev scores every finished spoken sentence individually (cached per video → every sentence costs exactly once):
  `timeline` and quotes thus also work with natural speech, not only with lexicon hits.
- `ai/` now sets `coverage` itself (the fallback in `background.ts` then no longer applies) and reports `source: "local"` for the offline engine.
- `ai/` is up to date with `main` (tone recognition for satire/irony from #11).

**What you need to do:**
- In `.env`: `STT_API_URL=https://openrouter.ai/api/v1/chat/completions`, `STT_API_KEY=<OpenRouter-Key>`, `STT_MODEL=google/gemini-2.5-flash` → `npm run build` → ↻
- **Switch to "cloud" in the popup**, otherwise only the local engine runs (`DEFAULT_SETTINGS.mode` is `"local"`). Important for the demo!
- **Glue (UI dev):** the post cache in `background.ts` must not cache `kind: "draft"` (same id, text changes while typing) → add `input.item.kind !== "draft"` to the cache condition.

**Good to know:** In cloud mode video AUDIO goes to OpenRouter/Google and text to TypeSafe. The key is inside `dist/` → never pass `dist/` on.

---

## 2026-09-21 · Branch `video-stt` · Scraper + AI + Glue + UI · Videos are really listened to (speech → text → analysis, with progress and countdown)

**What changed:**
- `scraper/video.ts` (new, wired into `createScraper` for X and TikTok): The running, visible video is
  listened to via `video.captureStream()` — no tab capture, no extra permission, no microphone. Every 8 s
  a piece goes to `sink.onAudio()` as 16-kHz mono WAV. Silent pieces are discarded locally (nothing sent);
  max. 180 s per video.
- `ai/stt.ts` (new): `createTranscriber(config)` — two kinds of endpoint, detected by URL:
  Whisper-like (`…/audio/transcriptions`, exact timestamps) or OpenAI-compatible chat with `input_audio`
  (e.g. OpenRouter + `google/gemini-2.5-flash`). Delivers text + sentences with start time.
- `extension/src/background.ts`: message `fedo/transcribe`. `scripts/build.mjs`: `STT_API_URL`, `STT_API_KEY`,
  `STT_MODEL` from `.env` (template in `.env.example`); `host_permissions` contains the STT origin.
- `extension/src/content.ts`: audio → STT → `TranscriptChunk`s (`source: "stt"`) → the existing
  transcript pipeline (`withLiveVideo`, timeline, LIVE badge). Maintains `VideoProgress` (seconds heard,
  total length, ETA) and closes the transcript when the video ends.
- `contracts/` (optional only): `AudioChunk`, `TranscriptionResult`, `VideoProgress`, `Transcriber`,
  `ScraperSink.onAudio?`, `AnalyzerConfig.sttApiUrl/sttApiKey/sttModel`, `OverlayState.progress?`,
  message `fedo/transcribe`.
- `ui/index.ts`: progress bar under the chip bar ("🎧 0:16 of 0:45 analyzed · full analysis in 34 s",
  ticks every second), "Full video analyzed" at the end, "Unmute the video to analyze the speech" for a muted player,
  timeline "In the video" in the Why panel (renders `result.timeline` from PR #4/#5).
- Playground: "Simulate live video" now shows progress, countdown and timeline.

**What you need to do:**
- `git pull --rebase origin main`, enter in `.env` (the AI dev has the OpenRouter key):
  `STT_API_URL=https://openrouter.ai/api/v1/chat/completions`, `STT_API_KEY=sk-or-…`,
  `STT_MODEL=google/gemini-2.5-flash` → `npm run build` → ↻ in chrome://extensions → play a video on X **with sound**.
- **AI dev:** please do a real run against OpenRouter — the keys on the machine this was built on
  were dead (401). The client has been checked against a replica of both API formats (multipart + auth, `input_audio` wav,
  timestamps), not against the real provider.

**Good to know:** Verified in Chromium: an 11-s speech recording in a `<video>` yields two WAV pieces
(0.0–7.9 s and 7.9–11.4 s, 16 kHz mono, −15.6 dB, `ended` correct). Without `STT_API_URL` nothing new happens —
videos are then scored only via text/caption as before. Muted players deliver no audio in Chrome
→ the bar says so honestly instead of showing "clean".

---

## 2026-09-21 · `ai/real-feed-tuning` · AI · Tested on 168 real posts and sharpened

**What changed:**
- Jev now additionally scores every sentence individually (in parallel, no extra latency): the sentence with the highest score becomes the
  `evidence` quote. Hits without a quote: previously ~85 %, now ~10 %. Signals that are not found in any sentence are dampened.
- Fewer false alarms: hashtag-only posts, stock tickers, neutral news reports. Distribution on a real feed:
  61 % none, 27 % low, 11 % medium, 1 % high. Latency p50 ~0.4 s.
- `evidence` can now be a whole sentence (max. 90 characters, with "…"), no longer just 2–4 words.

**What you need to do:**
- `git pull --rebase origin main`, `npm run build`, ↻
- **UI dev:** (1) `evidence` needs room for ~90 characters / line wrapping. (2) For heavily charged posts 5–8 signals ≥ 50 % arrive.
  Recommendation: the 3–4 strongest as chips, the rest behind "+n". Several signals can have the same quote → show it only once.
  (3) `result.timeline` + `result.overall` come ready-made from the AI, they do not have to be rebuilt from score jumps.

---

## 2026-09-21 · Branch `feed-diet` · Contracts + Glue + UI · Feed diet dashboard, live settings, coverage

**What changed:**
- `contracts/` (everything optional, nothing breaking): `Settings.mode` ("local"/"cloud") + `Settings.calmMode`,
  `AnalysisResult.coverage` ("full"/"text_only"/"insufficient"), `source: "local"` in addition to "mock",
  `FeedItem.kind` ("post"/"draft" for the compose mirror), `ExposureRecord`/`FeedStats`/`StatsWindow`,
  messages `fedo/getStats`, `fedo/getRecords`, `fedo/clearStats`, `RESEARCH` + `SIGNAL_GROUPS` in `signals.ts`.
- `extension/src/background.ts`: writes one record per analyzed post to `chrome.storage.local`
  (deduplicated by item ID, never drafts), aggregates statistics per time window, sets the badge counter
  (high intensity in this session), picks the analyzer according to `Settings.mode`, sets `coverage` as a fallback.
- `extension/src/content.ts`: popup changes apply immediately (no tab reload), sequence guard for
  transcript responses (old responses no longer overwrite new ones).
- `ui/popup/`: the dashboard — time windows, metrics, donut by level, top techniques, top sources,
  presets instead of a slider, Calm Mode, local/cloud, export, reset.
- `ui/index.ts`: overall level badge, coverage states (no green tick without text), Calm Mode dims
  (never hides, "Show post"), research line in the Why panel.
- `scripts/build.mjs`: `host_permissions` now only the Jev origin (instead of `https://*/*`).
- `npm run check` now also runs `npm run eval` (10 regression cases). `DEMO.md` new.

**What you need to do:**
- `git pull --rebase origin main` (after `feed-diet` has been merged), `npm run build`, click ↻ in chrome://extensions.
- **AI dev:** set `source: "local"` instead of "mock" and fill `coverage` in `analyzeLocally` (then the
  fallback in the glue gets removed). Do not treat `kind: "draft"` differently in the analysis, the glue just does not log drafts.
- **Scraper dev:** deliver the compose box (`[data-testid="tweetTextarea_0"]`) as a `FeedItem` with `kind: "draft"`, if there is time.

**Good to know:** Verified in Chromium with the extension loaded: 10 posts → 10 records, a duplicate analysis
counts once, badge = number of "high". Old results without `overall` get a derived level.

---

## 2026-09-21 · `ai/live-video` · AI · Live video: throttled analysis + timeline

**What changed:**
- Transcript updates are bundled per video in `ai/`: max. 1 request at a time / every 750 ms, always only the newest
  transcript. The glue may keep calling `analyze` on EVERY chunk, results never arrive in the wrong order.
- Every video result has `timeline` (see the contract entry) and `partial` (`true` as long as the last chunk is not final).

**What you need to do:**
- `git pull --rebase origin main`, `npm run build`, ↻
- **Scraper dev:** deliver `sink.onTranscript({ itemId, text, isFinal, t, source })`, per finished sentence `isFinal: true`,
  `t` = seconds since video start. Interim chunks (`isFinal: false`) are allowed and cheap. This is what it looks like: `npx tsx ai/dev/run-live.ts`
- **UI dev:** `result.timeline` + `result.partial` for the live view.

**Good to know:** Speech-to-text for videos WITHOUT subtitles is still open. That needs tab audio (`chrome.tabCapture`)
and therefore belongs in glue/scraper, not in `ai/`. With TikTok captions the live path already works completely.

---

## 2026-09-21 · `contracts/timeline` · Contracts (AI → UI) · New optional field `AnalysisResult.timeline` for videos

**What changed:**
- `contracts/types.ts`: `AnalysisResult.timeline?: TimelineEvent[]` with `{ t, key, score, evidence? }`
  = detected techniques in the spoken text with timestamp (seconds), chronological. Grows while the video is playing.
- `contracts/fixtures.ts`: the result for `tiktok:2001` has an example timeline.

**What you need to do:**
- `git pull --rebase origin main`
- **UI dev:** usable for the live video view ("00:04 ⚠ Fear framing"): format `SIGNALS[event.key].label` + `event.t`.
  The field is optional → show nothing for posts and for `undefined`.
- Scraper dev: set `TranscriptChunk.t` (seconds since video start) cleanly, the timestamps are derived from it.

**Good to know:** No breaking change (the field is optional).

---

## 2026-09-21 · `ai/llm-openrouter` · AI · Real analysis with Jev (TypeSafe) via OpenRouter

**What changed:**
- `ai/jev.ts` now talks to the real Jev API (OpenRouter Decisions API): one yes/no question per signal → probability.
  ~0.3–1 s per post. Jev scores are fused with the local engine (fewer false alarms), evidence quotes come locally.
- Error, timeout or empty credit → automatically the result of the local engine (`source: "mock"`), never an error in the feed.
- Alternative: any chat model, if `JEV_API_URL` ends in `/chat/completions` (`ai/llm.ts`).

**What you need to do:**
- `git pull --rebase origin main`
- For real analysis in `.env` (never commit!): `FEDO_ANALYZER=jev`, `JEV_API_URL=https://openrouter.ai/api/alpha/decisions`,
  `JEV_API_KEY=<OpenRouter-Key, ask the AI dev>` → `npm run build` → click ↻ in chrome://extensions
- Without `.env` everything runs as before with the local engine.

**Good to know:** The key is embedded into `dist/background.js` at build time → never pass on or commit `dist/`
(it is in `.gitignore`). In Jev mode post texts go to OpenRouter/TypeSafe.

---

## 2026-09-21 · `ai/local-engine` · AI · Local scoring engine replaces the keyword heuristic

**What changed:**
- `ai/` now scores posts with a real local engine (EN + DE): weighted phrasings per signal,
  style features, context rules, `evidence` quote per signal, `explanation` and `overall` (overall level).
- Mode `mock` = this engine (offline, no API key). Mode `jev` uses it for evidence and as a fallback on API errors.
- `callJev()` is still a skeleton (the TypeSafe format is still missing).

**What you need to do:**
- `git pull --rebase origin main`, `npm run build`, click ↻ in chrome://extensions
- Seen a wrongly scored post? Send the text to the AI dev → it becomes a test case in `ai/dev/cases.ts`.

**Good to know:** Results still have `source: "mock"`, but are no longer placeholders.
The simulated latency is gone → `pending` is only visible very briefly in the real feed.

---

## 2026-09-21 · `contracts/overall-intensity` · Contracts (AI → UI) · New optional field `AnalysisResult.overall`

**What changed:**
- `contracts/types.ts`: `AnalysisResult.overall?: { level: "none" | "low" | "medium" | "high"; score: number }`
  = all signals summarised into ONE level per post (types `IntensityLevel`, `OverallIntensity`).
- `contracts/fixtures.ts`: all `FIXTURE_RESULTS` have example values for `overall`.

**What you need to do:**
- `git pull --rebase origin main`
- **UI dev:** display `result.overall` as a badge per post (e.g. colour by `level`). The field is
  optional → for `undefined` simply show no badge. In the playground the values are already there via the fixtures.
- Scraper dev: nothing.

**Good to know:** No breaking change (the field is optional). Wording: the level describes how strongly
persuasion TECHNIQUES are used, not whether something is true or "dangerous". `political_content` alone always yields `none`.

---

## 2026-09-21 · `main @ e9a7de5` · All paths · Scaffolding is in place (v0.1.0)

The project is set up. All three paths can work **in parallel and independently** of each other
**from now on** — nobody has to wait for anybody.

**What's in it:**
- `contracts/` — the shared interface: types, the three interfaces (`Scraper`,
  `Analyzer`, `OverlayRenderer`), signal definitions, fixtures, messaging.
- `scraper/` — X already works (`article[data-testid="tweet"]` + MutationObserver).
  TikTok selectors are **best effort** and have to be verified in DevTools.
- `ai/` — currently runs on the **mock analyzer** (keyword heuristic). `jev.ts` is a
  **skeleton**: only `callJev()` has to be adapted to the real TypeSafe Jev API.
- `ui/` — overlay in the Shadow DOM (`pending` / `done` / `error`), popup, playground fake feed.
- `extension/src/` — the glue that wires everything together. Deliberately stays thin.
- CI + `npm run check` (typecheck + boundaries + build) as a gate before every push.
- Docs: `README.md` (overview), `START_HERE.md` (complete onboarding).

**What you need to do:**
```bash
git pull --rebase origin main
npm install        # needed the first time
npm run build      # → dist/, then "Load unpacked" in chrome://extensions
```

**Good to know:**
- The analysis is still a **mock**, not real. Results are placeholders, but in the right format.
- Please **do not change `contracts/` on your own** — propose it, the human coordinates it with the team.
  Exception: adding new fixtures in `fixtures.ts` is okay without coordination.
- Only work in the folder of your role. Otherwise `npm run check:boundaries` fails.

**Next open points** are listed per role in `START_HERE.md`, section 8.

---

<!--
Template for the next entry — insert at the top, directly below the rules:

## YYYY-MM-DD · `main @ <hash>` · <Scraper|AI|UI|Glue> · <title in one sentence>

**What changed:**
- ...

**What you need to do:**
- `git pull --rebase origin main`
- (only if package.json was affected: `npm install`)
- `npm run build` + click ↻ in chrome://extensions

**Good to know:** (breaking changes, new contracts, pitfalls — otherwise leave out)
-->
