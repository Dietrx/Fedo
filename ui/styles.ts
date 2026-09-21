export const OVERLAY_CSS = /* css */ `
  :host { all: initial; display: block; margin: 8px 0 4px; font: 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; color: #e7e9ea; }
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 10px;
         background: rgba(20, 23, 26, .92); border: 1px solid rgba(255,255,255,.08); }
  .pending { color: #8b98a5; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #1d9bf0; animation: pulse 1s infinite ease-in-out; }
  @keyframes pulse { 50% { opacity: .25; } }
  .clean { color: #00ba7c; }
  .error, .muted { color: #8b98a5; }
  .tag { font-size: 10px; letter-spacing: .04em; text-transform: uppercase; color: #8b98a5; border: 1px solid rgba(255,255,255,.14); border-radius: 4px; padding: 0 5px; }
  .badge { font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 4px; border: 1px solid currentColor; white-space: nowrap; }
  .badge.low  { color: #ffd400; } .badge.mid { color: #f28a1e; } .badge.high { color: #f4384a; }
  .actions { margin-left: auto; display: flex; gap: 10px; }
  .chip { padding: 2px 8px; border-radius: 999px; font-size: 12px; white-space: nowrap; }
  .chip b { font-weight: 600; margin-left: 2px; }
  .chip.low  { background: rgba(255, 212, 0, .14);  color: #ffd400; }
  .chip.mid  { background: rgba(242, 138, 30, .16); color: #f28a1e; }
  .chip.high { background: rgba(244, 56, 74, .18);  color: #f4384a; }
  .more { color: #8b98a5; font-size: 12px; }
  .live { font-size: 10px; font-weight: 700; letter-spacing: .06em; color: #fff; background: #f4212e; padding: 1px 6px; border-radius: 4px; }
  .why { border: 0; background: none; color: #1d9bf0; font: inherit; cursor: pointer; padding: 0 2px; }
  .why:hover { text-decoration: underline; }
  .panel { margin-top: 6px; padding: 10px 12px; border-radius: 10px; background: rgba(20,23,26,.92); border: 1px solid rgba(255,255,255,.08); }
  .explain { margin: 0 0 8px; }
  .row { display: grid; grid-template-columns: 170px 1fr 40px; align-items: center; gap: 8px; margin: 4px 0; }
  .label { color: #e7e9ea; }
  .meter { height: 6px; border-radius: 3px; background: rgba(255,255,255,.08); overflow: hidden; }
  .fill { display: block; height: 100%; }
  .fill.low { background: #ffd400; } .fill.mid { background: #f28a1e; } .fill.high { background: #f4384a; }
  .val { text-align: right; color: #8b98a5; font-variant-numeric: tabular-nums; }
  .evidence { grid-column: 1 / -1; color: #8b98a5; font-style: italic; font-size: 12px; margin-top: -2px; }
  .progress { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; align-items: center; margin-top: 4px; padding: 5px 8px; border-radius: 8px;
              background: rgba(20,23,26,.92); border: 1px solid rgba(255,255,255,.08); font-size: 11px; color: #8b98a5; font-variant-numeric: tabular-nums; }
  .progress.muted { display: block; }
  .ptrack { grid-column: 1 / -1; height: 3px; border-radius: 2px; background: rgba(255,255,255,.1); overflow: hidden; }
  .pfill { display: block; height: 100%; background: #1d9bf0; transition: width .4s; }
  .peta { text-align: right; } .peta b { color: #00ba7c; font-weight: 600; }
  .tlwrap { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,.08); }
  .tlh { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #71767b; margin-bottom: 4px; }
  .tl { display: flex; align-items: center; gap: 8px; margin: 3px 0; }
  .tt { font-variant-numeric: tabular-nums; color: #8b98a5; min-width: 34px; font-size: 12px; }
  .tev { color: #8b98a5; font-style: italic; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .research { margin: 8px 0 0; color: #8b98a5; font-size: 11px; }
  .note { margin: 8px 0 0; color: #71767b; font-size: 11px; }
`;
