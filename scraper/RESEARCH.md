# Scraper workstream: research, measurements, architecture, prototype

As of **2026-09-21**. Everything in this file was measured or built in one session with Playwright on the real
sites; where something was estimated, adopted from elsewhere or could not be checked, it says so. This file is
the memory of the scraper workstream: whoever continues after me should find the line of thought here, not just
the result. `DOKUMENTATION.md` in the project root was the first test before this; this file replaces its
assumptions with measurements.

---

## 0. How to read this file

- **Short:** section 1 (one page).
- **As the scraper dev:** sections 4–5 (data paths), 7 (architecture), 9 (coverage table), 13 (code), 15 (verification).
- **As the AI dev:** section 9 (which fields arrive how reliably), 10 (transcript channel, duplication question), 9.2 (additional fields).
- **As a human who reads nothing but results:** section 15 says what to type and what you must see.

Terms: *Isolated world* = the JavaScript world in which a Chrome content script runs (sees the DOM, not the
page's variables). *MAIN world* = the world of the page itself. *Bridge* = our message channel between the two
(`scraper/bridge.ts`). *Item* = TikTok's JSON object for a video. *Tweet entity* = X's JSON object for a post.

---

## 1. Summary

1. **TikTok delivers all metadata seconds before the video.** The page loads eight items at once via `fetch`
   (`/api/recommend/item_list/`, 165–223 KB), each with ID, full description, structured hashtags and
   mentions, author (handle, display name, verified), counters (likes, comments, shares, views, saves), music,
   creation time, language, ad flag, AI label, text stickers and, where present, a
   **WebVTT subtitle URL**. The DOM of the For You feed, by contrast, contains **no video ID** and no
   `video-author-uniqueid`; the old selectors in `tiktok.ts` matched nothing.
2. **That is why the scraper needs a MAIN-world script.** A content script sees neither the network responses
   nor the React state (measured: in an isolated world there are 0 `__reactFiber$*` keys, `fetch` is native).
   This is a change to `extension/manifest.json` (a second `content_scripts` entry with
   `"world": "MAIN"`) and to `scripts/build.mjs` (one bundle entry). Both are done and listed below.
3. **With the MAIN-world script, `onItem` arrives before the video:** in the integration run, `onItem` for the first
   video was in the same frame as the `play` event (0–1 ms) and for all further ones **1.0–3.6 s before it** (the
   article is filled before the user reaches it). All 12 items of the third run had real IDs,
   `createdAt` and display name; 3 already carried the full subtitle text in `FeedItem.captions`.
4. **Subtitles exist, but rarely:** 5 of 33 feed videos had a track (`video.claInfo.captionInfos`,
   all auto-generated, original language). The VTT file can be fetched from the page context (200, CORS
   allowed, 5–300 ms). Where it is missing, speech-to-text is needed.
5. **Local STT is fast enough:** whisper.cpp `large-v3-turbo` with Metal on the M4 processes 10 s of audio
   in 0.8–1.3 s; the MP4 can be loaded from the page context (392 KB in 172 ms, 2.9 MB in 324 ms), the browser
   decodes it itself (52 ms) and sends WAV windows to `whisper-server` (CORS `*`). In the integration run the
   **first STT chunk arrived 840–1,413 ms after `play`**. No chunk reached the sink for a video that had been left.
6. **Comments cost one call without a signature:** `/api/comment/list/?aid=1988&aweme_id=<id>&count=20&cursor=0`
   from the page context → 200, 15–18 comments (sorted by popularity, likes, reply count, language),
   ~380–430 ms. Replies likewise. **Not** built into the prototype (no `FeedItem` field, section 9.2).
7. **X could only be observed partially.** The test profile is logged out; `x.com/home` and permalinks
   return a static page without `data-testid` and without GraphQL calls. What is built and tested is the
   mapper for the GraphQL tweet entity (shape from public type definitions, **fixture synthetic**) and a
   mapper for the public syndication API (checked live). The DOM path remains that of the scaffold
   (verified by the scaffold, not re-verified here). A DevTools probe for the logged-in feed is included.
8. **Existing interface unchanged.** `contracts/` has not been touched. `onTranscript` is now really
   served (captions paced, STT progressive), `onItemRemoved` likewise (TikTok recycles articles).
9. **Proof:** `npm run check` green, `npm run test:scraper` 15/15 green, three Playwright integration runs on
   tiktok.com (section 14).

---

## 2. Starting point and what became of it

| Before (scaffold + DOKUMENTATION.md) | After |
|---|---|
| TikTok: `data-e2e="video-author-uniqueid"` and `a[href*="/video/"]` — do not match in the FYP (measured: `handle` and `href` undefined) | Item JSON via the bridge, ID via DOM attribute from the React state; DOM fallback via `a[href^="/@"]` + text |
| Assumption "TikTok subtitles first, otherwise Deepgram" (cloud, tab audio, offscreen document) | VTT URL from the item JSON (no guessing in the DOM), STT locally without tab capture: load the MP4, decode it in the browser |
| `onTranscript` only as a stub idea | Implemented: captions in step with playback, STT in 10-s windows, one job, abort on switch |
| X via DOM, GraphQL as "optional" | GraphQL mapper + syndication mapper tested; DOM path remains the fallback; live verification while logged in is open |
| No tests | 15 tests against real (sanitised) and synthetic payloads, `npm run test:scraper` |

---

## 3. Method and limits

- Tooling: Playwright MCP (Chromium 153), **logged out**, `tiktok.com/foryou`, `x.com`; Apple M4, 16 GB.
- Times inside the page with `performance.now()`, outside with `Date.now()` (same clock, same machine).
- For every load-bearing number there are two differently built derivations (section 17).
- **Not observable:** the logged-in X feed (DOM and GraphQL), TikTok logged in (more subtitles? unknown),
  video CORS of `video.twimg.com`, behaviour over hours (rate limits, session expiry).
- The integration run simulates the extension: `main-world.js` in the page world, the scraper in an
  isolated world (CDP). One difference remains: a CDP isolated world is subject to the page CSP, a real
  content script is not — that is why the test ran with `bypassCSP` (section 12, CSP/LNA).

---

## 4. TikTok: data paths per piece of information

### 4.1 Overview

| Information | Path 1 (recommended) | Path 2 | Path 3 | Observed latency | Stability |
|---|---|---|---|---|---|
| Video ID | Item JSON (`id`), via the bridge; the ID ends up as `data-fedo-tiktok-id` on the article | React state (fiber, depth 2, hook 10, `ref.current.value`) | — **not present** in the DOM; fallback: hash of handle+text | before the video | high (API shape for years), medium (fiber) |
| Description / text | `contents[].desc` (full) or `desc` | DOM `[data-e2e="video-desc"]` (innerText, spans → normalise line breaks) | — | before the video / 0.3 ms | high / high |
| Hashtags | `textExtra[].hashtagName` (structured, exact) | `challenges[].title` | regex over the text | before the video | high |
| Mentions | `textExtra[].userUniqueId` | regex `@…` | — | before the video | high |
| Handle | `author.uniqueId` (API) or `author` (string, React state) | DOM `a[href^="/@"]` | — | before the video / 0.3 ms | high |
| Display name | `author.nickname` or `nickname` | — (not visible in the FYP DOM) | — | before the video | high |
| verified | `author.verified` (API shape only) | — | — | before the video | medium (missing in the state shape) |
| Post URL | `https://www.tiktok.com/@<handle>/video/<id>` from ID+handle | `a[href*="/video/"]` (profile/detail pages only) | — | before the video | high |
| Creation time | `createTime` (epoch seconds) | — | — | before the video | high |
| Likes / comments / shares / views / saves | `stats` (numbers) or `statsV2` (strings) | DOM `[data-e2e="like-count"]` etc. (formatted "48.9K") | — | before the video | high / medium |
| Sound | `music.title`, `music.authorName`, `music.original` | DOM `[data-e2e="video-music"]` (was empty) | — | before the video | high |
| Language | `textLanguage` (`en`, `de`, `un`…) | `claInfo.originalLanguageInfo.languageCode` | — | before the video | high |
| Subtitles | `video.claInfo.captionInfos[].url` (WebVTT) | `video.subtitleInfos[].Url` (legacy, identical cases) | DOM `DivCaptionContainer` — **stays empty** (h=0), even when a track exists | 5–300 ms for the file | high, coverage 5/33 |
| Video file | `video.playAddr` (MP4, h264 ~350 kbps) | `video.downloadAddr` | `<video>.currentSrc` is `blob:` (MSE, **not** loadable) | 172 ms/392 KB, 324 ms/2.9 MB | high (from the page context; from outside 403) |
| Comments | `/api/comment/list/` without signature | comment panel (logged in only) | — | 380–430 ms per 15–18 | medium (unsigned could be switched off) |
| Ad / AI label | `isAd`, `AIGCDescription`, `ShowAIGC` | DOM `[data-e2e="sponsored-tag"]` | — | before the video | high |
| Text stickers | `stickersOnItem[].stickerText[]` | — | — | before the video | medium (rarely filled: 3/33) |
| Image posts | `imagePost.images[].imageURL.urlList[0]`, `imagePost.title` | — | — | — | 0/33 in the FYP sample, shape known |

### 4.2 The item JSON (network)

Measured on `/foryou`: first response ~2.0 s after navigation start (2 items, 68 KB), then `/api/preload/item_list/`
and further `/api/recommend/item_list/` with 7–8 items (165–223 KB) — **each seconds before the user reaches the
videos**. Retrieved via `fetch` (not XHR). The request URL carries signatures (`X-Bogus`, `msToken`,
`X-Gnarly`) — calling it yourself does not work (`/api/item/detail/` without signature → 200 with empty body), listening in does.

TikTok's own SDK already wraps `window.fetch` and `XMLHttpRequest.prototype.open` (both no longer native).
A wrapper that is installed **afterwards** still sees all further `item_list` responses (measured: after
a late patch 8 items came through), because the app calls `window.fetch` at runtime. At
`document_start` we are first anyway.

Complete field list of an item (excerpt, sample in `scraper/test/fixtures/tiktok-capture.json`):
`id, desc, contents[], textExtra[], challenges[], createTime, textLanguage, isAd, AIGCDescription, ShowAIGC,
CategoryType, author{uniqueId,nickname,verified,signature,…}, stats{diggCount,commentCount,shareCount,playCount,
collectCount}, statsV2{…,repostCount}, music{title,authorName,original,duration}, video{playAddr,downloadAddr,cover,
duration,bitrateInfo[],claInfo{captionInfos[],originalLanguageInfo,noCaptionReason,hasOriginalAudio},
subtitleInfos[]}, stickersOnItem[], imagePost?, poi?, anchors?, contentContext, diversificationId, itemCommentStatus`.

### 4.3 React state (fiber)

`__reactFiber$…` hangs on the `<article>`. Two levels above it, a `useRef` holds the item (`ref.current.value`,
hook index 10; the search costs ~0.1 ms). **Caution, second shape:** this object carries `author` as a **string**
(handle) and `nickname`, `authorId`, `avatarThumb` directly on the item; `verified` is missing. The mapper knows both shapes
(test "React-state shape"). The MAIN-world script uses this path to give every article its ID as a DOM
attribute — DOM attributes are visible in both worlds. Fragile: hook order and depth can change with every
TikTok deploy; that is why the network is the primary path and the fiber is only the mapping article → ID.

### 4.4 Hydration script

`#__UNIVERSAL_DATA_FOR_REHYDRATION__` (258 KB, readable from the isolated world) contains **no items** on `/foryou`
(`webapp.app-context`, `biz-context`, `i18n`, `seo.abtest`, `a-b`). On directly loaded video pages it carries
`webapp.video-detail`; after SPA navigation it no longer does (measured: detail page via click → scope unchanged).
No `SIGI_STATE` any more. Conclusion: only usable for the initial load of a video page, not for the feed.

### 4.5 DOM

`data-e2e` in the FYP article (measured): `feed-video, video-desc, desc-span-*, search-common-link, sponsored-tag,
video-author-avatar, feed-follow, like-icon/-count, comment-icon/-count, favorite-icon/-count, share-icon/-count,
video-music`. Links: `/@<handle>` and `/music/…`, **no** `/video/<id>`. `video-desc` yields spans with
line breaks (normalise whitespace). Extraction of all visible articles: **0.3 ms**. Articles are inserted as
empty placeholders (10 in the DOM) and filled as the user approaches; the filling is a mutation
(insertion → filled in 0–1 ms), so MutationObserver detection is immediate. Elements are recycled (59
article elements in 5 scrolls) → `onItemRemoved` is needed, otherwise overlays hang on dead nodes.

### 4.6 Comments

- Opening the panel loads 4 pages (18+18+18+17) in ~1.2 s; first response ~380 ms after the click. Logged out, the
  click leads to the detail page with a login modal.
- **Without a signature** from the page context: `/api/comment/list/?aid=1988&aweme_id=<id>&count=20&cursor=0` → 200,
  18 comments, `total`, `has_more`; replies: `/api/comment/list/reply/?aid=1988&comment_id=<cid>&item_id=<id>
  &count=3&cursor=0` → 200, 308 ms. A call with additional app parameters returned an empty body — the
  minimal URL is the robust one.
- Fields per comment: `text, digg_count, reply_comment_total, create_time, comment_language, user{nickname,
  unique_id}, author_pin, text_extra, label_list`. Sorting: TikTok's ranking (first comment 689 K likes) —
  **the first page is the "top comments" sample**.
- Recommendation: only after `onItem`, only for the active video, one page, with an AbortController on switch. Not
  built, because `FeedItem` has no field for it (proposal 9.2).

### 4.7 Video and audio

- `playAddr` delivers MP4 (h264 ~350 kbps, plus h265 variants in `bitrateInfo`). From the page context with
  cookies: 206/200; from Node without a referer: 403 (`Access-Control-Allow-Origin: https://www.tiktok.com`).
- The player has already buffered the active and often the next video (fetch 4 ms from the cache); unbuffered
  172 ms for 9 s/392 KB, 324 ms for 35 s/2.9 MB.
- `AudioContext.decodeAudioData`: 48–52 ms for 9–18 s (48 kHz stereo); resampling to 16 kHz mono via
  `OfflineAudioContext`: 4 ms. So the browser needs **no ffmpeg**.
- `<video>.currentSrc` is a `blob:` URL of a `MediaSource` → not loadable; `textTracks` = 0.
- `music.playUrl` is not loadable from the page context (CORS).

### 4.8 Content detection while scrolling

| Method | Measured | Verdict |
|---|---|---|
| `play` event (capture, `document`) | key press → `play` of the new video in **287–418 ms** (10 measurements) | **Primary**: tells which video is *playing* |
| Polling `video.paused` | 261–357 ms (25 measurements), same order of magnitude | second derivation, not needed in the product |
| MutationObserver on articles | article filled → visible in 0–1 ms; items 1.0–3.6 s before `play` | **Primary for `onItem`** |
| IntersectionObserver | not measured; on the FYP the playing video is always the visible one | reserve for pages without autoplay (profile grid) |
| URL change | **none** on `/foryou` (stays `/foryou`) | unusable |
| Network (`item_list`) | 8 items per response, ~2–5 s lead | primary for *data*, not for "visible now" |
| `video.currentSrc` change (DOKUMENTATION.md) | works, but `play` is more direct | reserve |

### 4.9 Timeline (measured, integration runs 3 and 4)

```
T−3.5 s … T−1.0 s   item JSON present, article filled → sink.onItem (real ID, text, hashtags, author,
                     counters, createdAt; captions if the VTT is already loaded: 3 of 12 items)
T+0                  user lands on the video (play event, ~300 ms after the key press)
T+0 … +1 ms          onItem for the very first video of the page (in the same frame)
T+0.5 s              first captions chunk (VTT paced; cue start 0.4 s)
T+0.84 … +1.4 s      first STT chunk (10-s window; outliers 3.0 s / 4.4 s during page start-up)
T+2.3 s              second STT window (chunks 2 and 3 …)
switch               old job aborted: 0 straggler chunks in three runs
```

---

## 5. X: data paths (with the login limit)

### 5.1 What was observable

- Logged out, `x.com/home` returns the landing page (0 tweets) and `x.com/<user>/status/<id>` a **static
  page** with text, counters and replies, but **without a single `data-testid`** and without GraphQL calls.
  The logged-in feed DOM could therefore not be measured.
- The embed page `platform.twitter.com/embed/Tweet.html?id=…` uses the same `data-testid`s (`tweetText`,
  `icon-verified`, `UserAvatar-Container-*`) as the app — a hint that the scaffold selectors are current.
- **Syndication API** `https://cdn.syndication.twimg.com/tweet-result?id=<id>&token=<token>` (token formula in
  `x-syndication.ts`): 200 without login, JSON with `text, user{screen_name,name,is_blue_verified,verified}, entities,
  favorite_count, conversation_count, lang, created_at (ISO), mediaDetails?, quoted_tweet?`. Fixture saved live.
  The timeline endpoint `syndication.twitter.com/srv/timeline-profile/screen-name/<u>` answered 429.

### 5.2 GraphQL (primary path, unverified live)

X's app loads the feed via `/i/api/graphql/<hash>/HomeTimeline` (or `HomeLatestTimeline`, `TweetDetail`,
`UserTweets`, `SearchTimeline`). All responses contain the same tweet entity (`tweet_results.result`):
`rest_id, legacy{full_text, created_at, lang, favorite_count, retweet_count, reply_count, quote_count,
bookmark_count, entities{hashtags,urls,user_mentions,media}, extended_entities{media[{type, media_url_https,
ext_alt_text, video_info.variants[]}]}, retweeted_status_result, quoted_status_id_str}, core.user_results.result
{legacy{screen_name,name,verified} | core{screen_name,name}, is_blue_verified, verification{verified}},
note_tweet.note_tweet_results.result{text, entity_set} (long posts), quoted_status_result, views.count,
birdwatch_pivot (Community Note)`; sometimes wrapped in `TweetWithVisibilityResults{tweet}`.
Source of the shape: public type definitions (the-convocation/twitter-scraper, `timeline-v1.ts`/`v2.ts`,
retrieved 2026-09-21) — **not our own observation**. The mapper (`x-graphql.ts`) is tested against a
synthetic fixture and must be confirmed with `scraper/research/console-probes/x-graphql-capture.js` on a
logged-in profile (task T-006).

