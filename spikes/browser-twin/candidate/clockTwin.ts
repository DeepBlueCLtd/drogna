/**
 * C-01, the simulation clock, reimplemented in the browser.
 *
 * This is spike code, written as it would appear at `client/twin/clockTwin.ts` and grafted
 * there by `spikes/browser-twin/run.sh` for the length of one test run. Nothing imports it
 * in the committed tree.
 *
 * It sits beside `client/src` rather than inside it, and the spike found that boundary
 * rather than choosing it: `tests/no-mock.test.ts` and `tests/loop/noSynthesisedTraffic.test.ts`
 * both read every file under `client/src` and fail on a `.publish(` call anywhere in it.
 * The client receives and never sends, structurally, and that property is worth more than
 * the convenience of one directory. A component is a component; it is not part of the page
 * that draws it.
 *
 * It is an implementation of the clock, not a recording of one and not a picture of one.
 * What it publishes, it publishes because it computed it; what the page lights, the page
 * lights because this component was running and spoke. That is the whole of the argument
 * that Constitution VII survives a browser-hosted twin, and it is why this file is a
 * component rather than a table of messages to replay.
 *
 * Two properties are taken straight from `contracts/schemas/clock.schema.json` and are
 * what make the twin cheap:
 *
 *   - "The value of tick n is epoch + n * tick_interval and is unaffected by rate." So
 *     the content of every sample is a pure function of the tick index. Host time decides
 *     only *when* a tick is emitted, never what it says.
 *   - Rate zero is a legitimate state, not an absence of one. The twin keeps
 *     heartbeating at rate zero, exactly as ADR-0006 requires of the real clock, so a
 *     capture at a pinned rate does not grey out a running system.
 *
 * Host time is read through `time/host.ts` and for the one purpose ADR-0006 already
 * permits: cadence. No new exemption is taken here.
 */
import { elapsedSeconds } from "../src/time/host";

/** What the clock was started from. Its own configuration, not a list of what exists. */
export interface ClockScenario {
  readonly runId: string;
  /** Simulation time of tick zero, as epoch milliseconds. */
  readonly epochMs: number;
  /** Simulation seconds between consecutive ticks. */
  readonly tickIntervalSeconds: number;
  /** Emission rate. Zero pins the clock without stopping the heartbeat (FR-53). */
  readonly rate: number;
  readonly mode: "realtime" | "accelerated" | "paused" | "lockstep";
  /** Host seconds between heartbeats, declared on every one of them (ADR-0006). */
  readonly heartbeatIntervalSeconds: number;
  readonly configDigest: string | null;
}

/** Where a component's output goes: the fabric, or anything shaped like it. */
export interface Publisher {
  publish(topic: string, payload: string): void;
}

/** ISO-8601 UTC at the microsecond precision the contract asks for. */
export function simTimeOf(scenario: ClockScenario, tick: number): string {
  const millis = scenario.epochMs + tick * scenario.tickIntervalSeconds * 1000;
  return new Date(millis).toISOString().replace(/Z$/, "000Z");
}

/** The tick index due at a given host instant, given where the clock started. */
export function tickDueAt(scenario: ClockScenario, startedAt: number, hostNow: number): number {
  if (scenario.rate === 0) {
    return 0;
  }
  const simSeconds = elapsedSeconds(startedAt, hostNow) * scenario.rate;
  return Math.max(0, Math.floor(simSeconds / scenario.tickIntervalSeconds));
}

export function timeSample(scenario: ClockScenario, tick: number): Record<string, unknown> {
  return {
    run_id: scenario.runId,
    tick,
    sim_time: simTimeOf(scenario, tick),
    mode: scenario.rate === 0 ? "paused" : scenario.mode,
    rate: scenario.rate,
  };
}

export function heartbeatOf(scenario: ClockScenario, tick: number): Record<string, unknown> {
  return {
    component: "clock",
    sim_time: simTimeOf(scenario, tick),
    tick,
    status: "ok",
    run_id: scenario.runId,
    config_digest: scenario.configDigest,
    heartbeat_interval_seconds: scenario.heartbeatIntervalSeconds,
  };
}

export const CLOCK_TOPIC_NAME = "ctl/clock";
export const HEARTBEAT_TOPIC_NAME = "ctl/heartbeat";

/**
 * One step of the component: emit the heartbeat, and the time sample if the tick moved.
 *
 * Separated from any timer so the component's behaviour is a function of the instant it
 * is given, which is the shape every other module in this client already takes.
 */
export function step(
  scenario: ClockScenario,
  publisher: Publisher,
  startedAt: number,
  hostNow: number,
  lastTick: number | null,
): number {
  const tick = tickDueAt(scenario, startedAt, hostNow);
  if (lastTick === null || tick !== lastTick) {
    publisher.publish(CLOCK_TOPIC_NAME, JSON.stringify(timeSample(scenario, tick)));
  }
  publisher.publish(HEARTBEAT_TOPIC_NAME, JSON.stringify(heartbeatOf(scenario, tick)));
  return tick;
}
