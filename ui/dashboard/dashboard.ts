/**
 * The analysis dashboard: an extension page (dashboard.html) where the reader sees everything Fedo analyzed.
 * Reads the UI-owned log (ui/log.ts). No chrome context (opened as a plain file/URL) → demo data, so the page can be designed and reviewed.
 */
import { SIGNALS, SIGNAL_KEYS, type IntensityLevel, type SignalKey } from "@contracts";
import { clearLog, loadLog, onLogChange, type LogEntry } from "../log";
import { loadPrefs, onStorageChange, type UiPrefs } from "../prefs";
import { GLYPH, GROUPS, groupOf, resolveTheme, themeCss, type Group } from "../theme";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
document.head.appendChild(Object.assign(document.createElement("style"), { textContent: themeCss(":root") }));
const LABEL: Record<Group, string> = { political: "Political", rhetoric: "Rhetoric", credibility: "Credibility", synthetic: "Synthetic" };
const hasChrome = typeof chrome !== "undefined" && !!chrome.storage?.local;

let log: LogEntry[] = [];
let cb = false;
const open = new Set<string>();

function applyTheme(p: UiPrefs) {
  cb = p.colorBlind;
  document.documentElement.dataset.theme = resolveTheme(p.theme, p.colorBlind, matchMedia("(prefers-color-scheme: dark)").matches);
}

// ── filters ─────────────────────────────────────────────────────────────────────────────
const radio = (name: string) => (document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? "all");
function windowed(): LogEntry[] {
  const w = radio("win");
  const since = w === "today" ? new Date().setHours(0, 0, 0, 0) : w === "7d" ? Date.now() - 7 * 864e5 : 0;
  return log.filter((e) => e.ts >= since);
}
function filtered(): LogEntry[] {
  const pf = radio("pf"), lv = radio("lv"), slop = $<HTMLInputElement>("onlySlop").checked;
  return windowed().filter((e) => (pf === "all" || e.platform === pf) && (lv === "all" || e.overall?.level === lv) && (!slop || e.slop));
}

// ── views ───────────────────────────────────────────────────────────────────────────────
const pct = (x: number) => `${Math.round(x * 100)}%`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const mark = (g: Group) => (cb ? `<span class="k" style="background:none;width:auto;height:auto;color:var(--cat-${g}-ink);font-size:10px">${GLYPH[g]}</span>` : `<span class="k"></span>`);
const when = (ts: number) => {
  const d = new Date(ts), today = new Date().toDateString() === d.toDateString();
  return today ? d.toTimeString().slice(0, 5) : `${d.getDate()}.${d.getMonth() + 1}.`;
};

function renderReadouts(all: LogEntry[]) {
  const withSig = all.filter((e) => e.signals.some((s) => s.score >= 0.5));
  $("nAll").textContent = String(all.length);
  $("nAllSub").textContent = all.length === 1 ? "post" : "posts";
  $("nSig").textContent = String(withSig.length);
  $("nSigSub").textContent = `${all.length ? Math.round((withSig.length / all.length) * 100) : 0}% of feed`;
  $("nHigh").textContent = String(all.filter((e) => e.overall?.level === "high").length);
  $("nSlop").textContent = String(all.filter((e) => e.slop).length);
}

