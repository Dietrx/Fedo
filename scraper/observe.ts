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
