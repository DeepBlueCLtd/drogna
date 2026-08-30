/**
 * Intro's half of the address (SRD-v2 FR-15, ADR-0032). The shell hands down an opaque
 * remainder; this module is the only place that knows it names a step of the walkthrough.
 *
 * The remainder is the **step's name**, not its number: `#/view/intro/asked` survives a
 * step being inserted before it, where `#/view/intro/6` quietly starts naming a different
 * part of the system. A pasted link is a claim about what it opens. A role id is accepted
 * too, so that a part of the drawing and an address mean the same thing.
 *
 * Nothing here errors and nothing here blanks. A remainder naming a step that no longer
 * exists resolves to the first — the anchor is a convenience, never state.
 */
import type { Beat } from './roles.js';

/** The 1-based step the remainder names, or the first step. */
export function stepFromRest(storyboard: readonly Beat[], rest: string | undefined): number {
  if (rest === undefined) return 1;
  const named = storyboard.findIndex((beat) => beat.id === rest);
  if (named !== -1) return named + 1;
  // A role id names the step that brings it in, so a part the reader clicked and an
  // address they pasted mean the same thing.
  const brought = storyboard.findIndex((beat) => beat.roles.includes(rest));
  return brought === -1 ? 1 : brought + 1;
}

/** The remainder to write for a step. Out-of-range steps write nothing. */
export function restForStep(storyboard: readonly Beat[], step: number): string | undefined {
  return storyboard[step - 1]?.id;
}

/** A step the storyboard has, for a step that may have come from anywhere. */
export function clampStep(storyboard: readonly Beat[], step: number): number {
  if (storyboard.length === 0) return 1;
  return Math.min(Math.max(step, 1), storyboard.length);
}
