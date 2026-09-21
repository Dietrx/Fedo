/**
 * Design tokens (source of truth: the Fedo Shield design system).
 * Four themes: light / dark, each with a colour-blind-safe twin (Okabe-Ito hues).
 * Colour tells the CATEGORY of a technique, fill weight tells its STRENGTH. Red is only ever LIVE.
 */
import type { SignalKey } from "@contracts";
import { SIGNALS } from "@contracts";

export type ThemeId = "light" | "dark" | "light-cb" | "dark-cb";
export type ThemePref = "system" | "light" | "dark";
/** The groups the theme has colours for. contracts/signals.ts may add more: those render neutral until a colour is added here. */
export type Group = "political" | "rhetoric" | "credibility" | "synthetic";
export type AnyGroup = Group | "other";

type Palette = Record<string, string>;

const NEUTRAL_LIGHT: Palette = {
  ground: "#f5f5f7", surface: "#ffffff", "surface-sunken": "#f0f0f3",
  ink: "#0b0b0f", "ink-muted": "#636366", hairline: "#e5e5ea",
  action: "#0b0b0f", "on-action": "#ffffff", focus: "#0b0b0f",
  live: "#d70015", "on-live": "#ffffff",
  "shadow-card": "0 1px 2px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.08)",
  "glow-live": "0 0 0 4px rgba(215,0,21,.16)",
  "glow-action": "0 0 0 4px rgba(11,11,15,.12)",
};
const NEUTRAL_DARK: Palette = {
  ground: "#000000", surface: "#141416", "surface-sunken": "#1c1c1f",
  ink: "#f5f5f7", "ink-muted": "#9a9aa0", hairline: "#2a2a2e",
  action: "#f5f5f7", "on-action": "#0b0b0f", focus: "#f5f5f7",
  live: "#ff453a", "on-live": "#0b0b0f",
  "shadow-card": "0 1px 2px rgba(0,0,0,.7), 0 8px 24px rgba(0,0,0,.5)",
  "glow-live": "0 0 0 4px rgba(255,69,58,.22), 0 0 18px rgba(255,69,58,.45)",
  "glow-action": "0 0 0 4px rgba(245,245,247,.16)",
};

/** [fill, on-fill, tint, ink-on-tint] per group */
type Cat = Record<Group, [string, string, string, string]>;
const CAT: Record<ThemeId, Cat & { clean: [string, string] }> = {
  light: {
    political: ["#6e56cf", "#ffffff", "#efebfd", "#5240b8"],
    rhetoric: ["#ea5f22", "#0b0b0f", "#fdebe2", "#b03f0f"],
    credibility: ["#bf8700", "#0b0b0f", "#fdf3cf", "#7a5600"],
    synthetic: ["#0d9490", "#0b0b0f", "#dcf5f3", "#0b6f6b"],
    clean: ["#177a3d", "#e2f5e9"],
  },
  dark: {
    political: ["#9b8afb", "#0b0b0f", "#231e3d", "#bdb0ff"],
    rhetoric: ["#ff8a4c", "#0b0b0f", "#3a2114", "#ffa471"],
    credibility: ["#ffc940", "#0b0b0f", "#3a2e0e", "#ffd262"],
    synthetic: ["#2fd3cc", "#0b0b0f", "#0f3331", "#5ee3dc"],
    clean: ["#4ade80", "#10301e"],
  },
  "light-cb": {
    political: ["#0072b2", "#ffffff", "#e3f0fa", "#005a8c"],
    rhetoric: ["#d55e00", "#0b0b0f", "#fbe9dc", "#a34600"],
    credibility: ["#c28500", "#0b0b0f", "#fdf1d4", "#8a5f00"],
    synthetic: ["#2f8fca", "#0b0b0f", "#e2f2fb", "#1a6f9e"],
    clean: ["#00785a", "#dff4ec"],
  },
  "dark-cb": {
    political: ["#5eb3f0", "#0b0b0f", "#0f2a3d", "#8ccbf7"],
    rhetoric: ["#ff8a3d", "#0b0b0f", "#3d2010", "#ffab73"],
    credibility: ["#f5c542", "#0b0b0f", "#3a2f0a", "#ffd76a"],
    synthetic: ["#9ad8fb", "#0b0b0f", "#142e3f", "#b8e3fb"],
    clean: ["#3fd0a0", "#0f3328"],
  },
};

