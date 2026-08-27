/**
 * When the clock goes quiet the display stops. It does not carry on from the browser.
 *
 * FR-013 and SC-006: with the clock service disconnected, the count of displayed
 * timestamps that continue to advance is zero. The interesting case is not the obvious
 * one — nobody writes `new Date()` into a timestamp on purpose — but the one ADR-0007
 * creates. Interpolation reads the browser's frame timestamp, and an interpolation that
 * extrapolated past the most recent sample would advance the display from host time
 * exactly when the clock had stopped speaking.
 *
 * So the property tested here is the first of ADR-0007's three rules, from the outside:
 * frames keep coming, samples do not, and the displayed instant stops moving.
 */
import { describe, expect, it } from "vitest";

import { frameInstant, NO_INSTANT, NO_SAMPLES, receiveDisplaySample } from "../../src/controls/interpolatedClock";
import { microsFromIso } from "../../src/controls/simInstant";
import { describeClock, emptyClock, receiveClockSample } from "../../src/transport/clock";

const EARLIER = { simTime: "2026-08-26T00:00:00.000000Z", receivedAt: 1000 };
const LATER = { simTime: "2026-08-26T00:00:10.000000Z", receivedAt: 2000 };

const PAIR = receiveDisplaySample(receiveDisplaySample(NO_SAMPLES, EARLIER), LATER);

describe("when samples stop arriving", () => {
  it("holds at the most recent sample however many frames pass", () => {
    const held = [3000, 10_000, 1_000_000].map((frame) => frameInstant(PAIR, frame).text);
    expect(new Set(held).size).toBe(1);
    expect(held[0]).toBe(LATER.simTime);
  });

  it("never shows an instant later than the most recent sample", () => {
    const ceiling = microsFromIso(LATER.simTime);
    for (const frame of [1500, 2000, 2500, 5000, 100_000]) {
      const shown = frameInstant(PAIR, frame).text;
      expect(microsFromIso(shown ?? ""), `frame ${frame}`).toBeLessThanOrEqual(ceiling!);
    }
  });

  it("says it is holding rather than moving", () => {
    expect(frameInstant(PAIR, 50_000).holding).toBe(true);
    expect(frameInstant(PAIR, 50_000).interpolated).toBe(false);
  });

  it("shows nothing at all before any sample has arrived", () => {
    expect(frameInstant(NO_SAMPLES, 1234)).toEqual(NO_INSTANT);
    expect(frameInstant(NO_SAMPLES, 1234).text).toBeNull();
  });

  it("shows the one sample verbatim when only one has arrived", () => {
    const single = receiveDisplaySample(NO_SAMPLES, LATER);
    expect(frameInstant(single, 9_000).text).toBe(LATER.simTime);
    expect(frameInstant(single, 9_000).interpolated).toBe(false);
  });
});

describe("the clock panel with the clock unreachable", () => {
  it("reports stale rather than paused when the clock is not being heard from", () => {
    const state = receiveClockSample(
      emptyClock,
      { run_id: "run-0001", tick: 10, sim_time: LATER.simTime, mode: "accelerated", rate: 10 },
      1000,
    );
    const view = describeClock(state, 90_000, 10, "dark");
    expect(view.display).toBe("stale");
  });

  it("keeps the last sample's own simulation time rather than moving it on", () => {
    const state = receiveClockSample(
      emptyClock,
      { run_id: "run-0001", tick: 10, sim_time: LATER.simTime, mode: "accelerated", rate: 10 },
      1000,
    );
    expect(describeClock(state, 90_000, 10, "dark").sample?.simTime).toBe(LATER.simTime);
    expect(describeClock(state, 900_000, 10, "dark").sample?.simTime).toBe(LATER.simTime);
  });

  it("says nothing is known at all when no sample has ever arrived", () => {
    expect(describeClock(emptyClock, 5000, 10, "lit").display).toBe("unheard");
  });
});

describe("interpolation between two samples", () => {
  it("walks from the earlier sample towards the later one and stops there", () => {
    const start = frameInstant(PAIR, LATER.receivedAt);
    const middle = frameInstant(PAIR, LATER.receivedAt + 500);
    const end = frameInstant(PAIR, LATER.receivedAt + 1000);
    expect(microsFromIso(start.text ?? "")).toBe(microsFromIso(EARLIER.simTime));
    expect(microsFromIso(middle.text ?? "")).toBeGreaterThan(microsFromIso(EARLIER.simTime)!);
    expect(microsFromIso(middle.text ?? "")).toBeLessThan(microsFromIso(LATER.simTime)!);
    expect(microsFromIso(end.text ?? "")).toBe(microsFromIso(LATER.simTime));
  });

  it("snaps to an arriving sample and discards whatever it was doing", () => {
    // Rule two. The fraction restarts from the newly-previous sample's own instant, which
    // is a received value, so error cannot accumulate across samples.
    const midFlight = frameInstant(PAIR, LATER.receivedAt + 400);
    expect(midFlight.interpolated).toBe(true);
    const NEXT = { simTime: "2026-08-26T00:00:20.000000Z", receivedAt: 3000 };
    const snapped = receiveDisplaySample(PAIR, NEXT);
    expect(snapped.previous).toEqual(LATER);
    expect(frameInstant(snapped, NEXT.receivedAt).text).toBe(LATER.simTime);
  });

  it("holds still when the two samples carry the same instant, which is a rate of zero", () => {
    const pinned = receiveDisplaySample(
      receiveDisplaySample(NO_SAMPLES, { simTime: LATER.simTime, receivedAt: 1000 }),
      { simTime: LATER.simTime, receivedAt: 2000 },
    );
    for (const frame of [2000, 2500, 3000]) {
      expect(frameInstant(pinned, frame).text).toBe(LATER.simTime);
      expect(frameInstant(pinned, frame).interpolated).toBe(false);
    }
  });

  it("falls back to the sample verbatim when asked not to interpolate", () => {
    const stepped = frameInstant(PAIR, LATER.receivedAt + 500, false);
    expect(stepped.text).toBe(LATER.simTime);
    expect(stepped.interpolated).toBe(false);
  });

  it("falls back to the sample rather than guessing when an instant is unreadable", () => {
    const broken = receiveDisplaySample(
      receiveDisplaySample(NO_SAMPLES, { simTime: "not an instant", receivedAt: 1000 }),
      LATER,
    );
    expect(frameInstant(broken, 1500).text).toBe(LATER.simTime);
  });

  it("falls back to the sample when two samples arrived at the same host instant", () => {
    const simultaneous = receiveDisplaySample(
      receiveDisplaySample(NO_SAMPLES, { ...EARLIER, receivedAt: 2000 }),
      LATER,
    );
    expect(frameInstant(simultaneous, 2000).text).toBe(LATER.simTime);
  });

  it("never runs backwards when samples arrive out of order", () => {
    const reversed = receiveDisplaySample(receiveDisplaySample(NO_SAMPLES, LATER), EARLIER);
    expect(frameInstant(reversed, 2500).text).toBe(EARLIER.simTime);
    expect(frameInstant(reversed, 2500).interpolated).toBe(false);
  });
});
