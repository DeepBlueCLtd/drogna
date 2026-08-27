/**
 * What a provoked failure looks like on the page, through the client's own code.
 *
 * Spike code, grafted to `client/tests/faultDisplay.test.ts` and removed afterwards.
 *
 * The Python half of this spike proves a requested impairment reaches a real heartbeat.
 * This half proves the other end: that the four things an operator can provoke are four
 * distinguishable things on the display, and that the display keeps saying what the
 * component said rather than what anybody asked for.
 *
 * Nothing here is a claim about the twin or about a console. These are the client's own
 * `interpret`, `receive`, `describeShell` and `statusWords`, fed messages of the shape the
 * grafted `FaultState` produces — which is testing a function with a value, exactly as
 * FR-023 permits, and not a path in the built client.
 */
import { describe, expect, it } from "vitest";

import { interpret } from "../src/liveness/ingest";
import { emptyLiveness, receive } from "../src/liveness/reducer";
import type { LivenessState } from "../src/liveness/types";
import { describeShell } from "../src/liveness/view";
import { emptyClock } from "../src/transport/clock";
import { statusWords } from "../src/ui/states";

const TOLERANCES = { defaultWindowSeconds: 15, windowMultiplier: 3 };
const HEARING = { connected: true, disconnectedIsIndeterminate: true };

/** The mark the grafted `fault.py` leaves in a detail. Duplicated deliberately: if the
 *  Python spelling changed and this did not, the spike should notice. */
const INJECTED = "impairment-requested";

interface Fields {
  readonly status: string;
  readonly detail?: string;
  readonly receivedAt?: number;
}

/** One heartbeat as the impaired component would publish it, folded in through the client. */
function heard(state: LivenessState, fields: Fields): LivenessState {
  const message: Record<string, unknown> = {
    component: "planner",
    sim_time: "2026-08-26T00:00:10.000000Z",
    tick: 10,
    status: fields.status,
    run_id: "run-0001",
    heartbeat_interval_seconds: 2,
    ...(fields.detail === undefined ? {} : { detail: fields.detail }),
  };
  const interpretation = interpret(message, fields.receivedAt ?? 1000, TOLERANCES);
  if (!interpretation.accepted) {
    throw new Error(`the client refused a message this spike claims is valid: ${interpretation.reason}`);
  }
  return receive(state, interpretation.evidence);
}

function shell(liveness: LivenessState, now = 1000) {
  return describeShell({
    liveness,
    clockState: emptyClock,
    connection: "receiving",
    now,
    hearing: HEARING,
    clockStaleAfterSeconds: 10,
  });
}

function planner(liveness: LivenessState, now = 1000) {
  return shell(liveness, now).nodes.find((node) => node.componentId === "planner");
}

describe("the four things an operator can provoke", () => {
  it("shows an unimpaired component lit and reporting ok", () => {
    const view = planner(heard(emptyLiveness, { status: "ok" }));
    expect(view?.illumination).toBe("lit");
    expect(statusWords(view?.reported?.status ?? "")).toBe("reports ok");
  });

  it("shows a degraded component lit, and says degraded rather than looking healthy", () => {
    const view = planner(
      heard(emptyLiveness, { status: "degraded", detail: `${INJECTED}: degrade (demo)` }),
    );
    // Lit is the honest word: it was heard from. Health is a separate sentence.
    expect(view?.illumination).toBe("lit");
    expect(statusWords(view?.reported?.status ?? "")).toBe("reports degraded");
  });

  it("shows a stalled component lit, and distinguishes it from a degraded one", () => {
    const stalled = planner(heard(emptyLiveness, { status: "stalled" }));
    const degraded = planner(heard(emptyLiveness, { status: "degraded" }));
    expect(statusWords(stalled?.reported?.status ?? "")).toBe("reports stalled");
    expect(statusWords(degraded?.reported?.status ?? "")).toBe("reports degraded");
    expect(statusWords(stalled?.reported?.status ?? "")).not.toBe(
      statusWords(degraded?.reported?.status ?? ""),
    );
  });

  it("shows a silenced component dark once its window lapses, which is a different claim", () => {
    // Heard from at 1000, declaring a two-second interval: believed for six seconds.
    const liveness = heard(emptyLiveness, { status: "ok", receivedAt: 1000 });
    expect(planner(liveness, 3000)?.illumination).toBe("lit");

    // Then it stops publishing. Nothing arrives, and the window runs out.
    expect(planner(liveness, 20000)?.illumination).toBe("dark");

    // Dark says "not heard from" — not "failed". The display does not diagnose.
    expect(planner(liveness, 20000)?.reported?.status).toBe("ok");
  });

  it("leaves a throttled component reporting ok, because slow is not sick", () => {
    const view = planner(
      heard(emptyLiveness, { status: "ok", detail: `${INJECTED}: throttle (slow it)` }),
    );
    expect(view?.illumination).toBe("lit");
    expect(statusWords(view?.reported?.status ?? "")).toBe("reports ok");
    expect(view?.reported?.detail).toContain(INJECTED);
  });
});

describe("a provoked failure is distinguishable from a real one", () => {
  it("carries the mark in the detail the client already keeps", () => {
    const provoked = planner(
      heard(emptyLiveness, { status: "degraded", detail: `${INJECTED}: degrade (a demonstration)` }),
    );
    const genuine = planner(heard(emptyLiveness, { status: "degraded", detail: "no-field" }));

    expect(provoked?.reported?.detail).toContain(INJECTED);
    expect(genuine?.reported?.detail).not.toContain(INJECTED);
    // Both report degraded. The status alone cannot tell them apart, which is why the
    // mark has to be in the message rather than in the console's memory.
    expect(provoked?.reported?.status).toBe(genuine?.reported?.status);
  });
});

describe("the display reports rather than diagnoses", () => {
  it("shows a status the client does not recognise as it arrived", () => {
    // The console cannot invent a status: an unknown spelling is passed through rather
    // than folded into ok, so a component saying something new is visible as new.
    expect(statusWords("wedged")).toBe("reports wedged");
  });

  it("lights nothing at all when nothing has been heard", () => {
    expect(shell(emptyLiveness).litCount).toBe(0);
    expect(planner(emptyLiveness)?.illumination).toBe("dark");
  });
});
