/**
 * Builds the 1–2 neutral sentences for "Why am I seeing this?" from the scored signals.
 * Deterministic (no extra API call) so it works the same for the local engine and Jev.
 * Wording principle: name the TECHNIQUE and how heavily it is used, never opinion or intent.
 */
import { SIGNALS, type Signal } from "@contracts";
import { assess } from "./assess";

const MAX_SIGNALS = 3;

export function buildExplanation(signals: Signal[], isVideo = false): string | undefined {
  const { level, drivers } = assess(signals);
  const top = drivers.slice(0, MAX_SIGNALS);
  if (!top.length) return undefined;

  const subject = isVideo ? "the spoken text and caption of this video show" : "the wording of this post shows";
  const parts = top.map((s) => {
    const raw = SIGNALS[s.key].label;
    const label = raw.charAt(0).toLowerCase() + raw.slice(1);
    return s.evidence ? `${label} (“${s.evidence}”)` : label;
  });
  const more = drivers.length > top.length ? ` and ${drivers.length - top.length} more` : "";
  return `Persuasion intensity ${level}: ${subject} patterns of ${joinList(parts)}${more}. This describes techniques in the text, not whether the message is true or what the author intends.`;
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
