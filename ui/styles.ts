/**
 * Overlay CSS, all values from the design tokens (see theme.ts). Lives inside the Shadow DOM.
 * Hue = category, fill weight = strength (low / mid / high). Red only for LIVE and the pending pulse.
 */
import { GROUPS, themeCss } from "./theme";

const TICKS = `linear-gradient(var(--hairline),var(--hairline)) 25% 0/1px 100% no-repeat,
  linear-gradient(var(--hairline),var(--hairline)) 50% 0/1px 100% no-repeat,
  linear-gradient(var(--hairline),var(--hairline)) 75% 0/1px 100% no-repeat, var(--surface-sunken)`;

const groupCss = GROUPS.map(
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
  .prog.loading i { animation: fill 1.6s cubic-bezier(.2,.7,.3,1) forwards; }
  @keyframes fill { to { width: 90%; } }
  .prog.done i { width: 100%; opacity: 0; }
  .prog.live i { width: 100%; background: var(--live); opacity: 1; }
  .prog.err i { width: 100%; background: var(--ink-muted); }

  /* the strip: one quiet 28px line inside the post, no box, colour only on the dots */
  .strip { display: flex; align-items: center; gap: var(--space-2); min-height: 28px; padding: 0 2px; font: 500 12px/16px var(--font-sans);
           white-space: nowrap; overflow: hidden; cursor: pointer; border-radius: 6px; }
  .strip:hover .details, .strip:focus-visible .details { color: var(--ink); }
  .strip:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .strip.muted { color: var(--ink-muted); }
  .strip svg { width: 12px; height: 12px; color: var(--clean); flex: none; }
  .muted { color: var(--ink-muted); }
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

  .panel { position: relative; margin-top: 6px; padding: var(--space-4); border-radius: var(--radius-md); background: var(--surface); border: 1px solid var(--hairline); animation: rise .16s ease-out; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); margin-bottom: var(--space-2); }
  .head h3 { margin: 0; font: 600 17px/22px var(--font-display); letter-spacing: -.01em; }
  .meta { display: inline-flex; align-items: center; gap: var(--space-2); }
  .overall { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); padding: var(--space-2) var(--space-3); margin-bottom: var(--space-3);
             border-radius: var(--radius-sm); background: var(--surface-sunken); font: 500 12px/16px var(--font-sans); }
  .overall .lvl { color: var(--ink); }
  .explain { margin: 0 0 var(--space-3); font: 400 14px/20px var(--font-sans); }
  .sec { font: 600 11px/16px var(--font-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--ink-muted); margin: var(--space-2) 0 2px; }
  .foot { display: flex; align-items: center; justify-content: space-between; margin-top: var(--space-3); }
  .foot .note { margin: 0; }
  .row { display: grid; grid-template-columns: 1fr 44px; align-items: center; column-gap: var(--space-3); row-gap: 5px; padding: var(--space-2) 0; border-top: 1px solid var(--hairline); }
  .lbl { display: flex; align-items: center; gap: var(--space-2); font: 500 13px/18px var(--font-sans); }
  .sw { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .val { text-align: right; }
  .meter { grid-column: 1 / -1; height: 6px; border-radius: var(--radius-sm); overflow: hidden; background: ${TICKS}; }
  .fill { display: block; height: 100%; border-radius: var(--radius-pill); transition: width .4s ease-out; }
  .ev { grid-column: 1 / -1; color: var(--ink-muted); }
  .ev q { font-style: italic; quotes: "“" "”"; }
  .note { margin: var(--space-3) 0 0; font: 600 11px/14px var(--font-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--ink-muted); }

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
  ${groupCss}
`;
