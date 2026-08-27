/**
 * The overlay learns about a new run by being told, and never by asking.
 *
 * FR-021 and SC-010. SRD FR-31 is explicit that the query layer has no notification
 * mechanism and that consumers subscribe rather than poll, so a page that polled for
 * freshness would work and would be wrong in a way nothing on the screen would show. The
 * count that matters is the count of reads issued against the count of announcements
 * received, and it is asserted here rather than left to review.
 */
import { describe, expect, it } from "vitest";

import { announceRun, coversInstant, emptyOverlay, fieldRead } from "../../src/uncertainty/overlay";

import { runPublished } from "../control";

describe("the overlay's run", () => {
  it("knows nothing before an announcement arrives", () => {
    expect(emptyOverlay.runId).toBeNull();
    expect(emptyOverlay.collection).toBeNull();
    expect(emptyOverlay.stale).toBe(false);
  });

  it("moves to the announced run and marks the field as needing a read", () => {
    const state = announceRun(emptyOverlay, runPublished());
    expect(state.runId).toBe("run-0007");
    expect(state.collection).toBe("uncertainty-run-0007");
    expect(state.stale).toBe(true);
    expect(state.announcements).toBe(1);
  });

  it("carries the published valid span, so out-of-range can be answered", () => {
    const state = announceRun(emptyOverlay, runPublished());
    expect(state.validFrom).toBe("2026-08-26T00:10:00.000000Z");
    expect(state.validTo).toBe("2026-08-26T06:10:00.000000Z");
  });

  it("does not move to a run published for inspection rather than made current", () => {
    let state = announceRun(emptyOverlay, runPublished());
    state = fieldRead(state);
    const inspected = announceRun(state, runPublished({ run_id: "run-0008", current: false }));
    expect(inspected.runId).toBe("run-0007");
    expect(inspected.stale).toBe(false);
    expect(inspected.announcements).toBe(2);
  });

  it("refuses an announcement its schema rejects, and changes nothing", () => {
    const state = announceRun(announceRun(emptyOverlay, runPublished()), { run_id: "run-0009" });
    expect(state.runId).toBe("run-0007");
    expect(state.refused).toBe(1);
  });

  it("clears the needs-a-read mark once the field has been read", () => {
    const state = fieldRead(announceRun(emptyOverlay, runPublished()));
    expect(state.stale).toBe(false);
    expect(fieldRead(state)).toBe(state);
  });
});

describe("reads against announcements", () => {
  it("issues one read per announcement of a current run, and none otherwise", () => {
    // Standing in for the query-layer read: every time the overlay says it is stale, the
    // page reads once. Over a session with no announcement, that is zero reads — which is
    // SC-010's count of polling requests.
    let state = emptyOverlay;
    let reads = 0;
    const drawFrames = (count: number): void => {
      for (let frame = 0; frame < count; frame += 1) {
        if (state.stale) {
          reads += 1;
          state = fieldRead(state);
        }
      }
    };

    drawFrames(1000);
    expect(reads).toBe(0);

    state = announceRun(state, runPublished());
    drawFrames(1000);
    expect(reads).toBe(1);

    state = announceRun(state, runPublished({ run_id: "run-0008" }));
    drawFrames(1000);
    expect(reads).toBe(2);
    expect(state.runId).toBe("run-0008");
  });

  it("refreshes within one frame of the announcement", () => {
    let state = announceRun(emptyOverlay, runPublished());
    expect(state.stale).toBe(true);
    state = fieldRead(state);
    expect(state.stale).toBe(false);
  });

  it("takes an announcement and nothing else: there is no schedule to come in through", () => {
    // The structural half. `announceRun` takes a state and a received message; there is no
    // interval, no timer and no parameter a poll could be configured through.
    expect(announceRun.length).toBe(2);
    expect(fieldRead.length).toBe(1);
  });
});

describe("whether a moment has a forecast at all", () => {
  const published = announceRun(emptyOverlay, runPublished());

  it("says yes inside the published valid span, at both ends", () => {
    expect(coversInstant(published, "2026-08-26T00:10:00.000000Z")).toBe(true);
    expect(coversInstant(published, "2026-08-26T03:00:00.000000Z")).toBe(true);
    expect(coversInstant(published, "2026-08-26T06:10:00.000000Z")).toBe(true);
  });

  it("says no outside it, rather than offering the nearest field", () => {
    expect(coversInstant(published, "2026-08-26T00:09:59.999999Z")).toBe(false);
    expect(coversInstant(published, "2026-08-26T06:10:00.000001Z")).toBe(false);
  });

  it("says no when nothing has been published, rather than guessing", () => {
    expect(coversInstant(emptyOverlay, "2026-08-26T03:00:00.000000Z")).toBe(false);
  });

  it("says no for an instant it cannot read", () => {
    expect(coversInstant(published, "half past three")).toBe(false);
  });
});
