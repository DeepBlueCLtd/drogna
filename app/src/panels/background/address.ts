/**
 * Background's half of the address (FR-003, ADR-0032). The shell hands down an
 * opaque remainder; this module is the only place that knows it means
 * `<explainer-id>/<step>`.
 *
 * Nothing here errors and nothing here blanks. A remainder naming an explainer that
 * no longer exists, or a step that was edited away, resolves to the course's first
 * step or the explainer's first step — the anchor is a convenience, never state
 * (SRD FR-15, spec Edge Cases, FR-003).
 */
import { stepCount, type Explainer } from './model.js';

export interface CoursePosition {
  readonly explainerId: string;
  /** 1-based, and always a step the explainer has. */
  readonly step: number;
}

export function positionFromRest(
  course: readonly Explainer[],
  rest: string | undefined,
): CoursePosition {
  const [explainerId, stepText] = (rest ?? '').split('/');
  const explainer = course.find((candidate) => candidate.id === explainerId) ?? course[0];
  const requested = Number(stepText);
  const valid =
    stepText !== undefined &&
    /^\d+$/.test(stepText) &&
    requested >= 1 &&
    requested <= stepCount(explainer) &&
    course.some((candidate) => candidate.id === explainerId);
  return { explainerId: explainer.id, step: valid ? requested : 1 };
}

export function restForPosition(position: CoursePosition): string {
  return `${position.explainerId}/${position.step}`;
}