What the GraphQL path brings compared with the DOM: the **full text of long posts** ("Show more" in the DOM), alt texts,
views, language, **Community Notes**, quote text even when not rendered, MP4 variants with bitrate.

### 5.3 DOM (fallback)

`article[data-testid="tweet"]`, `tweetText`, `User-Name`, `tweetPhoto img`, `video`, `a[href*="/status/"] time`,
`socialContext` — verified by the scaffold ("already works"), not re-verified in this session.
Added: `tweet-text-show-more-link` as truncation detection (debug log). Second `tweetText` = quote (heuristic
of the scaffold, unchanged).

### 5.4 Video on X

MP4 variants live on `video.twimg.com` (from `video_info.variants`, highest bitrate chosen). Whether the download
from the page context is allowed (CORS) was **not checkable** without a login; X videos practically never have
subtitles. The STT path is built platform-neutral (`transcribeFromUrl`), but not wired up for X until the
CORS point is clarified.

---

## 6. Speech-to-text: measured and compared

Available locally: `whisper-cli`, `whisper-server`, `whisper-stream` (whisper.cpp via Homebrew, Metal active) and
`ggml-large-v3-turbo.bin` (1.5 GB). Test clip: neutral synthetic speech (macOS `say`), 5/10/28 s, 16 kHz mono.

