/**
 * Speech-to-text for video audio. Two kinds of endpoint, picked by the URL:
 *
 *   STT_API_URL=https://api.openai.com/v1/audio/transcriptions      (Whisper-style: multipart, exact timestamps)
 *   STT_API_URL=https://openrouter.ai/api/v1/chat/completions       (any audio-capable chat model via `input_audio`)
 *   STT_MODEL=google/gemini-3.1-flash-lite                           (default for the chat kind; `whisper-1` for the other)
 *
 * Input is always 16 kHz mono WAV (the scraper converts in the page), so every provider accepts it.
 * Output: the text plus sentence segments with a start time — the timeline needs the `t`.
 * Rule of this folder: no `chrome.*`, no `document` → the dev harness runs it in Node.
 */
import type { AnalyzerConfig, AudioChunk, TranscriptionResult, Transcriber } from "@contracts";

const TIMEOUT_MS = 20_000;
/** Measured on the same 8 s chunk: gemini-2.5-flash ~2.7 s, gemini-3.1-flash-lite ~1.1 s, identical transcript. */
const DEFAULT_CHAT_MODEL = "google/gemini-3.1-flash-lite";

const NOT_CONFIGURED: TranscriptionResult = { configured: false, text: "", segments: [] };

export function createTranscriber(config: AnalyzerConfig): Transcriber {
  const { sttApiUrl: url, sttApiKey: key } = config;
  if (!url || !key) {
    return { async transcribe() { return NOT_CONFIGURED; } };
  }
  const whisper = /\/audio\/transcriptions\/?$/.test(url);
  const model = config.sttModel || (whisper ? "whisper-1" : DEFAULT_CHAT_MODEL);
  return {
    async transcribe(chunk) {
      if (!chunk.audio) return { configured: true, text: "", segments: [] };
      const res = whisper ? await viaWhisper(url, key, model, chunk) : await viaChat(url, key, model, chunk);
      return { configured: true, ...res };
    },
  };
}

// ── Whisper-style endpoint ────────────────────────────────────────────────────────────

async function viaWhisper(url: string, key: string, model: string, chunk: AudioChunk): Promise<Omit<TranscriptionResult, "configured">> {
  const form = new FormData();
  form.append("file", new Blob([bytes(chunk.audio)], { type: "audio/wav" }), "chunk.wav");
  form.append("model", model);
  form.append("response_format", "verbose_json");
  const res = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`STT ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { text?: string; segments?: { start: number; text: string }[] };
  const text = (json.text ?? "").trim();
  const segments = (json.segments ?? [])
    .map((s) => ({ text: s.text.trim(), t: round(chunk.t0 + s.start) }))
    .filter((s) => s.text);
  return { text, segments: segments.length ? segments : spread(text, chunk) };
}

// ── OpenAI-compatible chat endpoint with audio input ──────────────────────────────────

const PROMPT =
  "Transcribe the speech in this audio verbatim, in its original language. " +
  "Output only the transcript, nothing else. If nobody speaks, output exactly: [no speech]";

async function viaChat(url: string, key: string, model: string, chunk: AudioChunk): Promise<Omit<TranscriptionResult, "configured">> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "input_audio", input_audio: { data: chunk.audio, format: "wav" } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`STT ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  let text = (json.choices?.[0]?.message?.content ?? "").trim();
  // "[no speech]" as asked, but models also like "[music]", "(applause)", "♪ … ♪" → none of that is speech.
  text = text.replace(/\[[^\]]{0,40}\]|\([^)]{0,40}\)|♪[^♪]*♪|[♪🎵🎶]/gu, " ").replace(/\s+/g, " ").trim();
  return { text, segments: spread(text, chunk) };
}

// ── helpers ───────────────────────────────────────────────────────────────────────────

/** No timestamps from the model → split into sentences and spread them evenly over the chunk. */
function spread(text: string, chunk: AudioChunk): { text: string; t: number }[] {
  const sentences = text.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
  const span = Math.max(0, chunk.t1 - chunk.t0);
  return sentences.map((s, i) => ({ text: s, t: round(chunk.t0 + (span * i) / sentences.length) }));
}

function bytes(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

const round = (n: number) => Math.round(n * 10) / 10;
