/**
 * Platform captions (WebVTT) for the transcript channel.
 *
 * TikTok hands us a WebVTT URL inside the item JSON (`video.claInfo.captionInfos[].url`); the file is a few KB,
 * fetchable from the page context (200, CORS allowed; measured 5–300 ms). The cues are emitted in playback
 * order so the analysis can follow the speaker — one batch every `intervalMs` at most, because the glue
 * re-analyzes on every `onTranscript` call (extension/src/content.ts).
 */
export interface Cue {
  /** seconds */
  start: number;
  end: number;
  text: string;
}

const TIMESTAMP = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/;

export function parseVttTimestamp(s: string): number | null {
  const m = TIMESTAMP.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2]);
  const sec = Number(m[3]);
  const ms = Number((m[4] ?? "0").padEnd(3, "0"));
  return h * 3600 + min * 60 + sec + ms / 1000;
}

export function parseVtt(text: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = text.replace(/\r\n?/g, "\n").split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const idx = lines.findIndex((l) => l.includes("-->"));
    if (idx < 0) continue;
    const parts = lines[idx]!.split("-->");
    const start = parseVttTimestamp(parts[0] ?? "");
    // after "-->" come the end time and optional cue settings ("align:start"); trim first, then take the first token
    const end = parseVttTimestamp((parts[1] ?? "").trim().split(/\s+/)[0] ?? "");
    if (start === null || end === null) continue;
    const cueText = lines
      .slice(idx + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (cueText) cues.push({ start, end, text: cueText });
  }
  return cues;
}

export function cuesToText(cues: Cue[]): string {
  return cues.map((c) => c.text).join(" ").replace(/\s+/g, " ").trim();
}

/**
 * TikTok lists up to three URL variants per track (two CDN hosts + a tiktok.com play URL). Measured: single-URL
 * fetches failed for 5 of 7 tracks in one run ("Failed to fetch"), so the variants are tried in order.
 */
export async function fetchCaptions(urls: string | string[], signal?: AbortSignal): Promise<Cue[]> {
  const list = Array.isArray(urls) ? urls : [urls];
  let lastError: unknown = new Error("captions: no url");
  for (const url of list) {
    if (signal?.aborted) throw lastError;
    try {
      const res = await fetch(url, { credentials: "include", signal });
      if (!res.ok) throw new Error(`captions ${res.status}`);
      return parseVtt(await res.text());
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

export interface PacedChunk {
  text: string;
  /** seconds since video start (start of the first cue in the batch) */
  t: number;
}

/**
 * Emit cues as the video reaches them. Batches everything that became due since the last emission and emits at
 * most once per `intervalMs`. Returns a stop function. Loops (TikTok restarts the video) do not re-emit.
 */
export function paceCues(cues: Cue[], video: HTMLVideoElement, emit: (chunk: PacedChunk) => void, intervalMs = 750): () => void {
  const done = new Set<number>();
  let lastEmit = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    const now = video.currentTime;
    const due: Cue[] = [];
    cues.forEach((c, i) => {
      if (!done.has(i) && c.start <= now) {
        done.add(i);
        due.push(c);
      }
    });
    if (!due.length) return;
    lastEmit = Date.now();
    emit({ text: cuesToText(due), t: due[0]!.start });
  };

  const onTime = () => {
    if (timer) return;
    const wait = Math.max(0, intervalMs - (Date.now() - lastEmit));
    timer = setTimeout(() => {
      timer = undefined;
      flush();
    }, wait);
  };

  video.addEventListener("timeupdate", onTime);
  onTime();
  return () => {
    video.removeEventListener("timeupdate", onTime);
    if (timer) clearTimeout(timer);
  };
}
