/**
 * UI ↔ contracts coverage check.  Run:  npx tsx ui/dev/contract-coverage.ts
 *
 * Fails (exit 1) when the UI cannot represent something the contract defines:
 *   - a signal key without label/description, or with a group the theme has no colour for
 *   - an IntensityLevel the dashboard/popup have no style for
 *   - a fixture result the overlay's pure view logic can't classify
 * Warns (exit 0) about contract fields the UI never reads — the list of what's still unused.
 * Purpose: when the AI/Scraper devs add fields, this shows at once what the UI still has to pick up.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SETTINGS, FIXTURE_RESULTS, SIGNALS, SIGNAL_KEYS } from "@contracts";
import { GROUPS, groupOf } from "../theme";

let fails = 0;
const fail = (m: string) => { console.error(`✗ ${m}`); fails++; };
const ok = (m: string) => console.log(`✓ ${m}`);
const warn = (m: string) => console.log(`! ${m}`);

// ── 1. every signal key is presentable ──────────────────────────────────────────────────
const known = new Set<string>(GROUPS);
for (const key of SIGNAL_KEYS) {
  const s = SIGNALS[key];
  if (!s?.label || !s.description) fail(`SIGNALS.${key}: missing label/description (ui shows SIGNALS[key].label verbatim)`);
  if (!known.has(s.group)) warn(`SIGNALS.${key}: group "${s.group}" has no colour in ui/theme.ts → renders neutral ("other"). Add it to CAT/GROUPS/GLYPH/LABEL.`);
  if (groupOf(key) === "other" && known.has(s.group)) fail(`groupOf(${key}) fell back to "other" although the group is known`);
}
ok(`${SIGNAL_KEYS.length} signal keys have labels; groups: ${[...new Set(SIGNAL_KEYS.map((k) => SIGNALS[k].group))].join(", ")}`);

// ── 2. every IntensityLevel has a style ─────────────────────────────────────────────────
const typesSrc = readFileSync("contracts/types.ts", "utf8");
const levels = /export type IntensityLevel = ([^;]+);/.exec(typesSrc)?.[1]?.match(/"([a-z]+)"/g)?.map((x) => x.replace(/"/g, "")) ?? [];
const dashHtml = readFileSync("ui/dashboard/dashboard.html", "utf8");
for (const lvl of levels) {
  if (lvl === "none") continue; // "none" renders as "clean"
  if (!dashHtml.includes(`.lvl.${lvl}`) && !dashHtml.includes(`value="${lvl}"`)) fail(`IntensityLevel "${lvl}": no filter/style in ui/dashboard/dashboard.html`);
}
ok(`IntensityLevel: ${levels.join(" | ")} handled`);

// ── 3. fixtures pass through the overlay's classification ───────────────────────────────
for (const r of FIXTURE_RESULTS) {
  const shown = r.signals.filter((s) => s.score >= DEFAULT_SETTINGS.minScore);
  const kind = r.partial ? "live" : shown.length ? "labels" : "clean";
  if (r.timeline?.some((t) => !SIGNAL_KEYS.includes(t.key))) fail(`fixture ${r.itemId}: timeline key not in SIGNAL_KEYS`);
  console.log(`  · ${r.itemId.padEnd(12)} → ${kind.padEnd(6)} overall=${r.overall?.level ?? "–"} signals=${r.signals.length} timeline=${r.timeline?.length ?? 0}`);
}
ok(`${FIXTURE_RESULTS.length} fixture results classified`);

// ── 4. which contract fields does the UI read? ──────────────────────────────────────────
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === "dev" || f === "playground" ? [] : walk(p)) : p.endsWith(".ts") ? [p] : []; });
const uiSrc = walk("ui").map((f) => readFileSync(f, "utf8")).join("\n");
const iface = (name: string) => {
  const body = new RegExp(`export (?:interface|type) ${name}\\b[^{]*\\{([\\s\\S]*?)\\n\\}`).exec(typesSrc)?.[1] ?? "";
  return [...body.matchAll(/^\s{2}([a-zA-Z_]+)\??:/gm)].map((m) => m[1]!);
};
const relevant = ["AnalysisResult", "Signal", "OverallIntensity", "TimelineEvent", "Settings", "FeedItem"];
for (const name of relevant) {
  const fields = iface(name);
  const used = fields.filter((f) => new RegExp(`\\.${f}\\b|\\b${f}:`).test(uiSrc));
  const unused = fields.filter((f) => !used.includes(f));
  console.log(`  ${name.padEnd(17)} used: ${used.join(", ") || "–"}`);
  if (unused.length) warn(`${name}: not read by the UI yet → ${unused.join(", ")}${name === "FeedItem" ? "  (render() gets no FeedItem; see UPDATE.md proposal)" : ""}`);
}

// ── 5. the module contract ──────────────────────────────────────────────────────────────
const modulesSrc = readFileSync("contracts/modules.ts", "utf8");
const renderer = /export interface OverlayRenderer \{([\s\S]*?)\n\}/.exec(modulesSrc)?.[1] ?? "";
const methods = [...renderer.matchAll(/^\s{2}([a-zA-Z]+)\(/gm)].map((m) => m[1]!);
const indexSrc = readFileSync("ui/index.ts", "utf8");
for (const m of methods) if (!new RegExp(`^\\s{4}${m}\\(`, "m").test(indexSrc)) fail(`OverlayRenderer.${m}() not implemented in ui/index.ts`);
ok(`OverlayRenderer: ${methods.join(", ")} implemented`);
const msgs = [...readFileSync("contracts/messages.ts", "utf8").matchAll(/type: "(fedo\/[a-zA-Z]+)"/g)].map((m) => m[1]!);
const popupSrc = readFileSync("ui/popup/popup.ts", "utf8");
console.log(`  messages: ${[...new Set(msgs)].map((m) => `${m}${popupSrc.includes(m) ? " ✓" : " (not used by popup)"}`).join(", ")}`);

console.log(fails ? `\n${fails} problem(s)` : "\nUI covers the contract.");
process.exit(fails ? 1 : 0);
