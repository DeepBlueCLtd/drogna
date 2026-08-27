/**
 * Zero is a rate. Everything about this test follows from that one sentence.
 *
 * The failure it guards against is a display that treats a rate of zero as an error or a
 * disconnection: a page that greys out, or says stale, or shows an empty panel, when what
 * has actually happened is that somebody asked for the simulated world to hold still so a
 * capture could be taken (FR-014, FR-53).
 *
 * The subtler half is SC-015. Liveness windows are real time (ADR-0006), so pinning the
 * rate stops simulated time and stops nothing else: heartbeats keep arriving at their
 * real cadence and every component that was lit stays lit, however long the pin lasts in
 * simulated seconds. A display that measured liveness in simulation time would grey out
 * the whole system during exactly the capture meant to show it running.
 *
 * And the third: nothing host-derived may be drawn, or the page differs frame to frame
 * and two captures of the same state are never identical (FR-009, SC-009).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { acknowledgeRate, emptyRate, isPinned, rateWords, requestRate } from "../../src/controls/rateState";
import { SpeedControl } from "../../src/controls/SpeedControl";
import { ComponentDiagram } from "../../src/layout/ComponentDiagram";
import { interpret } from "../../src/liveness/ingest";
import { emptyLiveness, receive } from "../../src/liveness/reducer";
import { describeShell } from "../../src/liveness/view";
import { ClockState } from "../../src/ui/ClockState";
import { UnmappedComponents } from "../../src/ui/UnmappedComponents";
import { emptyClock, receiveClockSample } from "../../src/transport/clock";

import { clockSample, heartbeat, HEARING_CONNECTED, TOLERANCES } from "../heartbeats";

function pinnedRateState() {
  const state = requestRate(emptyRate, 0, 100);
  return acknowledgeRate(state, {
    runId: "run-0001",
    tick: 101,
    simTime: "2026-08-26T00:01:41.000000Z",
    mode: "paused",
    rate: 0,
    receivedAt: 1000,
  });
}

/** How long the clock's heartbeat declares it should be believed, in host seconds. */
const WINDOW_SECONDS = 5;

/**
 * The shell as it stands at a host instant, with the rate pinned to zero.
 *
 * Heartbeats keep arriving while the rate is zero, because a heartbeat's cadence is real
 * time and pausing the simulated world does not pause the processes simulating it
 * (ADR-0006). So the most recent one is taken to have arrived half a real second before
 * whatever host instant the caller names, however far into the pin that is. The clock's
 * own last *time sample* is not refreshed, because emission genuinely stops at a rate of
 * zero — which is why `paused` and `stale` have to be decided separately.
 */
function shellWhilePinned(now: number) {
  const interpretation = interpret(
    heartbeat({ heartbeat_interval_seconds: 1, liveness_window_seconds: WINDOW_SECONDS }),
    now - 500,
    TOLERANCES,
  );
  if (!interpretation.accepted) {
    throw new Error(interpretation.reason);
  }
  return describeShell({
    liveness: receive(emptyLiveness, interpretation.evidence),
    clockState: receiveClockSample(emptyClock, clockSample({ rate: 0, mode: "paused" }), 1000),
    connection: "receiving",
    now,
    hearing: HEARING_CONNECTED,
    clockStaleAfterSeconds: 10,
  });
}

describe("a rate of zero", () => {
  it("is a rate in force, not an absence of one", () => {
    const state = pinnedRateState();
    expect(state.acknowledged).toBe(0);
    expect(isPinned(state)).toBe(true);
    expect(state.awaitingAcknowledgement).toBe(false);
  });

  it("is described as paused rather than as an error or a disconnection", () => {
    const words = rateWords(pinnedRateState());
    expect(words).toContain("Paused");
    expect(words).not.toMatch(/error|disconnect|fail/i);
  });

  it("is shown by the clock panel as paused, which is not stale", () => {
    const shell = shellWhilePinned(1500);
    expect(shell.clock.display).toBe("paused");
    const markup = renderToStaticMarkup(<ClockState clock={shell.clock} />);
    expect(markup).toContain('data-clock="paused"');
    expect(markup).not.toContain('data-clock="stale"');
  });

  it("leaves lit what was lit, for far longer than the declared window (SC-015)", () => {
    // Real host time passes and the heartbeats keep arriving; simulated time does not
    // move at all. The count of components lit before the pin and dark after it is zero,
    // at any host instant, however many multiples of the declared window have passed.
    const before = shellWhilePinned(1500).litCount;
    expect(before).toBe(1);
    for (const later of [10_000, 60_000, 3_600_000]) {
      expect(shellWhilePinned(later).litCount, `at ${later}`).toBe(before);
    }
  });

  it("greys the clock out only when its heartbeat genuinely stops, pin or no pin", () => {
    // The other half of the same rule: liveness still means liveness. A component that
    // stops speaking goes dark whatever the rate is, so a lit box is never an artefact of
    // the pin.
    const interpretation = interpret(
      heartbeat({ liveness_window_seconds: WINDOW_SECONDS }),
      1000,
      TOLERANCES,
    );
    if (!interpretation.accepted) {
      throw new Error(interpretation.reason);
    }
    const silent = describeShell({
      liveness: receive(emptyLiveness, interpretation.evidence),
      clockState: receiveClockSample(emptyClock, clockSample({ rate: 0, mode: "paused" }), 1000),
      connection: "receiving",
      now: 1000 + WINDOW_SECONDS * 1000 + 1,
      hearing: HEARING_CONNECTED,
      clockStaleAfterSeconds: 10,
    });
    expect(silent.litCount).toBe(0);
  });

  it("does not advance displayed simulation time while the rate is zero", () => {
    const first = shellWhilePinned(1500);
    const later = shellWhilePinned(4500);
    expect(first.clock.sample?.simTime).toBe(later.clock.sample?.simTime);
    expect(first.clock.sample?.tick).toBe(later.clock.sample?.tick);
  });
});

