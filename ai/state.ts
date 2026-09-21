/**
 * Turns an AnalysisInput into the compact textual state that Jev (or any LLM) gets to see.
 * Video: spoken text + captions + post metadata. Vision output can be added here later.
 */
import type { AnalysisInput, FeedItem } from "@contracts";

/**
 * ai-internal: a FeedItem after vision.ts looked at its pictures. Not part of the contract:
 * the fields are added inside ai/ (with-vision.ts) and only read by the state builders below.
 */
export interface SeenItem extends FeedItem {
  /** text written IN the image(s): meme text, overlaid headline, screenshot. Part of the message → scored like post text. */
  imageText?: string;
  /** our neutral one-line description of the picture: context for the model, never scored or quoted as the author's words */
  imageDescription?: string;
}

/**
 * `item.captions` = the platform's full caption file. When the same captions also arrive as transcript
 * chunks (the scraper sends both), using the field too would count every sentence twice.
 */
export function captionsOf(input: AnalysisInput): string | undefined {
  if (input.kind === "transcript" && input.transcript.some((c) => c.source === "captions")) return undefined;
  return input.item.captions;
}

export function buildState(input: AnalysisInput): string {
  const { item } = input;
  const lines = [
    `platform: ${item.platform}`,
    `author: @${item.author.handle}${item.author.verified ? " (verified)" : ""}`,
    `text: ${item.text}`,
  ];
  if (item.quotedText) lines.push(`quoted_text: ${item.quotedText}`);
  if (item.hashtags.length) lines.push(`hashtags: ${item.hashtags.map((h) => "#" + h).join(" ")}`);
  const captions = captionsOf(input);
  if (captions) lines.push(`captions: ${captions}`);
  if (item.media.length) lines.push(`media: ${item.media.map((m) => m.type + (m.altText ? ` (alt: ${m.altText})` : "")).join(", ")}`);
  const seen = item as SeenItem;
  if (seen.imageText) lines.push(`text_in_image: ${seen.imageText}`);
  if (seen.imageDescription) lines.push(`image_shows: ${seen.imageDescription}`);
  if (input.kind === "transcript") {
    lines.push(`spoken_text: ${input.transcript.map((c) => c.text).join(" ")}`);
  }
  return lines.join("\n");
}

export function allText(input: AnalysisInput): string {
  const { item } = input;
  const spoken = input.kind === "transcript" ? input.transcript.map((c) => c.text).join(" ") : "";
  return [item.text, (item as SeenItem).imageText, item.quotedText, captionsOf(input), spoken].filter(Boolean).join(" ");
}

/**
 * The same raw data, split by where it came from. The scoring engine weighs each source:
 * the author's own words count fully, a quoted post or an image alt text count less
 * (quoting something is not the same as saying it).
 */
export interface Segment {
  source: "text" | "image" | "captions" | "spoken" | "hashtags" | "quoted" | "alt";
  text: string;
  weight: number;
}

export function buildSegments(input: AnalysisInput): Segment[] {
  const { item } = input;
  const segments: Segment[] = [{ source: "text", text: item.text, weight: 1 }];
  // Text inside the picture is what the author chose to show → almost full weight (OCR can misread a word).
  const imageText = (item as SeenItem).imageText;
  if (imageText) segments.push({ source: "image", text: imageText, weight: 0.9 });
  const captions = captionsOf(input);
  if (captions) segments.push({ source: "captions", text: captions, weight: 1 });
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

/**
 * Structured state for Jev. TypeSafe recommends an object with descriptive field names over one long
 * string, so the model can tell the post text from captions or spoken text.
 * The quoted post is deliberately left out: Jev scores it as if the author had said it (see fuse() in jev.ts).
 */
export function buildStateObject(input: AnalysisInput): Record<string, unknown> {
  const { item } = input;
  const state: Record<string, unknown> = {
    platform: item.platform,
    author: `@${item.author.handle}${item.author.verified ? " (verified)" : ""}`,
    post_text: item.text,
  };
  if (item.hashtags.length) state.hashtags = item.hashtags.map((h) => "#" + h);
  const seen = item as SeenItem;
  if (seen.imageText) state.text_written_in_the_image = seen.imageText;
  if (seen.imageDescription) state.image_shows = seen.imageDescription;
  const captions = captionsOf(input);
  if (captions) state.video_captions = captions;
  if (input.kind === "transcript") state.spoken_text = input.transcript.map((c) => c.text).join(" ");
  const alt = item.media.map((m) => m.altText).filter(Boolean);
  if (alt.length) state.image_descriptions = alt;
  return state;
}
