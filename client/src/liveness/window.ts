/**
 * The liveness window: whether what was heard is still evidence.
 *
 * Real time, per ADR-0006. The simulation time a heartbeat carries is payload, not
 * schedule: were the window measured in simulation time, a clock rate of zero would
 * expire every window at once and grey out a running system during exactly the capture
 * FR-53 pins the rate for. A rate of zero stops simulated time and stops nothing else.
 *
 * Three states, and the third is the one that matters. Lit means a heartbeat arrived
 * inside its window. Dark means nothing has been heard from a component, or what was
 * heard has expired while the client was listening. Indeterminate means the evidence
 * expired while the client could not listen, which is a different claim: a client that
 * has gone deaf cannot honestly report a death. Indeterminate is not a shade of lit, and
 * nothing here can produce lit without evidence.
 */
import { elapsedSeconds } from "../time/host";

import type { ComponentEvidence, Identity, Illumination } from "./types";

/** How the client's own hearing bears on what it may claim. */
export interface Hearing {
  readonly connected: boolean;
  readonly disconnectedIsIndeterminate: boolean;
}

/** Seconds since this evidence arrived, in host time. */
export function ageSeconds(receivedAt: number, now: number): number {
  return elapsedSeconds(receivedAt, now);
}

/** Whether one arrival is still inside its declared window. */
export function withinWindow(receivedAt: number, windowSeconds: number, now: number): boolean {
  return ageSeconds(receivedAt, now) <= windowSeconds;
}

/** How a component is drawn, given what has been heard from it and when. */
export function illuminationFor(
  evidence: ComponentEvidence | undefined,
  now: number,
  hearing: Hearing,
): Illumination {
  if (evidence === undefined) {
    return "dark";
  }
  if (withinWindow(evidence.latest.receivedAt, evidence.latest.windowSeconds, now)) {
    return "lit";
  }
  if (!hearing.connected && hearing.disconnectedIsIndeterminate) {
    return "indeterminate";
  }
  return "dark";
}

/** The identities still inside their own windows: more than one is a conflict. */
export function concurrentIdentities(
  evidence: ComponentEvidence,
  now: number,
): readonly Identity[] {
  return evidence.identities.filter((identity) =>
    withinWindow(identity.lastReceivedAt, identity.windowSeconds, now),
  );
}
