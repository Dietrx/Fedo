# DEMO.md — run-of-show, fallbacks, known limits

> For the pitch. Whoever presents reads this once, completely, beforehand.

## Preparation (10 minutes before the slot)
1. `git pull --rebase origin main && npm run build`, then ↻ in `chrome://extensions` **and reload the x.com tab**
   (an open tab keeps the old content script and shows "Analysis unavailable").
2. Popup: **Analysis → Cloud**. After a fresh "Load unpacked" it is back on Local. The footer of the panel tells you
   which path ran: `jev` / `combined` (= image was read) / `local`.
3. x.com open in a tab, logged in, feed on **For you**. Scroll about 20 posts so the statistics are filled.
4. Pick a video with clear speech (EN works best) and **play it once with sound on**. Muted players deliver no audio.
5. `npm run dev:ui` in a second tab (http://localhost:8000) as the fallback: synthetic posts, "Simulate live video".
6. OpenRouter credit: check the balance once. With an empty account everything silently falls back to the local engine.

## Run-of-show (about 4 minutes)
| Step | What you see | One sentence |
|---|---|---|
| 1. Scroll on x.com | The panel top right follows the post in view: overall level, top techniques with scores | "We describe techniques, not opinions." |
| 2. A strong post | Bars, the verbatim quote for each technique, tap a technique for its definition and research line | "Every signal comes with the quote that triggered it and a study behind it." |
| 3. A clean post | "No strong signals", top five in grey | "It does not flag everything. Neutral news and jokes stay clean." |
| 4. A meme / text in an image | Techniques quoted from the picture, footer says `combined` | "It reads what is written inside the image." |
| 5. An AI-generated picture | "AI slop" cover with "Show post anyway", Synthetic media signals with the visible reason | "An indication, never proof, and nothing is hidden for good." |
| 6. Play a video (**sound on**) | "Listening …", scores grow, LIVE badge, at the end a timeline with timestamps | "The browser listens to the video and shows when which technique was used." |
| 7. Open the dashboard | **Feed Diet**: share of posts with strong techniques, top techniques, top sources | "No platform will show you this about your own feed." |
| 8. Calm mode | High-intensity posts are dimmed, one click reveals them | "Censorship removes. Fedo adds context and never hides." |

A 20-second screen recording of steps 1, 3, 5 and 6 on the real feed exists as a backup.

## Fallback chain
- **Cloud does not answer / no credit** → nothing to do, the local engine answers automatically (`local` in the footer).
  Tone and image reading are cloud-only, so use the playground for those.
- **No panel on x.com** → DevTools console: any `[fedo:scraper]` lines? If not, show the playground; the popup statistics
  from the preparation are still there.
- **"Analysis unavailable"** → the tab was not reloaded after ↻. Reload it.
- **Video stays on "Unmute the video…"** → the player is muted; unmute and press play again.
- **Image was not read** → service worker console (`chrome://extensions` → "Service Worker") shows one line per image:
  `[fedo:ai] vision x:…`.

## Known limits (do not hide them when asked)
- Videos: speech plus one still frame. The moving picture itself is not analysed.
- "Synthetic media signals" is a model noticing typical generator artefacts, capped at 90 %. Not deepfake forensics.
- Scores appear about 5–10 s behind the video (4 s first audio window, then 8 s windows, plus transcription and scoring).
- Posts with fewer than four real words get no verdict ("Not enough text to assess").
- Jev is strongest in English. The local fallback engine is a weighted EN/DE lexicon and cannot read tone or irony.
- The statistics count *analysed* posts (deduplicated), not posts actually *read*.
- TikTok is experimental → **present on X.** Logged-out X pages use different markup and are not supported.
- Calibration rests on a few hundred real posts, which is why the wording is "shows patterns of".
