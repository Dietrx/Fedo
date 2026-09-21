/**
 * Shared sample data so every path can work without the others:
 * - AI dev runs these items through the analyzer (npm run dev:ai)
 * - UI dev renders these results in the playground (npm run dev:ui)
 * - Scraper dev can compare their output shape against these
 * Feel free to ADD fixtures.
 */
import type { AnalysisResult, FeedItem } from "./types";

export const FIXTURE_ITEMS: FeedItem[] = [
  {
    id: "x:1001",
    platform: "x",
    url: "https://x.com/example/status/1001",
    author: { handle: "outrage_daily", displayName: "Outrage Daily" },
    text: "THEY are destroying our country and the media won't tell you. Crime is up 300% since they arrived. Share before this gets deleted!",
    hashtags: ["breaking", "wakeup"],
    media: [],
    scrapedAt: 0,
  },
  {
    id: "x:1002",
    platform: "x",
    url: "https://x.com/example/status/1002",
    author: { handle: "jane_bakes", displayName: "Jane" },
    text: "Finally nailed the sourdough after 3 weeks. The trick was a longer cold proof overnight.",
    hashtags: [],
    media: [{ type: "image", url: "https://picsum.photos/600/400" }],
    scrapedAt: 0,
  },
  {
    id: "x:1003",
    platform: "x",
    author: { handle: "growth_guru_ai", displayName: "Growth Guru" },
    text: "In today's fast-paced world, unlocking your potential is more important than ever. Here are 7 game-changing tips 🧵👇 Like and RT if you agree!",
    hashtags: ["mindset"],
    media: [],
    scrapedAt: 0,
  },
  {
    id: "tiktok:2001",
    platform: "tiktok",
    author: { handle: "truthseeker" },
    text: "Nobody in the media wants you to know this 🤯",
    hashtags: ["government", "fyp"],
    media: [{ type: "video", url: "" }],
    captions: "Nobody wants you to know what the government is hiding. They are lying to you and it's time we fight back.",
    scrapedAt: 0,
  },
];

export const FIXTURE_RESULTS: AnalysisResult[] = [
  {
    itemId: "x:1001",
    overall: { level: "high", score: 0.98 },
    source: "mock",
    latencyMs: 180,
    explanation: "This post uses fear-based language and divides people into opposing groups. It states a statistic without a source.",
    signals: [
      { key: "political_content", score: 0.96 },
      { key: "fear_framing", score: 0.91, evidence: "destroying our country" },
      { key: "us_vs_them", score: 0.87, evidence: "THEY" },
      { key: "factual_claim", score: 0.84, evidence: "Crime is up 300%" },
      { key: "urgency_language", score: 0.78, evidence: "Share before this gets deleted" },
      { key: "conspiracy_framing", score: 0.66, evidence: "the media won't tell you" },
    ],
  },
  { itemId: "x:1002", overall: { level: "none", score: 0 }, source: "mock", latencyMs: 95, signals: [{ key: "political_content", score: 0.02 }] },
  {
    itemId: "x:1003",
    overall: { level: "medium", score: 0.5 },
    source: "mock",
    latencyMs: 120,
    explanation: "This post shows patterns typical for mass-produced content and asks for engagement.",
    signals: [
      { key: "possible_ai_slop", score: 0.89 },
      { key: "engagement_bait", score: 0.82, evidence: "Like and RT if you agree" },
    ],
  },
  {
    itemId: "tiktok:2001",
    overall: { level: "medium", score: 0.79 },
    source: "mock",
    latencyMs: 240,
    partial: true,
    explanation: "The speaker suggests hidden truths and calls viewers to act against a group.",
    signals: [
      { key: "political_content", score: 0.93 },
      { key: "conspiracy_framing", score: 0.9, evidence: "what the government is hiding" },
      { key: "us_vs_them", score: 0.71 },
      { key: "sensationalism", score: 0.88 },
      { key: "synthetic_media", score: 0.34 },
    ],
  },
];
