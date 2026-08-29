/**
 * The content model every explainer is authored against (feature 111).
 *
 * These are local view models and nothing else. Background declares no shape that
 * crosses the seam, so it generates nothing — and must not therefore hand-write a
 * boundary shape here (Constitution III). Nothing in this file describes a message,
 * a response body or a configuration document.
 *
 * Content is data with drawings hung off it, which is what lets the value-panel
 * invariant (FR-008) and SC-007's test read the course rather than trust it.
 */
import type { ReactNode } from 'react';

export type ExplainerForm = 'slides' | 'interactive';

/**
 * The three axes of the closing Consequences panel, in the order every explainer
 * shows them (FR-008). The order lives here so that "same position, same order" is
 * a property of the machinery rather than of eleven separate authoring decisions.
 */
export const VALUE_AXES = [
  'through-life cost',
  'interoperability',
  'what you do not have to build',
] as const;

export type ValueAxisId = (typeof VALUE_AXES)[number];

/**
 * An axis is filled or explicitly omitted with its reason. There is no third state,
 * so an axis cannot be quietly padded or quietly dropped (FR-008).
 *
 * `qualitative` marks a claim as argued rather than measured (FR-009). Through-life
 * cost is where that matters; the field exists on any axis because the rule is about
 * the claim, not the axis.
 */
export type AxisContent =
  | { readonly kind: 'filled'; readonly body: string; readonly qualitative?: boolean }
  | { readonly kind: 'omitted'; readonly reason: string };

export type ValueContent = Readonly<Record<ValueAxisId, AxisContent>>;

/**
 * What a step's drawing is handed. `poke` is the free-play selection within this
 * step: it enriches what is drawn and never changes the address (FR-018), and it is
 * discarded when the spine moves, so arriving at a step by advancing and arriving at
 * it by deep link show the same thing.
 */
export interface FigureContext {
  readonly poke: string | undefined;
  readonly onPoke: (value: string | undefined) => void;
}

export interface StepFigure {
  /**
   * The width in CSS pixels the drawing needs to stay legible. Below it the drawing
   * is replaced by a statement of the width it wants (FR-024) — never scaled past
   * legibility, and never rendered having silently dropped its labels.
   */
  readonly minWidth: number;
  readonly draw: (context: FigureContext) => ReactNode;
  readonly caption?: string;
  /** Describes the drawing for a reader who is not looking at it. */
  readonly label: string;
}

export interface Step {
  readonly title: string;
  /** One paragraph per entry. Short declarative sentences (FR-026). */
  readonly prose: readonly string[];
  /** An aside that is not part of the argument — the beat, the hazard, the caveat. */
  readonly note?: string;
  /** A named link out to the live view where a claim is about drogna (FR-005). */
  readonly liveView?: { readonly view: string; readonly label: string };
  readonly figure?: StepFigure;
  /** What the viewer may poke here, stated so free play is discoverable in prose too. */
  readonly play?: string;
}

export interface Explainer {
  readonly id: string;
  readonly title: string;
  readonly form: ExplainerForm;
  /** The one idea, for the rail and for the reader deciding whether to start. */
  readonly idea: string;
  /** The content steps. The Consequences panel is appended as the last step. */
  readonly steps: readonly Step[];
  /**
   * FR-020: no explainer omits it. Optional in the type for exactly one reason —
   * so that a fixture explainer can omit it and SC-007's test can be watched
   * catching the omission rather than trusted to.
   */
  readonly value?: ValueContent;
}

/** The number the rail shows, and the highest step an anchor may name. */
export function stepCount(explainer: Explainer): number {
  return explainer.steps.length + (explainer.value ? 1 : 0);
}
