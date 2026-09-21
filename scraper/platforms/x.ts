/**
 * X / Twitter web: DOM extraction via MutationObserver.
 * Selectors are X's `data-testid`s — they are the most stable handles X exposes, but can change.
 *
 * TODO (scraper dev):
 *  - Alternative/boost: intercept HomeTimeline GraphQL responses (MAIN-world fetch patch) for cleaner data
 *  - Quoted posts, reposts ("reposted" social context), alt texts, video poster URLs
 */
import type { FeedItem, MediaRef, Scraper } from "@contracts";
import { debug, extractHashtags, observeFeed } from "../observe";

const SEL = {
  post: 'article[data-testid="tweet"]',
  text: '[data-testid="tweetText"]',
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
      debug("X scraper started");
      return observeFeed(SEL.post, (article) => {
        const item = extractPost(article);
        if (!item) return;
        article.dataset.fedoId = item.id;
        debug("NEW POST", item);
        sink.onItem(item, article);
      });
    },
  };
}

function extractPost(article: HTMLElement): FeedItem | null {
  // Permalink: <a href="/handle/status/123"><time/></a>
  const link = article.querySelector(SEL.statusLink)?.closest("a");
  const href = link?.getAttribute("href") ?? "";
  const m = href.match(/^\/([^/]+)\/status\/(\d+)/);
  if (!m) return null;
  const handle = m[1]!;
  const postId = m[2]!;

  const textEls = article.querySelectorAll<HTMLElement>(SEL.text);
  const text = textEls[0]?.innerText.trim() ?? "";
  const quotedText = textEls[1]?.innerText.trim();

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
