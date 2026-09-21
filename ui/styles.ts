export const OVERLAY_CSS = /* css */ `
  :host { all: initial; display: block; margin: 8px 0 4px; font: 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; color: #e7e9ea; }
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 10px;
         background: rgba(20, 23, 26, .92); border: 1px solid rgba(255,255,255,.08); }
  .pending { color: #8b98a5; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #1d9bf0; animation: pulse 1s infinite ease-in-out; }
  @keyframes pulse { 50% { opacity: .25; } }
  .clean { color: #00ba7c; }
  .error { color: #8b98a5; }
  .chip { padding: 2px 8px; border-radius: 999px; font-size: 12px; white-space: nowrap; }
  .chip b { font-weight: 600; margin-left: 2px; }
  .chip.low  { background: rgba(255, 212, 0, .14);  color: #ffd400; }
  .chip.mid  { background: rgba(255, 122, 0, .16);  color: #ff9a3c; }
  .chip.high { background: rgba(244, 33, 46, .18);  color: #ff5c68; }
  .more { color: #8b98a5; font-size: 12px; }
  .live { font-size: 10px; font-weight: 700; letter-spacing: .06em; color: #fff; background: #f4212e; padding: 1px 6px; border-radius: 4px; }
  .why { margin-left: auto; border: 0; background: none; color: #1d9bf0; font: inherit; cursor: pointer; padding: 0 2px; }
  .why:hover { text-decoration: underline; }
  .panel { margin-top: 6px; padding: 10px 12px; border-radius: 10px; background: rgba(20,23,26,.92); border: 1px solid rgba(255,255,255,.08); }
  .explain { margin: 0 0 8px; }
  .row { display: grid; grid-template-columns: 170px 1fr 40px; align-items: center; gap: 8px; margin: 4px 0; }
  .label { color: #e7e9ea; }
  .meter { height: 6px; border-radius: 3px; background: rgba(255,255,255,.08); overflow: hidden; }
  .fill { display: block; height: 100%; }
  .fill.low { background: #ffd400; } .fill.mid { background: #ff7a00; } .fill.high { background: #f4212e; }
  .val { text-align: right; color: #8b98a5; font-variant-numeric: tabular-nums; }
  .evidence { grid-column: 1 / -1; color: #8b98a5; font-style: italic; font-size: 12px; margin-top: -2px; }
  .note { margin: 8px 0 0; color: #71767b; font-size: 11px; }
`;
