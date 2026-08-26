/**
 * The join: the drawing on one side, what has been heard on the other.
 *
 * The layout supplies boxes. The reducer supplies evidence. This module puts them side
 * by side without either one being allowed to invent the other: a layout node with no
 * evidence is dark, and evidence with no layout node is shown anyway, in its own region,
 * because a display that hides something genuinely alive is worse than one that shows a
 * box it cannot place (FR-014).
 */
import { CLIENT_COMPONENT_ID, COMPONENTS, COMPONENTS_BY_ID } from "../layout/components";
import type { ComponentNode } from "../layout/components";
import { describeClock } from "../transport/clock";
import type { ClockState, ClockView } from "../transport/clock";

import type {
  ComponentEvidence,
  ConnectionState,
  Evidence,
  Identity,
  Illumination,
  LivenessState,
} from "./types";
import { ageSeconds, concurrentIdentities, illuminationFor } from "./window";
import type { Hearing } from "./window";

export interface ComponentView {
  readonly componentId: string;
  /** The layout node, where the layout has one. Null means heard but unplaced. */
  readonly node: ComponentNode | null;
  readonly illumination: Illumination;
  /** The heartbeat with the greatest simulation time: what is displayed. */
  readonly reported: Evidence | null;
  /** Host seconds since the most recent arrival, for a viewer judging the claim. */
  readonly sinceHeardSeconds: number | null;
  readonly windowSeconds: number | null;
  readonly windowDeclared: boolean;
  /** More than one process publishing this id, each still inside its own window. */
  readonly conflicting: readonly Identity[];
  /**
   * Whether this component reports a tick well ahead of the last one the client saw.
   *
   * One tick ahead is ordinary: the client's own sample stream lags. Further ahead means
   * the client is missing time samples, and saying so is better than quietly showing a
   * simulation time nothing else agrees with.
   */
  readonly aheadOfClock: boolean;
}

export interface ShellView {
  readonly nodes: readonly ComponentView[];
  readonly unmapped: readonly ComponentView[];
  readonly clock: ClockView;
  readonly connection: ConnectionState;
  readonly discarded: number;
  readonly lastDiscardReason: string | null;
  readonly litCount: number;
}

export interface ShellInputs {
  readonly liveness: LivenessState;
  readonly clockState: ClockState;
  readonly connection: ConnectionState;
  readonly now: number;
  readonly hearing: Hearing;
  readonly clockStaleAfterSeconds: number;
}

/** How far ahead of the last received tick a heartbeat may be before it is flagged. */
const TICK_TOLERANCE = 1;

function viewFor(
  componentId: string,
  node: ComponentNode | null,
  evidence: ComponentEvidence | undefined,
  now: number,
  hearing: Hearing,
  clockTick: number | null,
): ComponentView {
  const illumination =
    componentId === CLIENT_COMPONENT_ID ? "self" : illuminationFor(evidence, now, hearing);
  if (evidence === undefined) {
    return {
      componentId,
      node,
      illumination,
      reported: null,
      sinceHeardSeconds: null,
      windowSeconds: null,
      windowDeclared: false,
      conflicting: [],
      aheadOfClock: false,
    };
  }
  const conflicting = concurrentIdentities(evidence, now);
  const reportedTick = evidence.reported.tick;
  return {
    componentId,
    node,
    illumination,
    reported: evidence.reported,
    sinceHeardSeconds: ageSeconds(evidence.latest.receivedAt, now),
    windowSeconds: evidence.latest.windowSeconds,
    windowDeclared: evidence.latest.windowDeclared,
    conflicting: conflicting.length > 1 ? conflicting : [],
    aheadOfClock:
      reportedTick !== null && clockTick !== null && reportedTick > clockTick + TICK_TOLERANCE,
  };
}

/** The whole page's model, computed fresh each frame from state that is never mutated. */
export function describeShell(inputs: ShellInputs): ShellView {
  const { liveness, clockState, connection, now, hearing, clockStaleAfterSeconds } = inputs;
  const clockEvidence = liveness.components.get("clock");
  const clockLiveness: Illumination = illuminationFor(clockEvidence, now, hearing);
  const clock = describeClock(clockState, now, clockStaleAfterSeconds, clockLiveness);
  const clockTick = clock.sample === null ? null : clock.sample.tick;

  const nodes = COMPONENTS.map((node) =>
    viewFor(node.id, node, liveness.components.get(node.id), now, hearing, clockTick),
  );

  const unmapped: ComponentView[] = [];
  for (const [componentId, evidence] of liveness.components) {
    if (COMPONENTS_BY_ID.has(componentId)) {
      continue;
    }
    unmapped.push(viewFor(componentId, null, evidence, now, hearing, clockTick));
  }
  unmapped.sort((left, right) => left.componentId.localeCompare(right.componentId));

  return {
    nodes,
    unmapped,
    clock,
    connection,
    discarded: liveness.discarded,
    lastDiscardReason: liveness.lastDiscardReason,
    litCount: nodes.filter((view) => view.illumination === "lit").length,
  };
}
