/**
 * Video audio capture, shared by all platforms.
 *
 * The page itself listens to the <video> that is playing: `video.captureStream()` gives us its audio
 * without tab capture, without a microphone and without an extra permission. Every CHUNK_MS we hand a
 * finished piece of audio to the sink as 16 kHz mono WAV; the glue sends it to speech-to-text and the
 * text flows into the normal transcript pipeline (timeline, LIVE badge, throttled analysis).
 *
 * Only the video that is playing AND on screen is captured. Silent chunks are dropped locally
 * (nothing is sent), so an autoplaying muted feed costs nothing.
 */
import type { AudioChunk, ScraperSink } from "@contracts";
import { debug } from "./observe";

/** `captureStream()` is not in TypeScript's DOM lib yet, but shipped in Chrome since 53. */
type CapturableVideo = HTMLVideoElement & { captureStream?: () => MediaStream };

const CHUNK_MS = 8_000;
/** Stop after this much audio per video → a 30-minute stream doesn't turn into 200 API calls. */
const MAX_SEC = 180;
const SAMPLE_RATE = 16_000;
/** RMS below this = silence (muted at the source, or no speech) → chunk is not sent. */
const SILENCE_RMS = 0.004;

interface Capture {
  itemId: string;
  video: HTMLVideoElement;
  stream: MediaStream;
  recorder?: MediaRecorder;
  t0: number;
  sentSec: number;
  stopped: boolean;
  /** stopped because the video ended (not just paused / scrolled away) */
  ending: boolean;
}

