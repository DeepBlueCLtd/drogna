/**
 * The liveness reducer: heartbeats in, per-component evidence out.
 *
 * This is the design centre of the client and the place Constitution VII is either kept
 * or lost. Its signature admits two things — evidence adapted from a validated heartbeat,
 * and a count of what was refused — and nothing else. There is no configuration
 * parameter, no list of components, no flag and no seeded state, so there is no way to
 * assert that a component exists other than by a message from it having arrived. The
 * unit tests hold that shut: a configuration document cannot be passed to these
 * functions at all, which is a stronger guarantee than passing one and asserting it is
 * ignored.
 *
 * The reducer is pure. State goes in, state comes out, and the caller decides when to
 * draw. That is what lets every received heartbeat be folded in while rendering is
 * throttled to the frame budget: a high clock rate costs frames, never truth.
 */
import type { ComponentEvidence, Evidence, Identity, LivenessState } from "./types";

export const emptyLiveness: LivenessState = {
  components: new Map(),
  discarded: 0,
  lastDiscardReason: null,
};

/**
 * Which of two heartbeats is later in simulation time.
 *
 * Ticks are quantised and strictly increasing within a run (ADR-0009), so they decide it
 * where both messages carry one. Otherwise the simulation times are compared as text,
 * which is well defined because the contract fixes them as ISO-8601 UTC of uniform
 * precision. Arrival order decides nothing here: a message that overtook another must
 * not make the display go backwards.
 */
export function laterInSimulation(left: Evidence, right: Evidence): Evidence {
  if (left.tick !== null && right.tick !== null) {
    return right.tick >= left.tick ? right : left;
  }
  return right.simTime >= left.simTime ? right : left;
}

function identityKey(evidence: Evidence): string {
  return `${evidence.runId ?? ""}|${evidence.configDigest ?? ""}`;
}

function withIdentity(existing: readonly Identity[], evidence: Evidence): readonly Identity[] {
  const key = identityKey(evidence);
  const identity: Identity = {
    key,
    runId: evidence.runId,
    configDigest: evidence.configDigest,
    lastReceivedAt: evidence.receivedAt,
    windowSeconds: evidence.windowSeconds,
  };
  const others = existing.filter((seen) => seen.key !== key);
  return [...others, identity];
}

/** Fold one heartbeat into the state. The only way a component becomes known. */
export function receive(state: LivenessState, evidence: Evidence): LivenessState {
  const components = new Map(state.components);
  const known = components.get(evidence.componentId);
  const merged: ComponentEvidence =
    known === undefined
      ? {
          latest: evidence,
          reported: evidence,
          heard: 1,
          identities: withIdentity([], evidence),
        }
      : {
          latest: evidence.receivedAt >= known.latest.receivedAt ? evidence : known.latest,
          reported: laterInSimulation(known.reported, evidence),
          heard: known.heard + 1,
          identities: withIdentity(known.identities, evidence),
        };
  components.set(evidence.componentId, merged);
  return { ...state, components };
}

/**
 * Record a message that did not pass validation.
 *
 * It lights nothing, and it leaves a mark. A discarded message means either a component
 * is publishing something the contract does not describe or the contract is wrong, and
 * both of those are worth a viewer's attention.
 */
export function discard(state: LivenessState, reason: string): LivenessState {
  return { ...state, discarded: state.discarded + 1, lastDiscardReason: reason };
}