export const GROUPS: Group[] = ["political", "rhetoric", "credibility", "synthetic"];
/** Shape glyph per group, shown before the label in the colour-blind themes so hue never carries meaning alone. */
export const GLYPH: Record<AnyGroup, string> = { political: "◆", rhetoric: "▲", credibility: "●", synthetic: "■", other: "○" };
const KNOWN = new Set<string>(["political", "rhetoric", "credibility", "synthetic"]);
/** Group of a signal for colouring. An unknown group (new in contracts) maps to "other" = neutral ink. */
export const groupOf = (key: SignalKey): AnyGroup => {
  const g = (SIGNALS[key] as { group?: string } | undefined)?.group ?? "other";
  return (KNOWN.has(g) ? g : "other") as AnyGroup;
};

const SCALE = {
  "font-sans": `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif`,
  "font-display": `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif`,
  "font-mono": `ui-monospace, "SF Mono", Menlo, "Cascadia Mono", monospace`,
  "space-1": "4px", "space-2": "8px", "space-3": "12px", "space-4": "16px", "space-6": "24px", "space-8": "32px", "space-11": "44px",
  "radius-sm": "8px", "radius-md": "12px", "radius-lg": "16px", "radius-xl": "20px", "radius-pill": "999px",
};

function vars(theme: ThemeId): string {
  const neutral = theme.startsWith("dark") ? NEUTRAL_DARK : NEUTRAL_LIGHT;
  const cat = CAT[theme];
  const out: string[] = [];
  for (const [k, v] of Object.entries(neutral)) out.push(`--${k}:${v}`);
  for (const g of GROUPS) {
    const [fill, on, tint, ink] = cat[g];
    out.push(`--cat-${g}:${fill}`, `--cat-${g}-on:${on}`, `--cat-${g}-tint:${tint}`, `--cat-${g}-ink:${ink}`);
  }
  out.push(`--clean:${cat.clean[0]}`, `--clean-tint:${cat.clean[1]}`);
  // "other": a group the theme doesn't know yet → neutral
  out.push(`--cat-other:${neutral["ink-muted"]}`, `--cat-other-on:${neutral.ground}`, `--cat-other-tint:${neutral["surface-sunken"]}`, `--cat-other-ink:${neutral.ink}`);
  return out.join(";");
}

/**
 * CSS custom properties for all four themes, keyed by `[data-theme]` on `scope` (":host" in the shadow DOM, ":root" in the popup).
 */
export function themeCss(scope: ":host" | ":root"): string {
  const sel = (t: ThemeId) => (scope === ":host" ? `:host([data-theme="${t}"])` : `:root[data-theme="${t}"]`);
  const scale = Object.entries(SCALE).map(([k, v]) => `--${k}:${v}`).join(";");
  return `${scope}{${scale}}` + (Object.keys(CAT) as ThemeId[]).map((t) => `${sel(t)}{${vars(t)}}`).join("");
}

export function resolveTheme(pref: ThemePref, colorBlind: boolean, systemDark: boolean): ThemeId {
  const dark = pref === "dark" || (pref === "system" && systemDark);
  return `${dark ? "dark" : "light"}${colorBlind ? "-cb" : ""}` as ThemeId;
}

/** Is the host page (x.com / tiktok.com) in a dark colour scheme? Reads the body background, falls back to prefers-color-scheme. */
export function hostIsDark(doc: Document = document): boolean {
  try {
    const bg = getComputedStyle(doc.body).backgroundColor;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(bg);
    if (m && (m[4] === undefined || Number(m[4]) > 0.5)) {
      const lum = (0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3])) / 255;
      return lum < 0.5;
    }
  } catch {}
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}
