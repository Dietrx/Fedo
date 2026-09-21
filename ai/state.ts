/**
 * Turns an AnalysisInput into the compact textual state that Jev (or any LLM) gets to see.
 * Video: spoken text + captions + post metadata. Vision output can be added here later.
 */
import type { AnalysisInput } from "@contracts";

export function buildState(input: AnalysisInput): string {
  const { item } = input;
  const lines = [
    `platform: ${item.platform}`,
    `author: @${item.author.handle}${item.author.verified ? " (verified)" : ""}`,
    `text: ${item.text}`,
  ];
  if (item.quotedText) lines.push(`quoted_text: ${item.quotedText}`);
  if (item.hashtags.length) lines.push(`hashtags: ${item.hashtags.map((h) => "#" + h).join(" ")}`);
  if (item.captions) lines.push(`captions: ${item.captions}`);
  if (item.media.length) lines.push(`media: ${item.media.map((m) => m.type + (m.altText ? ` (alt: ${m.altText})` : "")).join(", ")}`);
  if (input.kind === "transcript") {
    lines.push(`spoken_text: ${input.transcript.map((c) => c.text).join(" ")}`);
  }
  return lines.join("\n");
}

export function allText(input: AnalysisInput): string {
  const { item } = input;
  const spoken = input.kind === "transcript" ? input.transcript.map((c) => c.text).join(" ") : "";
  return [item.text, item.quotedText, item.captions, spoken].filter(Boolean).join(" ");
}
