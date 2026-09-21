/**
 * Video pipeline end to end in Node, exactly like the extension does it:
 *   WAV file → 8 s AudioChunks (what scraper/video.ts sends) → speech-to-text (ai/stt.ts)
 *   → TranscriptChunks (same rules as extension/src/content.ts) → analyzer → scores + timeline
 *
 *   npx tsx ai/dev/run-stt.ts <16kHz-mono.wav> [--jev]
 *   make a test file on macOS:  say -o /tmp/speech.wav --data-format=LEI16@16000 "some text"
 * Needs STT_API_URL / STT_API_KEY (and optionally STT_MODEL) in .env.
 */
import { existsSync, readFileSync } from "node:fs";
import { SIGNALS, type AudioChunk, type FeedItem, type TranscriptChunk } from "@contracts";
import { createAnalyzer, createTranscriber } from "../index";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1]! in process.env)) process.env[m[1]!] = m[2]!;
  }
}
const file = process.argv[2];
if (!file) throw new Error("usage: npx tsx ai/dev/run-stt.ts <16kHz-mono.wav> [--jev]");
const config = {
  mode: process.argv.includes("--jev") ? ("jev" as const) : ("mock" as const),
  jevApiUrl: process.env.JEV_API_URL,
  jevApiKey: process.env.JEV_API_KEY,
  sttApiUrl: process.env.STT_API_URL,
  sttApiKey: process.env.STT_API_KEY,
  sttModel: process.env.STT_MODEL,
};
const transcriber = createTranscriber(config);
const analyzer = createAnalyzer(config);

// ── WAV → 8 s chunks ─────────────────────────────────────────────────────────────────
const CHUNK_SEC = 8;
const wav = readFileSync(file);

/** Walk the RIFF chunks: real files carry JUNK / FLLR / LIST chunks, so fixed offsets don't work. */
function riffChunk(id: string): Buffer {
  let pos = 12;
  while (pos + 8 <= wav.length) {
    const size = wav.readUInt32LE(pos + 4);
    if (wav.toString("ascii", pos, pos + 4) === id) return wav.subarray(pos + 8, pos + 8 + size);
    pos += 8 + size + (size & 1);
  }
  throw new Error(`no "${id}" chunk in ${file}: not a WAV file?`);
}
const fmt = riffChunk("fmt ");
const channels = fmt.readUInt16LE(2);
const rate = fmt.readUInt32LE(4);
const bits = fmt.readUInt16LE(14);
if (fmt.readUInt16LE(0) !== 1 || bits !== 16) throw new Error("need 16-bit PCM WAV (say --data-format=LEI16@16000)");
const bytesPerSec = rate * channels * 2;
const pcm = riffChunk("data");
const durationSec = pcm.length / bytesPerSec;
console.log(`${file}: ${rate} Hz, ${channels} ch, ${durationSec.toFixed(1)} s → ${Math.ceil(durationSec / CHUNK_SEC)} chunks`);

/** A minimal, clean 44-byte header → what scraper/video.ts produces in the page. */
function wavOf(samples: Buffer): string {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + samples.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(bytesPerSec, 28);
  h.writeUInt16LE(channels * 2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(samples.length, 40);
  return Buffer.concat([h, samples]).toString("base64");
}

const item: FeedItem = { id: "tiktok:stt-test", platform: "tiktok", author: { handle: "test" }, text: "", hashtags: [], media: [{ type: "video", url: "" }], scrapedAt: 0 };
const transcript: TranscriptChunk[] = [];
const mmss = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

for (let t0 = 0; t0 < durationSec; t0 += CHUNK_SEC) {
  const t1 = Math.min(durationSec, t0 + CHUNK_SEC);
  const chunk: AudioChunk = { itemId: item.id, audio: wavOf(pcm.subarray(Math.floor(t0 * bytesPerSec), Math.floor(t1 * bytesPerSec))), mime: "audio/wav", t0, t1, durationSec, ended: t1 >= durationSec };
  const started = Date.now();
  const res = await transcriber.transcribe(chunk);
  if (!res.configured) throw new Error("STT not configured: set STT_API_URL and STT_API_KEY in .env");
  console.log(`\n[${mmss(t0)}–${mmss(t1)}] STT ${Date.now() - started}ms: "${res.text}"`);

  // same rules as extension/src/content.ts
  for (const c of transcript) c.isFinal = true;
  transcript.push(...res.segments.map((seg, i) => ({ itemId: item.id, text: seg.text, isFinal: chunk.ended || i < res.segments.length - 1, t: seg.t, source: "stt" as const })));
  if (!transcript.length) continue;

  const result = await analyzer.analyze({ kind: "transcript", item, transcript: [...transcript] });
  const top = [...result.signals].sort((a, b) => b.score - a.score).filter((s) => s.score >= 0.5).slice(0, 5);
  console.log(`   ${result.partial ? "LIVE" : "DONE"} ${result.source} ${result.overall?.level} (${result.overall?.score}) · ${top.map((s) => `${SIGNALS[s.key].label} ${Math.round(s.score * 100)}%`).join(", ") || "nothing"}`);
  if (chunk.ended) {
    console.log(`\nTimeline (${result.timeline?.length ?? 0} events):`);
    for (const e of result.timeline ?? []) console.log(`   ${mmss(e.t)}  ${SIGNALS[e.key].label} ${Math.round(e.score * 100)}%${e.evidence ? `  ← "${e.evidence}"` : ""}`);
    console.log(`\nwhy: ${result.explanation}`);
  }
}
