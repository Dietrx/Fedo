/**
 * X GraphQL `tweet_results.result` → FeedItem.
 *
 * Shape source: the timeline entities X's web app receives from `/i/api/graphql/<hash>/HomeTimeline`,
 * `TweetDetail`, `UserTweets`, `SearchTimeline` … They all wrap the same `Tweet` entity. Field names follow the
 * public type definitions of the-convocation/twitter-scraper (timeline-v1.ts / timeline-v2.ts) and X's
 * syndication payloads; the logged-in HomeTimeline response itself could NOT be observed in this session
 * (test profile logged out) — see RESEARCH.md "X" and the console probe in scraper/research/console-probes/.
 * Everything is optional; unknown shapes map to null instead of throwing.
 */
import type { FeedItem, MediaRef } from "@contracts";
import { extractHashtags, uniq } from "../observe";

interface EntitySet {
  hashtags?: { text?: string }[];
  user_mentions?: { screen_name?: string }[];
  urls?: { url?: string; expanded_url?: string; display_url?: string }[];
  media?: { url?: string }[];
}

interface MediaRaw {
  type?: string;
  media_url_https?: string;
  url?: string;
  ext_alt_text?: string;
  video_info?: { variants?: { bitrate?: number; content_type?: string; url?: string }[] };
}

export interface UserResultRaw {
  rest_id?: string;
  is_blue_verified?: boolean;
  legacy?: { screen_name?: string; name?: string; verified?: boolean };
  core?: { screen_name?: string; name?: string };
  verification?: { verified?: boolean };
}

export interface LegacyTweetRaw {
  id_str?: string;
  full_text?: string;
  created_at?: string;
  lang?: string;
  favorite_count?: number;
  retweet_count?: number;
  reply_count?: number;
  quote_count?: number;
  bookmark_count?: number;
  possibly_sensitive?: boolean;
  conversation_id_str?: string;
  in_reply_to_status_id_str?: string;
  quoted_status_id_str?: string;
  entities?: EntitySet;
  extended_entities?: { media?: MediaRaw[] };
  retweeted_status_result?: { result?: TweetResultRaw };
}

export interface TweetResultRaw {
  __typename?: string;
  rest_id?: string;
  /** `TweetWithVisibilityResults` wraps the real tweet here. */
  tweet?: TweetResultRaw;
  core?: { user_results?: { result?: UserResultRaw } };
  legacy?: LegacyTweetRaw;
  note_tweet?: { note_tweet_results?: { result?: { text?: string; entity_set?: EntitySet } } };
  quoted_status_result?: { result?: TweetResultRaw };
  views?: { count?: string };
  birdwatch_pivot?: { title?: string; subtitle?: { text?: string }; note?: { rest_id?: string } };
}

/** Data X provides that has no FeedItem field (yet). Documented as contract proposals in RESEARCH.md. */
export interface XExtras {
  language?: string;
  counts: { likes?: number; reposts?: number; replies?: number; quotes?: number; bookmarks?: number; views?: number };
  /** Community Note text attached by X (Birdwatch). Strong credibility signal for the analysis. */
  communityNote?: string;
  mentions: string[];
  links: string[];
  possiblySensitive?: boolean;
  conversationId?: string;
  inReplyToId?: string;
}

export interface MappedTweet {
  item: FeedItem;
  extras: XExtras;
  rawId: string;
}

/** Timeline responses nest tweets ~10 levels deep; the cap only guards against pathological payloads. */
const MAX_WALK_DEPTH = 30;

/** Walks any GraphQL response and returns every Tweet entity it contains, in document order. */
export function collectTweetResults(json: unknown): TweetResultRaw[] {
  const out: TweetResultRaw[] = [];
  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== "object" || depth > MAX_WALK_DEPTH) return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth + 1);
      return;
    }
    const o = node as Record<string, unknown>;
    if (isTweetResult(o)) {
      out.push(o);
      return; // nested quoted/retweeted tweets are handled by the mapper
    }
    for (const child of Object.values(o)) walk(child, depth + 1);
  };
  walk(json, 0);
  return out;
}

export function isTweetResult(v: unknown): v is TweetResultRaw {
  if (!v || typeof v !== "object") return false;
  const r = v as TweetResultRaw;
  if (r.__typename === "TweetWithVisibilityResults" && r.tweet) return isTweetResult(r.tweet);
  return typeof r.rest_id === "string" && !!r.legacy && typeof r.legacy === "object" && typeof r.legacy.full_text === "string";
}

