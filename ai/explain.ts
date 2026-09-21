/**
 * Builds the 1–2 neutral sentences for "Why am I seeing this?" from the scored signals.
 * Deterministic (no extra API call) so it works the same for the local engine and Jev.
 * Wording principle: name the TECHNIQUE, never opinion or intent. The overall level travels separately in `result.overall`.
 */
import { SIGNALS, type Signal } from "@contracts";
import { assess } from "./assess";

const MAX_SIGNALS = 3;

export function buildExplanation(signals: Signal[], isVideo = false, note?: string): string | undefined {
  const { drivers } = assess(signals);
  const top = drivers.slice(0, MAX_SIGNALS);
  if (!top.length) return undefined;

  const subject = isVideo ? "The spoken text and caption of this video show" : "The wording of this post shows";
  // One sentence often carries several techniques → quote it once, not once per technique.
  const quoted = new Set<string>();
  const parts = top.map((s) => {
    const raw = SIGNALS[s.key].label;
    const label = raw.charAt(0).toLowerCase() + raw.slice(1);
    if (!s.evidence || quoted.has(s.evidence)) return label;
    quoted.add(s.evidence);
    return `${label} (“${s.evidence}”)`;
  });
  const more = drivers.length > top.length ? ` and ${drivers.length - top.length} more` : "";
  return `${note ? note + " " : ""}${subject} patterns of ${joinList(parts)}${more}. This describes techniques in the text, not whether the message is true or what the author intends.`;
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