function renderTechniques(all: LogEntry[]) {
  const count = new Map<SignalKey, number>();
  const byGroup: Record<Group, number> = { political: 0, rhetoric: 0, credibility: 0, synthetic: 0 };
  for (const e of all) for (const s of e.signals) if (s.score >= 0.5) { count.set(s.key, (count.get(s.key) ?? 0) + 1); byGroup[groupOf(s.key)]++; }
  const total = GROUPS.reduce((n, g) => n + byGroup[g], 0);
  $("dist").innerHTML = GROUPS.filter((g) => byGroup[g] > 0).map((g) => `<i data-group="${g}" style="width:${(byGroup[g] / total) * 100}%" title="${LABEL[g]} ${byGroup[g]}"></i>`).join("");
  $("legend").innerHTML = GROUPS.map((g) => `<span data-group="${g}">${cb ? mark(g) : "<i></i>"}${LABEL[g]}${byGroup[g] ? ` · ${byGroup[g]}` : ""}</span>`).join("");
  const top = SIGNAL_KEYS.map((k) => [k, count.get(k) ?? 0] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = top[0]?.[1] ?? 1;
  $("rank").innerHTML = top.length
    ? top.map(([k, n]) => `<div class="row" data-group="${groupOf(k)}"><span class="lbl">${mark(groupOf(k))}${esc(SIGNALS[k].label)}</span><span class="n">${n}</span><div class="meter"><span class="fill" style="width:${(n / max) * 100}%"></span></div></div>`).join("")
    : `<div class="sub">No techniques above 50% in this window.</div>`;
}

function renderSources(all: LogEntry[]) {
  const by = new Map<string, { n: number; groups: Set<Group>; name?: string; platform: string }>();
  for (const e of all) {
    if (!e.signals.some((s) => s.score >= 0.5)) continue;
    const cur = by.get(e.handle) ?? { n: 0, groups: new Set<Group>(), name: e.displayName, platform: e.platform };
    cur.n++;
    for (const s of e.signals) if (s.score >= 0.5) cur.groups.add(groupOf(s.key));
    by.set(e.handle, cur);
  }
  const top = [...by.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
  $("src").innerHTML = top.length
    ? top.map(([h, v]) => `<div class="row"><span class="who">${esc(v.name ?? h)} <span>@${esc(h)} · ${v.platform === "x" ? "X" : "TikTok"}</span></span><span class="dots">${[...v.groups].map((g) => `<span data-group="${g}"><i></i></span>`).join("")}</span><span class="n">${v.n}</span></div>`).join("")
    : `<div class="sub">No flagged sources yet.</div>`;
}

function renderPosts(list: LogEntry[]) {
  $("count").textContent = `${list.length} ${list.length === 1 ? "post" : "posts"}`;
  if (!list.length) {
    $("posts").innerHTML = `<div class="empty"><div>Nothing here yet. Fedo logs every post it analyzes while you scroll.</div><button class="btn primary" id="goX">Open x.com</button></div>`;
    $("goX").addEventListener("click", () => (hasChrome ? chrome.tabs.create({ url: "https://x.com/home" }) : window.open("https://x.com/home")));
    return;
  }
  $("posts").innerHTML = list.slice(0, 200).map((e) => {
    const shown = e.signals.filter((s) => s.score >= 0.5);
    const labs = shown.slice(0, 3).map((s) => `<span data-group="${groupOf(s.key)}">${mark(groupOf(s.key))}${esc(SIGNALS[s.key].label)} <b>${pct(s.score)}</b></span>`).join(`<span class="sep">·</span>`) + (shown.length > 3 ? `<b class="sep" style="color:var(--ink-muted)"> +${shown.length - 3}</b>` : "");
    const lvl = e.slop ? `<span class="lvl slop">AI slop</span>` : e.overall && e.overall.level !== "none" ? `<span class="lvl ${e.overall.level}">${e.overall.level}</span>` : `<span class="lvl">clean</span>`;
    const rows = e.signals.map((s) => `<div class="row" data-group="${groupOf(s.key)}"><span class="lbl">${mark(groupOf(s.key))}${esc(SIGNALS[s.key].label)}</span><span class="n">${pct(s.score)}</span><div class="meter"><span class="fill" style="width:${pct(s.score)}"></span></div>${s.evidence ? `<div class="ev">“${esc(s.evidence)}”</div>` : ""}</div>`).join("");
    return `
      <article class="post${open.has(e.id) ? " open" : ""}" data-id="${esc(e.id)}">
        <div class="t">${e.platform === "x" ? "X" : "TIKTOK"}<b>${when(e.ts)}</b></div>
        <div>
          <div class="who">${esc(e.displayName ?? e.handle)} <span>@${esc(e.handle)}</span></div>
          <div class="ex">${esc(e.text) || "<i>no text</i>"}</div>
          <div class="labs">${labs || `<span class="sub">No strong signals</span>`}</div>
          <div class="det">${e.explanation ? `<p>${esc(e.explanation)}</p>` : ""}${rows}${e.url ? `<a class="open" href="${esc(e.url)}" target="_blank" rel="noopener">Open post ↗</a>` : ""}</div>
        </div>
        ${lvl}
      </article>`;
  }).join("");
  $("posts").querySelectorAll<HTMLElement>(".post").forEach((el) => el.addEventListener("click", (ev) => {
    if ((ev.target as HTMLElement).closest("a")) return;
    const id = el.dataset.id!;
    open.has(id) ? open.delete(id) : open.add(id);
    el.classList.toggle("open");
  }));
}

function render() {
  const all = windowed();
  renderReadouts(all); renderTechniques(all); renderSources(all); renderPosts(filtered());
}

// ── demo data (no extension context) ────────────────────────────────────────────────────
function demo(): LogEntry[] {
  const pool: Array<Partial<LogEntry> & { text: string; handle: string; sig: [SignalKey, number, string?][] }> = [
    { handle: "outrage_daily", displayName: "Outrage Daily", text: "THEY are destroying our country and the media won't tell you. Crime is up 300% since they arrived. Share before this gets deleted!", sig: [["political_content", .96], ["fear_framing", .91, "destroying our country"], ["us_vs_them", .87, "THEY are"], ["factual_claim", .84, "Crime is up 300%"], ["urgency_language", .78, "Share before this gets deleted"]], overall: { level: "high", score: .98 } },
    { handle: "jane_bakes", displayName: "Jane", text: "Finally nailed the sourdough after 3 weeks. The trick was a longer cold proof overnight.", sig: [], overall: { level: "none", score: 0 } },
    { handle: "growth_guru_ai", displayName: "Growth Guru", text: "In today's fast-paced world, unlocking your potential is more important than ever. Here are 7 game-changing tips 🧵👇", sig: [["possible_ai_slop", .89, "In today's fast-paced world"], ["engagement_bait", .82]], overall: { level: "medium", score: .5 }, slop: true },
    { handle: "truthseeker", platform: "tiktok", text: "Nobody in the media wants you to know this 🤯", sig: [["conspiracy_framing", .9, "what the government is hiding"], ["us_vs_them", .71, "they are lying to you"], ["sensationalism", .88]], overall: { level: "medium", score: .79 } },
    { handle: "promo_bot_9000", displayName: "Promo", text: "🚀 Unlock 10x productivity with our revolutionary AI-powered solution! Limited time offer — transform your workflow today! #ad", sig: [["possible_ai_slop", .94, "Unlock 10x productivity"], ["commercial_persuasion", .9], ["urgency_language", .7, "Limited time offer"]], overall: { level: "medium", score: .6 }, slop: true },
    { handle: "cityhall_news", displayName: "City Hall News", text: "Council votes 7–2 to extend the tram line to the east side; construction starts in March, according to the published minutes.", sig: [["political_content", .8]], overall: { level: "low", score: .2 } },
    { handle: "dr_mia_k", displayName: "Mia K.", text: "New meta-analysis (n=41 studies) finds no link between screen time and sleep in adults. Link to the paper in replies.", sig: [["factual_claim", .55]], overall: { level: "low", score: .18 } },
    { handle: "anger_hour", platform: "tiktok", text: "They laughed at us. Now watch them squirm. RT if you're done being polite.", sig: [["anger_framing", .9, "watch them squirm"], ["us_vs_them", .8, "They laughed at us"], ["engagement_bait", .72, "RT if"]], overall: { level: "high", score: .9 } },
  ];
  const out: LogEntry[] = [];
  for (let i = 0; i < 46; i++) {
    const p = pool[i % pool.length]!;
    out.push({ id: `${p.platform ?? "x"}:${9000 + i}`, platform: (p.platform ?? "x") as LogEntry["platform"], handle: p.handle, displayName: p.displayName, url: `https://x.com/i/status/${9000 + i}`,
      text: p.text, ts: Date.now() - i * 37 * 60e3 - (i % 5) * 864e5, overall: p.overall as LogEntry["overall"], explanation: p.sig.length ? "Explanation from the analyzer goes here." : undefined,
      signals: p.sig.map(([key, score, evidence]) => ({ key, score, evidence })), slop: !!p.slop });
  }
  return out;
}

// ── wiring ──────────────────────────────────────────────────────────────────────────────
async function init() {
  applyTheme(await loadPrefs());
  log = hasChrome ? await loadLog() : demo();
  render();
}
document.querySelectorAll<HTMLInputElement>('input[name="win"], input[name="pf"], input[name="lv"], #onlySlop').forEach((r) => r.addEventListener("change", render));
$("export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(windowed(), null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `fedo-analyses-${new Date().toISOString().slice(0, 10)}.json` });
  a.click(); URL.revokeObjectURL(a.href);
});
$("reset").addEventListener("click", async () => { if (confirm("Delete all logged analyses?")) { await clearLog(); log = hasChrome ? [] : demo(); render(); } });
onLogChange((l) => { log = l; render(); });
onStorageChange((c) => { if (c.prefs) { applyTheme(c.prefs); render(); } });
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", async () => { applyTheme(await loadPrefs()); });
init().catch((e) => console.error("[fedo:dashboard]", e));
