/**
 * The Noul (yes/no) questions we ask Jev — one per text signal.
 * `instructions` comes from contracts/signals.ts (shared wording); `criteria` lives here because it is
 * prompt tuning: it tells the model what counts as a yes and, just as important, what does NOT.
 * Docs: https://docs.typesafe.ai/primitives/noul
 */
import { SIGNAL_KEYS, SIGNALS, type SignalKey } from "@contracts";

export interface NoulQuestion {
  type: "noul";
  instructions: string;
  criteria?: { true: string; false: string };
}

/** Jev only sees text → synthetic_media is left to a future vision branch. */
export const JEV_KEYS = SIGNAL_KEYS.filter((k) => k !== "synthetic_media");

const CRITERIA: Partial<Record<SignalKey, { true: string; false: string }>> = {
  political_content: {
    true: "Mentions governments, parties, politicians, elections, laws, or contested policy topics such as migration or taxes.",
    false: "Everyday, personal, entertainment, or commercial content without a political subject.",
  },
  political_persuasion: {
    true: "Pushes the audience toward a political side: calls to vote, support, oppose, or resist, or emotionally loaded framing of a political subject.",
    false: "Not political, or reports on politics neutrally without pushing a position.",
  },
  fear_framing: {
    true: "Presents a threat, danger, or looming disaster to move the audience (e.g. destruction, invasion, 'before it's too late', harm to your family).",
    false: "No threat language, or danger is reported factually and calmly.",
  },
  anger_framing: {
    true: "Wording chosen to provoke outrage: betrayal, disgrace, 'how dare they', 'enough is enough'.",
    false: "Calm or merely critical tone without outrage wording.",
  },
  us_vs_them: {
    true: "Sets an in-group ('we', 'our country', 'real people') against an out-group ('they', 'these people', 'the elites').",
    false: "'They' or 'them' is used as an ordinary pronoun for specific people, with no group opposition.",
  },
  scapegoating: {
    true: "Blames a group of people for broad problems such as crime, the economy, or the decline of a country.",
    false: "No group is blamed, or a specific actor is criticised for a specific, named action.",
  },
  urgency_language: {
    true: "Pressures the audience to act or share immediately: 'share before it's deleted', 'act now', 'wake up', 'last chance'.",
    false: "No time pressure, or a genuine date or deadline stated neutrally.",
  },
  sensationalism: {
    true: "Exaggerated or shocking wording, ALL-CAPS shouting, stacked exclamation marks or alarm emoji.",
    false: "Measured wording, even if the topic itself is serious.",
  },
  conspiracy_framing: {
    true: "Suggests hidden actors or suppressed truths: 'they don't want you to know', 'the media won't tell you', cover-ups.",
    false: "No claim of secrecy or suppression, or documented wrongdoing reported with a source.",
  },
  factual_claim: {
    true: "States a checkable fact, statistic, or number as true WITHOUT naming a source or linking to one.",
    false: "No factual claim, only opinion or personal experience, or the claim names or links its source.",
  },
  personal_attack: {
    true: "Insults or demeans a specific person (idiot, liar, clown, traitor) instead of addressing what they said or did.",
    false: "Criticises actions or arguments without insulting the person, or contains no criticism.",
  },
  dehumanizing_language: {
    true: "Describes people or a group as animals, vermin, parasites, disease, filth, or otherwise less than human.",
    false: "Such words are absent or refer to actual animals, biology, or objects rather than people.",
  },
  engagement_bait: {
    true: "Asks for likes, shares, follows, tags, or comments as its main purpose, or teases to keep people watching.",
    false: "Shares content without soliciting engagement.",
  },
  commercial_persuasion: {
    true: "Promotes a product, service, course, discount code, or 'link in bio', disclosed or not.",
    false: "Nothing is being sold or promoted.",
  },
  possible_ai_slop: {
    true: "Generic mass-produced phrasing: 'in today's fast-paced world', 'game-changing', 'unlock your potential', formulaic listicles.",
    false: "Specific, personal, or idiosyncratic writing.",
  },
};

export const JEV_QUESTIONS: Record<string, NoulQuestion> = Object.fromEntries(
  JEV_KEYS.map((key) => [key, { type: "noul" as const, instructions: SIGNALS[key].question, criteria: CRITERIA[key] }]),
);
