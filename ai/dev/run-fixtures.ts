/**
 * AI dev harness — runs fixture posts through the analyzer in Node. No browser needed.
 *   npm run dev:ai              (uses FEDO_ANALYZER from .env, default mock)
 *   npm run dev:ai -- --jev     (force Jev)
 */
import { existsSync, readFileSync } from "node:fs";
import { FIXTURE_ITEMS, SIGNALS } from "@contracts";
import { assess } from "../assess";
import { createAnalyzer } from "../index";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1]! in process.env)) process.env[m[1]!] = m[2]!;
  }
}

const mode = process.argv.includes("--jev") ? "jev" : process.env.FEDO_ANALYZER === "jev" ? "jev" : "mock";
const analyzer = createAnalyzer({ mode, jevApiUrl: process.env.JEV_API_URL, jevApiKey: process.env.JEV_API_KEY });

for (const item of FIXTURE_ITEMS) {
  const result = await analyzer.analyze({ kind: "post", item });
  console.log(`\n── ${item.id}  (@${item.author.handle})  ${result.source}, ${result.latencyMs}ms`);
  console.log(`   "${item.text.slice(0, 90)}${item.text.length > 90 ? "…" : ""}"`);
  for (const s of [...result.signals].sort((a, b) => b.score - a.score).filter((s) => s.score >= 0.5)) {
    console.log(`   ${(s.score * 100).toFixed(0).padStart(3)}%  ${SIGNALS[s.key].label}${s.evidence ? `  ← "${s.evidence}"` : ""}`);
  }
  const a = assess(result.signals);
  console.log(`   intensity: ${a.level} (${a.score})`);
  if (result.explanation) console.log(`   why: ${result.explanation}`);
}
