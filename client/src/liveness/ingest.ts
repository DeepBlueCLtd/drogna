/**
 * The gate every inbound heartbeat passes through, and the only way into the reducer.
 *
 * A message is validated against the contract before anything reads a field from it. A
 * message that fails lights nothing and is counted (FR-013): a discard that leaves no
 * mark is indistinguishable, from the page, from a component that never spoke.
 */
import { rejectionReason, validateHeartbeat } from "../contracts/schemas";

import type { Evidence } from "./types";

/** How long a heartbeat is believed when its sender does not say. */
export interface LivenessTolerances {
  readonly defaultWindowSeconds: number;
  readonly windowMultiplier: number;
}

export type Interpretation =
  | { readonly accepted: true; readonly evidence: Evidence }
  | { readonly accepted: false; readonly reason: string };

function optionalNumber(message: Record<string, unknown>, key: string): number | undefined {
  const value = message[key];
  return typeof value === "number" ? value : undefined;
}

function nullableString(message: Record<string, unknown>, key: string): string | null {
  const value = message[key];
  return typeof value === "string" ? value : null;
}

/**
 * How long this heartbeat is evidence of life.
 *
 * The sender is asked first, because only the sender knows its own cadence, and the
 * client holds no table of expected intervals — a table would be a list of what ought to
 * exist, which is what Constitution VII forbids. What the client holds instead is one
 * scalar tolerance for senders that declare nothing, which can lengthen or shorten
 * belief in something already heard and can never manufacture the hearing.
 */
export function windowFor(
  message: Record<string, unknown>,
  tolerances: LivenessTolerances,
): { seconds: number; declared: boolean } {
  const declaredWindow = optionalNumber(message, "liveness_window_seconds");
  if (declaredWindow !== undefined) {
    return { seconds: declaredWindow, declared: true };
  }
  const declaredInterval = optionalNumber(message, "heartbeat_interval_seconds");
  if (declaredInterval !== undefined) {
    return { seconds: declaredInterval * tolerances.windowMultiplier, declared: true };
  }
  return { seconds: tolerances.defaultWindowSeconds, declared: false };
}

/** Validate one raw message and adapt it, or say why it was refused. */
export function interpret(
  raw: unknown,
  receivedAt: number,
  tolerances: LivenessTolerances,
): Interpretation {
  if (!validateHeartbeat(raw)) {
    return { accepted: false, reason: rejectionReason(validateHeartbeat) };
  }
  const message = raw as Record<string, unknown>;
  const window = windowFor(message, tolerances);
  const tick = message["tick"];
  return {
    accepted: true,
    evidence: {
      componentId: message["component"] as string,
      status: message["status"] as string,
      simTime: message["sim_time"] as string,
      tick: typeof tick === "number" ? tick : null,
      runId: nullableString(message, "run_id"),
      configDigest: nullableString(message, "config_digest"),
      detail: (message["detail"] as string | undefined) ?? "",
      windowSeconds: window.seconds,
      windowDeclared: window.declared,
      receivedAt,
    },
  };
}

/** Decode a broker payload. A payload that is not JSON is refused like any other. */
export function decode(payload: string): { value: unknown } | { reason: string } {
  try {
    return { value: JSON.parse(payload) as unknown };
  } catch (error) {
    return { reason: error instanceof Error ? error.message : "payload is not JSON" };
  }
}
