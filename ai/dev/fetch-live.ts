/**
 * Pulls REAL public posts (no login needed) and converts them to FeedItems, to test the analyzer on
 * material nobody wrote with our lexicon in mind. Sources: Bluesky author feeds + Mastodon tag timelines.
 *   npx tsx ai/dev/fetch-live.ts <out.json>
 * Keep the output OUT of the repo (real people's posts) — write it to a temp folder.
 */
import { writeFileSync } from "node:fs";
import type { FeedItem } from "@contracts";

const BLUESKY = ["nytimes.com", "reuters.com", "washingtonpost.com", "theonion.com", "aoc.bsky.social", "meidastouch.com", "ronfilipkowski.bsky.social", "acyn.bsky.social", "georgetakei.bsky.social", "mcuban.bsky.social", "spiegel.de", "tagesschau.de"];
const MASTODON_TAGS = ["politics", "uspol", "depol", "crypto", "food", "cats", "climate", "deals", "ai", "photography"];
const PER_SOURCE = 8;

const hashtags = (t: string) => [...t.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1]!);
const stripHtml = (h: string) => h.replace(/<br\s*\/?>/g, "\n").replace(/<\/p>\s*<p>/g, "\n\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const items: FeedItem[] = [];
for (const actor of BLUESKY) {
  try {
    const json = await getJson(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${actor}&limit=${PER_SOURCE}&filter=posts_no_replies`);
    for (const { post, reason } of json.feed ?? []) {
      const text: string = post.record?.text ?? "";
      if (!text.trim()) continue;
      const embed = post.embed ?? {};
      const quoted = embed.record?.value?.text ?? embed.record?.record?.value?.text;
      const images = embed.images ?? embed.media?.images ?? [];
      items.push({
        id: `bsky:${post.uri.split("/").pop()}`,
        platform: "x",
        author: { handle: post.author.handle, displayName: post.author.displayName, verified: Boolean(post.author.verification?.verifiedStatus === "valid") },
        text,
        hashtags: hashtags(text),
        media: images.map((i: any) => ({ type: "image" as const, url: i.fullsize ?? "", altText: i.alt || undefined })),
        quotedText: quoted || undefined,
        isRepost: Boolean(reason),
        scrapedAt: Date.now(),
      });
    }
  } catch (e) {
    console.warn(`skip bluesky ${actor}:`, (e as Error).message);
  }
}
for (const tag of MASTODON_TAGS) {
  try {
    const json = await getJson(`https://mastodon.social/api/v1/timelines/tag/${tag}?limit=${PER_SOURCE}`);
    for (const s of json) {
      const text = stripHtml(s.content ?? "").trim();
      if (!text) continue;
      items.push({
        id: `masto:${s.id}`,
        platform: "x",
        author: { handle: s.account.acct, displayName: s.account.display_name },
        text,
        hashtags: hashtags(text),
        media: (s.media_attachments ?? []).map((m: any) => ({ type: m.type === "video" ? ("video" as const) : ("image" as const), url: m.url ?? "", altText: m.description || undefined })),
        scrapedAt: Date.now(),
      });
    }
  } catch (e) {
    console.warn(`skip mastodon #${tag}:`, (e as Error).message);
  }
}

const out = process.argv[2];
if (!out) throw new Error("usage: npx tsx ai/dev/fetch-live.ts <out.json>");
writeFileSync(out, JSON.stringify(items, null, 1));
console.log(`${items.length} real posts → ${out}`);
