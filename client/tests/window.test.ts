/**
 * The liveness window, evaluated in real time.
 *
 * ADR-0006 settled the question this file would otherwise be ambiguous about. Were the
 * window measured in simulation time, a rate of zero would expire every window at once
 * and grey out a running system during exactly the capture FR-53 pins the rate for. The
 * simulation time a heartbeat carries is payload; the window is real.
 */
import { describe, expect, it } from "vitest";

import { interpret, windowFor } from "../src/liveness/ingest";
import { receive, emptyLiveness } from "../src/liveness/reducer";
import { illuminationFor, withinWindow } from "../src/liveness/window";

import { heartbeat, HEARING_CONNECTED, HEARING_DEAF, TOLERANCES } from "./heartbeats";

function state(fields: Parameters<typeof heartbeat>[0], receivedAt: number) {
  const interpretation = interpret(heartbeat(fields), receivedAt, TOLERANCES);
  if (!interpretation.accepted) {
    throw new Error(interpretation.reason);
  }
  return receive(emptyLiveness, interpretation.evidence).components.get(
    interpretation.evidence.componentId,
  );
}

describe("the window a heartbeat is believed for", () => {
  it("uses the window the sender declares", () => {
    expect(windowFor(heartbeat({ liveness_window_seconds: 7 }), TOLERANCES)).toEqual({
      seconds: 7,
      declared: true,
    });
  });

  it("multiplies a declared interval when no window is declared", () => {
    expect(windowFor(heartbeat({ heartbeat_interval_seconds: 2 }), TOLERANCES)).toEqual({
      seconds: 6,
      declared: true,
    });
  });

  it("falls back to the receiver's tolerance when the sender declares neither", () => {
    expect(windowFor(heartbeat(), TOLERANCES)).toEqual({ seconds: 15, declared: false });
  });

  it("measures the window in host seconds", () => {
    expect(withinWindow(1000, 10, 1000 + 9_999)).toBe(true);
    expect(withinWindow(1000, 10, 1000 + 10_001)).toBe(false);
  });
});

describe("what a component is drawn as", () => {
  it("is dark when nothing has ever been heard from it", () => {
    expect(illuminationFor(undefined, 5000, HEARING_CONNECTED)).toBe("dark");
  });

  it("is lit inside the declared window", () => {
    const heard = state({ liveness_window_seconds: 5 }, 1000);
    expect(illuminationFor(heard, 1000 + 4_000, HEARING_CONNECTED)).toBe("lit");
  });

  it("returns to dark past the declared window, with no other input", () => {
    const heard = state({ liveness_window_seconds: 5 }, 1000);
    expect(illuminationFor(heard, 1000 + 6_000, HEARING_CONNECTED)).toBe("dark");
  });

  it("stays lit while simulation time does not advance", () => {
    // Every heartbeat here carries the same simulation time, as it would at rate zero.
    // The window is real time, so the component stays lit for as long as it keeps
    // speaking, which is what makes a capture at rate zero mean anything.
    const heard = state({ sim_time: "2026-08-26T00:00:00.000000Z", liveness_window_seconds: 5 }, 1000);
    expect(illuminationFor(heard, 1000 + 1_000, HEARING_CONNECTED)).toBe("lit");
  });

  it("is indeterminate when the evidence expired while the page could not listen", () => {
    const heard = state({ liveness_window_seconds: 5 }, 1000);
    expect(illuminationFor(heard, 1000 + 6_000, HEARING_DEAF)).toBe("indeterminate");
  });

  it("never produces lit without evidence, connected or not", () => {
    expect(illuminationFor(undefined, 9_999_999, HEARING_DEAF)).toBe("dark");
    expect(illuminationFor(undefined, 9_999_999, HEARING_CONNECTED)).toBe("dark");
  });
});
