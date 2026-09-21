/**
 * MAIN-world script — the only part of the scraper that runs inside the page's own JavaScript world.
 * Injected via extension/manifest.json (`content_scripts` entry with `"world": "MAIN"`, `run_at: document_start`)
 * and bundled as its own entry (dist/main-world.js). It must not use `chrome.*`.
 *
 * INTENTIONAL-UNTESTED: page-world script (fetch patch, React fiber, DOM attributes) has no DOM in node:test;
 * its behaviour is pinned by the Playwright integration probe scraper/research/playwright/run-feed-probe.mjs.
 *
 * What it does (both measured on the live sites, see scraper/RESEARCH.md):
 *  1. Wraps `window.fetch` and `XMLHttpRequest` and forwards the platform's own feed payloads to the content
 *     script (TikTok `/api/…/item_list/`, X `/i/api/graphql/…`). TikTok's SDK already wraps fetch itself and calls
 *     `window.fetch` at call time, so a wrapper installed here sees every later request.
 *  2. TikTok only: resolves the item object behind each feed article from React state (a `useRef` two fiber
 *     levels above the <article>, hook index ~10) and writes the item id onto the article as a DOM attribute —
 *     DOM attributes are visible in the isolated world, so the content script can map article → item without
 *     any id in the visible DOM (the For-You page renders none).
 *  3. Keeps the last records so the content script — which starts at document_idle, i.e. after the first feed
 *     payload (measured ~2 s after navigation start) — can ask for a replay once it listens.
 */
import { MAIN_WORLD_FLAG, TIKTOK_ID_ATTR, isReplayRequest, postBridge, type BridgeRecord, type BridgeSource } from "./bridge";
import { isTikTokItemRaw } from "./platforms/tiktok-item";
import { collectTweetResults } from "./platforms/x-graphql";

declare global {
  interface Window {
    __fedoMainWorld?: boolean;
  }
}

const TIKTOK_API = /\/api\/(?:[\w-]+\/)*item_list\/|\/api\/item\/detail\//;
const X_API = /\/i\/api\/graphql\//;
const TIKTOK_ARTICLE = 'article[data-e2e="feed-video"], [data-e2e="recommend-list-item-container"]';
const RECENT_MAX = 64;

(function install() {
  if (window.__fedoMainWorld) return;
  window.__fedoMainWorld = true;

  const host = location.hostname;
  // INTENTIONAL-SPECIAL-CASE: the two platform hosts ARE the product's scope (same rule as detectPlatform in scraper/index.ts).
  const platform = /(^|\.)tiktok\.com$/.test(host) ? "tiktok" : /(^|\.)(x|twitter)\.com$/.test(host) ? "x" : null;
  if (!platform) return;
  markPresence();

  const interesting = (url: string) => (platform === "tiktok" ? TIKTOK_API : X_API).test(url);

  const recordsOf = (json: unknown): BridgeRecord[] => {
    if (platform === "x") return collectTweetResults(json).map((tweet) => ({ kind: "x-tweet", tweet }));
    const j = json as { itemList?: unknown[]; itemInfo?: { itemStruct?: unknown } };
    const items = Array.isArray(j?.itemList) ? j.itemList : j?.itemInfo?.itemStruct ? [j.itemInfo.itemStruct] : [];
    return items.filter(isTikTokItemRaw).map((item) => ({ kind: "tiktok-item", item }));
  };

  const recent: BridgeRecord[] = [];
  const send = (records: BridgeRecord[], source: BridgeSource) => {
    if (!records.length) return;
    recent.push(...records);
    if (recent.length > RECENT_MAX) recent.splice(0, recent.length - RECENT_MAX);
    postBridge(records, source);
  };
  window.addEventListener("message", (ev) => {
    if (ev.source === window && isReplayRequest(ev.data) && recent.length) postBridge(recent.slice(), "replay");
  });

  const handleText = (text: string, source: BridgeSource) => {
    try {
      send(recordsOf(JSON.parse(text)), source);
    } catch {
      /* not JSON or not the shape we expect — ignore */
    }
  };

  // 1. fetch
  const origFetch = window.fetch;
  window.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const promise = origFetch.call(this, input, init);
    if (interesting(url)) {
      promise.then(
        (res) => {
          res.clone().text().then((t) => handleText(t, "fetch"), () => {});
        },
        () => {},
      );
    }
    return promise;
  } as typeof fetch;

  // 1b. XMLHttpRequest
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]) {
    const url = String(args[1] ?? "");
    if (interesting(url)) {
      this.addEventListener("load", () => {
        if (this.responseType === "" || this.responseType === "text") handleText(this.responseText, "xhr");
        else if (this.responseType === "json" && this.response) send(recordsOf(this.response), "xhr");
      });
    }
    return Reflect.apply(origOpen, this, args) as void;
  } as typeof XMLHttpRequest.prototype.open;

  // 2. TikTok: article → item via React state
  if (platform !== "tiktok") return;

  const annotate = () => {
    for (const el of document.querySelectorAll<HTMLElement>(TIKTOK_ARTICLE)) {
      if (el.hasAttribute(TIKTOK_ID_ATTR)) continue;
      const item = itemFromFiber(el);
      if (!item) continue;
      el.setAttribute(TIKTOK_ID_ATTR, item.id);
      send([{ kind: "tiktok-item", item }], "fiber");
    }
  };
  const start = () => {
    annotate();
    new MutationObserver(annotate).observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
})();

/**
 * Flag the content script reads to know the bridge is active. At `document_start` the <html> element exists;
 * a script injected even earlier (Playwright/CDP `addScriptToEvaluateOnNewDocument`) sees no documentElement yet.
 */
function markPresence() {
  const set = () => {
    document.documentElement.dataset[MAIN_WORLD_FLAG] = "1";
  };
  if (document.documentElement) return set();
  const observer = new MutationObserver(() => {
    if (!document.documentElement) return;
    observer.disconnect();
    set();
  });
  observer.observe(document, { childList: true });
}

interface Fiber {
  return?: Fiber;
  memoizedState?: Hook;
  memoizedProps?: Record<string, unknown>;
}
interface Hook {
  memoizedState?: { current?: { value?: unknown } | unknown };
  next?: Hook;
}

/** Walks up from the article's fiber and looks for the TikTok item in hook refs and props. Measured cost ≈ 0.1 ms. */
function itemFromFiber(el: Element): { id: string } | undefined {
  const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
  if (!key) return undefined;
  let fiber = (el as unknown as Record<string, Fiber | undefined>)[key];
  for (let depth = 0; fiber && depth < 6; depth++, fiber = fiber.return) {
    let hook = fiber.memoizedState;
    for (let i = 0; hook && i < 60; i++, hook = hook.next) {
      const ref = hook.memoizedState?.current as { value?: unknown } | undefined;
      const cand = ref && typeof ref === "object" && "value" in ref ? ref.value : ref;
      if (isFeedItem(cand)) return cand;
    }
    for (const v of Object.values(fiber.memoizedProps ?? {})) if (isFeedItem(v)) return v;
  }
  return undefined;
}

function isFeedItem(v: unknown): v is { id: string } {
  return isTikTokItemRaw(v) && !!v.video;
}