describe("nothing host-derived is drawn", () => {
  it("keeps the component boxes identical between two frames of the same state", () => {
    const first = renderToStaticMarkup(<ComponentDiagram views={shellWhilePinned(1500).nodes} />);
    const second = renderToStaticMarkup(<ComponentDiagram views={shellWhilePinned(9500).nodes} />);
    expect(first).toBe(second);
  });

  it("keeps the clock panel identical between two frames of the same state", () => {
    const first = renderToStaticMarkup(<ClockState clock={shellWhilePinned(1500).clock} />);
    const second = renderToStaticMarkup(<ClockState clock={shellWhilePinned(9500).clock} />);
    expect(first).toBe(second);
  });

  it("keeps the unplaced-component panel identical between two frames", () => {
    const first = renderToStaticMarkup(<UnmappedComponents views={shellWhilePinned(1500).unmapped} />);
    const second = renderToStaticMarkup(<UnmappedComponents views={shellWhilePinned(9500).unmapped} />);
    expect(first).toBe(second);
  });

  it("draws no elapsed-since figure anywhere in the rendered page", () => {
    const shell = shellWhilePinned(9500);
    const markup = [
      renderToStaticMarkup(<ComponentDiagram views={shell.nodes} />),
      renderToStaticMarkup(<ClockState clock={shell.clock} />),
      renderToStaticMarkup(<UnmappedComponents views={shell.unmapped} />),
    ].join("");
    expect(markup).not.toMatch(/\d+\s*s ago/);
    expect(markup).not.toMatch(/min ago/);
    expect(markup).not.toMatch(/under a second ago/);
  });
});

describe("the speed control as drawn", () => {
  it("offers zero and marks the rate in force, not the rate requested", () => {
    const state = pinnedRateState();
    const markup = renderToStaticMarkup(
      <SpeedControl rate={state} onRequest={() => undefined} unavailable={null} />,
    );
    expect(markup).toContain('data-testid="rate-0" data-in-force="true"');
    expect(markup).toContain('data-testid="rate-60" data-in-force="false"');
    expect(markup).toContain("Paused");
  });

  it("shows the rate in force after a request the clock adjusted", () => {
    let state = requestRate(emptyRate, 1000, 10);
    state = acknowledgeRate(state, {
      runId: "run-0001",
      tick: 11,
      simTime: "2026-08-26T00:00:11.000000Z",
      mode: "accelerated",
      rate: 60,
      receivedAt: 1000,
    });
    const markup = renderToStaticMarkup(
      <SpeedControl rate={state} onRequest={() => undefined} unavailable={null} />,
    );
    expect(markup).toContain('data-acknowledged-rate="60"');
    expect(markup).toContain("adjusted");
    expect(markup).toContain('data-testid="rate-60" data-in-force="true"');
  });

  it("renders identically twice from the same state", () => {
    const state = pinnedRateState();
    const draw = () =>
      renderToStaticMarkup(<SpeedControl rate={state} onRequest={() => undefined} unavailable={null} />);
    expect(draw()).toBe(draw());
  });

  it("says why it cannot act rather than silently doing nothing", () => {
    const markup = renderToStaticMarkup(
      <SpeedControl rate={pinnedRateState()} onRequest={() => undefined} unavailable="there is nowhere to send it." />,
    );
    expect(markup).toContain('data-testid="rate-unavailable"');
    expect(markup).toContain("disabled");
  });
});