| Run | Audio | Encode | Total (tool) | Wall (call) |
|---|---|---|---|---|
| CLI, full context | 5 s | 1.07 s | 2.49 s | 3.14 s |
| CLI, `-ac 512` | 5 s | 0.59 s | 1.57 s | 2.13 s |
| CLI, `-ac 384` | 5 s | 0.33 s | 1.05 s | 1.61 s |
| CLI, full context | 10 s | 1.14 s | 2.11 s | 2.61 s |
| CLI, `-ac 512` | 10 s | 0.32 s | 1.24 s | 1.60 s |
| CLI, full context | 28 s | 1.02 s | 2.63 s | 3.12 s |
| CLI, `-l auto` | 28 s | 2 × 1.0 s | 3.50 s | 4.15 s |
| Server (model loaded), full context | 5 / 10 / 28 s | — | — | 1.17 / 1.30 / 1.90 s |
| Server, `-ac 768` | 5 / 10 s | — | — | 0.75 / 0.80 s |
| Server, `-ac 768` | 28 s | — | — | 6.67 s (context too small → several windows) |
| Server, MP4/AAC input with `--convert` | 28 s | — | — | 1.92 s (ffmpeg conversion ~0) |

Findings: the encode costs ~1.0 s per 30-s window, **independent of the audio length**; `--audio-ctx`
shortens it proportionally with the same recognition (10 s: identical text at 512 and full). Model load time
0.44–1.27 s per process → the server (model in memory) is mandatory. A language hint saves ~1 s (TikTok delivers
`textLanguage`). `verbose_json` gives segments with times. ffmpeg decoding of 10 s: 24 ms (in case it is done server-side after all).

