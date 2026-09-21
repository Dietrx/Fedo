/**
 * Speech-to-text works on fixed audio windows (8 s), so a sentence is often cut in two:
 *   chunk 1: "… And you know who gets all the help? Not us. The"     chunk 2: "newcomers get everything …"
 * Scoring "The" and "newcomers get everything" separately gives wrong quotes and a wrong timeline.
 * This stitches the pieces back together: a piece that does not end a sentence is joined with the next one.
 * The sentence keeps the time of its FIRST piece and is only final once its last piece is.
 */
import type { TranscriptChunk } from "@contracts";

const ENDS_SENTENCE = /[.!?…]["'”’)\]]*\s*$/u;

export function toSentences(transcript: TranscriptChunk[]): TranscriptChunk[] {
  const out: TranscriptChunk[] = [];
  let open: TranscriptChunk | undefined;
  for (const chunk of transcript) {
    const text = chunk.text.trim();
    if (!text) continue;
    open = open ? { ...open, text: `${open.text} ${text}`, isFinal: chunk.isFinal } : { ...chunk, text };
    if (ENDS_SENTENCE.test(text)) {
      out.push(open);
      open = undefined;
    }
  }
  // Whatever is left has no sentence end yet. It only counts as final when the source says the video is over.
  if (open) out.push({ ...open, isFinal: open.isFinal && transcript.at(-1)?.isFinal === true && isLastOf(transcript, open) });
  return out;
}

/** The dangling piece is final only if nothing can follow it anymore (= every chunk is final). */
function isLastOf(transcript: TranscriptChunk[], _open: TranscriptChunk): boolean {
  return transcript.every((c) => c.isFinal);
}
