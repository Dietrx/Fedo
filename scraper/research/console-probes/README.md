# DevTools probes (reproducible without tooling)

Each file is a snippet to paste into the **DevTools console** on the respective page
(`F12` → Console → paste → Enter). They need neither Playwright nor the extension and show within
seconds whether a data path from `scraper/RESEARCH.md` still works this way today.

| File | Page | Shows |
|---|---|---|
| `tiktok-network-capture.js` | tiktok.com/foryou | captures `item_list` responses (a `fetch` wrapper) and lists items with subtitle track, language, duration |
| `tiktok-item-from-fiber.js` | tiktok.com/foryou | reads the item of the currently playing video from the React state (the path that `scraper/main-world.ts` uses) |
| `tiktok-captions-fetch.js` | tiktok.com/foryou | fetches the WebVTT file of the active video and shows cues and latency |
| `tiktok-comments.js` | tiktok.com (any page) | calls the comment API without a signature and shows the top comments |
| `x-graphql-capture.js` | x.com/home (**logged in**) | captures GraphQL responses and shows the tweet entities — **the step that was not possible in the research session** |
| `x-syndication-fetch.js` | any | fetches a tweet via the public syndication API (no login) |

All probes are purely read-only accesses in your own browser; they send nothing to third parties.
