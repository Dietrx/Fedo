/**
 * Checks for ai/transcript.ts (no network).   npx tsx ai/dev/test-transcript.ts   → exit 1 on failure
 */
import type { TranscriptChunk } from "@contracts";
import { coverageOf } from "../coverage";
import { allText } from "../state";
import { toSentences } from "../transcript";

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`}`);
}
const c = (text: string, t: number, source: "captions" | "stt" = "stt", isFinal = true): TranscriptChunk => ({ itemId: "v", text, t, source, isFinal });
const texts = (chunks: TranscriptChunk[]) => chunks.map((x) => `${x.t}|${x.text}|${x.isFinal ? "F" : "open"}`);

check(
  "stt: sentence cut at the 8 s window is stitched, keeps the time of its first piece",
  texts(toSentences([c("Not us. The", 8), c("newcomers get everything handed to them.", 16)])),
  ["8|Not us. The newcomers get everything handed to them.|F"],
);
check(
  "stt: newest piece still open → stitched sentence is open too",
  texts(toSentences([c("We have to act.", 0), c("If we don't stand up", 8, "stt", false)])),
  ["0|We have to act.|F", "8|If we don't stand up|open"],
);
check(
  "stt: dangling piece without sentence end is only final once everything is final",
  texts(toSentences([c("We have to act.", 0), c("before it is too late", 8)])),
  ["0|We have to act.|F", "8|before it is too late|F"],
);
check(
  "captions + stt for the same video → only captions count, in video order, nothing twice",
  texts(
    toSentences([
      c("Nobody wants you to know this.", 3, "captions"),
      c("Nobody wants you to know this. They are", 0, "stt"),
      c("They are lying to you.", 6, "captions"),
      c("Nobody wants you to know this.", 3, "captions"),
      c("lying to you.", 8, "stt"),
    ]),
  ),
  ["3|Nobody wants you to know this.|F", "6|They are lying to you.|F"],
);
check(
  "auto-captions without punctuation are grouped into readable units (≥ 12 words), not one endless sentence",
  toSentences(["nobody wants you", "to know what the", "government is hiding from", "all of us right now", "they are lying", "to you every day", "and the media", "will not tell you"].map((t, i) => c(t, i * 1.5, "captions"))).length,
  2,
);
check(
  "a long pause ends the sentence",
  texts(toSentences([c("so here is the thing", 0, "captions"), c("completely different topic", 20, "captions")])),
  ["0|so here is the thing|F", "20|completely different topic|F"],
);

const item = { id: "v", platform: "tiktok" as const, author: { handle: "a" }, text: "watch this", hashtags: [], media: [{ type: "video" as const, url: "" }], captions: "They are lying to you.", scrapedAt: 0 };
check(
  "item.captions is not counted again when the transcript already comes from the captions",
  allText({ kind: "transcript", item, transcript: [c("They are lying to you.", 1, "captions")] }),
  "watch this They are lying to you.",
);
check("…but it is used when the transcript comes from speech-to-text only", allText({ kind: "transcript", item, transcript: [c("Hello there.", 1)] }), "watch this They are lying to you. Hello there.");
check("coverage: video with spoken text is 'full'", coverageOf({ kind: "transcript", item, transcript: [c("They are lying to you all.", 1)] }), "full");
check("coverage: video post without any speech is 'text_only'", coverageOf({ kind: "post", item: { ...item, captions: undefined, text: "you really need to watch this one" } }), "text_only");

console.log(`\n${failed ? failed + " FAILED" : "all passed"}`);
process.exit(failed ? 1 : 0);
