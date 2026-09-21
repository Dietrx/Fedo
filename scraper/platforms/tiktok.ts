/**
 * TikTok web (For You feed). Best-effort selectors based on `data-e2e` attributes — verify in DevTools!
 *
 * TODO (scraper dev):
 *  - Verify selectors on current tiktok.com
 *  - Captions: read TikTok's subtitle track / caption DOM and emit via sink.onTranscript({source:"captions"})
 *  - Detect which video is currently playing (IntersectionObserver) → only that one matters for live analysis
 */
import type { FeedItem, Scraper } from "@contracts";
import { debug, extractHashtags, hash, observeFeed } from "../observe";

const SEL = {
  post: '[data-e2e="recommend-list-item-container"]',
  desc: '[data-e2e="video-desc"]',
  author: '[data-e2e="video-author-uniqueid"]',
  videoLink: 'a[href*="/video/"]',
  video: "video",
};

export function createTikTokScraper(): Scraper {
  return {
    platform: "tiktok",
    start(sink) {
      debug("TikTok scraper started");
      return observeFeed(SEL.post, (container) => {
        const item = extractVideo(container);
        if (!item) return;
        container.dataset.fedoId = item.id;
        debug("NEW VIDEO", item);
        sink.onItem(item, container);
      });
    },
  };
}

function extractVideo(el: HTMLElement): FeedItem | null {
  const text = el.querySelector<HTMLElement>(SEL.desc)?.innerText.trim() ?? "";
  const handle = el.querySelector<HTMLElement>(SEL.author)?.innerText.trim() ?? "";
  if (!text && !handle) return null;

  const href = el.querySelector<HTMLAnchorElement>(SEL.videoLink)?.href;
  const videoId = href?.match(/\/video\/(\d+)/)?.[1] ?? hash(handle + text);
  const video = el.querySelector<HTMLVideoElement>(SEL.video);

  return {
    id: `tiktok:${videoId}`,
    platform: "tiktok",
    url: href,
    author: { handle },
    text,
    hashtags: extractHashtags(text),
    media: video ? [{ type: "video", url: video.currentSrc || video.src, posterUrl: video.poster || undefined }] : [],
    scrapedAt: Date.now(),
  };
}
