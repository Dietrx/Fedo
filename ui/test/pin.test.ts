/**
 * Pins the UI behaviour that must not move when the card is restyled: what counts as a signal,
 * what the log stores, where the card sits. No DOM needed.
 *   node --import tsx --test ui/test/*.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FIXTURE_RESULTS, SIGNAL_KEYS } from "@contracts";
import { groupOf, isTopic, rankSignals, resolveTheme, themeCss } from "../theme";
import { isSlop } from "../index";
import { entryFrom, safeHttpUrl } from "../log";
import { OVERLAY_CSS } from "../styles";
import { DEFAULT_PREFS } from "../prefs";

const result = (id: string) => FIXTURE_RESULTS.find((r) => r.itemId === id)!;
const anchor = (text: string) => ({ querySelector: () => null, innerText: text }) as unknown as HTMLElement;

test("theme: political_content is a topic, every other key is a technique with a group", () => {
  assert.equal(isTopic("political_content"), true);
  assert.equal(isTopic("fear_framing"), false);
  assert.equal(groupOf("fear_framing"), "rhetoric");
  assert.equal(groupOf("possible_ai_slop"), "synthetic");
  assert.equal(groupOf("not_a_key" as never), "other");
});

test("theme: four themes, each with the category colours", () => {
  assert.equal(resolveTheme("system", false, true), "dark");
  assert.equal(resolveTheme("light", true, true), "light-cb");
  const css = themeCss(":host");
  for (const t of ["light", "dark", "light-cb", "dark-cb"]) assert.ok(css.includes(`:host([data-theme="${t}"])`), t);
  assert.ok(css.includes("--cat-rhetoric:") && css.includes("--ink-muted:"));
});

test("card: top-right panel is the default layout and stays fixed top right", () => {
  assert.equal(DEFAULT_PREFS.layout, "hud");
  assert.match(OVERLAY_CSS, /:host\(\.hud\)\s*\{[^}]*position:\s*fixed;[^}]*top:\s*12px;[^}]*right:\s*12px;/);
});

test("slop cover: only possible_ai_slop / synthetic_media at 85% or more", () => {
  assert.equal(isSlop(result("x:1003")), true); // possible_ai_slop 0.89
  assert.equal(isSlop(result("x:1001")), false);
  assert.equal(isSlop({ ...result("x:1003"), signals: [{ key: "possible_ai_slop", score: 0.84 }] }), false);
});

test("log entry: id, url, overall, text and strongest-first signals", () => {
  const e = entryFrom("x:1001", anchor("THEY are\n destroying"), result("x:1001"), false);
  assert.equal(e.platform, "x");
  assert.equal(e.url, "https://x.com/i/status/1001");
  assert.equal(e.text, "THEY are destroying");
  assert.deepEqual(e.overall, { level: "high", score: 0.98 });
  assert.deepEqual(e.signals.map((s) => s.key), ["political_content", "fear_framing", "us_vs_them", "factual_claim", "urgency_language", "conspiracy_framing"]);
  assert.equal(e.signals[1]!.evidence, "destroying our country");
  assert.equal(entryFrom("x:1002", anchor(""), result("x:1002"), false).signals.length, 0); // only a topic at 2% → nothing to store
});

test("ranking: strongest first, topics left out, ties keep the contract's key order (a clean post must not reshuffle)", () => {
  const clean = SIGNAL_KEYS.filter((k) => k !== "synthetic_media").map((key) => ({ key, score: 0.02 }));
  const top = (s: typeof clean) => rankSignals(s).slice(0, 5).map((x) => x.key);
  assert.deepEqual(top(clean), ["political_persuasion", "fear_framing", "anger_framing", "us_vs_them", "scapegoating"]);
  assert.deepEqual(top([...clean].reverse()), top(clean));
  assert.equal(rankSignals(clean).length, 14);
  assert.deepEqual(rankSignals([{ key: "urgency_language", score: 0.2 }, { key: "political_content", score: 0.9 }, { key: "sensationalism", score: 0.6 }]).map((x) => x.key), ["sensationalism", "urgency_language"]);
});

test("log entry: a clean post stores its five strongest readings, so the dashboard can show the same bars as the card", () => {
  const signals = SIGNAL_KEYS.filter((k) => k !== "synthetic_media").map((key) => ({ key, score: key === "sensationalism" ? 0.35 : 0.02 }));
  const e = entryFrom("x:7", anchor("hi"), { itemId: "x:7", signals, source: "local", latencyMs: 1 }, false);
  assert.equal(e.signals.length, 5);
  assert.equal(e.signals[0]!.key, "sensationalism");
  assert.ok(e.signals.every((s) => s.key !== "political_content")); // a topic at 2% is not stored
});

test("log entry: a topic at 50% or more is kept next to the five techniques", () => {
  const signals = SIGNAL_KEYS.filter((k) => k !== "synthetic_media").map((key) => ({ key, score: key === "political_content" ? 0.8 : 0.02 }));
  const e = entryFrom("x:8", anchor("hi"), { itemId: "x:8", signals, source: "local", latencyMs: 1 }, false);
  assert.deepEqual([e.signals[0]!.key, e.signals.length], ["political_content", 6]);
});

test("log: only http(s) urls reach the dashboard page", () => {
  assert.equal(safeHttpUrl("https://x.com/a"), "https://x.com/a");
  assert.equal(safeHttpUrl("javascript:alert(1)"), undefined);
});

test("dashboard: a technique counts from 50%, topics never count", () => {
  const src = readFileSync("ui/dashboard/dashboard.ts", "utf8");
  assert.equal(src.split("s.score >= 0.5").length - 1, 7);
  assert.equal(src.split("!isTopic(s.key)").length - 1, 6); // 5 counting sites + the bar rows of a post (display only)
});
