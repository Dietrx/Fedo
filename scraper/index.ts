/**
 * PATH 1 — SCRAPER. Public entry point. Only this file is imported by the glue code.
 * Contract: produce `FeedItem`s (see contracts/types.ts) and hand them to the sink.
 */
import type { Platform, Scraper } from "@contracts";
import { createXScraper } from "./platforms/x";
import { createTikTokScraper } from "./platforms/tiktok";

export function detectPlatform(hostname: string): Platform | null {
  if (/(^|\.)(x|twitter)\.com$/.test(hostname)) return "x";
  if (/(^|\.)tiktok\.com$/.test(hostname)) return "tiktok";
  return null;
}

export function createScraper(platform: Platform): Scraper {
  switch (platform) {
    case "x":
      return createXScraper();
    case "tiktok":
      return createTikTokScraper();
  }
}
