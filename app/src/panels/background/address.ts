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

/**
 * The position one step either side of `position`, or undefined at the two ends of the
 * course.
 *
 * The unit here is the course, not the explainer. Stepping past an explainer's last
 * step — its Consequences panel — opens the next explainer at its first step, and
 * stepping back from a first step lands on the previous explainer's last, so the
 * arrow keys are one walk through all sixty-nine steps rather than eleven separate
 * ones (FR-014).
 *
 * The spine's own buttons stay bounded by the explainer they belong to. They are
 * labelled "step N of M" and sit beside that count, and a control that silently
 * leaves the thing it counts is a different control; the rail is how a pointer moves
 * between explainers, and the arrow keys are how a keyboard does.
 */
export function advance(
  course: readonly Explainer[],
  position: CoursePosition,
  delta: 1 | -1,
): CoursePosition | undefined {
  const index = course.findIndex((candidate) => candidate.id === position.explainerId);
  if (index < 0) return undefined;
  const step = position.step + delta;
  if (step >= 1 && step <= stepCount(course[index])) {
    return { explainerId: position.explainerId, step };
  }
  const neighbour = course[index + delta];
  if (neighbour === undefined) return undefined;
  return { explainerId: neighbour.id, step: delta === 1 ? 1 : stepCount(neighbour) };
}
