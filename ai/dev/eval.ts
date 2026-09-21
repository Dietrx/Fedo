/**
 * Checks an analyzer against ai/dev/cases.ts.
 *   npx tsx ai/dev/eval.ts          → local engine (offline)
 *   npx tsx ai/dev/eval.ts --jev    → real API from .env (JEV_API_URL / JEV_API_KEY)
 * Exit code 1 if a case fails.
 */
import { existsSync, readFileSync } from "node:fs";
import { createAnalyzer } from "../index";
import { CASES } from "./cases";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1]! in process.env)) process.env[m[1]!] = m[2]!;
  }
}
const mode = process.argv.includes("--jev") ? "jev" : "mock";
const verbose = process.argv.includes("-v");
const analyzer = createAnalyzer({ mode, jevApiUrl: process.env.JEV_API_URL, jevApiKey: process.env.JEV_API_KEY });

let failed = 0;
for (const c of CASES) {
  const result = await analyzer.analyze({ kind: "post", item: c.item });
  const { signals } = result;
  const on = new Set(signals.filter((s) => s.score >= 0.5).map((s) => s.key));
  const { level, score } = result.overall ?? { level: "none" as const, score: 0 };
  const problems = [
    ...c.expect.filter((k) => !on.has(k)).map((k) => `missing ${k} (${signals.find((s) => s.key === k)?.score})`),
    ...c.reject.filter((k) => on.has(k)).map((k) => `unexpected ${k} (${signals.find((s) => s.key === k)?.score})`),
    ...(c.level.includes(level) ? [] : [`level ${level} (${score}), expected ${c.level.join("|")}`]),
  ];
  if (problems.length) failed++;
  console.log(`${problems.length ? "✗" : "✓"} [${result.source} ${level.padEnd(6)} ${score.toFixed(2)}] ${c.item.text.slice(0, 70)}`);
  for (const p of problems) console.log(`      ${p}`);
  if (verbose) console.log(`      on: ${signals.filter((s) => s.score >= 0.5).map((s) => `${s.key} ${s.score.toFixed(2)}`).join(", ")}`);
}
console.log(`\n${CASES.length - failed}/${CASES.length} cases passed (${mode})`);
process.exit(failed ? 1 : 0);
