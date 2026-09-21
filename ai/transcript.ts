/**
 * Turns whatever the glue collected for a video into clean sentences. Two real-world problems:
 *
 * 1. SEVERAL SOURCES AT ONCE. On TikTok the scraper paces the platform's caption file (source "captions")
 *    while the audio capture transcribes the same speech (source "stt"). Both land in one list: every
 *    sentence twice, out of order. Captions are exact and free → if there are any, only they count.
 *
 * 2. PIECES INSTEAD OF SENTENCES. Speech-to-text works on fixed 8 s windows and cuts sentences in two
 *    ("… Not us. The" | "newcomers get everything …"); auto-captions come as short cues with no
 *    punctuation at all. Scoring such pieces gives wrong quotes and a wrong timeline. Pieces are joined
 *    until a sentence ends, or, when there is no punctuation to go by, until it is long enough.
 *
 * A sentence keeps the time of its FIRST piece and is only final once its last piece is.
 */
import type { TranscriptChunk } from "@contracts";

const ENDS_SENTENCE = /[.!?…]["'”’)\]]*\s*$/u;
/** Without punctuation: close after this many words (caption cues), or at the latest after MAX_WORDS. */
const CUE_WORDS = 12;
const MAX_WORDS = 40;
/** A pause this long between caption cues ends the sentence too. */
const PAUSE_SEC = 4;

export function toSentences(raw: TranscriptChunk[]): TranscriptChunk[] {
  const transcript = cleanSources(raw);
  const allFinal = transcript.every((c) => c.isFinal);
  const out: TranscriptChunk[] = [];
  let open: TranscriptChunk | undefined;
  let lastT = 0;

  for (const chunk of transcript) {
    const text = chunk.text.trim();
    if (!text) continue;
    // Only caption cues carry real timing; speech-to-text pieces are 8 s apart by construction.
    if (open && chunk.source === "captions" && chunk.t - lastT >= PAUSE_SEC) {
      out.push(open);
      open = undefined;
    }
    open = open ? { ...open, text: `${open.text} ${text}`, isFinal: chunk.isFinal } : { ...chunk, text };
    lastT = chunk.t;
    const words = open.text.split(/\s+/).length;
    const longEnough = words >= MAX_WORDS || (chunk.source === "captions" && words >= CUE_WORDS);
    if (ENDS_SENTENCE.test(text) || longEnough) {
      out.push(open);
      open = undefined;
    }
  }
  // Whatever is left has no sentence end yet: final only when nothing can follow anymore.
  if (open) out.push({ ...open, isFinal: open.isFinal && allFinal });
  return out;
}

/** One source, in video order, nothing twice. */
function cleanSources(transcript: TranscriptChunk[]): TranscriptChunk[] {
  const hasCaptions = transcript.some((c) => c.source === "captions");
  const chunks = (hasCaptions ? transcript.filter((c) => c.source === "captions") : transcript)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.t - b.c.t || a.i - b.i)
    .map(({ c }) => c);
  const seen = new Set<string>();
  return chunks.filter((c) => {
    const id = `${Math.round(c.t)}:${c.text.trim().toLowerCase()}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Did the platform's caption file feed this transcript? Then `item.captions` is the same text again. */
export const hasCaptionChunks = (transcript: TranscriptChunk[]) => transcript.some((c) => c.source === "captions");
