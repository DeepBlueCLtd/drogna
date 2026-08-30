/**
 * Feasible sets (FR-85): what you can actually do, and what it costs you to do it.
 *
 * The output is deliberately **not** a schedule. It is the top two or three *maximal*
 * feasible sets, each with what it gives up — because *you can do A and B, or B and C,
 * but never A and C* is the sentence an operator needs, and one set alone hides exactly
 * that. A triage aid, not an optimiser: it is the honest claim and the defensible one.
 *
 * Two mechanisms carry the weight:
 *
 * **Confidence weighting, not boolean intersection.** A requirement that fails does not
 * simply close a window; it contributes its source's confidence weight, and the window
 * closes when the failing weight reaches the configured veto weight. That is what makes
 * "a low-confidence source may not veto a task on its own" a property of the arithmetic
 * rather than a promise in prose: the veto weight sits above the medium weight and at or
 * below the high one, so one high-confidence source closes a window and one low-confidence
 * source never does. `Off` is not a low weight — the source leaves the computation.
 *
 * **Per-task thresholds.** A task carries its own threshold against each continuous lane
 * it depends on, and the reader drags it. Two tasks may disagree about the same sea state
 * and both be right, which is why the threshold is not a property of the lane.
 *
 * The scheduling inside a candidate set is a greedy earliest-fit by deadline. It is a
 * heuristic and this file says so: the tab claims to say what you are giving up, not to
 * solve the scheduling problem, and a heuristic that is named is worth more than an
 * optimiser that is implied.
 */
import type { ConfigShell } from '../../../generated/types.js';
import type { Confidence, Lane } from './lanes.js';

export type TaskSpec = ConfigShell['consumers']['feasibility']['tasks'][number];

export interface TaskThresholds {
  /** Threshold per lane, as the reader has dragged them, keyed by lane id. */
  readonly [laneId: string]: number;
}

export interface Window {
  readonly fromStep: number;
  /** Exclusive. */
  readonly toStep: number;
  /** 1 where nothing objected at all, lower where something did without vetoing. */
  readonly margin: number;
}

export interface TaskFeasibility {
  readonly task: TaskSpec;
  readonly steps: number;
  readonly windows: readonly Window[];
  /** Why there is no window, naming the source that closed it. */
  readonly blockedBy?: string;
}

export interface FeasibleSet {
  readonly taskIds: readonly string[];
  /** Start step of each task, in the order they would be done. */
  readonly schedule: readonly { readonly taskId: string; readonly fromStep: number; readonly toStep: number }[];
  /** The tasks this set gives up. */
  readonly givesUp: readonly string[];
  readonly margin: number;
}

export interface FeasibilityRequest {
  readonly tasks: readonly TaskSpec[];
  readonly lanes: readonly Lane[];
  readonly confidence: Readonly<Record<string, Confidence>>;
  readonly thresholds: Readonly<Record<string, TaskThresholds>>;
  readonly weights: ConfigShell['consumers']['feasibility']['confidence_weights'];
  readonly vetoWeight: number;
  readonly stepMinutes: number;
  readonly steps: number;
  readonly setCount: number;
  readonly locked: ReadonlySet<string>;
}

function weightFor(
  laneId: string,
  request: FeasibilityRequest,
): number {
  const confidence = request.confidence[laneId] ?? 'high';
  if (confidence === 'off') return 0;
  return request.weights[confidence];
}

/**
 * How much objection a task faces at one step, and from which source the most of it came.
 * A lane switched off contributes nothing at all — that is what Off means.
 */
function objectionAt(
  task: TaskSpec,
  step: number,
  request: FeasibilityRequest,
): { weight: number; loudest?: string } {
  let total = 0;
  let loudest: string | undefined;
  let loudestWeight = 0;
  for (const requirement of task.requirements) {
    const lane = request.lanes.find((entry) => entry.id === requirement.lane);
    if (!lane) continue;
    const weight = weightFor(lane.id, request);
    if (weight === 0) continue;
    const value = lane.samples[step];
    if (!Number.isFinite(value)) {
      // A source that has said nothing cannot object, and cannot reassure either. It is
      // treated as absent rather than as satisfied, which is why it carries its weight.
      total += weight;
      if (weight > loudestWeight) {
        loudestWeight = weight;
        loudest = `${lane.label} (nothing served for this step)`;
      }
      continue;
    }
    const threshold = request.thresholds[task.id]?.[lane.id] ?? requirement.threshold ?? 0;
    const met =
      requirement.sense === 'present'
        ? value >= 0.5
        : requirement.sense === 'absent'
          ? value < 0.5
          : requirement.sense === 'at-least'
            ? value >= threshold
            : value <= threshold;
    if (met) continue;
    total += weight;
    if (weight > loudestWeight) {
      loudestWeight = weight;
      loudest = lane.label;
    }
  }
  return { weight: total, loudest };
}

