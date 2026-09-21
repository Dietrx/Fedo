import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collectTweetResults, mapTweetResult, parseCreatedAt } from "../platforms/x-graphql";

const timeline = JSON.parse(readFileSync(new URL("./fixtures/x-graphql-timeline.json", import.meta.url), "utf8"));

test("collectTweetResults finds every top-level tweet in a timeline response", () => {
  const results = collectTweetResults(timeline);
  assert.equal(results.length, 3);
});

test("long post: note_tweet text, expanded links, structured hashtags, alt text, counts, community note", () => {
  const [first] = collectTweetResults(timeline);
  const mapped = mapTweetResult(first!, 5);
  assert.ok(mapped);
  const { item, extras } = mapped;
  assert.equal(item.id, "x:1001");
  assert.equal(item.url, "https://x.com/jane_bakes/status/1001");
  assert.equal(item.author.handle, "jane_bakes");
  assert.equal(item.author.displayName, "Jane");
  assert.equal(item.author.verified, true);
  assert.ok(item.text.startsWith("Finally nailed the sourdough"));
  assert.ok(item.text.includes("https://example.org/sourdough-notes"), "t.co link expanded");
  assert.ok(!item.text.includes("t.co"), "no t.co left");
  assert.ok(!item.text.includes("…"), "full note text, not the truncated legacy text");
  assert.deepEqual(item.hashtags, ["sourdough", "baking"]);
  assert.equal(item.media.length, 1);
  assert.equal(item.media[0]!.altText, "A round loaf with a deep ear on a wooden board");
  assert.equal(item.createdAt, "2026-09-21T10:00:00.000Z");
  assert.equal(item.scrapedAt, 5);
  assert.equal(item.isRepost, undefined);
  assert.equal(extras.counts.views, 123456);
  assert.equal(extras.counts.likes, 10);
  assert.equal(extras.language, "en");
  assert.ok(extras.communityNote?.includes("personal blog"));
  assert.deepEqual(extras.links, ["https://example.org/sourdough-notes"]);
});

test("repost: keyed on the ORIGINAL id, original author, best mp4 variant, verified via `verification`", () => {
  const [, second] = collectTweetResults(timeline);
  const mapped = mapTweetResult(second!);
  assert.ok(mapped);
  assert.equal(mapped.item.id, "x:1000");
  assert.equal(mapped.item.isRepost, true);
  assert.equal(mapped.item.author.handle, "growth_guru");
  assert.equal(mapped.item.author.verified, true);
  assert.equal(mapped.item.text, "Seven tips for better focus");
  assert.equal(mapped.item.media[0]!.type, "video");
  assert.equal(mapped.item.media[0]!.url, "https://video.twimg.com/ext_tw_video/1000/pu/vid/720x1280/high.mp4");
  assert.match(mapped.item.media[0]!.posterUrl!, /poster\.jpg$/);
});

test("quote inside TweetWithVisibilityResults: quotedText filled, quote link removed, HTML entities decoded", () => {
  const [, , third] = collectTweetResults(timeline);
  const mapped = mapTweetResult(third!);
  assert.ok(mapped);
  assert.equal(mapped.item.id, "x:1003");
  assert.equal(mapped.item.text, "Interesting take on cold proofing & scoring 👇");
  assert.equal(mapped.item.quotedText, "Cold proof overnight, then score deep. That's the whole secret.");
  assert.deepEqual(mapped.extras.links, []);
});

test("unknown shapes map to null, legacy timestamps parse", () => {
  assert.equal(mapTweetResult({}), null);
  assert.equal(mapTweetResult({ rest_id: "1" }), null);
  assert.equal(parseCreatedAt("Wed Oct 10 20:19:24 +0000 2018"), "2018-10-10T20:19:24.000Z");
  assert.equal(parseCreatedAt("nonsense"), undefined);
});
