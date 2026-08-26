/**
 * Values fed to the functions under test.
 *
 * FR-023 is explicit about what this is and is not: constructing a heartbeat as the
 * input to a pure function is testing a function, not driving a display. No path in the
 * built client can reach these values, and no test in this directory renders a page from
 * them and calls the result a running system. The distinction matters enough that the
 * spec spends a sentence on it, so this file does too.
 */
export interface HeartbeatFields {
  component?: string;
  sim_time?: string;
  tick?: number | null;
  status?: string;
  run_id?: string | null;
  config_digest?: string | null;
  heartbeat_interval_seconds?: number;
  liveness_window_seconds?: number;
  detail?: string;
}

const DIGEST = `sha256:${"a".repeat(64)}`;

/** A heartbeat of the shape feature 001 publishes, with overrides. */
export function heartbeat(fields: HeartbeatFields = {}): Record<string, unknown> {
  const message: Record<string, unknown> = {
    component: "clock",
    sim_time: "2026-08-26T00:00:00.000000Z",
    tick: 0,
    status: "ok",
    run_id: "run-0001",
    config_digest: DIGEST,
    ...fields,
  };
  return message;
}

/** A time sample of the shape the clock publishes on ctl/clock. */
export function clockSample(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    run_id: "run-0001",
    tick: 12,
    sim_time: "2026-08-26T00:00:12.000000Z",
    mode: "accelerated",
    rate: 10,
    ...fields,
  };
}

export const TOLERANCES = { defaultWindowSeconds: 15, windowMultiplier: 3 };

export const HEARING_CONNECTED = { connected: true, disconnectedIsIndeterminate: true };
export const HEARING_DEAF = { connected: false, disconnectedIsIndeterminate: true };
