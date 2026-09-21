/**
 * TikTok web (For You feed, profile and video pages).
 *
 * Data path (measured 2026-09-21, see scraper/RESEARCH.md):
 *   primary  — the item JSON TikTok itself loads (`/api/recommend/item_list/`, 8 items per response, arriving
 *              seconds before the user reaches them), handed over by scraper/main-world.ts via the bridge and
 *              matched to the article through the `data-fedo-tiktok-id` attribute the MAIN-world script writes.
 *   fallback — DOM only (`video-desc`, the `/@handle` link, the <video>). The For-You DOM carries NO video id,
 *              so the fallback id is a hash of handle + text and stats/captions/createdAt stay empty.
 * The currently playing video (`play` event) drives the transcript channel: platform captions when the item has
 * a WebVTT track, local STT otherwise (scraper/transcript/).
 */
import type { FeedItem, MediaRef, Scraper } from "@contracts";
import { debug, extractHashtags, hash, trackFeed } from "../observe";
import { listenBridge, mainWorldPresent, TIKTOK_ID_ATTR } from "../bridge";
import { isTikTokItemRaw, mapTikTokItem, type MappedTikTok } from "./tiktok-item";
import { createTranscriptController } from "../transcript/controller";

const SEL = {
  post: 'article[data-e2e="feed-video"], [data-e2e="recommend-list-item-container"]',
  desc: '[data-e2e="video-desc"]',
  authorLink: 'a[href^="/@"]',
  videoLink: 'a[href*="/video/"]',
  video: "video",
};

/**
 * How long a filled article may wait for the MAIN-world id before the DOM fallback (hash id, no stats/captions)
 * is used. Measured: the id normally arrives in the same frame; one item in 7 needed longer than 400 ms and was
 * emitted twice (hash id, then real id) — hence the generous window.
 */
const ID_GRACE_MS = 1500;

