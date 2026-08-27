/**
 * The pin is readable from outside, so a capture waits for it instead of hoping.
 *
 * FR-53 has two halves and FR-015 is the second: a rate of zero pins the clock, and
 * something outside the page can tell that the pin has taken effect. Without that, a
 * before-and-after pair differs wherever the simulation happened to be between the two
 * shots, and the difference under evidence is lost in the noise of a running system.
 *
 * What is asserted here is a contract with a tool this feature does not build. Feature
 * 016 owns capture; what it is owed is this record, and the one condition it should wait
 * on — `steady`, which is true only when a rate is known, it is zero, and no request is
 * still outstanding.
 */
import { describe, expect, it } from "vitest";

import { captureReadiness, CAPTURE_READINESS_KEY, exposeCaptureReadiness, readCaptureReadiness } from "../../src/controls/captureReadiness";
import { acknowledgeRate, emptyRate, requestRate } from "../../src/controls/rateState";
import type { ClockSample } from "../../src/transport/clock";

function sample(rate: number, tick: number): ClockSample {
  return {
    runId: "run-0001",
    tick,
    simTime: "2026-08-26T00:00:10.000000Z",
    mode: rate === 0 ? "paused" : "accelerated",
    rate,
    receivedAt: 1000,
  };
}

describe("the readiness record", () => {
  it("reports no rate and no pin before any sample has arrived", () => {
    const readiness = captureReadiness(emptyRate);
    expect(readiness.acknowledgedRate).toBeNull();
    expect(readiness.pinned).toBe(false);
    expect(readiness.steady).toBe(false);
  });

  it("is not steady while a request for zero is still outstanding", () => {
    const asked = requestRate(acknowledgeRate(emptyRate, sample(10, 5)), 0, 5);
    const readiness = captureReadiness(asked);
    expect(readiness.awaitingAcknowledgement).toBe(true);
    expect(readiness.pinned).toBe(false);
    expect(readiness.steady).toBe(false);
  });

  it("becomes steady only once the clock reports zero in force", () => {
    let state = requestRate(acknowledgeRate(emptyRate, sample(10, 5)), 0, 5);
    state = acknowledgeRate(state, sample(0, 6));
    const readiness = captureReadiness(state);
    expect(readiness.acknowledgedRate).toBe(0);
    expect(readiness.pinned).toBe(true);
    expect(readiness.awaitingAcknowledgement).toBe(false);
    expect(readiness.steady).toBe(true);
  });

  it("is not steady at a rate the clock reports as anything but zero", () => {
    const running = captureReadiness(acknowledgeRate(emptyRate, sample(60, 5)));
    expect(running.pinned).toBe(false);
    expect(running.steady).toBe(false);
  });

  it("says the clock adjusted a request, so a capture is not misled about why", () => {
    let state = requestRate(emptyRate, 0, 5);
    state = acknowledgeRate(state, sample(1, 6));
    const readiness = captureReadiness(state);
    expect(readiness.adjusted).toBe(true);
    expect(readiness.steady).toBe(false);
  });

  it("is pure: the same state gives the same record", () => {
    const state = acknowledgeRate(emptyRate, sample(0, 6));
    expect(captureReadiness(state)).toEqual(captureReadiness(state));
  });
});

describe("where a capture reads it", () => {
  it("writes the record under one stable name outside the React tree", () => {
    const host: Record<string, unknown> = {};
    const state = acknowledgeRate(emptyRate, sample(0, 6));
    exposeCaptureReadiness(state, host);
    expect(host[CAPTURE_READINESS_KEY]).toBeDefined();
    expect(readCaptureReadiness(host)?.steady).toBe(true);
  });

  it("reports nothing where the page has not written one yet", () => {
    expect(readCaptureReadiness({})).toBeNull();
  });

  it("replaces the record rather than accumulating them", () => {
    const host: Record<string, unknown> = {};
    exposeCaptureReadiness(acknowledgeRate(emptyRate, sample(10, 5)), host);
    exposeCaptureReadiness(acknowledgeRate(emptyRate, sample(0, 6)), host);
    expect(Object.keys(host)).toEqual([CAPTURE_READINESS_KEY]);
    expect(readCaptureReadiness(host)?.acknowledgedRate).toBe(0);
  });

  it("offers nothing that could set a rate: it reports, and that is all", () => {
    const host: Record<string, unknown> = {};
    const readiness = exposeCaptureReadiness(acknowledgeRate(emptyRate, sample(0, 6)), host);
    for (const value of Object.values(readiness)) {
      expect(typeof value).not.toBe("function");
    }
  });

  it("carries no host-derived quantity, so two readings during a pin agree", () => {
    const state = acknowledgeRate(emptyRate, sample(0, 6));
    const first: Record<string, unknown> = {};
    const second: Record<string, unknown> = {};
    exposeCaptureReadiness(state, first);
    exposeCaptureReadiness(state, second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