export function mapTweetResult(input: TweetResultRaw, now: number = Date.now()): MappedTweet | null {
  const outer = unwrap(input);
  if (!outer?.rest_id || !outer.legacy) return null;

  // A repost carries the original tweet inside; the DOM article links to the ORIGINAL id, so we key on that.
  const original = unwrap(outer.legacy.retweeted_status_result?.result);
  const isRepost = !!original?.rest_id && !!original.legacy;
  const tweet = isRepost ? original! : outer;
  const legacy = tweet.legacy!;
  const rawId = tweet.rest_id!;

  const user = tweet.core?.user_results?.result;
  const handle = user?.legacy?.screen_name ?? user?.core?.screen_name ?? "";
  const displayName = user?.legacy?.name ?? user?.core?.name ?? undefined;
  const verified = user ? !!(user.is_blue_verified || user.legacy?.verified || user.verification?.verified) : undefined;

  const note = tweet.note_tweet?.note_tweet_results?.result;
  const entities = note?.entity_set ?? legacy.entities ?? {};
  const quoted = unwrap(tweet.quoted_status_result?.result);
  const quotedId = quoted?.rest_id ?? legacy.quoted_status_id_str;
  const text = expandText(note?.text ?? legacy.full_text ?? "", entities, legacy.entities, quotedId);

  const hashtags = uniq((entities.hashtags ?? []).map((h) => (h.text ?? "").toLowerCase()).filter(Boolean));

  const item: FeedItem = {
    id: `x:${rawId}`,
    platform: "x",
    url: handle ? `https://x.com/${handle}/status/${rawId}` : `https://x.com/i/status/${rawId}`,
    author: { handle, displayName, verified },
    text,
    hashtags: hashtags.length ? hashtags : extractHashtags(text),
    media: mediaOf(legacy),
    quotedText: quoted ? quotedTextOf(quoted) : undefined,
    isRepost: isRepost || undefined,
    createdAt: parseCreatedAt(legacy.created_at),
    scrapedAt: now,
  };

  const extras: XExtras = {
    language: legacy.lang || undefined,
    counts: {
      likes: legacy.favorite_count,
      reposts: legacy.retweet_count,
      replies: legacy.reply_count,
      quotes: legacy.quote_count,
      bookmarks: legacy.bookmark_count,
      views: tweet.views?.count ? Number(tweet.views.count) : undefined,
    },
    communityNote: tweet.birdwatch_pivot?.subtitle?.text || tweet.birdwatch_pivot?.title || undefined,
    mentions: uniq((entities.user_mentions ?? []).map((m) => m.screen_name ?? "").filter(Boolean)),
    links: uniq((entities.urls ?? []).map((u) => u.expanded_url ?? "").filter((u) => u && !(quotedId && u.endsWith(`/status/${quotedId}`)))),
    possiblySensitive: legacy.possibly_sensitive,
    conversationId: legacy.conversation_id_str,
    inReplyToId: legacy.in_reply_to_status_id_str || undefined,
  };
  return { item, extras, rawId };
}

function unwrap(r: TweetResultRaw | undefined): TweetResultRaw | undefined {
  if (!r) return undefined;
  return r.__typename === "TweetWithVisibilityResults" && r.tweet ? r.tweet : r;
}

function quotedTextOf(q: TweetResultRaw): string | undefined {
  const legacy = q.legacy;
  const note = q.note_tweet?.note_tweet_results?.result;
  const raw = note?.text ?? legacy?.full_text;
  if (!raw) return undefined;
  const t = expandText(raw, note?.entity_set ?? legacy?.entities ?? {}, legacy?.entities, undefined);
  return t || undefined;
}

/**
 * full_text contains t.co links: media links are removed (the media is in `media`), the quote link is removed
 * (the quote is in `quotedText`), every other link is replaced by its expanded URL.
 */
function expandText(text: string, entities: EntitySet, legacyEntities: EntitySet | undefined, quotedId: string | undefined): string {
  let out = text;
  const mediaLinks = [...(entities.media ?? []), ...(legacyEntities?.media ?? [])].map((m) => m.url).filter(Boolean) as string[];
  for (const link of mediaLinks) out = out.split(link).join("");
  for (const u of entities.urls ?? []) {
    if (!u.url) continue;
    const isQuoteLink = !!quotedId && !!u.expanded_url && u.expanded_url.endsWith(`/status/${quotedId}`);
    out = out.split(u.url).join(isQuoteLink ? "" : u.expanded_url ?? u.display_url ?? u.url);
  }
  return decodeEntities(out).replace(/[ \t]+\n/g, "\n").trim();
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function mediaOf(legacy: LegacyTweetRaw): MediaRef[] {
  const media: MediaRef[] = [];
  for (const m of legacy.extended_entities?.media ?? []) {
    const alt = m.ext_alt_text || undefined;
    if (m.type === "photo" && m.media_url_https) {
      media.push({ type: "image", url: m.media_url_https, altText: alt });
    } else if (m.type === "video" || m.type === "animated_gif") {
      const best = (m.video_info?.variants ?? [])
        .filter((v) => v.url && (!v.content_type || v.content_type === "video/mp4"))
        .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
      if (best?.url) media.push({ type: m.type === "video" ? "video" : "gif", url: best.url, posterUrl: m.media_url_https || undefined, altText: alt });
    }
  }
  return media;
}

/** X's legacy timestamp: "Wed Oct 10 20:19:24 +0000 2018" → ISO 8601. */
export function parseCreatedAt(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}
