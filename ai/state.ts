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

/**
 * The same raw data, split by where it came from. The scoring engine weighs each source:
 * the author's own words count fully, a quoted post or an image alt text count less
 * (quoting something is not the same as saying it).
 */
export interface Segment {
  source: "text" | "captions" | "spoken" | "hashtags" | "quoted" | "alt";
  text: string;
  weight: number;
}

export function buildSegments(input: AnalysisInput): Segment[] {
  const { item } = input;
  const segments: Segment[] = [{ source: "text", text: item.text, weight: 1 }];
  if (item.captions) segments.push({ source: "captions", text: item.captions, weight: 1 });
  if (input.kind === "transcript") {
    segments.push({ source: "spoken", text: input.transcript.map((c) => c.text).join(" "), weight: 1 });
  }
  if (item.hashtags.length) {
    // The scraper usually leaves hashtags inside `text` too → only add the ones that are not there already.
    const lower = item.text.toLowerCase();
    const extra = item.hashtags.filter((h) => !lower.includes("#" + h.toLowerCase()));
    if (extra.length) segments.push({ source: "hashtags", text: extra.map((h) => "#" + h).join(" "), weight: 0.8 });
  }
  if (item.quotedText) segments.push({ source: "quoted", text: item.quotedText, weight: 0.6 });
  const alt = item.media.map((m) => m.altText).filter(Boolean).join(". ");
  if (alt) segments.push({ source: "alt", text: alt, weight: 0.5 });
  return segments.filter((s) => s.text.trim());
}
