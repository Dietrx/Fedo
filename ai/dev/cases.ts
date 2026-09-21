/**
 * Regression cases for the local engine: what MUST fire, what must NOT, and the expected
 * intensity level. Run with `npx tsx ai/dev/eval.ts`. Add a case whenever a post is scored wrongly.
 */
import type { FeedItem, IntensityLevel, SignalKey } from "@contracts";

export interface Case {
  item: FeedItem;
  expect: SignalKey[];
  reject: SignalKey[];
  level: IntensityLevel[];
  /** Needs real language understanding (tone, irony) → skipped for the offline engine. */
  jevOnly?: boolean;
}

let n = 0;
const post = (text: string, extra: Partial<FeedItem> = {}): FeedItem => ({
  id: `case:${++n}`,
  platform: "x",
  author: { handle: "case" },
  text,
  hashtags: [],
  media: [],
  scrapedAt: 0,
  ...extra,
});

export const CASES: Case[] = [
  {
    item: post("Finally nailed the sourdough after 3 weeks. The trick was a longer cold proof overnight."),
    expect: [],
    reject: ["fear_framing", "factual_claim", "us_vs_them", "political_content"],
    level: ["none"],
  },
  {
    item: post("They said the party starts at 8, I told them we'd bring cake. Can't wait to see everyone!"),
    expect: [],
    reject: ["us_vs_them", "political_content", "scapegoating"],
    level: ["none"],
  },
  {
    item: post("According to the Federal Statistics Office, unemployment fell to 5.2% in August. https://example.org/report"),
    expect: [],
    reject: ["factual_claim", "fear_framing", "sensationalism"],
    level: ["none"],
  },
  {
    item: post("The government presented its new budget today. Parliament votes next week."),
    expect: ["political_content"],
    reject: ["political_persuasion", "fear_framing"],
    level: ["none"],
  },
  {
    // "parasites" / "rats" about animals must not count as dehumanizing. An invitation to visit IS mild promotion → "low" is fine.
    item: post("Our zoo's new exhibit shows how parasites and rats survive in cities. Open daily!"),
    expect: [],
    reject: ["dehumanizing_language", "scapegoating", "fear_framing"],
    level: ["none", "low"],
  },
  {
    item: post("These migrants are vermin. They are taking our jobs and destroying our way of life. Vote them out before it's too late!"),
    expect: ["dehumanizing_language", "scapegoating", "us_vs_them", "fear_framing", "political_persuasion"],
    reject: ["commercial_persuasion", "possible_ai_slop"],
    level: ["high"],
  },
  {
    item: post("WACHT AUF!! Die Medien verschweigen euch die Wahrheit über die Regierung. Diese Leute zerstören unser Land. Teilen bevor es gelöscht wird!"),
    expect: ["conspiracy_framing", "fear_framing", "us_vs_them", "urgency_language", "sensationalism", "political_content"],
    reject: ["commercial_persuasion"],
    level: ["high"],
  },
  {
    item: post("@senator_x is a complete clown and a liar. Pathetic."),
    expect: ["personal_attack"],
    reject: ["dehumanizing_language", "commercial_persuasion"],
    level: ["low", "medium"],
  },
  {
    item: post("This changed my skin in 2 weeks 😍 Use my code GLOW20 for 20% off, link in bio! #ad"),
    expect: ["commercial_persuasion"],
    reject: ["fear_framing", "political_content"],
    level: ["low", "medium"],
  },
  {
    item: post("Interesting thread on housing.", { quotedText: "THEY are destroying our country and the media won't tell you. Wake up!" }),
    expect: [],
    reject: ["scapegoating", "dehumanizing_language"],
    level: ["none", "low", "medium"],
  },
  // ── found on real feeds (fetch-live.ts): things the API analyzer got wrong at first ──
  {
    item: post("#depol #afd #merz", { hashtags: ["depol", "afd", "merz"] }),
    expect: [],
    reject: ["political_persuasion", "personal_attack", "us_vs_them"],
    level: ["none"],
  },
  {
    item: post("📊 Market report 21/09 🟢 AVAX: $11.36 (+11.7%) | Vol: $1.47B 🟢 ADA: $0.2447 (+10.9%) | Vol: $717M 🟢 DOGE: $0.0932 (+9.9%)"),
    expect: [],
    reject: ["fear_framing", "political_persuasion"],
    level: ["none", "low"],
  },
  {
    item: post("Breaking News: A police officer shot and injured a man in Austin, Texas, the latest violent episode amid the administration's push to increase deportations."),
    expect: ["political_content"],
    reject: ["scapegoating", "dehumanizing_language", "conspiracy_framing"],
    level: ["none", "low"],
  },
  {
    item: post("Humans strike again 😡"),
    expect: [],
    reject: ["scapegoating", "dehumanizing_language"],
    level: ["none", "low"],
  },
  {
    item: post("Weatherwatch: wildfires driven by global heating destroy UK bird habitats"),
    expect: [],
    reject: ["conspiracy_framing", "scapegoating"],
    level: ["none", "low"],
  },
  // ── irony, satire, memes (Jev only: the offline engine cannot read tone) ──
  {
    item: post("If you approach me gently, like you would with an insane animal, I will reward you with Unlimited Access. Take notice, and learn."),
    expect: [],
    reject: ["dehumanizing_language", "fear_framing"],
    level: ["none", "low"],
    jevOnly: true,
  },
  {
    item: post("'90s Grunge Singers Added to Endangered Species List"),
    expect: [],
    reject: ["dehumanizing_language", "factual_claim"],
    level: ["none", "low"],
    jevOnly: true,
  },
  {
    item: post("nobody:\nabsolutely nobody:\nmy cat at 3am: THE FLOOR IS LAVA AND I MUST DESTROY EVERYTHING"),
    expect: [],
    reject: ["fear_framing", "sensationalism", "anger_framing"],
    level: ["none"],
    jevOnly: true,
  },
  {
    item: post("Oh great, another brilliant idea from our genius government 🙄 Truly heroes. I just LOVE paying more taxes so they can waste it."),
    expect: ["political_content", "political_persuasion"],
    reject: ["dehumanizing_language"],
    level: ["low", "medium"],
    jevOnly: true,
  },
  {
    item: post("Those people are like rats lol, just joking... unless? 😏 Seriously though they breed like crazy and ruin every neighborhood."),
    expect: ["dehumanizing_language", "us_vs_them"],
    reject: [],
    level: ["medium", "high"],
    jevOnly: true,
  },
];
