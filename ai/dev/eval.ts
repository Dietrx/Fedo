/**
 * Checks the local engine against FIXTURE_ITEMS expectations + ai/dev/cases.ts.
 *   npx tsx ai/dev/eval.ts      → exit code 1 if a case fails
 */
import { assess } from "../assess";
import { scoreSignals } from "../engine";
import { CASES } from "./cases";

let failed = 0;
for (const c of CASES) {
  const signals = scoreSignals({ kind: "post", item: c.item });
  const on = new Set(signals.filter((s) => s.score >= 0.5).map((s) => s.key));
  const { level, score } = assess(signals);
  const problems = [
    ...c.expect.filter((k) => !on.has(k)).map((k) => `missing ${k} (${signals.find((s) => s.key === k)?.score})`),
    ...c.reject.filter((k) => on.has(k)).map((k) => `unexpected ${k} (${signals.find((s) => s.key === k)?.score})`),
    ...(c.level.includes(level) ? [] : [`level ${level} (${score}), expected ${c.level.join("|")}`]),
  ];
  if (problems.length) failed++;
  console.log(`${problems.length ? "✗" : "✓"} [${level.padEnd(6)} ${score.toFixed(2)}] ${c.item.text.slice(0, 70)}`);
  for (const p of problems) console.log(`      ${p}`);
}
console.log(`\n${CASES.length - failed}/${CASES.length} cases passed`);
process.exit(failed ? 1 : 0);
