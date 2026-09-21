/**
 * Runs a sample from fetch-live.ts through the analyzer and prints a review report.
 *   npx tsx ai/dev/run-live-sample.ts <sample.json> [--jev] [--out report.json]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { AnalysisResult, FeedItem } from "@contracts";
import { createAnalyzer } from "../index";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1]! in process.env)) process.env[m[1]!] = m[2]!;
  }
}
const file = process.argv[2];
if (!file) throw new Error("usage: npx tsx ai/dev/run-live-sample.ts <sample.json> [--jev]");
const mode = process.argv.includes("--jev") ? "jev" : "mock";
const outIdx = process.argv.indexOf("--out");
const analyzer = createAnalyzer({ mode, jevApiUrl: process.env.JEV_API_URL, jevApiKey: process.env.JEV_API_KEY });
const items = JSON.parse(readFileSync(file, "utf8")) as FeedItem[];

const rows: { item: FeedItem; result: AnalysisResult }[] = [];
const CONCURRENCY = 4;
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      rows.push({ item, result: await analyzer.analyze({ kind: "post", item }) });
    }
  }),
);
rows.sort((a, b) => (b.result.overall?.score ?? 0) - (a.result.overall?.score ?? 0));

const levels: Record<string, number> = {};
let chips = 0;
for (const { item, result } of rows) {
  const lvl = result.overall?.level ?? "-";
  levels[lvl] = (levels[lvl] ?? 0) + 1;
  const on = result.signals.filter((s) => s.score >= 0.5).sort((a, b) => b.score - a.score);
  chips += on.length;
  console.log(`\n[${lvl.toUpperCase().padEnd(6)} ${(result.overall?.score ?? 0).toFixed(2)}] ${result.source} @${item.author.handle}${item.quotedText ? " (quotes)" : ""}`);
  console.log(`  ${item.text.replace(/\s+/g, " ").slice(0, 260)}`);
  if (on.length) console.log(`  → ${on.map((s) => `${s.key} ${Math.round(s.score * 100)}${s.evidence ? "" : "°"}`).join(", ")}`);
}
console.log(`\n${rows.length} posts (${mode}): ${JSON.stringify(levels)} · avg chips/post ${(chips / rows.length).toFixed(1)} · ° = no evidence quote`);
if (outIdx > 0) writeFileSync(process.argv[outIdx + 1]!, JSON.stringify(rows, null, 1));
