/**
 * How a state is put into words and marks, rather than into colour alone.
 *
 * PR-08 expects these screenshots to survive being printed in greyscale in a blog post,
 * and a display whose only distinction is hue does not. Every state therefore carries a
 * word and a mark as well as a colour, and the word is the primary carrier.
 */
import type { Illumination } from "../liveness/types";

export interface Appearance {
  /** The word a viewer reads. Never a colour name. */
  readonly label: string;
  /** A mark that survives greyscale. */
  readonly glyph: string;
  readonly className: string;
}

export const ILLUMINATION: Readonly<Record<Illumination, Appearance>> = {
  lit: { label: "heard from", glyph: "●", className: "lit" },
  dark: { label: "not heard from", glyph: "○", className: "dark" },
  indeterminate: { label: "cannot tell", glyph: "◐", className: "indeterminate" },
  self: { label: "this page", glyph: "◎", className: "self" },
};

/**
 * The reported status, in words.
 *
 * The contract's spellings are given a sentence each so that degraded is not shown as
 * though it were healthy. A spelling this client does not recognise is shown as it
 * arrived rather than folded into "ok", because folding it would be the display deciding
 * something it has no business deciding.
 */
const STATUS_WORDS: Readonly<Record<string, string>> = {
  starting: "reports starting",
  ok: "reports ok",
  degraded: "reports degraded",
  stalled: "reports stalled",
  stopping: "reports stopping",
};

export function statusWords(status: string): string {
  return STATUS_WORDS[status] ?? `reports ${status}`;
}

/*
 * There was a `secondsWords` here, turning a host duration into "12 s ago" for the boxes
 * and the clock panel. Feature 012's FR-009 removed it and the three places that called
 * it. Host time may drive illumination and nothing else: a figure counting upwards makes
 * the rendered output differ from one frame to the next, so two captures of the same
 * state at a pinned rate could never be identical (SC-009), and the pin is the whole
 * point of FR-53. Whether a component is still believed is said by its illumination, and
 * whether the clock is still speaking is said by the four-state clock display. Neither
 * needs a number, and the number was the only thing making the page restless.
 */