Options compared (only the first row is measured):

| Option | First text | Privacy | Effort | Verdict |
|---|---|---|---|---|
| **whisper.cpp locally, `whisper-server`, WAV windows from the browser** | 0.84–1.4 s after `play` (measured) | everything local | start the companion process (`scraper/companion/whisper-server.sh`) | **chosen** |
| Cloud STT (Deepgram streaming, old plan) | typ. 0.5–1 s (adopted, not measured) | audio leaves the machine | key, tab capture, offscreen document, sound goes mute (DOKUMENTATION.md 3.2) | reserve |
| Whisper in the browser (WebGPU, transformers.js, tiny/base) | 1–3 s (adopted) | local | 40–150 MB model in the extension context, clearly worse recognition | check later |
| Web Speech API | — | — | microphone only, no tab audio | unsuitable |
| MLX-Whisper (Apple) | comparable to whisper.cpp (adopted) | local | Python process, no HTTP server included | alternative to the companion |
| `whisper-stream` (microphone streaming) | — | local | records from the mic, not from the tab | unsuitable |

Progressive transcription: built as windows of 10 s (first window = seconds 0–10 → one chunk, then 10–20 …).
Smaller first windows (5 s, `-ac 512`: 0.75 s) are possible; I chose 10 s because the chunk then carries a sentence
and the glue layer triggers a whole analysis per chunk.

---

## 7. Architecture

```
 tiktok.com / x.com  ─────────────────────────────────────────────────────────────
 │ MAIN world   scraper/main-world.ts  (manifest: world MAIN, document_start)
 │   fetch/XHR wrapper ──► item_list / graphql JSON ──► window.postMessage ─┐
 │   TikTok: article ──fiber──► item ──► data-fedo-tiktok-id on the article │
 │                                                                          ▼
 │ isolated world (content script)                                  scraper/bridge.ts
 │   platforms/tiktok.ts  cache rawId→MappedTikTok  ◄──── listenBridge ──────┘
 │     trackFeed(article) → resolve(attribute → cache | DOM fallback) → sink.onItem
 │     play event → transcript.setActive(...)
 │   platforms/x.ts        cache statusId→MappedTweet, observeFeed(article) → sink.onItem
 │   transcript/controller.ts  exactly ONE job · prefetch(VTT) · abort on switch
 │     captions.ts  load/parse VTT, cues in step (≤ 1 chunk / 750 ms)
 │     stt.ts       load MP4 → decodeAudioData → 16 kHz WAV windows → POST
 └──────────────────────────────────────────────────────────────────────────────
                     │ http://127.0.0.1:8181/inference  (CORS *)
                     ▼
              whisper-server  (scraper/companion/whisper-server.sh, model in memory)
```

Two details that only the integration run forced: the content script starts at `document_idle`, i.e.
after the first item response (~2 s) — the MAIN world therefore keeps the last 64 records and delivers them on
request (replay: first items 29 ms after installation, run 6). And an article only counts as "ready" once
its record is in the cache (or 1.5 s have passed) — the ID on the article alone is not enough, because it is there
before the replay.

Why this way and not another:

| Alternative | Why not (measured or from the docs) |
|---|---|
| DOM only | no video ID, no counters, no subtitle URL, no MP4 (blob) on TikTok |
| `chrome.webRequest` | MV3 delivers no response bodies |
| `chrome.debugger` (CDP from the extension) | full bodies, but a yellow warning bar "is being debugged", heavy, the jury sees it |
| Fetch patch via `<script>` injection from the content script | TikTok's CSP blocks inline scripts; `web_accessible_resources` would also be a manifest change → then rather `world: MAIN` |
| Tab capture + offscreen (old plan) | tab goes mute, real-time constraint (can never be faster than the video), additional permissions |
| Native messaging instead of HTTP | installation of a host manifest per user; `whisper-server` already speaks HTTP with CORS |
| STT in the background worker | cleaner with regard to CSP/LNA (section 12), but needs a new message type in `contracts/messages.ts` — proposal, not done |

