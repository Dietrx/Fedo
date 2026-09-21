/**
 * PATH 1 — SCRAPER. Public entry point. Only this file is imported by the glue code.
 * Contract: produce `FeedItem`s (see contracts/types.ts) and hand them to the sink.
 */
import type { Platform, Scraper } from "@contracts";
import { createXScraper } from "./platforms/x";
import { createTikTokScraper } from "./platforms/tiktok";
import { watchVideos } from "./video";

export function detectPlatform(hostname: string): Platform | null {
  if (/(^|\.)(x|twitter)\.com$/.test(hostname)) return "x";
  if (/(^|\.)tiktok\.com$/.test(hostname)) return "tiktok";
  return null;
}

export function createScraper(platform: Platform): Scraper {
  const posts = platform === "x" ? createXScraper() : createTikTokScraper();
  // Posts come from the platform scraper; the audio of the playing video comes from the shared watcher.
  return {
    platform,
    start(sink) {
      const stopPosts = posts.start(sink);
      const stopVideos = watchVideos(sink);
      return () => {
        stopPosts();
        stopVideos();
      };
    },
  };
}