/** The windows a task could be done in, each at least as long as the task. */
export function feasibilityOf(task: TaskSpec, request: FeasibilityRequest): TaskFeasibility {
  const need = Math.max(1, Math.ceil(task.duration_minutes / request.stepMinutes));
  const windows: Window[] = [];
  let runStart: number | undefined;
  let worst = 0;
  let blocked: string | undefined;
  let blockedWeight = 0;

  const close = (end: number) => {
    if (runStart === undefined) return;
    if (end - runStart >= need) {
      windows.push({ fromStep: runStart, toStep: end, margin: 1 - worst });
    }
    runStart = undefined;
    worst = 0;
  };

  for (let step = 0; step < request.steps; step++) {
    const objection = objectionAt(task, step, request);
    if (objection.weight >= request.vetoWeight) {
      if (objection.weight > blockedWeight && objection.loudest) {
        blockedWeight = objection.weight;
        blocked = objection.loudest;
      }
      close(step);
      continue;
    }
    if (runStart === undefined) {
      runStart = step;
      worst = 0;
    }
    if (objection.weight > worst) worst = objection.weight;
  }
  close(request.steps);

  return {
    task,
    steps: need,
    windows,
    blockedBy: windows.length === 0 ? blocked : undefined,
  };
}

/**
 * Can this set of tasks be done, one at a time, within their windows? Greedy earliest-fit
 * in order of the deadline each task faces — the last step it could still start at.
 */
function schedule(
  chosen: readonly TaskFeasibility[],
  stepCount: number,
): FeasibleSet['schedule'] | undefined {
  const ordered = [...chosen].sort((a, b) => deadline(a, stepCount) - deadline(b, stepCount));
  const placed: { taskId: string; fromStep: number; toStep: number }[] = [];
  let cursor = 0;
  for (const entry of ordered) {
    let start: number | undefined;
    for (const window of entry.windows) {
      const earliest = Math.max(cursor, window.fromStep);
      if (earliest + entry.steps <= window.toStep) {
        start = earliest;
        break;
      }
    }
    if (start === undefined) return undefined;
    placed.push({ taskId: entry.task.id, fromStep: start, toStep: start + entry.steps });
    cursor = start + entry.steps;
  }
  return placed;
}

function deadline(entry: TaskFeasibility, stepCount: number): number {
  let latest = -1;
  for (const window of entry.windows) latest = Math.max(latest, window.toStep - entry.steps);
  return latest < 0 ? stepCount : latest;
}

/**
 * The maximal feasible sets, best first.
 *
 * Maximal means no further task could be added to it. Enumeration is exhaustive over the
 * configured task list, which is small by design: the honest reason the list is fixed
 * configuration rather than composable in the UI is that the trade is what is being
 * demonstrated, and a reader composing forty tasks would be demonstrating a solver.
 */
export function feasibleSets(request: FeasibilityRequest): {
  readonly sets: readonly FeasibleSet[];
  readonly perTask: readonly TaskFeasibility[];
} {
  const perTask = request.tasks.map((task) => feasibilityOf(task, request));
  const schedulable = perTask.filter((entry) => entry.windows.length > 0);
  const candidates: FeasibleSet[] = [];

  const total = 1 << schedulable.length;
  for (let mask = 0; mask < total; mask++) {
    const chosen = schedulable.filter((_, index) => (mask & (1 << index)) !== 0);
    if (chosen.length === 0) continue;
    // A locked task is mandatory: sets without it are not answers to the question the
    // reader asked (FR-85).
    if ([...request.locked].some((id) => !chosen.some((entry) => entry.task.id === id))) continue;
    const placed = schedule(chosen, request.steps);
    if (!placed) continue;
    candidates.push({
      taskIds: chosen.map((entry) => entry.task.id),
      schedule: placed,
      givesUp: request.tasks
        .filter((task) => !chosen.some((entry) => entry.task.id === task.id))
        .map((task) => task.id),
      margin:
        chosen.reduce((sum, entry) => sum + (entry.windows[0]?.margin ?? 0), 0) / chosen.length,
    });
  }

  const maximal = candidates.filter(
    (set) =>
      !candidates.some(
        (other) =>
          other !== set &&
          other.taskIds.length > set.taskIds.length &&
          set.taskIds.every((id) => other.taskIds.includes(id)),
      ),
  );
  maximal.sort((a, b) => b.taskIds.length - a.taskIds.length || b.margin - a.margin);
  return { sets: maximal.slice(0, request.setCount), perTask };
}