Safari/WebKit: `world: MAIN` in `content_scripts` does not exist there in the same form; the bridge approach would need
a script injection with `web_accessible_resources`. Not investigated, Chrome is the target platform of the manifest.

---

## 8. Fallback strategy per field (TikTok)

```
id          bridge/attribute ─► (fiber, MAIN) ─► hash(handle+text)          [attribute missing >1.5 s → hash]
text        contents[].desc ─► desc ─► DOM video-desc
hashtags    textExtra ─► challenges ─► regex over text
handle      author.uniqueId | author (string) ─► DOM a[href^="/@"]
displayName author.nickname | nickname ─► —
media       playAddr (+cover) | imagePost ─► DOM <video> (blob, only as a marker)
captions    VTT loaded in advance (prefetch when the item arrives) ─► empty, then onTranscript
transcript  VTT paced ─► STT local ─► nothing (companion off)
```
The switch is automatic: if the bridge is missing (`data-fedo-main-world` not set), the DOM path runs immediately
(integration run 1: 6 items with handle, text, hashtags, 3 `onItemRemoved`, but hash IDs and no transcript).

---

## 9. FeedItem Coverage and Contract Compatibility

`FeedItem` according to `contracts/types.ts` (unchanged):

```ts
id: string; platform: "x" | "tiktok"; url?: string;
author: { handle: string; displayName?: string; verified?: boolean };
text: string; hashtags: string[]; media: MediaRef[];      // MediaRef {type, url, posterUrl?, altText?}
quotedText?: string; captions?: string; isRepost?: boolean; createdAt?: string; scrapedAt: number;
```

### 9.1 Coverage

| Field | TikTok | X | Recommended path | Fallback | Latency | Reliability / limitation |
|---|---|---|---|---|---|---|
| `id` | yes | yes | TikTok: item JSON via attribute; X: permalink `/status/<id>` (DOM) or GraphQL `rest_id` | TikTok: hash | before the video / at article | TikTok 12/12 real (run 3); hash only without the bridge |
| `platform` | yes | yes | hostname | — | immediate | — |
| `url` | yes | yes | from id + handle | — | immediate | TikTok empty if the handle is missing |
| `author.handle` | yes | yes | JSON / permalink | DOM link | immediate | 12/12 |
| `author.displayName` | yes | yes (DOM `User-Name` / GraphQL `name`) | JSON | — | immediate | 12/12 with the bridge; **missing in the DOM fallback** |
| `author.verified` | partly | yes (`icon-verified` / `is_blue_verified`) | JSON (API shape) | — | immediate | TikTok: not contained in the React-state shape → `undefined` |
| `text` | yes | yes | JSON `contents[].desc` / GraphQL `note_tweet` | DOM | immediate | X DOM truncates long posts ("Show more") |
| `hashtags` | yes | yes | structured (`textExtra` / `entities.hashtags`) | regex | immediate | test: structured = regex on the sample |
| `media` | yes (video/image) | yes (image/video/gif + alt) | JSON / GraphQL variants | DOM `<img>`/`<video>` | immediate | TikTok `<video>` is blob (DOM fallback only) |
| `quotedText` | n/a | yes | GraphQL `quoted_status_result` | 2nd `tweetText` in the DOM | immediate | GraphQL unverified live |
| `captions` | partly | no | load the VTT in advance | empty → `onTranscript` | before the video, if the prefetch is done | 3/12 items in run 3; coverage 5/33 in the feed |
| `isRepost` | no (not in the FYP sample) | yes (`socialContext` / `retweeted_status_result`) | GraphQL | DOM | immediate | TikTok: `statsV2.repostCount` exists, repost flag not seen |
| `createdAt` | yes | yes | `createTime` / `created_at` / `<time datetime>` | — | immediate | 12/12 |
| `scrapedAt` | yes | yes | `Date.now()` at emission | — | — | — |

May remain empty: `captions` (no track), `verified` (TikTok state shape), `quotedText` (TikTok always),
`displayName`/`createdAt` (only in the DOM fallback without the bridge).

### 9.2 Additional fields that the platforms deliver (proposal, not implemented)

All values named below are already extracted internally (`TikTokExtras`, `XExtras` in the mappers) and printed in the
debug log; they do not reach the sink because `FeedItem` does not know them.

| Field (proposal) | Added value for analysis | Reliability | Type | Platform |
|---|---|---|---|---|
| `language` | Jev questions in the right language; STT language hint saves ~1 s | high (`textLanguage`, `lang`) | `string` (ISO 639-1, `un` = unknown) | both |
| `stats` | reach/engagement as context for engagement bait, virality | high | `{ likes?, comments?, shares?, views?, saves?, quotes?, bookmarks? }` (number) | both |
| `stickerTexts` | for videos without speech, on-screen text is often the actual message | medium (3/33 filled) | `string[]` | TikTok |
| `mentions` | target groups/parties involved, us-vs-them | high | `string[]` | both |
| `communityNote` | strongest credibility signal on X | unknown live (GraphQL) | `string` | X |
| `links` (expanded URLs) | source given vs. no source (`factual_claim`) | high | `string[]` | both (TikTok: `anchors`, rare) |
| `isAd` / `aiLabel` | Commercial persuasion, synthetic media | high | `boolean`, `string` | TikTok |
| `music` | sound trends, original vs. someone else's | high | `{ title?, author?, original? }` | TikTok |
| `durationSec` | STT budget, chunk planning | high | `number` | TikTok |
| `topComments` | reception, disagreement, context ("this is satire") | medium (unsigned endpoint) | `{ text, likes, replies, language? }[]` | TikTok |
| `possiblySensitive`, `inReplyToId`, `conversationId` | thread context | unknown live | `boolean`, `string` | X |

All as **optional** fields — the team rule "prefer adding new fields as optional" (START_HERE.md §4).

---

## 10. Transcript Integration

- **Channel:** `sink.onTranscript({ itemId, text, isFinal, t, source })` — exists in the contract, is now served.
- **Mapping:** `itemId` = `FeedItem.id` (`tiktok:<id>`); the controller only knows the active video.
- **Trigger:** the `play` event of the video (capture listener on `document`), not visibility — so
  a transcript never runs for a visible but paused video.
