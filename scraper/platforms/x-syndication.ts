/**
 * X syndication payload → FeedItem. Third, login-free way to get one post by id:
 * `https://cdn.syndication.twimg.com/tweet-result?id=<id>&token=<token>` (the endpoint X's own embeds use;
 * verified live 2026-09-21, see scraper/test/fixtures/x-syndication-tweet.json). Intended as a fallback for
 * a single post (e.g. a truncated long post or a quoted post the DOM did not render), not for the feed:
 * one request per post and the endpoint rate-limits.
 */
import type { FeedItem, MediaRef } from "@contracts";
import { extractHashtags, uniq } from "../observe";

export interface SyndicationTweetRaw {
  id_str?: string;
  text?: string;
  lang?: string;
  created_at?: string;
  favorite_count?: number;
  conversation_count?: number;
  user?: { screen_name?: string; name?: string; is_blue_verified?: boolean; verified?: boolean };
  entities?: { hashtags?: { text?: string }[]; urls?: { url?: string; expanded_url?: string }[]; media?: { url?: string }[] };
  mediaDetails?: { type?: string; media_url_https?: string; ext_alt_text?: string; video_info?: { variants?: { bitrate?: number; content_type?: string; url?: string }[] } }[];
  quoted_tweet?: SyndicationTweetRaw;
}

export function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

export function syndicationUrl(id: string): string {
  return `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(id)}&token=${syndicationToken(id)}`;
}

export function mapSyndicationTweet(raw: SyndicationTweetRaw, now: number = Date.now()): FeedItem | null {
  const id = raw.id_str;
  if (!id) return null;
  const handle = raw.user?.screen_name ?? "";
  const text = cleanText(raw);
  const hashtags = uniq((raw.entities?.hashtags ?? []).map((h) => (h.text ?? "").toLowerCase()).filter(Boolean));
  const media: MediaRef[] = [];
  for (const m of raw.mediaDetails ?? []) {
    const altText = m.ext_alt_text || undefined;
    if (m.type === "photo" && m.media_url_https) media.push({ type: "image", url: m.media_url_https, altText });
    else if (m.type === "video" || m.type === "animated_gif") {
      const best = (m.video_info?.variants ?? []).filter((v) => v.url && (!v.content_type || v.content_type === "video/mp4")).sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
      if (best?.url) media.push({ type: m.type === "video" ? "video" : "gif", url: best.url, posterUrl: m.media_url_https || undefined, altText });
    }
  }
  const createdMs = raw.created_at ? Date.parse(raw.created_at) : NaN;
  return {
    id: `x:${id}`,
    platform: "x",
    url: handle ? `https://x.com/${handle}/status/${id}` : `https://x.com/i/status/${id}`,
    author: { handle, displayName: raw.user?.name || undefined, verified: raw.user ? !!(raw.user.is_blue_verified || raw.user.verified) : undefined },
    text,
    hashtags: hashtags.length ? hashtags : extractHashtags(text),
    media,
    quotedText: raw.quoted_tweet ? cleanText(raw.quoted_tweet) || undefined : undefined,
    createdAt: Number.isNaN(createdMs) ? undefined : new Date(createdMs).toISOString(),
    scrapedAt: now,
  };
}

function cleanText(raw: SyndicationTweetRaw): string {
  let out = raw.text ?? "";
  for (const m of raw.entities?.media ?? []) if (m.url) out = out.split(m.url).join("");
  for (const u of raw.entities?.urls ?? []) if (u.url) out = out.split(u.url).join(u.expanded_url ?? u.url);
  return out.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}
