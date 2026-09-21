/**
 * Local speech-to-text for videos without platform captions.
 *
 * Pipeline (all measured on 2026-09-21, Apple M4, see scraper/RESEARCH.md):
 *   fetch(mp4 from the page context)  ~120–170 ms for a 9 s clip (often already in the browser cache)
 *   AudioContext.decodeAudioData       ~50 ms / 9 s
 *   OfflineAudioContext → 16 kHz mono  ~4 ms
 *   POST WAV window → whisper-server   0.75–1.3 s per 10 s window (large-v3-turbo, Metal)
 * The companion is `whisper-server` from whisper.cpp (scraper/companion/whisper-server.sh). It answers with
 * `Access-Control-Allow-Origin: *`, so the content script can post to it directly.
 */
export const DEFAULT_STT_ENDPOINT = "http://127.0.0.1:8181/inference";

/** whisper expects 16 kHz mono */
const SAMPLE_RATE = 16000;

export interface SttChunk {
  text: string;
  /** seconds since media start */
  t: number;
}

export interface SttOptions {
  endpoint?: string;
  /** ISO 639-1 code; omitted → whisper auto-detects (costs ~1 s extra). */
  language?: string;
  /** seconds of audio per request; 10 s ≈ 0.8–1.3 s latency on the measured setup */
  windowSec?: number;
  signal?: AbortSignal;
  onChunk: (chunk: SttChunk) => void;
}

let availability: { ok: boolean; checkedAt: number } | undefined;

/**
 * One cheap probe per minute; a missing companion must not slow the feed down.
 * A plain GET is used on purpose: whisper-server answers it with 404, but the answer proves the server is there and
 * carries the CORS headers. (`method: "OPTIONS"` would trigger a preflight the server rejects — measured.)
 */
export async function sttAvailable(endpoint = DEFAULT_STT_ENDPOINT): Promise<boolean> {
  // a positive answer is kept for a minute, a negative one only briefly — measured: while tiktok.com is still
  // booting, even a loopback GET took 3.5 s, and a cached "down" would have switched STT off for every video
  if (availability && Date.now() - availability.checkedAt < (availability.ok ? 60_000 : 10_000)) return availability.ok;
  let ok = false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5_000);
    await fetch(endpoint, { method: "GET", signal: ctrl.signal });
    clearTimeout(timer);
    ok = true;
  } catch {
    ok = false;
  }
  availability = { ok, checkedAt: Date.now() };
  return ok;
}

export async function transcribeFromUrl(mediaUrl: string, opts: SttOptions): Promise<void> {
  const { signal } = opts;
  const endpoint = opts.endpoint ?? DEFAULT_STT_ENDPOINT;
  const windowSec = opts.windowSec ?? 10;

  const res = await fetch(mediaUrl, { credentials: "include", signal });
  if (!res.ok) throw new Error(`media ${res.status}`);
  const pcm = await decodeTo16kMono(await res.arrayBuffer());
  if (signal?.aborted) return;

  const step = windowSec * SAMPLE_RATE;
  for (let offset = 0; offset < pcm.length; offset += step) {
    if (signal?.aborted) return;
    const slice = pcm.subarray(offset, Math.min(offset + step, pcm.length));
    if (slice.length < SAMPLE_RATE / 2) break; // < 0.5 s left: nothing to say
    const text = await inferWindow(endpoint, slice, opts.language, signal);
    if (signal?.aborted) return;
    if (text) opts.onChunk({ text, t: offset / SAMPLE_RATE });
  }
}

async function inferWindow(endpoint: string, pcm: Float32Array, language: string | undefined, signal?: AbortSignal): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([pcmToWav(pcm, SAMPLE_RATE)], { type: "audio/wav" }), "window.wav");
  form.append("response_format", "json");
  if (language) form.append("language", language);
  const res = await fetch(endpoint, { method: "POST", body: form, signal });
  if (!res.ok) throw new Error(`stt ${res.status}`);
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").replace(/\s+/g, " ").trim();
}

export async function decodeTo16kMono(buf: ArrayBuffer): Promise<Float32Array> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(buf);
    const length = Math.ceil(decoded.duration * SAMPLE_RATE);
    const offline = new OfflineAudioContext(1, length, SAMPLE_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
  } finally {
    void ctx.close();
  }
}

/** 16-bit PCM WAV container around mono float samples. */
export function pcmToWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const str = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(o, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
  }
  return buffer;
}