- **Captions path:** the VTT is loaded as soon as the item comes off the network (prefetch) → often the full text
  is already in `item.captions` at `onItem`. In addition, the cues are delivered as chunks in step with playback
  (`isFinal: true`, `t` = cue start, `source: "captions"`, at most one chunk per 750 ms, bundled), so that the
  values "run along". First chunk: 504 ms (run 3), 13 ms and 201 ms (run 7, loaded in advance) after `play`.
  TikTok names up to three URL variants per track (`url`, `urlList`: two CDN hosts + `tiktok.com/aweme/v1/play`);
  the fetch tries them in order — with only the first one, 5 of 7 fetches failed (run 6), with the fallback 0 (run 7).
- **STT path:** without a track → `sttAvailable()` (GET probe, 5-s cap, negative result cached for only 10 s — an
  earlier 800-ms probe ran into a 3.5-s timeout during page start-up and switched STT off for a minute)
  → load MP4 → decode → 10-s windows → one chunk per window (`source: "stt"`, `t` = window start).
  First chunk 840–1,413 ms after `play` (4 of 6), outliers 3.0 s and 4.4 s at page start-up.
- **Abort:** `setActive` for a different item calls `stop()` (AbortController on fetches and POST, pace timer
  gone). Measured: 0 straggler chunks in three runs.
- **Parallelism:** exactly one job; only VTT files are loaded in advance for upcoming items (a few KB).
- **What the glue layer makes of it (read, `extension/src/content.ts`):** every chunk replaces the last
  non-final one and triggers a **complete** re-analysis with all chunks; `background.ts` only caches
  `kind: "post"`. Consequences: (a) limit the chunk rate (done: 750 ms / 10-s windows), (b) a second `onItem` for
  the same ID would be swallowed by the cache — that is why `onItem` is emitted exactly once per anchor.
- **Duplication, decision for the AI dev:** for items with VTT the text is in `captions` **and** arrives as
  chunks; `ai/state.ts` writes both into the state (`captions:` + `spoken_text:`). Proposal: for `kind:
  "transcript"` omit `captions` if `transcript[0].source === "captions"`. Not my file.
- **Minimal contract extension, if wanted (not done):** none needed for operation. Sensible would be
  optional `TranscriptChunk.language?: string` and `TranscriptChunk.endT?: number`.

---

## 11. When `sink.onItem` is fired — option A/B/C

- **Option C (update later)** is ruled out: `background.ts` caches the result per `item.id`; a second
  `onItem` with more data would never be analysed.
- **Option B (short window)** is only needed for the DOM fallback: a filled article waits up to 1.5 s for the
  ID from the MAIN world (measurement: normally it arrives in the same frame; once in 7 it took longer than 400 ms
  and produced a duplicate item with a hash ID — hence 1.5 s).
- **Option A (immediately)** is the normal case: the item JSON is there 1–3.6 s before the video, `onItem` fires when
  the article is filled, `captions` are often already included. Measured in three runs (section 14).

---

## 12. Robustness and risks

| Risk | Assessment | Countermeasure |
|---|---|---|
| TikTok changes the item JSON | shape stable for years (`itemList`, `desc`, `author`, `video`); two author shapes seen | mapper with optional fields, tests against fixtures, DOM fallback |
| React hook order changes | likely with larger deploys | fiber only for the ID mapping; search up to depth 6/60 hooks; fallback hash |
| `data-e2e` attributes change | rare, but DOKUMENTATION.md found 2 selectors that are missing today | only `feed-video`, `video-desc`, `/@` link in use |
| Comment endpoint requires a signature again | possible | feature is optional; then listen in on the panel |
| Page CSP blocks `127.0.0.1` | only affects the **page context**; content scripts bypass the page CSP in Chrome — in the CDP test run `bypassCSP` had to be set | check in the real extension (section 15); reserve: STT POST via the background worker (new message type) |
| Chrome "Local Network Access" (permission prompt for loopback) | **not** triggered here in Chromium 153 (GET from tiktok.com to 127.0.0.1 came back with a CORS response) | observe; reserve as above |
| Login walls (X) | X useless without login; TikTok fully usable logged out | target user is logged in |
| Rate limits | item JSON: no calls of our own (listening in); VTT: 1 file per video; STT: local; comments: 1 call per video | — |
| Anti-bot | we send nothing additional to TikTok apart from VTT/MP4 fetches that the player makes anyway | — |
| CPU/RAM | MAIN-world wrapper: ~0 ms; fiber search 0.1 ms; decode 50 ms; whisper ~1 s GPU per window | one job at a time |
| Privacy | everything local; no cloud; fixtures sanitised (no cookies/tokens, avatars/`secUid` removed) | — |
| Page error `a.init is not a function` (once, run 4) | uncaught in TikTok's code, not attributable to ours; no loss of function observed | observe (T-007) |
| Same-origin spoofing on the bridge | page code could post fake items | mappers validate the shape; no code path trusts strings blindly |

---

## 13. What was built

Only `scraper/` plus three listed glue lines. `contracts/` untouched.

| File | Purpose |
|---|---|
| `scraper/bridge.ts` | protocol MAIN ↔ isolated (`postMessage`, namespace, flag, attribute name) |
| `scraper/main-world.ts` | fetch/XHR wrapper, TikTok fiber → `data-fedo-tiktok-id`, presence flag |
| `scraper/platforms/tiktok-item.ts` | item JSON (both shapes) → `FeedItem` + `TikTokExtras` |
| `scraper/platforms/tiktok.ts` | adapter: bridge cache, `trackFeed`, DOM fallback, `play` → transcript, `onItemRemoved` |
| `scraper/platforms/x-graphql.ts` | tweet entity → `FeedItem` + `XExtras` (note_tweet, retweet, quote, media, Community Note) |
| `scraper/platforms/x-syndication.ts` | syndication JSON → `FeedItem`, token formula |
| `scraper/platforms/x.ts` | adapter: bridge cache by status ID, DOM fallback, truncation detection |
| `scraper/observe.ts` | new: `trackFeed` (placeholder lists, `onLeave`); `observeFeed` unchanged |
| `scraper/transcript/captions.ts` | load/parse VTT, `paceCues` |
| `scraper/transcript/stt.ts` | probe, MP4 → PCM 16 kHz → WAV → `whisper-server` |
| `scraper/transcript/controller.ts` | one job, prefetch, `captionsNow`, abort |
| `scraper/companion/whisper-server.sh` | starts the local STT server with the measured flags |
| `scraper/test/*.test.ts`, `scraper/test/fixtures/*` | 15 tests; real TikTok capture (sanitised), real syndication response, synthetic GraphQL timeline |
| `scraper/research/console-probes/*` | DevTools probes (reproducible without tooling) |
| `scraper/research/playwright/*` | harness + integration probe |
| **Glue:** `extension/manifest.json` | second `content_scripts` entry: `main-world.js`, `document_start`, `"world": "MAIN"` |
| **Glue:** `scripts/build.mjs` | bundle entry `scraper/main-world.ts → dist/main-world.js` |
| **Root:** `package.json` | script `test:scraper` (`node --import tsx --test`, no new dependency) |

