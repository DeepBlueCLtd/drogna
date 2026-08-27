/**
 * The rate requested and the rate in force are two different things, and one is displayed.
 *
 * FR-012 is easy to satisfy carelessly and the careless version fails exactly where it
 * matters: a control that echoes its own request reports success it has no evidence for,
 * and does so most convincingly when the clock refused. So the tests below all turn on
 * the same question — after asking for a rate, what does the display say is in force?
 *
 * Nothing here reads a clock of any kind. A request is resolved by a sample carrying a
 * later tick, and ticks are strictly increasing within a run (ADR-0009), so ordering
 * needs no duration.
 */
import { describe, expect, it } from "vitest";

import { acknowledgeRate, emptyRate, isPinned, OFFERED_RATES, rateWords, requestFailed, requestRate } from "../../src/controls/rateState";
import { NO_CONTROL_SURFACE, rateCommand, rateRequesterFor, unavailableRequester } from "../../src/controls/rateRequest";
import type { RuntimeConfig } from "../../src/config/runtime";
import type { ClockSample } from "../../src/transport/clock";

import { runtimeConfig } from "../runtimeConfig";

function sample(overrides: Partial<ClockSample> = {}): ClockSample {
  return {
    runId: "run-0001",
    tick: 100,
    simTime: "2026-08-26T00:01:40.000000Z",
    mode: "accelerated",
    rate: 10,
    receivedAt: 1000,
    ...overrides,
  };
}

describe("requesting a rate", () => {
  it("records the asking and changes nothing about what is in force", () => {
    const asked = requestRate(emptyRate, 60, 100);
    expect(asked.requested).toBe(60);
    expect(asked.acknowledged).toBeNull();
    expect(asked.awaitingAcknowledgement).toBe(true);
  });

  it("shows the rate the clock reports, not the rate that was asked for", () => {
    let state = requestRate(emptyRate, 60, 100);
    state = acknowledgeRate(state, sample({ tick: 101, rate: 10 }));
    expect(state.acknowledged).toBe(10);
    expect(state.requested).toBe(60);
    expect(rateWords(state)).toContain("10");
    expect(rateWords(state)).toContain("adjusted");
  });

  it("says a clamped request was adjusted rather than reporting it as granted", () => {
    let state = requestRate(emptyRate, 1000, 5);
    state = acknowledgeRate(state, sample({ tick: 6, rate: 60 }));
    expect(state.adjusted).toBe(true);
  });

  it("does not call a request adjusted when the clock granted it", () => {
    let state = requestRate(emptyRate, 5, 5);
    state = acknowledgeRate(state, sample({ tick: 6, rate: 5 }));
    expect(state.adjusted).toBe(false);
    expect(state.awaitingAcknowledgement).toBe(false);
    expect(rateWords(state)).toContain("5");
  });

  it("keeps a request outstanding until a sample later than it arrives", () => {
    let state = requestRate(emptyRate, 60, 100);
    state = acknowledgeRate(state, sample({ tick: 100, rate: 10 }));
    expect(state.awaitingAcknowledgement).toBe(true);
    expect(rateWords(state)).toContain("will change when the clock does");
    state = acknowledgeRate(state, sample({ tick: 101, rate: 60 }));
    expect(state.awaitingAcknowledgement).toBe(false);
  });

  it("leaves the rate in force untouched when the request could not be sent", () => {
    let state = acknowledgeRate(emptyRate, sample({ rate: 10 }));
    state = requestRate(state, 0, 100);
    state = requestFailed(state, NO_CONTROL_SURFACE);
    expect(state.acknowledged).toBe(10);
    expect(state.awaitingAcknowledgement).toBe(false);
    expect(rateWords(state)).toContain("could not be changed");
  });

  it("says nothing is in force before any sample has arrived", () => {
    expect(rateWords(emptyRate)).toContain("no rate is known to be in force");
    expect(isPinned(emptyRate)).toBe(false);
  });

  it("offers zero among the rates, because zero is a rate", () => {
    expect(OFFERED_RATES).toContain(0);
    expect(OFFERED_RATES[0]).toBe(0);
  });
});

describe("where the request goes", () => {
  const configured = (control: string | undefined): RuntimeConfig =>
    runtimeConfig({ controlUrl: control });

  it("declines in words when the document names no control route", async () => {
    expect(rateRequesterFor(configured(undefined))).toBeNull();
    expect(rateRequesterFor(null)).toBeNull();
    const outcome = await unavailableRequester(0);
    expect(outcome.sent).toBe(false);
  });

  it("asks the clock at the location the document names, and nowhere else", async () => {
    const asked: { url: string; body: string }[] = [];
    const requester = rateRequesterFor(configured("http://clock.invalid/clock/control"), async (url, body) => {
      asked.push({ url, body });
      return { ok: true, status: 200 };
    });
    const outcome = await requester!(0);
    expect(outcome.sent).toBe(true);
    expect(asked).toHaveLength(1);
    expect(asked[0]?.url).toBe("http://clock.invalid/clock/control");
    expect(JSON.parse(asked[0]?.body ?? "{}")).toEqual({ operation: "set_rate", rate: 0 });
  });

  it("reports a refusal rather than treating it as an acknowledgement", async () => {
    const requester = rateRequesterFor(configured("http://clock.invalid/clock/control"), async () => ({
      ok: false,
      status: 400,
    }));
    const outcome = await requester!(1000);
    expect(outcome.sent).toBe(false);
    expect(outcome.sent === false ? outcome.reason : "").toContain("400");
  });

  it("reports an unreachable clock rather than throwing into the render path", async () => {
    const requester = rateRequesterFor(configured("http://clock.invalid/clock/control"), async () => {
      throw new Error("connection refused");
    });
    const outcome = await requester!(5);
    expect(outcome.sent).toBe(false);
    expect(outcome.sent === false ? outcome.reason : "").toContain("connection refused");
  });

  it("spells the command the way the clock's control interface reads it", () => {
    expect(JSON.parse(rateCommand(5))).toEqual({ operation: "set_rate", rate: 5 });
  });
});
