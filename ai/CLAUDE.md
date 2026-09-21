# AI dev (Path 2)
Task: `AnalysisInput` → `AnalysisResult` (scores 0..1 per signal from contracts/signals.ts).
- Interface: `Analyzer` in contracts/modules.ts
- **No `chrome.*` and no `document`** here, everything must run in Node
- Testing: `npm run dev:ai` (mock) or `npm run dev:ai -- --jev` (real API, needs `.env`)
- Open items: more real-feed calibration (German, TikTok), video frames instead of just a still image for `synthetic_media`
- Wording: describe techniques, never judge opinions or intentions

## Structure (status: local engine)
- `state.ts`: raw data → weighted text segments (`buildSegments`) or text state for Jev (`buildState`)
- `lexicon.ts`: **declaration** – which phrasing (EN+DE) counts for which signal, with weight
- `engine.ts`: scoring (cue hits × source weight → noisy-OR → context rules) + evidence quote
- `assess.ts`: `SEVERITY` per signal → overall intensity `none|low|medium|high`
- `explain.ts`: neutral "Why am I seeing this?" text
- `mock.ts`: offline analyzer = local engine
- `jev.ts` + `questions.ts`: Jev via the OpenRouter **Decisions API** (`JEV_API_URL=https://openrouter.ai/api/alpha/decisions`), one Noul question per signal → probability. Evidence comes locally, error/timeout → local engine
- `live.ts` + `timeline.ts`: live video. Wrapper around any analyzer: per video max. 1 request at a time and every 750 ms, only the newest transcript is analyzed (nothing runs backwards), plus `timeline` (scored locally sentence by sentence, with timestamp). Simulator: `npx tsx ai/dev/run-live.ts [--jev]`
- Testing real posts: `npx tsx ai/dev/fetch-live.ts /tmp/live.json` (Bluesky + Mastodon, without login; do NOT commit the file), then `npx tsx ai/dev/run-live-sample.ts /tmp/live.json [--jev]`
- Jev additionally scores every sentence individually (in parallel): provides the evidence quote and dampens signals that cannot be localized in any sentence
- `tone.ts`: irony/satire/memes. Jev answers three context questions in the same request (humor? sarcasm? real group as target?). Playful humor without a real target group → signals dampened; humor AGAINST a group → not dampened, max. `medium`; sarcasm → only named in the explanation. Only in Jev mode, the local engine cannot read tone
- Video with sound: `stt.ts` (speech-to-text, called by the glue via `fedo/transcribe`) → glue builds `TranscriptChunk`s → `live.ts`. `transcript.ts` cleans up the transcript: with subtitles AND STT for the same video only the subtitles count (sorted, without duplicates), chopped-up STT sentences and punctuation-free subtitle snippets are assembled into sentences. Tests: `npx tsx ai/dev/test-transcript.ts`. In Jev mode every finished sentence is scored individually (cached per video) → quotes + `timeline`. End-to-end in Node: `npx tsx ai/dev/run-stt.ts <16kHz.wav> [--jev]` (test file: `say -o /tmp/s.wav --data-format=LEI16@16000 "text"`)
- `coverage.ts`: sets `result.coverage` (`insufficient` < 4 real words, `text_only` for unseen media) for all analyzers. Local engine reports `source: "local"`
- Images: `vision.ts` sends `media[].url` (images) or `posterUrl` (video still image) to a multimodal chat model (own `VISION_*` config, otherwise STT endpoint + key; model default `gemini-3.1-flash-lite`, ~1 s). Returns text in the image, a neutral description and a capped "signs of AI generation". `with-vision.ts` attaches this to every API analyzer: image text runs through the normal text scoring (all-caps memes are normalized), `synthetic_media` is set, `source: "combined"`, max. 4 s wait time, 1 retry. Never in offline mode. Test: `npx tsx ai/dev/run-vision.ts <image|https-url> [--text "..."]`
- Regression tests: `npx tsx ai/dev/eval.ts` (cases in `ai/dev/cases.ts`). Wrongly scored post → add a case, then adjust the lexicon
- `llm.ts`: alternative with any chat model. Active when `JEV_API_URL` ends in `/chat/completions`
  (switch model: append `...#google/gemini-2.5-flash` to the URL). Error/timeout → local engine.
