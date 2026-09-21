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
  .chip[data-group="${g}"].low  { background: var(--cat-${g}-tint); color: var(--cat-${g}-ink); }
  .chip[data-group="${g}"].mid  { background: var(--cat-${g}-tint); color: var(--cat-${g}-ink); border-color: var(--cat-${g}); }
  .chip[data-group="${g}"].high { background: var(--cat-${g}); color: var(--cat-${g}-on); }
  .row[data-group="${g}"] .sw   { background: var(--cat-${g}); }
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

  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); min-height: 48px;
         padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3); border-radius: var(--radius-md);
         background: var(--surface); border: 1px solid var(--hairline); font-weight: 500; }
  .muted { color: var(--ink-muted); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--live); animation: pulse 1s infinite ease-in-out; }
  .bar.clean { background: var(--clean-tint); border-color: transparent; color: var(--clean); font-weight: 600; }
  .bar.clean svg { width: 14px; height: 14px; }

  .chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: var(--radius-pill);
          font: 600 12px/16px var(--font-sans); white-space: nowrap; border: 1px solid transparent; }
  .chip b, .val, .more, .t { font: 700 12px/16px var(--font-mono); }
  .glyph { font-size: 10px; line-height: 16px; }
  .more { color: var(--ink-muted); }
  .live { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: var(--radius-pill);
          background: var(--live); color: var(--on-live); font: 600 11px/14px var(--font-mono); letter-spacing: .08em; box-shadow: var(--glow-live); }
  .live i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

  .btn { height: 32px; padding: 0 14px; border-radius: var(--radius-pill); border: 0; cursor: pointer; font: 600 14px/20px var(--font-sans); transition: box-shadow .15s ease; }
  .btn.primary { background: var(--action); color: var(--on-action); margin-left: auto; }
  .btn.primary:hover { box-shadow: var(--glow-action); }
  .btn.ghost { background: transparent; color: var(--ink-muted); }
  .btn:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

  .panel { position: relative; margin-top: 6px; padding: var(--space-4); border-radius: var(--radius-md); background: var(--surface); border: 1px solid var(--hairline); }
  .head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); margin-bottom: var(--space-2); }
  .head h3 { margin: 0; font: 600 17px/22px var(--font-display); letter-spacing: -.01em; }
  .explain { margin: 0 0 var(--space-3); font: 400 14px/20px var(--font-sans); }
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
  .c { position: absolute; width: 12px; height: 12px; border: 1.5px solid var(--ink); }
  .c.tl { top: 6px; left: 6px; border-right: 0; border-bottom: 0; border-top-left-radius: 4px; }
  .c.tr { top: 6px; right: 6px; border-left: 0; border-bottom: 0; border-top-right-radius: 4px; }
  .c.bl { bottom: 6px; left: 6px; border-right: 0; border-top: 0; border-bottom-left-radius: 4px; }
  .c.br { bottom: 6px; right: 6px; border-left: 0; border-top: 0; border-bottom-right-radius: 4px; }
  .t { color: var(--ink-muted); letter-spacing: .08em; }
  .log { margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--hairline); display: grid; gap: 6px; max-height: 120px; overflow-y: auto; }
  .log > div { display: flex; gap: var(--space-2); align-items: baseline; }
  .log .t { min-width: 40px; }
  .log .k { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
  .log q { color: var(--ink-muted); font-style: italic; quotes: "“" "”"; }
  ${groupCss}
`;
