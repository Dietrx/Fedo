/**
 * Regression cases for the local engine: what MUST fire, what must NOT, and the expected
 * intensity level. Run with `npx tsx ai/dev/eval.ts`. Add a case whenever a post is scored wrongly.
 */
import type { FeedItem, SignalKey } from "@contracts";
import type { IntensityLevel } from "../assess";

export interface Case {
  item: FeedItem;
  expect: SignalKey[];
  reject: SignalKey[];
  level: IntensityLevel[];
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
    item: post("Our zoo's new exhibit shows how parasites and rats survive in cities. Open daily!"),
    expect: [],
    reject: ["dehumanizing_language"],
    level: ["none"],
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
];
