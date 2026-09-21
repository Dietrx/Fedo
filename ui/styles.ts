/**
 * Overlay CSS, all values from the design tokens (see theme.ts). Lives inside the Shadow DOM.
 * Hue = category, fill weight = strength (low / mid / high). Red only for LIVE and the pending pulse.
 */
import { GROUPS, themeCss } from "./theme";

/** The meter track: one quiet mark at the threshold (`--th`, set by the panel) instead of a ruler. */
const TRACK = `linear-gradient(var(--ink-muted),var(--ink-muted)) var(--th, 50%) 0/1px 100% no-repeat, var(--surface-sunken)`;

const groupCss = [...GROUPS, "other" as const].map(
  (g) => `
  .row[data-group="${g}"] .sw, .lab[data-group="${g}"] .k { background: var(--cat-${g}); }
  .lab[data-group="${g}"] .glyph { color: var(--cat-${g}-ink); }
  .row[data-group="${g}"] .fill { background: var(--cat-${g}); }
  .row[data-group="${g}"] .val, .row[data-group="${g}"] .glyph, .log [data-group="${g}"] .glyph { color: var(--cat-${g}-ink); }
  .log [data-group="${g}"] .k   { background: var(--cat-${g}); }`,
).join("");

export const OVERLAY_CSS = /* css */ `
  ${themeCss(":host")}
  :host { all: initial; display: block; margin: var(--space-2) 0 var(--space-1); font: 13px/18px var(--font-sans); color: var(--ink);
          animation: rise .16s ease-out; }
  @keyframes rise { from { opacity: 0; transform: translateY(4px); } }
  @keyframes pulse { 50% { opacity: .25; } }
  @media (prefers-reduced-motion: reduce) { :host { animation: fade .16s ease-out; } .dot { animation: none !important; } .fill { transition: none !important; } }
  @keyframes fade { from { opacity: 0; } }
  * { box-sizing: border-box; }

  /* progress: a 2px line at the top of the overlay. Fills while the AI works, completes, fades to the hairline */
  .prog { position: relative; height: 2px; border-radius: 1px; background: var(--hairline); overflow: hidden; }
  .prog i { position: absolute; inset: 0 auto 0 0; width: 0; background: var(--ink); border-radius: 1px; transition: width .2s ease-out, opacity .4s ease .6s; }
  .prog.loading i { animation: fill 1.6s cubic-bezier(.2,.7,.3,1) forwards, creep 25s linear 1.6s forwards; }
  @keyframes fill { to { width: 90%; } }
  @keyframes creep { from { width: 90%; } to { width: 97%; } }
  .prog.done i { width: 100%; opacity: 0; }
  .prog.live i { width: 100%; background: var(--live); opacity: 1; }
  .prog.err i { width: 100%; background: var(--ink-muted); }
  .prog.video i { animation: none; transition: width .6s ease-out; background: var(--live); opacity: 1; }
  .prog.video.muted i { background: var(--ink-muted); }
  .btn.small { height: 24px; padding: 0 8px; font: 600 11px/16px var(--font-mono); letter-spacing: .08em; text-transform: uppercase; flex: none; }

  /* the strip: one quiet 28px line inside the post, no box, colour only on the dots */
  .strip { display: flex; align-items: center; gap: var(--space-2); min-height: 28px; padding: 0 2px; font: 500 12px/16px var(--font-sans);
           white-space: nowrap; overflow: hidden; cursor: pointer; border-radius: 6px; }
  .strip:hover .details, .strip:focus-visible .details { color: var(--ink); }
  .strip:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .strip.muted { color: var(--ink-muted); }
  .strip svg { width: 12px; height: 12px; color: var(--clean); flex: none; }
  .muted { color: var(--ink-muted); }
  /* loading: skeleton pills + animated ellipsis */
  .skel { display: inline-block; height: 14px; border-radius: var(--radius-pill); background: linear-gradient(90deg, var(--surface-sunken) 25%, var(--hairline) 50%, var(--surface-sunken) 75%) 200% 0 / 200% 100%; animation: shimmer 1.4s linear infinite; }
  .skel.w1 { width: 96px; } .skel.w2 { width: 64px; }
  @keyframes shimmer { to { background-position: 0 0; } }
  .pending [data-elapsed]::after { content: "…"; display: inline-block; width: 0; overflow: hidden; vertical-align: bottom; animation: ell 1.5s steps(4, end) infinite; }
  @keyframes ell { to { width: 1.1em; } }
  @media (prefers-reduced-motion: reduce) { .skel { animation: none; } .pending [data-elapsed]::after { width: 1.1em; animation: none; } .prog.loading i { animation: fill .2s forwards; } }
  .topic { flex: none; margin-left: 0; padding: 1px 8px; border-radius: var(--radius-pill); background: var(--surface-sunken); color: var(--ink-muted); font: 500 11px/16px var(--font-sans); }
  .sec .topic { margin-left: 8px; }
  .swap { animation: fade .18s ease-out; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--live); animation: pulse 1s infinite ease-in-out; flex: none; }
  .labs { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lab { color: var(--ink); }
  .lab .k { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 5px; vertical-align: 1px; }
  .sep { margin: 0 6px; }
  .more { margin-left: 6px; }
  .lab b, .more, .val, .t { font: 600 11px/16px var(--font-mono); color: var(--ink-muted); }
  .glyph { font-size: 9px; line-height: 16px; margin-right: 4px; }
  .sep { color: var(--hairline); }
  .more { flex: none; }
  .live { display: inline-flex; align-items: center; gap: 4px; color: var(--live); font: 600 10px/16px var(--font-mono); letter-spacing: .08em; flex: none; }
  .live i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; animation: pulse 1s infinite ease-in-out; }
  .details { margin-left: auto; flex: none; padding-left: 8px; color: var(--ink-muted);
             font: 600 11px/16px var(--font-mono); letter-spacing: .08em; text-transform: uppercase; display: inline-flex; align-items: center; gap: 2px; }
  .chev { font-family: var(--font-sans); font-size: 14px; }
  .lvl { font: 600 11px/16px var(--font-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--ink-muted); }

  .btn { height: 32px; padding: 0 14px; border-radius: var(--radius-pill); border: 0; cursor: pointer; font: 600 14px/20px var(--font-sans); transition: box-shadow .15s ease; }
  .btn.primary { background: var(--action); color: var(--on-action); margin-left: auto; }
  .btn.primary:hover { box-shadow: var(--glow-action); }
  .btn.ghost { background: transparent; color: var(--ink-muted); }
  .btn:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

  /* the panel: level as the title → one bar → one sentence → the ranking. Sans for words, mono only for numbers. */
  .panel { position: relative; margin-top: 6px; padding: var(--space-4); border-radius: var(--radius-md); background: var(--surface); border: 1px solid var(--hairline); animation: rise .16s ease-out; }
  .status { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); }
  .sum { margin-bottom: var(--space-3); }
  .lv { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-2); }
  .level { margin: 0; font: 700 22px/26px var(--font-display); letter-spacing: -.02em; text-transform: capitalize; }
  .level.calm { display: flex; align-items: center; gap: 6px; font-size: 17px; line-height: 22px; letter-spacing: -.01em; text-transform: none; }
  .level svg { width: 16px; height: 16px; color: var(--clean); flex: none; }
  .score { font: 600 15px/20px var(--font-mono); font-variant-numeric: tabular-nums; }
  .cap { margin: 0; font: 400 12px/16px var(--font-sans); color: var(--ink-muted); }
  .explain { margin: 0 0 var(--space-3); font: 400 13px/19px var(--font-sans); }
  .sec { font: 600 12px/16px var(--font-sans); color: var(--ink-muted); margin: var(--space-2) 0 var(--space-1); }
  .foot { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); margin-top: var(--space-3); font: 400 11px/14px var(--font-sans); color: var(--ink-muted); }
  .foot .meta { margin-left: auto; font-family: var(--font-mono); }
  .row { display: grid; row-gap: 6px; padding: var(--space-2) 0; border-top: 1px solid var(--hairline); }
  .rbtn { all: unset; box-sizing: border-box; display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; align-items: center; column-gap: var(--space-2); width: 100%; min-height: 24px; border-radius: 6px; cursor: pointer; }
  .rbtn:focus-visible, .all:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .rank { font: 600 11px/16px var(--font-mono); color: var(--ink-muted); text-align: center; }
  .lbl { display: flex; align-items: center; gap: var(--space-2); min-width: 0; font: 500 13px/18px var(--font-sans); color: var(--ink); }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sw { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .val { text-align: right; font-variant-numeric: tabular-nums; }
  .meter { height: 6px; margin-left: 24px; border-radius: var(--radius-pill); overflow: hidden; background: ${TRACK}; }
  .meter.ov { height: 6px; margin: var(--space-2) 0 6px; background: var(--surface-sunken); }
  .meter.ov .fill { background: var(--ink); }
  .fill { display: block; height: 100%; border-radius: var(--radius-pill); transition: width .4s ease-out; }
  .row .fill { min-width: 3px; }
  .ev { margin-left: 24px; font: 400 12px/17px var(--font-sans); color: var(--ink-muted); }
  .ev q { font-style: italic; quotes: "“" "”"; }
  .whybox { margin-left: 24px; padding: var(--space-2) 10px; border-radius: var(--radius-sm); background: var(--surface-sunken); font: 400 12px/17px var(--font-sans); color: var(--ink); }
  .whybox p { margin: 0; } .whybox .ev { margin: var(--space-1) 0 0; }
  .whybox .src { margin-top: 6px; font-size: 11px; line-height: 15px; color: var(--ink-muted); }
  .all { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 2px; min-height: 28px; margin-left: 24px; padding-top: var(--space-1); border-radius: 6px; cursor: pointer; font: 600 12px/16px var(--font-sans); color: var(--ink); }
  .note { margin: 0; }
  .panel.skeleton { display: grid; gap: 10px; }
  .panel.skeleton .skel { display: block; height: 10px; }
  .panel.skeleton .skel.title { width: 40%; height: 22px; } .panel.skeleton .skel.bar { width: 100%; height: 6px; margin-bottom: var(--space-2); }

  /* live tracker mode */
  .panel.tracker { box-shadow: var(--shadow-card); }
  .panel .live { padding: 3px 8px; border-radius: var(--radius-pill); background: var(--live); color: var(--on-live); box-shadow: var(--glow-live); font-size: 11px; }
  .panel .live i { animation: none; }
  .panel .val { color: inherit; font-size: 12px; }
  .c { position: absolute; width: 12px; height: 12px; border: 1.5px solid var(--ink); }
  .c.tl { top: 6px; left: 6px; border-right: 0; border-bottom: 0; border-top-left-radius: 4px; }
  .c.tr { top: 6px; right: 6px; border-left: 0; border-bottom: 0; border-top-right-radius: 4px; }
  .c.bl { bottom: 6px; left: 6px; border-right: 0; border-top: 0; border-bottom-left-radius: 4px; }
  .c.br { bottom: 6px; right: 6px; border-left: 0; border-top: 0; border-bottom-right-radius: 4px; }
  .t { color: var(--ink-muted); letter-spacing: .08em; }
  .log { display: grid; gap: 6px; max-height: 140px; overflow-y: auto; padding: var(--space-1) 0; }
  .log > div { display: flex; gap: var(--space-2); align-items: baseline; }
  .log .t { min-width: 40px; }
  .log .k { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
  .log q { color: var(--ink-muted); font-style: italic; quotes: "“" "”"; }
  /* HUD: one fixed panel top-right that follows the post in view */
  :host(.hud) { position: fixed; top: 12px; right: 12px; z-index: 2147483000; width: 340px; max-width: calc(100vw - 24px); margin: 0; }
  .hud { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-xl); box-shadow: var(--shadow-card); overflow: hidden; }
  .hud .prog { border-radius: 0; height: 3px; }
  .hud .top { display: flex; align-items: center; gap: var(--space-2); padding: 10px 10px 0 var(--space-4); }
  .hud .brand { margin-right: auto; font: 600 13px/18px var(--font-sans); letter-spacing: -.01em; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hud .brand span { color: var(--ink-muted); font-weight: 400; }
  .hud .dash, .hud .fold { flex: none; height: 28px; border: 0; border-radius: var(--radius-pill); background: var(--surface-sunken); color: var(--ink); cursor: pointer; transition: background .15s ease, color .15s ease; }
  .hud .dash { padding: 0 var(--space-3); font: 600 12px/16px var(--font-sans); white-space: nowrap; }
  .hud .fold { display: grid; place-items: center; width: 28px; padding: 0; }
  .hud .fold svg { width: 12px; height: 12px; transition: transform .2s ease; }
  .hud .fold[aria-expanded="false"] svg { transform: rotate(180deg); }
  .hud .dash:hover, .hud .fold:hover { background: var(--action); color: var(--on-action); }
  .hud .dash:focus-visible, .hud .fold:focus-visible, .hud .strip:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .hud .who { display: flex; align-items: center; gap: var(--space-2); min-height: 24px; padding: var(--space-1) var(--space-4) 0; font: 400 12px/16px var(--font-sans); color: var(--ink-muted); white-space: nowrap; }
  .hud .who .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .hud .who b { color: var(--ink); font-weight: 600; }
  .hud .strip { padding: 2px var(--space-4) 10px; min-height: 30px; border-radius: 0; }
  .hud .idle { padding: 10px var(--space-4) 14px; color: var(--ink-muted); font: 400 12px/16px var(--font-sans); }
  .hud .body { max-height: min(70vh, 640px); overflow-y: auto; }
  .hud .panel { margin: 10px 0 0; padding: 14px var(--space-4) var(--space-3); border: 0; border-top: 1px solid var(--hairline); border-radius: 0; animation: none; }
  .hud .strip + .panel { margin-top: 0; }
  .hud .panel .c { display: none; }
  @media (prefers-reduced-motion: reduce) { .hud .fold svg, .hud .dash, .hud .fold { transition: none; } }

  /* below the threshold: measured, shown quietly, counted nowhere */
  .row.weak { row-gap: var(--space-1); padding: 6px 0; }
  .row.weak .lbl { font-weight: 400; color: var(--ink-muted); }
  .row.weak .meter { height: 4px; }
  .row.weak[data-group] .sw { background: transparent; box-shadow: inset 0 0 0 1.5px var(--ink-muted); }
  .row.weak[data-group] .fill { background: var(--ink-muted); }
  .row.weak[data-group] .val, .row.weak[data-group] .glyph { color: var(--ink-muted); }

  /* AI slop cover: over the whole post, until the reader dismisses it */
  .cover { position: absolute; inset: 0; z-index: 5; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-2);
           padding: var(--space-4); background: var(--ground); border-radius: var(--radius-lg); border: 1px solid var(--hairline); text-align: center; animation: fade .16s ease-out; }
  .cover .tag { font: 700 22px/26px var(--font-display); letter-spacing: -.02em; color: var(--ink); }
  .cover .tag::before { content: ""; display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--cat-synthetic); margin-right: 8px; vertical-align: 2px; }
  .cover .why { font: 500 12px/16px var(--font-sans); color: var(--ink-muted); max-width: 420px; white-space: normal; }
  .cover .why b { font: 600 11px/16px var(--font-mono); color: var(--ink); }
  .cover .why q { font-style: italic; quotes: "“" "”"; }
  .cover .x { position: absolute; top: 8px; right: 8px; width: 32px; height: 32px; border: 0; border-radius: 50%; background: transparent; color: var(--ink-muted); font: 400 22px/32px var(--font-sans); cursor: pointer; }
  .cover .x:hover { background: var(--surface-sunken); color: var(--ink); }
  .cover .show { margin-top: var(--space-2); }
  .btn.secondary { background: var(--surface); color: var(--ink); border: 1px solid var(--ink); height: 36px; padding: 0 16px; }
  ${groupCss}
`;
