/**
 * X / Twitter web.
 *
 * Data path:
 *   primary  — the GraphQL timeline entities X's app receives (`/i/api/graphql/…/HomeTimeline` etc.), handed over
 *              by scraper/main-world.ts and mapped in ./x-graphql.ts; matched to the article by the status id in
 *              the permalink. Gives the full text of long posts, alt texts, counts, language, Community Notes.
 *   fallback — DOM via X's `data-testid`s (the most stable handles X exposes). Long posts are truncated there
 *              ("Show more"), which the fallback reports in the debug log.
 * The logged-in feed could not be observed in the research session (see scraper/RESEARCH.md → X); the DOM
 * selectors are the ones verified by the scaffold, the GraphQL shape follows public type definitions and must
 * be confirmed with scraper/research/console-probes/x-graphql-capture.js on a logged-in profile.
 */
import type { FeedItem, MediaRef, Scraper } from "@contracts";
import { debug, extractHashtags, observeFeed } from "../observe";
import { listenBridge, mainWorldPresent } from "../bridge";
import { isTweetResult, mapTweetResult, type MappedTweet } from "./x-graphql";

/** Containers X renders immediately, before the actual <img>/<video> exists. */
const MEDIA_HINT = '[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="videoComponent"]';
const MEDIA_RETRY_MS = 250;
const MEDIA_MAX_WAIT_MS = 2_500;

const SEL = {
  post: 'article[data-testid="tweet"]',
  text: '[data-testid="tweetText"]',
  showMore: '[data-testid="tweet-text-show-more-link"]',
  userName: '[data-testid="User-Name"]',
  photo: '[data-testid="tweetPhoto"] img',
  video: "video",
  statusLink: 'a[href*="/status/"] time',
  socialContext: '[data-testid="socialContext"]',
};

export function createXScraper(): Scraper {
  return {
    platform: "x",
    start(sink) {
      const records = new Map<string, MappedTweet>(); // status id → mapped tweet from the bridge
      debug("X scraper started", mainWorldPresent() ? "(bridge active)" : "(DOM only — main-world script not installed)");

      const stopBridge = listenBridge((msg) => {
        for (const r of msg.records) {
          if (r.kind !== "x-tweet" || !isTweetResult(r.tweet)) continue;
          const mapped = mapTweetResult(r.tweet);
          if (mapped && !records.has(mapped.rawId)) records.set(mapped.rawId, mapped);
        }
      });

      const stopFeed = observeFeed(SEL.post, (article) => {
        // X inserts <img>/<video> only once the media has loaded, and the GraphQL replay for the first screenful
        // arrives a moment AFTER the first scan. Reading the article right away therefore often yields `media: []`
        // (measured symptom: pictures analyzed only sometimes). If the post visibly HAS media but we know neither
        // the record nor the element yet, look again for a short while before reporting it.
        const started = Date.now();
        const attempt = () => {
          if (!article.isConnected) return;
          const item = extractPost(article, records);
          if (!item) return;
          const known = records.has(item.id.slice(2));
          const mediaPending = !known && !item.media.length && !!article.querySelector(MEDIA_HINT);
          if (mediaPending && Date.now() - started < MEDIA_MAX_WAIT_MS) {
            setTimeout(attempt, MEDIA_RETRY_MS);
            return;
          }
          article.dataset.fedoId = item.id;
          debug("NEW POST", item);
          sink.onItem(item, article);
        };
        attempt();
      });

      return () => {
        stopFeed();
        stopBridge();
      };
    },
  };
}

function extractPost(article: HTMLElement, records: Map<string, MappedTweet>): FeedItem | null {
  // Permalink: <a href="/handle/status/123"><time/></a>
  const link = article.querySelector(SEL.statusLink)?.closest("a");
  const href = link?.getAttribute("href") ?? "";
  const m = href.match(/^\/([^/]+)\/status\/(\d+)/);
  if (!m) return null;
  const handle = m[1]!;
  const postId = m[2]!;

  const mapped = records.get(postId);
  if (mapped) return { ...mapped.item, scrapedAt: Date.now() };

  const textEls = article.querySelectorAll<HTMLElement>(SEL.text);
  const text = textEls[0]?.innerText.trim() ?? "";
  const quotedText = textEls[1]?.innerText.trim();
  if (article.querySelector(SEL.showMore)) debug("text truncated in DOM (long post), no GraphQL record for", postId);

  const displayName = article.querySelector<HTMLElement>(`${SEL.userName} span`)?.innerText.trim();
  const verified = !!article.querySelector(`${SEL.userName} [data-testid="icon-verified"]`);

  const media: MediaRef[] = [];
  article.querySelectorAll<HTMLImageElement>(SEL.photo).forEach((img) =>
    media.push({ type: "image", url: img.src, altText: img.alt || undefined }),
  );
  article.querySelectorAll<HTMLVideoElement>(SEL.video).forEach((v) =>
    media.push({ type: "video", url: v.currentSrc || v.src, posterUrl: v.poster || undefined }),
  );

  return {
    id: `x:${postId}`,
    platform: "x",
    url: `https://x.com${href}`,
    author: { handle, displayName, verified },
    text,
    quotedText: quotedText || undefined,
    hashtags: extractHashtags(text),
    media,
    isRepost: !!article.querySelector(SEL.socialContext),
    createdAt: article.querySelector("time")?.getAttribute("datetime") ?? undefined,
    scrapedAt: Date.now(),
  };
}
