/**
 * A stopped loop is not a quiet healthy one, and the display must not let them look alike.
 *
 * FR-007 exists because the frozen-but-healthy display is the failure mode that costs
 * most: a page that has lost the broker and a page connected to a system with nothing to
 * say draw identically if you only draw what arrived, and they mean opposite things. One
 * is a broken display; the other is a true report of an idle system.
 *
 * Three states, therefore, and the test asserts all three are reachable and distinct.
 */
import { describe, expect, it } from "vitest";

import { emptyLoop, loopStatus, receiveControl } from "../../src/data/controlSubscription";
import { DIVERGENCE_TOPIC, HEARTBEAT_TOPIC } from "../../src/data/topics";
import { LOOP_STATUS_WORDS } from "../../src/loop/CycleView";

import { divergenceEvent, wire } from "../control";
import { heartbeat } from "../heartbeats";

describe("how the loop is shown", () => {
  it("is stopped and disconnected when the page cannot hear", () => {
    expect(loopStatus(emptyLoop(), "not-connected")).toBe("stopped-disconnected");
  });

  it("is idle and connected when it can hear and nothing has been said", () => {
    expect(loopStatus(emptyLoop(), "connected-silent")).toBe("idle-connected");
    expect(loopStatus(emptyLoop(), "receiving")).toBe("idle-connected");
  });

  it("is turning once a run message has arrived", () => {
    const state = receiveControl(emptyLoop(), DIVERGENCE_TOPIC, wire(divergenceEvent()));
    expect(loopStatus(state, "receiving")).toBe("turning");
  });

  it("goes back to stopped when the broker is lost, whatever it had received", () => {
    const state = receiveControl(emptyLoop(), DIVERGENCE_TOPIC, wire(divergenceEvent()));
    expect(loopStatus(state, "not-connected")).toBe("stopped-disconnected");
  });

  it("stays idle rather than turning when all it has heard is cadence", () => {
    const state = receiveControl(emptyLoop(), HEARTBEAT_TOPIC, wire(heartbeat()));
    expect(loopStatus(state, "receiving")).toBe("idle-connected");
  });

  it("gives each state its own words, so the two idle-looking ones cannot be confused", () => {
    const stopped = LOOP_STATUS_WORDS["stopped-disconnected"];
    const idle = LOOP_STATUS_WORDS["idle-connected"];
    const turning = LOOP_STATUS_WORDS.turning;
    for (const words of [stopped, idle, turning]) {
      expect(words.label.length).toBeGreaterThan(5);
      expect(words.detail.length).toBeGreaterThan(30);
    }
    expect(new Set([stopped.label, idle.label, turning.label]).size).toBe(3);
    expect(new Set([stopped.glyph, idle.glyph, turning.glyph]).size).toBe(3);
    expect(stopped.detail).toMatch(/not|cannot|lost/i);
  });
});
