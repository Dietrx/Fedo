import type { SignalKey } from "./types";

/**
 * Human-readable meaning of each signal.
 * - AI path uses `question` to phrase the Jev decision.
 * - UI path uses `label` / `description` for display.
 * Wording principle: we describe TECHNIQUES, never judge opinions or intent.
 */
export const SIGNALS: Record<SignalKey, { label: string; description: string; question: string; group: "political" | "rhetoric" | "credibility" | "synthetic" }> = {
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