/** One global watcher per page: media events don't bubble, but they can be caught in the capture phase. */
export function watchVideos(sink: ScraperSink): () => void {
  if (!sink.onAudio) return () => {};
  const captures = new Map<HTMLVideoElement, Capture>();

  const visible = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const video = e.target as HTMLVideoElement;
        if (e.intersectionRatio >= 0.5 && !video.paused) start(video);
        else if (e.intersectionRatio < 0.5) stop(video, false);
      }
    },
    { threshold: [0, 0.5, 1] },
  );

  function itemIdOf(video: HTMLVideoElement): string | undefined {
    return video.closest<HTMLElement>("[data-fedo-id]")?.dataset.fedoId;
  }

  function start(video: HTMLVideoElement) {
    if (captures.has(video)) return;
    const itemId = itemIdOf(video);
    if (!itemId) return;
    const capturable = video as CapturableVideo;
    if (typeof capturable.captureStream !== "function" || typeof MediaRecorder === "undefined") return;
    let stream: MediaStream;
    try {
      const tracks = capturable.captureStream().getAudioTracks();
      if (!tracks.length) return; // no audio in this video
      stream = new MediaStream(tracks);
    } catch (e) {
      debug("captureStream failed", e);
      return;
    }
    const cap: Capture = { itemId, video, stream, t0: video.currentTime, sentSec: 0, stopped: false, ending: false };
    captures.set(video, cap);
    debug("LISTENING", itemId);
    record(cap);
  }

  /** Each chunk gets its own MediaRecorder: only a stopped recorder yields a complete, decodable file. */
  function record(cap: Capture) {
    if (cap.stopped || cap.sentSec >= MAX_SEC) return;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(cap.stream, { mimeType: "audio/webm;codecs=opus" });
    } catch {
      recorder = new MediaRecorder(cap.stream);
    }
    cap.recorder = recorder;
    cap.t0 = cap.video.currentTime;
    const parts: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && parts.push(e.data);
    recorder.onstop = () => {
      const t1 = cap.video.currentTime;
      const ended = cap.ending || cap.video.ended;
      void emit(cap, new Blob(parts, { type: recorder.mimeType }), cap.t0, t1, ended);
      if (!cap.stopped && !ended) record(cap);
    };
    recorder.start();
    setTimeout(() => recorder.state === "recording" && recorder.stop(), CHUNK_MS);
  }

  async function emit(cap: Capture, blob: Blob, t0: number, t1: number, ended: boolean) {
    if (blob.size === 0 || t1 - t0 < 0.5) return;
    try {
      const wav = await toWav(await blob.arrayBuffer());
      if (!wav) {
        debug("silent chunk", cap.itemId, t0.toFixed(1), "muted:", cap.video.muted);
        // Still tell the glue once, so the UI can say "unmute to analyze speech".
        if (cap.video.muted && cap.sentSec === 0) sink.onAudio?.({ itemId: cap.itemId, audio: "", mime: "audio/wav", t0, t1, durationSec: duration(cap.video), ended });
        return;
      }
      cap.sentSec += t1 - t0;
      const chunk: AudioChunk = { itemId: cap.itemId, audio: base64(wav), mime: "audio/wav", t0, t1, durationSec: duration(cap.video), ended };
      debug("AUDIO", cap.itemId, `${t0.toFixed(1)}–${t1.toFixed(1)}s`, `${Math.round(wav.byteLength / 1024)} kB`);
      sink.onAudio?.(chunk);
    } catch (e) {
      debug("audio chunk failed", e);
    }
  }

  function stop(video: HTMLVideoElement, ended: boolean) {
    const cap = captures.get(video);
    if (!cap) return;
    cap.stopped = true;
    cap.ending = ended;
    captures.delete(video);
    if (cap.recorder?.state === "recording") cap.recorder.stop(); // → onstop emits the last piece with ended = true
    else if (ended) sink.onAudio?.({ itemId: cap.itemId, audio: "", mime: "audio/wav", t0: video.currentTime, t1: video.currentTime, durationSec: duration(video), ended: true });
    debug("STOPPED", cap.itemId);
  }

  const onPlay = (e: Event) => {
    const video = e.target as HTMLVideoElement;
    if (!(video instanceof HTMLVideoElement)) return;
    visible.observe(video);
    if (isOnScreen(video)) start(video);
  };
  const onPause = (e: Event) => e.target instanceof HTMLVideoElement && stop(e.target, false);
  const onEnded = (e: Event) => e.target instanceof HTMLVideoElement && stop(e.target, true);

  document.addEventListener("play", onPlay, true);
  document.addEventListener("pause", onPause, true);
  document.addEventListener("ended", onEnded, true);
  // Videos that are already playing when we start (autoplay).
  document.querySelectorAll("video").forEach((v) => !v.paused && onPlay({ target: v } as unknown as Event));

  return () => {
    document.removeEventListener("play", onPlay, true);
    document.removeEventListener("pause", onPause, true);
    document.removeEventListener("ended", onEnded, true);
    for (const v of Array.from(captures.keys())) stop(v, false);
    visible.disconnect();
  };
}

function isOnScreen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
  return r.height > 0 && h / r.height >= 0.5;
}

const duration = (v: HTMLVideoElement) => (Number.isFinite(v.duration) ? v.duration : undefined);

// ── WebM/Opus → 16 kHz mono WAV ────────────────────────────────────────────────────────

/** Returns null for silence. Decoding through an OfflineAudioContext resamples to 16 kHz for free. */
async function toWav(webm: ArrayBuffer): Promise<ArrayBuffer | null> {
  const ctx = new OfflineAudioContext(1, SAMPLE_RATE, SAMPLE_RATE);
  const decoded = await ctx.decodeAudioData(webm);
  const n = decoded.length;
  const mono = new Float32Array(n);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const data = decoded.getChannelData(c);
    for (let i = 0; i < n; i++) mono[i]! += data[i]! / decoded.numberOfChannels;
  }
  let sum = 0;
  for (let i = 0; i < n; i++) sum += mono[i]! * mono[i]!;
  if (Math.sqrt(sum / n) < SILENCE_RMS) return null;

  const out = new ArrayBuffer(44 + n * 2);
  const view = new DataView(out);
  const str = (o: number, s: string) => [...s].forEach((ch, i) => view.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF"); view.setUint32(4, 36 + n * 2, true); str(8, "WAVE");
  str(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  str(36, "data"); view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, mono[i]!)) * 0x7fff, true);
  return out;
}

function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
