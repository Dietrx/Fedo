/**
 * GLUE — content script. Wires scraper → background (AI) → UI.
 * Keep this file thin. Logic belongs in scraper/, ai/ or ui/.
 */
import { DEFAULT_SETTINGS, type AudioChunk, type FeedItem, type OverlayState, type Settings, type TranscriptChunk, type VideoProgress } from "@contracts";
import { send } from "@contracts/messages";
import { createScraper, detectPlatform } from "../../scraper";
import { createOverlay } from "../../ui";

interface Entry {
  item: FeedItem;
  anchor: HTMLElement;
  transcript: TranscriptChunk[];
  /** last state shown, so a settings change can re-render without re-analyzing */
  state?: OverlayState;
  /** analysis requests sent for this item; only the newest response may render (transcripts can overtake each other) */
  seq: number;
  /** videos only: how far the speech-to-text has come */
  progress?: VideoProgress;
  /** audio chunks waiting for / in transcription, so the ETA and the "done" moment are honest */
  pendingAudio: number;
}

/** Roughly how long one chunk takes from capture to score — used for the countdown. */
const STT_LATENCY_MS = 6_000;

async function main() {
  const platform = detectPlatform(location.hostname);
  if (!platform) return;

  let settings: Settings = { ...DEFAULT_SETTINGS, ...(await send({ type: "fedo/getSettings" })) };
  const overlay = createOverlay({ minScore: settings.minScore, calmMode: settings.calmMode });
  const items = new Map<string, Entry>();

  function show(entry: Entry, state: OverlayState) {
    entry.state = state.status === "error" || !entry.progress ? state : { ...state, progress: entry.progress };
    if (settings.enabled) overlay.render(entry.item.id, entry.anchor, entry.state);
  }

  /** Re-render the current state (e.g. progress changed, analysis unchanged). */
  function refresh(entry: Entry) {
    show(entry, entry.state ?? { status: "pending" });
  }

  function setProgress(entry: Entry, patch: Partial<VideoProgress>) {
    entry.progress = { phase: "listening", coveredSec: 0, ...entry.progress, ...patch };
    refresh(entry);
  }

  /** Video over: close the transcript (no more LIVE) and score it one last time. */
  function finish(entry: Entry, atSec: number) {
    for (const c of entry.transcript) c.isFinal = true;
    setProgress(entry, { phase: "done", coveredSec: atSec, etaAt: undefined });
    if (entry.transcript.length) analyze(entry);
  }

  function analyze(entry: Entry) {
    const seq = ++entry.seq;
    const input = entry.transcript.length ? { kind: "transcript" as const, item: entry.item, transcript: entry.transcript } : { kind: "post" as const, item: entry.item };
    send({ type: "fedo/analyze", input })
      .then((result) => seq === entry.seq && show(entry, { status: "done", result }))
      .catch((e) => seq === entry.seq && !entry.transcript.length && show(entry, { status: "error", message: String(e) }));
  }

  // Popup changes apply live: no tab reload needed.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.settings) return;
    const next: Settings = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue as Partial<Settings>) };
    const wasEnabled = settings.enabled;
    settings = next;
    // The overlay listens to the same storage change itself (ui/prefs.ts): minScore / calmMode re-render live,
    // enabled=false clears. Re-creating it here would throw away panels, live log and dismissed slop covers.
    if (!settings.enabled || wasEnabled) return;
    // switched back on: the overlay cleared itself on disable, so put every known post back on screen
    for (const entry of items.values()) {
      if (!entry.state || entry.state.status === "pending") {
        show(entry, { status: "pending" });
        analyze(entry);
      } else {
        overlay.render(entry.item.id, entry.anchor, entry.state);
      }
    }
  });

  const scraper = createScraper(platform);
  scraper.start({
    onItem(item, anchor) {
      const entry: Entry = { item, anchor, transcript: [], seq: 0, pendingAudio: 0 };
      items.set(item.id, entry);
      if (!settings.enabled) return; // remembered; analyzed as soon as the user switches Fedo on
      show(entry, { status: "pending" });
      analyze(entry);
    },

    onTranscript(chunk) {
      const entry = items.get(chunk.itemId);
      if (!entry) return;
      // replace the trailing non-final chunk, append otherwise
      if (entry.transcript.at(-1)?.isFinal === false) entry.transcript.pop();
      entry.transcript.push(chunk);
      if (settings.enabled) analyze(entry); // errors keep the last good result on screen (see analyze)
    },

    // Captured video audio → speech-to-text in the background → the transcript pipeline (timeline, LIVE, throttled scoring).
    async onAudio(chunk: AudioChunk) {
      const entry = items.get(chunk.itemId);
      if (!entry || !settings.enabled) return;
      if (entry.progress?.phase === "unavailable") return;
      const duration = chunk.durationSec ?? entry.progress?.durationSec;
      if (!chunk.audio) {
        // Silent first chunk while the player is muted → tell the user instead of pretending.
        if (!chunk.ended && entry.progress?.coveredSec === undefined) setProgress(entry, { phase: "muted", coveredSec: 0, durationSec: duration });
        else if (chunk.ended) finish(entry, chunk.t1);
        return;
      }
      entry.pendingAudio++;
      const remainingSec = duration ? Math.max(0, duration - chunk.t1) : 0;
      setProgress(entry, {
        phase: "transcribing",
        durationSec: duration,
        etaAt: Date.now() + remainingSec * 1000 + STT_LATENCY_MS,
      });
      try {
        const res = await send({ type: "fedo/transcribe", chunk });
        if (!res.configured) {
          setProgress(entry, { phase: "unavailable" });
          return;
        }
        // Everything before this chunk is final now; the newest sentence stays "open" while the video plays,
        // so the AI keeps the LIVE badge until the last chunk arrives.
        for (const c of entry.transcript) c.isFinal = true;
        const chunks: TranscriptChunk[] = res.segments.map((seg, i) => ({
          itemId: chunk.itemId,
          text: seg.text,
          isFinal: chunk.ended || i < res.segments.length - 1,
          t: seg.t,
          source: "stt",
        }));
        entry.transcript.push(...chunks);
        entry.pendingAudio--;
        setProgress(entry, { phase: chunk.ended && !entry.pendingAudio ? "done" : "listening", coveredSec: chunk.t1, durationSec: duration });
        if (chunks.length) analyze(entry);
        else if (chunk.ended) finish(entry, chunk.t1);
      } catch (e) {
        entry.pendingAudio--;
        console.warn("[fedo] transcription failed", e);
        setProgress(entry, { phase: chunk.ended ? "done" : "listening" });
      }
    },

    onItemRemoved(itemId) {
      items.delete(itemId);
      overlay.remove(itemId);
    },
  });
}

main().catch((e) => console.error("[fedo]", e));