export function createTikTokScraper(): Scraper {
  return {
    platform: "tiktok",
    start(sink) {
      const records = new Map<string, MappedTikTok>(); // TikTok id → mapped item from the bridge
      const anchors = new Map<string, HTMLElement>(); // FeedItem.id → element it was emitted with
      const firstSeen = new WeakMap<HTMLElement, number>();
      const transcript = createTranscriptController(sink, { log: debug });
      debug("TikTok scraper started", mainWorldPresent() ? "(bridge active)" : "(DOM fallback only — main-world script not installed)");

      const stopBridge = listenBridge((msg) => {
        for (const r of msg.records) {
          if (r.kind !== "tiktok-item" || !isTikTokItemRaw(r.item)) continue;
          const mapped = mapTikTokItem(r.item);
          if (!mapped || records.has(mapped.rawId)) continue;
          records.set(mapped.rawId, mapped);
          if (mapped.extras.caption) transcript.prefetch(mapped.item.id, mapped.extras.caption.urls);
        }
      });

      const resolve = (el: HTMLElement): { item: FeedItem; mapped?: MappedTikTok } | null => {
        const rawId = el.getAttribute(TIKTOK_ID_ATTR);
        const mapped = rawId ? records.get(rawId) : undefined;
        if (mapped) {
          const captions = transcript.captionsNow(mapped.item.id);
          return { item: { ...mapped.item, ...(captions ? { captions } : {}), scrapedAt: Date.now() }, mapped };
        }
        const item = extractFromDom(el);
        return item ? { item } : null;
      };

      // declared before `emit`: trackFeed scans synchronously at start and may call emit right away
      let activeVideo: HTMLVideoElement | undefined;

      const emit = (el: HTMLElement) => {
        const r = resolve(el);
        if (!r) return;
        if (anchors.get(r.item.id) === el) return;
        const previous = el.dataset.fedoId;
        if (previous && previous !== r.item.id && anchors.get(previous) === el) {
          // the article was emitted under a fallback (hash) id and now has its real id: retire the old one first
          anchors.delete(previous);
          sink.onItemRemoved?.(previous);
        }
        anchors.set(r.item.id, el);
        el.dataset.fedoId = r.item.id;
        debug("NEW VIDEO", r.item, r.mapped?.extras);
        sink.onItem(r.item, el);
        if (activeVideo && activeVideo.closest<HTMLElement>(SEL.post) === el) startTranscript(el, activeVideo);
      };

      const hasContent = (el: HTMLElement) => !!(el.querySelector(SEL.desc)?.textContent?.trim() || el.querySelector(SEL.video));
      // Ready = has content AND (no bridge | its record is in the cache | waited long enough). The id attribute alone is
      // not enough: right after a late install the attribute exists while the replayed record is still in flight.
      const isReady = (el: HTMLElement) => {
        if (!hasContent(el)) return false;
        if (!mainWorldPresent()) return true;
        const rawId = el.getAttribute(TIKTOK_ID_ATTR);
        if (rawId && records.has(rawId)) return true;
        const t0 = firstSeen.get(el) ?? Date.now();
        firstSeen.set(el, t0);
        return Date.now() - t0 > ID_GRACE_MS;
      };
      const stopFeed = trackFeed(SEL.post, {
        isReady,
        onReady: emit,
        onLeave(el) {
          const id = el.dataset.fedoId;
          if (id && anchors.get(id) === el) {
            anchors.delete(id);
            sink.onItemRemoved?.(id);
          }
        },
        retryMs: ID_GRACE_MS,
      });

      const startTranscript = (el: HTMLElement, video: HTMLVideoElement) => {
        const id = el.dataset.fedoId;
        if (!id) return;
        const rawId = el.getAttribute(TIKTOK_ID_ATTR);
        const mapped = rawId ? records.get(rawId) : undefined;
        transcript.setActive({
          itemId: id,
          video,
          captionUrls: mapped?.extras.caption?.urls,
          mediaUrl: mapped?.item.media.find((m) => m.type === "video")?.url,
          language: mapped?.extras.language,
        });
      };

      // The playing video decides which item gets the transcript. An article that is not ready yet (waiting for its
      // id from the MAIN world) is NOT emitted here — trackFeed emits it when ready and then starts the transcript.
      const onPlay = (ev: Event) => {
        const video = ev.target;
        if (!(video instanceof HTMLVideoElement)) return;
        const el = video.closest<HTMLElement>(SEL.post);
        if (!el) return;
        activeVideo = video;
        if (!el.dataset.fedoId && isReady(el)) emit(el);
        else if (el.dataset.fedoId) startTranscript(el, video);
      };
      document.addEventListener("play", onPlay, true);

      return () => {
        stopFeed();
        stopBridge();
        document.removeEventListener("play", onPlay, true);
        transcript.stop();
      };
    },
  };
}

function extractFromDom(el: HTMLElement): FeedItem | null {
  const text = (el.querySelector<HTMLElement>(SEL.desc)?.innerText ?? "").replace(/\s+/g, " ").trim();
  const handle = el.querySelector<HTMLAnchorElement>(SEL.authorLink)?.getAttribute("href")?.match(/^\/@([^/?#]+)/)?.[1] ?? "";
  if (!text && !handle) return null;

  const href = el.querySelector<HTMLAnchorElement>(SEL.videoLink)?.href;
  const videoId = href?.match(/\/video\/(\d+)/)?.[1] ?? hash(handle + text);
  const video = el.querySelector<HTMLVideoElement>(SEL.video);
  const media: MediaRef[] = video ? [{ type: "video", url: video.currentSrc || video.src, posterUrl: video.poster || undefined }] : [];

  return {
    id: `tiktok:${videoId}`,
    platform: "tiktok",
    url: href ?? (handle && /^\d+$/.test(videoId) ? `https://www.tiktok.com/@${handle}/video/${videoId}` : undefined),
    author: { handle },
    text,
    hashtags: extractHashtags(text),
    media,
    scrapedAt: Date.now(),
  };
}
