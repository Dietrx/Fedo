import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mapSyndicationTweet, syndicationToken, syndicationUrl } from "../platforms/x-syndication";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/x-syndication-tweet.json", import.meta.url), "utf8"));

test("live-captured syndication payload maps to a FeedItem", () => {
  const item = mapSyndicationTweet(fixture.tweet, 7);
  assert.ok(item);
  assert.equal(item.id, "x:20");
  assert.equal(item.url, "https://x.com/jack/status/20");
  assert.equal(item.author.handle, "jack");
  assert.equal(item.author.displayName, "jack");
  assert.equal(item.author.verified, true);
  assert.equal(item.text, "just setting up my twttr");
  assert.deepEqual(item.hashtags, []);
  assert.deepEqual(item.media, []);
  assert.equal(item.createdAt, "2006-03-21T20:50:14.000Z");
  assert.equal(item.scrapedAt, 7);
});

test("token formula matches the one X's embed uses (no dots, no zero runs)", () => {
  const token = syndicationToken("20");
  assert.match(token, /^[0-9a-z]+$/);
  assert.ok(!token.includes("."));
  assert.equal(syndicationUrl("20"), `https://cdn.syndication.twimg.com/tweet-result?id=20&token=${token}`);
});