Not built, deliberately: comment retrieval (no field), X STT (CORS unclarified), image OCR, IntersectionObserver path,
Safari.

---

## 14. Integration runs (Playwright, tiktok.com/foryou, logged out)

| Run | Setup | Result |
|---|---|---|
| 1 | MAIN-world script failed on a missing `documentElement` (CDP injects earlier than `document_start`) → pure DOM fallback | 6 items (hash IDs, handle, text, hashtags), 3 `onItemRemoved`, 0 transcripts — the fallback holds |
| 2 | MAIN world active (presence flag robust) | 10/10 articles with ID attribute, 7 items (6 real IDs, 1 hash after a 400 ms wait), `onItem` 0 ms and 3.2 s before `play` respectively, 4 `onItemRemoved`; STT silent (OPTIONS probe → preflight rejected) |
| 3 | probe on GET, wait 1.5 s, 18 videos | 12 items, 0 hash, 12× `createdAt`/display name, 3× `captions` at `onItem`, 2 captions chunks (first 504 ms after `play`), 9 `onItemRemoved`, 0 stragglers; STT silent (800-ms probe timeout at page start-up) |
| 4 | probe 5 s, negative cache 10 s, 16 key presses (keyboard navigation only took effect 6×) | 7 items, 0 hash, **9 STT chunks for 6 videos**, first chunk 840/855/876/1,413 ms (outliers 3,013 and 4,441 ms), 0 stragglers, 4 `onItemRemoved` |
| 5 | **Late installation** (harness only 5 s after load, like a `document_idle` content script after the first item response) | **Regression found:** 1 item (hash), then nothing — `activeVideo` was declared with `let` only after `emit`, the first synchronous scan threw a ReferenceError; in addition the DOM fallback kicked in although the ID was on the article and the replay record arrived milliseconds later |
| 6 | after the fix (declaration order, "ready" = record in the cache, replay buffer in the MAIN world) | 14 items, 0 hash, first two items **29 ms after installation** (replay), 13 videos, 11 `onItemRemoved`, 3 captions chunks (from 763 ms), 7 STT chunks (from 1,812 ms), 0 stragglers; **5 of 7 VTT fetches failed** ("Failed to fetch") |
| 7 | after the VTT fallback across all `urlList` variants | 11 items, 0 hash, 16 chunks (5 captions, 11 STT), **0 failed VTT fetches**, captions chunks 13 ms / 201 ms after `play` (loaded in advance), STT 926–1,983 ms (once 3,027), 8 `onItemRemoved`, 0 stragglers |

The STT pipeline in isolation (run between 3 and 4): probe 404/cors, MP4 2.9 MB in 324 ms, decode 52 ms
(17.9 s of audio), POST 10-s window 918 ms → text.

### 14.1 Cold review (Codex, gpt-6-astra, only the diff) and what became of it

| Finding (all SUSPECTED, 0 CONFIRMED) | Classification | Fix |
|---|---|---|
| Harness starts before `documentElement` | valid | harness waits for `DOMContentLoaded` |
| `onPlay` bypasses the waiting period → duplicate item (hash ID, then real ID) | valid | `onPlay` only emits "ready" articles; on the switch hash → real ID the old ID is withdrawn via `onItemRemoved` |
| a later GraphQL record does not update an X item emitted via the DOM | trade-off (glue cache, §11) | decision T-011 for the glue dev |
| `source` derived from the URL instead of from the actual path | valid | the source is passed in by the respective path (`captions` / `stt`) |
| open: bridge messages before `document_idle` are lost | valid | replay buffer (64 records) in the MAIN world, the content script requests it at start |
| open: `records: [null]` would make the receiver throw | valid | `isBridgeMessage` checks every record (test `bridge.test.ts`) |

**Second cold reader (cg-diff-reviewer, Claude, with repro scripts against a DOM fake):** on the patch
2 × CONFIRMED 🟡 (the `source` derivation and the `onPlay` double emission — both above, both shown as fixed on the final state with
a repro), 1 × SUSPECTED (lost bridge messages before `document_idle` — addressed by the replay buffer,
checked live only in runs 6/7, not in the real extension), and on an intermediate state 1 × CONFIRMED
🔴: the `let activeVideo` declaration after `emit` (run 5) — fixed. Final verdict: **REVIEW: CLEAN** for the
final state, with the recommendation to have the frozen final diff read cold once more (T-012), because the
tree moved during the review. Open questions of the reader: nesting of the two `SEL.post` selectors
(T-013; measured, both match the same element), the synthetic X fixture (known, T-006), the syndication mapper
without a runtime consumer (deliberate: documented building block).

---

## 15. Verification for the next dev

```bash
cd <Fedo-Repo> && npm run check          # ✓ path boundaries OK, dist/main-world.js
cd <Fedo-Repo> && npm run test:scraper   # tests 17 · pass 17 · fail 0
```

Real extension (the step this session could not do — Playwright cannot load an extension into the MCP
browser):

1. Terminal A: `cd <Fedo-Repo> && bash scraper/companion/whisper-server.sh`
2. Terminal B: `cd <Fedo-Repo> && npm run dev:scraper`, then load `dist/` in
   `chrome://extensions` (Developer mode → Load unpacked), open tiktok.com/foryou, open the console.
3. Expectation: `[fedo:scraper] TikTok scraper started (bridge active)`, per video `NEW VIDEO {id: "tiktok:<number>", …}`
   **before** it plays, for videos with speech analysis updates (transcript chunks) within ~1–2 s.
   If it says `(DOM fallback only …)` there, `main-world.js` is not loaded (check the manifest).
4. Checkpoint CSP/LNA: if an error with `127.0.0.1` (blocked / preflight / permission) appears in the console,
   the reserve path from section 12 applies (STT POST via the background worker).
5. X logged in: paste `scraper/research/console-probes/x-graphql-capture.js` into the console, scroll; save a real response
   as a fixture and adapt `x-graphql.test.ts` to it (T-006).

DevTools probes without the extension: `scraper/research/console-probes/README.md`.

---

## 16. Open points and next steps

