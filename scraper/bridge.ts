/**
 * Bridge between the MAIN-world script (scraper/main-world.ts) and the content script (isolated world).
 *
 * Why it exists: a content script cannot see the page's `fetch`/XHR traffic or React state — it runs in
 * an isolated world (measured with a CDP isolated world on tiktok.com: `__reactFiber$*` keys 0, fetch native).
 * The MAIN-world script sees both and hands the raw platform records over via `window.postMessage`.
 * DOM attributes are shared between worlds, so ids can also travel as attributes (see TIKTOK_ID_ATTR).
 *
 * Security note: same-origin page code could post fake records on this channel. Records are therefore
 * treated as untrusted input — every mapper re-validates the shape before anything reaches the sink.
 */
export const BRIDGE_NS = "fedo-bridge/1";

/** `document.documentElement.dataset[MAIN_WORLD_FLAG] === "1"` once the MAIN-world script is installed. */
export const MAIN_WORLD_FLAG = "fedoMainWorld";

/** Written by the MAIN-world script on each TikTok feed article once the item was resolved from React state. */
export const TIKTOK_ID_ATTR = "data-fedo-tiktok-id";

export type BridgeRecord =
  | { kind: "tiktok-item"; item: unknown }
  | { kind: "x-tweet"; tweet: unknown };

export type BridgeSource = "fetch" | "xhr" | "fiber" | "replay";

export interface BridgeMessage {
  ns: typeof BRIDGE_NS;
  source: BridgeSource;
  records: BridgeRecord[];
}

/** Content script → MAIN world: "send me what you saw before I was installed" (content scripts start at document_idle). */
export interface BridgeReplayRequest {
  ns: typeof BRIDGE_NS;
  request: "replay";
}

export function isBridgeMessage(data: unknown): data is BridgeMessage {
  if (!data || typeof data !== "object") return false;
  const m = data as Partial<BridgeMessage>;
  return (
    m.ns === BRIDGE_NS &&
    typeof m.source === "string" &&
    Array.isArray(m.records) &&
    m.records.every((r) => !!r && typeof r === "object" && typeof (r as BridgeRecord).kind === "string")
  );
}

export function isReplayRequest(data: unknown): data is BridgeReplayRequest {
  if (!data || typeof data !== "object") return false;
  const m = data as Partial<BridgeReplayRequest>;
  return m.ns === BRIDGE_NS && m.request === "replay";
}

export function requestReplay(): void {
  const msg: BridgeReplayRequest = { ns: BRIDGE_NS, request: "replay" };
  window.postMessage(msg, location.origin);
}

/** Content-script side: receive records from the MAIN world (and ask for the ones sent earlier). Returns a stop function. */
export function listenBridge(onMessage: (msg: BridgeMessage) => void): () => void {
  const handler = (ev: MessageEvent) => {
    if (ev.source !== window || ev.origin !== location.origin) return;
    if (!isBridgeMessage(ev.data)) return;
    onMessage(ev.data);
  };
  window.addEventListener("message", handler);
  requestReplay();
  return () => window.removeEventListener("message", handler);
}

/** MAIN-world side: hand records to the content script. */
export function postBridge(records: BridgeRecord[], source: BridgeSource): void {
  if (!records.length) return;
  const msg: BridgeMessage = { ns: BRIDGE_NS, source, records };
  window.postMessage(msg, location.origin);
}

export function mainWorldPresent(): boolean {
  return document.documentElement.dataset[MAIN_WORLD_FLAG] === "1";
}
