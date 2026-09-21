/**
 * Simulates a live video: feeds a transcript chunk by chunk (interim + final, like real STT) into the
 * analyzer, exactly the way the glue does, and prints how the result evolves.
 *   npx tsx ai/dev/run-live.ts          → local engine
 *   npx tsx ai/dev/run-live.ts --jev    → real API from .env
 */
import { existsSync, readFileSync } from "node:fs";
import { SIGNALS, type AnalysisResult, type FeedItem, type TranscriptChunk } from "@contracts";
import { createAnalyzer } from "../index";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1]! in process.env)) process.env[m[1]!] = m[2]!;
  }
}
const mode = process.argv.includes("--jev") ? "jev" : "mock";
const analyzer = createAnalyzer({ mode, jevApiUrl: process.env.JEV_API_URL, jevApiKey: process.env.JEV_API_KEY });

const item: FeedItem = {
  id: "tiktok:live-1",
  platform: "tiktok",
  author: { handle: "truthseeker" },
  text: "You need to hear this 🤯",
  hashtags: ["fyp"],
  media: [{ type: "video", url: "" }],
  scrapedAt: 0,
};

/** [seconds since video start, sentence] */
const SENTENCES: [number, string][] = [
  [0, "Hey guys, quick one today."],
  [3, "Nobody wants you to know what the government is hiding."],
  [8, "They are lying to you and the media won't tell you."],
  [13, "These people are destroying our country."],
  [17, "Share this before it gets deleted, wake up!"],
];
const WORD_MS = 120;

const transcript: TranscriptChunk[] = [];
const t0 = Date.now();
let calls = 0;
let lastShown = "";
const pending: Promise<void>[] = [];

function show(result: AnalysisResult, sentAt: number) {
  const top = [...result.signals].sort((a, b) => b.score - a.score).filter((s) => s.score >= 0.5).slice(0, 4);
  const line = `${result.overall?.level ?? "-"} | ${top.map((s) => `${SIGNALS[s.key].label} ${Math.round(s.score * 100)}%`).join(", ") || "nothing yet"}`;
  if (line === lastShown) return;
  lastShown = line;
  const stamp = ((Date.now() - t0) / 1000).toFixed(1).padStart(5);
  console.log(`[${stamp}s] ${result.partial ? "LIVE" : "DONE"} ${result.source} (+${Date.now() - sentAt}ms)  ${line}`);
}

function push(chunk: TranscriptChunk) {
  if (transcript.at(-1)?.isFinal === false) transcript.pop(); // same rule as extension/src/content.ts
  transcript.push(chunk);
  calls++;
  const sentAt = Date.now();
  pending.push(analyzer.analyze({ kind: "transcript", item, transcript: [...transcript] }).then((r) => show(r, sentAt)));
}

let last: AnalysisResult | undefined;
for (const [t, sentence] of SENTENCES) {
  const words = sentence.split(" ");
  for (let i = 1; i <= words.length; i++) {
    push({ itemId: item.id, text: words.slice(0, i).join(" "), isFinal: i === words.length, t, source: "stt" });
    await new Promise((r) => setTimeout(r, WORD_MS));
  }
}
await Promise.all(pending);
last = await analyzer.analyze({ kind: "transcript", item, transcript });

console.log(`\n${calls} transcript updates from the glue. Timeline:`);
for (const e of last.timeline ?? []) {
  const mm = String(Math.floor(e.t / 60)).padStart(2, "0");
  const ss = String(Math.floor(e.t % 60)).padStart(2, "0");
  console.log(`   ${mm}:${ss}  ${SIGNALS[e.key].label} ${Math.round(e.score * 100)}%${e.evidence ? `  ← "${e.evidence}"` : ""}`);
}