(The T numbers in sections 14 and 15 come from a local task list of the author that is not in the
repo. The points themselves are listed here in full.)

1. **Verify X logged in** (feed DOM, HomeTimeline GraphQL, `video.twimg.com` CORS) — probe is included.
2. **Run the real extension on tiktok.com** (CSP/LNA point, section 15).
3. Decision AI dev: `captions` vs. chunks (section 10).
4. Decision team: additional fields (9.2), first `language`, `stats`, `stickerTexts`, `communityNote`.
5. Build in comment retrieval as soon as a field exists (code sketch in 4.6).
6. TikTok logged in: are there more subtitle tracks? (unknown)
7. Keyboard navigation in the test does not always take effect (5/30 and 10/16 failed attempts respectively) — test harness, not product.
8. Observe: one-off TikTok error `a.init is not a function` (run 4).
9. Harden `SEL.post` in `platforms/tiktok.ts` against nesting (if `recommend-list-item-container` ever wraps an
   `article[feed-video]`, there would be two emissions per video; measured, both selectors match the same element).

---

## 17. Evidence block (numbers with two derivations)

- **Question:** How fast and how completely does the scraper fill `FeedItem`/`onTranscript` on TikTok, and what do the platforms deliver?
- **Population:** `tiktok.com/foryou` logged out (33-item sample, 4 integration runs of 6–12 videos each); `x.com` logged out; whisper.cpp on an M4.
- **Period:** 2026-09-21, 12:10–13:20.
- **Unit:** milliseconds (wall clock), number of items/chunks.

| Number | Derivation A | Derivation B | Reconciliation |
|---|---|---|---|
| New video active ~0.3 s after the key press | polling `video.paused` every 25 ms: 21 valid values 261–357 ms, median 0.29 s | `play` event listener: 10 values 287–418 ms, median 0.33 s | AGREE to 0.1 s (0.3 s) |
| Subtitle coverage 5/33 | `claInfo.captionInfos.length > 0` → 5 | `subtitleInfos.length > 0` → 5 | AGREE |
| VTT cues 53 | `grep -c -- '-->'` in the fixture | `parseVtt().length` in the test | AGREE (test) |
| Tests 15/15 | `npm run test:scraper` SUMMARY | `grep -c 'test("' scraper/test/*.test.ts` | AGREE (gegenprobe.py) |
| Item JSON → DOM ≤ 50 ms | Node timestamp of the body vs. in-page mutation: −14 ms | Resource Timing `responseEnd` vs. mutation: +43 ms | AGREE in order of magnitude (sign = body read time in Node) |
| whisper 10 s ≈ 0.8 s (server, `-ac 768`) | `curl time_total` 0.805 s / 0.790 s | encode 0.49 s (`-ac 768`, CLI) + decode + overhead ≈ 0.7–0.8 s | AGREE |
| `onItem` before `play` | run 3: 1, 1, −1,024 … −3,526 ms | run 4: 0, 0, −1,283 … −3,561 ms | AGREE (pattern identical) |
| first STT chunk 0.84–1.4 s | run 4 (4 of 6 videos) | isolated pipeline: 324 + 52 + 918 ms ≈ 1.3 s | AGREE |
| Comments per page 15–18 | app request (count=20): 18, 18, 18, 17 | minimal URL: 18, 15, 17 | AGREE (range) |

**Not measured:** X logged in (DOM, GraphQL, video CORS); TikTok logged in; long-term behaviour; real
extension (instead of the CDP simulation); IntersectionObserver path.

**RESULT:** `FeedItem` is complete on TikTok with the bridge in 12 of 12 cases (id, url, author.handle/
displayName, text, hashtags, media, createdAt) and is available before the video; `captions` immediately for 3/12;
`onTranscript` delivers after ~0.5 s with subtitles, after ~0.8–1.4 s via local STT; `verified` and `quotedText`
remain empty on TikTok. X is only prepared via mappers and probes — **unverified live**.

---

## 18. Draft for UPDATE.md (enter only after the merge)

```markdown
## YYYY-MM-DD · `main @ <hash>` · Scraper · TikTok reads item JSON + subtitles, local STT, transcript channel live

**What changed:**
- New MAIN-world script `scraper/main-world.ts` (manifest: second content_scripts entry, build: entry `main-world.js`).
- TikTok adapter new: real video IDs, counters, creation time, subtitles (`captions`), `onTranscript` (captions/STT), `onItemRemoved`.
- X: GraphQL/syndication mappers (fixture-tested), DOM path unchanged. Live verification while logged in is open.
- Tests: `npm run test:scraper` (node:test + tsx, no new dependency). Docs: `scraper/RESEARCH.md`.

**What you need to do:**
- `git pull --rebase origin main` · `npm run build` + click ↻ in chrome://extensions (the manifest has changed → reload the extension)
- For video transcripts: `bash scraper/companion/whisper-server.sh` (needs `brew install whisper-cpp` + model)

**Important to know:**
- AI dev: for videos with subtitles the text arrives in `item.captions` AND as `onTranscript` chunks (RESEARCH.md §10).
  Recommendation: for `kind: "transcript"` omit the `captions` field in the state if `transcript[0].source === "captions"`.
- Team (owner decision 2026-09-21): propose the four optional fields `language`, `stats`,
  `stickerTexts`, `communityNote` as the first contract extension (types in RESEARCH.md §9.2). Separate small PR on `contracts/`.
- Glue dev (owner decision 2026-09-21): proposal — `background.ts` should discard the cache entry when a
  second `onItem` with the same ID brings longer text; then the scraper can follow up with an X long post that was truncated via the DOM.
```

---

## Appendix: sources

| Topic | Source |
|---|---|
| TikTok item JSON, DOM, comments, VTT, MP4 | measured ourselves 2026-09-21 (Playwright, logged out) |
| X syndication API | measured ourselves 2026-09-21; token formula as in X's embed code |
| X GraphQL entity shape | github.com/the-convocation/twitter-scraper, `src/timeline-v1.ts`, `src/timeline-v2.ts` (retrieved 2026-09-21) — not observed ourselves |
| whisper.cpp | measured locally (`whisper-cli`, `whisper-server` 1.x via Homebrew, Metal) |
| Chrome MV3 `content_scripts.world` | developer.chrome.com/docs/extensions/reference/manifest/content-scripts (as of the docs) — not retrieved again |
| First test | `DOKUMENTATION.md` (2026-09-21, pre-session) |
