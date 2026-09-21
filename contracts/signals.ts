import type { SignalKey } from "./types";

/**
 * Human-readable meaning of each signal.
 * - AI path uses `question` to phrase the Jev decision.
 * - UI path uses `label` / `description` for display.
 * Wording principle: we describe TECHNIQUES, never judge opinions or intent.
 */
export type SignalGroup = "political" | "rhetoric" | "credibility" | "synthetic";

export const SIGNAL_GROUPS: Record<SignalGroup, { label: string; description: string }> = {
  political: { label: "Political", description: "Talks about or argues for a political position." },
  rhetoric: { label: "Emotional rhetoric", description: "Fear, anger, in-group vs. out-group, attacks." },
  credibility: { label: "Credibility", description: "Unsourced claims, conspiracy framing, bait, ads." },
  synthetic: { label: "Synthetic", description: "Signs of generated or manipulated content." },
};

/**
 * Where a signal comes from in the literature (shown in the "Why?" panel and the pitch).
 * Keep it to one line: authors, year, venue, what it found.
 */
export const RESEARCH: Partial<Record<SignalKey, string>> = {
  fear_framing: "Da San Martino et al. 2019 (EMNLP) / SemEval-2020 Task 11: 'appeal to fear' is one of the 14 catalogued propaganda techniques.",
  anger_framing: "Brady et al. 2017 (PNAS): each moral-emotional word raised retweet rates by ~20 %.",
  us_vs_them: "Rathje, Van Bavel & van der Linden 2021 (PNAS): out-group words raised the odds of a share by ~67 %.",
  scapegoating: "Roozenbeek et al. 2022 (Science Advances): scapegoating is one of the techniques that inoculation training teaches people to spot.",
  personal_attack: "Roozenbeek et al. 2022 (Science Advances): ad-hominem attacks are a core manipulation technique in inoculation research.",
  dehumanizing_language: "Da San Martino et al. 2019 (EMNLP): 'name calling / labeling' technique; dehumanizing terms are its strongest form.",
  conspiracy_framing: "SemEval-2020 Task 11: 'doubt' and 'causal oversimplification'; Vosoughi, Roy & Aral 2018 (Science): false news spread ~70 % more likely.",
  factual_claim: "Pennycook et al. 2021 (Nature): nudging attention to accuracy at the moment of sharing reduces the spread of misinformation.",
  sensationalism: "Da San Martino et al. 2019 (EMNLP): 'exaggeration / minimisation' and 'loaded language'.",
  urgency_language: "Roozenbeek & van der Linden 2019 ('Bad News'): manufactured urgency is one of the trained manipulation techniques.",
  engagement_bait: "Vosoughi, Roy & Aral 2018 (Science): novelty and emotional reactions, not truth, drive diffusion.",
};

export const SIGNALS: Record<SignalKey, { label: string; description: string; question: string; group: SignalGroup }> = {
  political_content: { group: "political", label: "Political content", description: "The post discusses political topics, parties or policies.", question: "Is this content about politics, political actors or policy?" },
  political_persuasion: { group: "political", label: "Political persuasion", description: "The post tries to change political opinions or votes.", question: "Does this content try to persuade the audience toward a political position?" },
  fear_framing: { group: "rhetoric", label: "Fear framing", description: "Uses fear or threat to make a point.", question: "Does this content use fear or threat to persuade?" },
  anger_framing: { group: "rhetoric", label: "Anger framing", description: "Tries to provoke outrage or anger.", question: "Does this content try to provoke anger or outrage?" },
  us_vs_them: { group: "rhetoric", label: "Us vs. them", description: "Divides people into opposing in-groups and out-groups.", question: "Does this content frame an in-group against an out-group?" },
  scapegoating: { group: "rhetoric", label: "Scapegoating", description: "Blames a group for broad problems.", question: "Does this content blame a group of people for broad societal problems?" },
  urgency_language: { group: "rhetoric", label: "Urgency", description: "Pushes you to act or share right now.", question: "Does this content create artificial urgency or push immediate action?" },
  sensationalism: { group: "rhetoric", label: "Sensational language", description: "Exaggerated, shocking wording.", question: "Is the language sensational or exaggerated?" },
  conspiracy_framing: { group: "credibility", label: "Conspiracy framing", description: "Suggests hidden actors or suppressed truths.", question: "Does this content suggest a conspiracy or hidden/suppressed truth?" },
  factual_claim: { group: "credibility", label: "Unsupported factual claim", description: "States facts or numbers without a source.", question: "Does this content make a factual claim without citing a source?" },
  personal_attack: { group: "rhetoric", label: "Personal attack", description: "Attacks a person instead of an argument.", question: "Does this content attack a person rather than an argument?" },
  dehumanizing_language: { group: "rhetoric", label: "Dehumanizing language", description: "Describes people as less than human.", question: "Does this content use dehumanizing language about people?" },
  engagement_bait: { group: "credibility", label: "Engagement bait", description: "Designed mainly to farm likes, shares or replies.", question: "Is this content primarily designed to farm engagement?" },
  commercial_persuasion: { group: "credibility", label: "Commercial persuasion", description: "Advertises or sells something, maybe undisclosed.", question: "Does this content promote a product or service?" },
  possible_ai_slop: { group: "synthetic", label: "Possible AI-generated text", description: "Text shows typical patterns of generated content.", question: "Does this text look mass-produced or AI-generated?" },
  synthetic_media: { group: "synthetic", label: "Synthetic media signals", description: "Image/video shows signs of generation or manipulation.", question: "Does the media show signs of being AI-generated or manipulated?" },
};
