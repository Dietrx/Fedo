/**
 * Shared helper: watch a dynamically loading feed and call `onElement` once per new matching element.
 */
export function observeFeed(selector: string, onElement: (el: HTMLElement) => void): () => void {
  const seen = new WeakSet<Element>();

  const scan = () => {
    document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      onElement(el);
    });
  };

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan();
    });
  });

  scan();
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

/**
 * Like `observeFeed`, but for virtual lists that insert empty placeholders first and fill them later (TikTok):
 * an element is reported once it is `isReady`, and `onLeave` fires when a reported element leaves the DOM.
 * `retryMs` re-scans pending elements even without a further DOM mutation.
 */
export function trackFeed(
  selector: string,
  hooks: { isReady?: (el: HTMLElement) => boolean; onReady: (el: HTMLElement) => void; onLeave?: (el: HTMLElement) => void; retryMs?: number },
): () => void {
  const state = new Map<HTMLElement, "pending" | "ready">();
  let scheduled = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const scan = () => {
    const present = new Set(document.querySelectorAll<HTMLElement>(selector));
    let pending = false;
    for (const el of present) {
      if (state.get(el) === "ready") continue;
      if (hooks.isReady && !hooks.isReady(el)) {
        state.set(el, "pending");
        pending = true;
        continue;
      }
      state.set(el, "ready");
      hooks.onReady(el);
    }
    for (const [el, s] of state) {
      if (present.has(el)) continue;
      state.delete(el);
      if (s === "ready") hooks.onLeave?.(el);
    }
    if (pending && hooks.retryMs && !retry) {
      retry = setTimeout(() => {
        retry = undefined;
        scan();
      }, hooks.retryMs);
    }
  };

  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan();
    });
  });

  scan();
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  return () => {
    observer.disconnect();
    if (retry) clearTimeout(retry);
  };
}

export function uniq(xs: string[]): string[] {
  return [...new Set(xs)];
}

export function extractHashtags(text: string): string[] {
  return [...text.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1]!.toLowerCase());
}

/** Cheap stable hash for items without a platform id. */
export function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export const debug = (...args: unknown[]) => console.debug("%c[fedo:scraper]", "color:#0a7", ...args);
