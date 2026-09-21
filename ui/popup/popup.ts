/**
 * Extension popup = the dashboard. Settings (enabled, minScore) go through the background via @contracts/messages;
 * appearance and the readout counters are UI-owned (ui/prefs.ts, chrome.storage.local) and need no contract change.
 */
import { send } from "@contracts/messages";
import { loadPrefs, loadStats, onStorageChange, resetStats, savePrefs, type Stats, type UiPrefs } from "../prefs";
import { GLYPH, GROUPS, resolveTheme, themeCss } from "../theme";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
document.head.appendChild(Object.assign(document.createElement("style"), { textContent: themeCss(":root") }));

const systemDark = () => matchMedia("(prefers-color-scheme: dark)").matches;
function applyTheme(p: UiPrefs) {
  document.documentElement.dataset.theme = resolveTheme(p.theme, p.colorBlind, systemDark());
  $<HTMLInputElement>("colorBlind").checked = p.colorBlind;
  $<HTMLInputElement>("slopCover").checked = p.slopCover;
  document.querySelectorAll<HTMLInputElement>('input[name="theme"]').forEach((r) => (r.checked = r.value === p.theme));
  document.querySelectorAll<HTMLInputElement>('input[name="layout"]').forEach((r) => (r.checked = r.value === p.layout));
}

const LABEL = { political: "Political", rhetoric: "Rhetoric", credibility: "Credibility", synthetic: "Synthetic" } as const;
function renderStats(s: Stats) {
  $("analyzed").textContent = String(s.analyzed);
  $("withSignals").textContent = String(s.withSignals);
  $("ratio").textContent = `${s.analyzed ? Math.round((s.withSignals / s.analyzed) * 100) : 0}% of feed`;
  const total = GROUPS.reduce((n, g) => n + s.byGroup[g], 0);
  $("dist").innerHTML = GROUPS.filter((g) => s.byGroup[g] > 0)
    .map((g) => `<i data-group="${g}" style="width:${(s.byGroup[g] / total) * 100}%" title="${LABEL[g]} ${s.byGroup[g]}"></i>`).join("");
  $("legend").innerHTML = GROUPS.map((g) => `<span data-group="${g}"><i>${GLYPH[g]}</i>${LABEL[g]} ${s.byGroup[g] ? `· ${s.byGroup[g]}` : ""}</span>`).join("");
}

const minScore = $<HTMLInputElement>("minScore");
function renderThreshold(v: number) {
  // slider shows sensitivity: high sensitivity = low threshold
  minScore.value = String(1.2 - v);
  minScore.style.setProperty("--fill", `${((1.2 - v - 0.3) / 0.6) * 100}%`);
  $("threshold").textContent = `shows ≥ ${Math.round(v * 100)}%`;
}

async function init() {
  applyTheme(await loadPrefs());
  renderStats(await loadStats());
  document.body.classList.remove("loading");
  const settings = await send({ type: "fedo/getSettings" }); // needs the extension context
  $<HTMLInputElement>("enabled").checked = settings.enabled;
  renderThreshold(settings.minScore);
}

$("enabled").addEventListener("change", (e) => send({ type: "fedo/setSettings", settings: { enabled: (e.target as HTMLInputElement).checked } }));
minScore.addEventListener("input", () => renderThreshold(1.2 - Number(minScore.value)));
minScore.addEventListener("change", () => send({ type: "fedo/setSettings", settings: { minScore: Math.round((1.2 - Number(minScore.value)) * 100) / 100 } }));
document.querySelectorAll<HTMLInputElement>('input[name="theme"]').forEach((r) =>
  r.addEventListener("change", async () => applyTheme(await savePrefs({ theme: r.value as UiPrefs["theme"] }))));
document.querySelectorAll<HTMLInputElement>('input[name="layout"]').forEach((r) =>
  r.addEventListener("change", async () => applyTheme(await savePrefs({ layout: r.value as UiPrefs["layout"] }))));
$("colorBlind").addEventListener("change", async (e) => applyTheme(await savePrefs({ colorBlind: (e.target as HTMLInputElement).checked })));
$("slopCover").addEventListener("change", async (e) => applyTheme(await savePrefs({ slopCover: (e.target as HTMLInputElement).checked })));
$("reset").addEventListener("click", () => resetStats());
$("open").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") }));
onStorageChange((c) => { if (c.stats) renderStats(c.stats); });
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", async () => applyTheme(await loadPrefs()));

init().catch((e) => console.error("[fedo:popup]", e));
