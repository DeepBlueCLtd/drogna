/**
 * What the page actually draws, read back out of the markup.
 *
 * The reducer tests hold the arithmetic; this holds the picture. Three properties are
 * worth reading out of rendered output rather than out of state: that a transit appears
 * on the boundary its message crossed and on no other, that the active phase is
 * distinguished from the phases that are merely reached, and that the inspector shows the
 * payload beside the schema that governs it.
 *
 * The rate-zero property is here too. With the progress fraction held — which is what a
 * pinned clock does to it — two renders of the same state produce identical bytes, which
 * is SC-009 asserted rather than assumed.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { drawFrame, emptyLoop, loopStatus, messageOn, receiveControl } from "../../src/data/controlSubscription";
import { DIVERGENCE_TOPIC, PLAN_TOPIC, RUN_REQUEST_TOPIC } from "../../src/data/topics";
import { MessageInspector } from "../../src/inspector/MessageInspector";
import { boundaryId } from "../../src/legibility/classification";
import { CycleView } from "../../src/loop/CycleView";

import { divergenceEvent, runRequest, wire } from "../control";

function loopAfter(topics: readonly (readonly [string, unknown])[]) {
  let state = emptyLoop();
  for (const [topic, message] of topics) {
    state = receiveControl(state, topic, wire(message));
  }
  return drawFrame(state);
}

const SENSED = loopAfter([[DIVERGENCE_TOPIC, divergenceEvent()]]);

describe("the cycle as drawn", () => {
  it("distinguishes the active phase from the ones not reached", () => {
    const markup = renderToStaticMarkup(<CycleView loop={SENSED} status="turning" progress={0.5} />);
    expect(markup).toContain('data-testid="cycle-phase-sense" data-phase-state="active"');
    expect(markup).toContain('data-testid="cycle-phase-decide" data-phase-state="not-reached"');
  });

  it("says which of the three statuses it is in, in words as well as a mark", () => {
    for (const status of ["stopped-disconnected", "idle-connected", "turning"] as const) {
      const markup = renderToStaticMarkup(<CycleView loop={emptyLoop()} status={status} progress={0} />);
      expect(markup).toContain(`data-loop-status="${status}"`);
    }
  });

  it("draws one transit per message, on the boundary its topic crosses", () => {
    const state = loopAfter([
      [DIVERGENCE_TOPIC, divergenceEvent()],
      [RUN_REQUEST_TOPIC, runRequest()],
    ]);
    const markup = renderToStaticMarkup(<CycleView loop={state} status="turning" progress={0.25} />);
    expect(markup).toContain(`data-testid="transit-${boundaryId("monitor", "scheduler")}"`);
    expect(markup).toContain(`data-testid="transit-${boundaryId("scheduler", "model_runner")}"`);
    expect(markup).not.toContain(`data-testid="transit-${boundaryId("ingest", "observation_store")}"`);
  });

  it("draws no transit at all when nothing has arrived", () => {
    const markup = renderToStaticMarkup(<CycleView loop={emptyLoop()} status="idle-connected" progress={0} />);
    expect(markup).not.toContain("<g class=\"transit");
    expect(markup).toContain("<svg class=\"transits\"");
  });

  it("moves the mark along the boundary as the progress fraction moves, and only then", () => {
    const early = renderToStaticMarkup(<CycleView loop={SENSED} status="turning" progress={0} />);
    const late = renderToStaticMarkup(<CycleView loop={SENSED} status="turning" progress={1} />);
    expect(early).not.toBe(late);
  });

  it("renders identically twice from the same state and the same held fraction", () => {
    // SC-009: with the rate pinned the fraction does not move, and two captures of the
    // same state are the same bytes.
    const first = renderToStaticMarkup(<CycleView loop={SENSED} status="turning" progress={0.4} />);
    const second = renderToStaticMarkup(<CycleView loop={SENSED} status="turning" progress={0.4} />);
    expect(first).toBe(second);
  });

  it("carries the coalesced count into the drawing when a burst was folded", () => {
    let state = emptyLoop(64, 4);
    for (let index = 0; index < 12; index += 1) {
      state = receiveControl(state, DIVERGENCE_TOPIC, wire(divergenceEvent()));
    }
    const markup = renderToStaticMarkup(<CycleView loop={drawFrame(state)} status="turning" progress={0.5} />);
    expect(markup).toContain('data-count="12"');
    expect(markup).toContain("12 messages, drawn as one");
  });

  it("says the loop is stopped rather than quiet when the broker is gone", () => {
    const status = loopStatus(SENSED, "not-connected");
    const markup = renderToStaticMarkup(<CycleView loop={SENSED} status={status} progress={0} />);
    expect(markup).toContain("stopped, and not connected");
    expect(markup).not.toContain("idle, and connected");
  });
});

describe("the inspector as drawn", () => {
  const boundary = boundaryId("monitor", "scheduler");

  it("shows topic, simulation time, schema name and the whole payload", () => {
    const markup = renderToStaticMarkup(
      <MessageInspector boundary={boundary} message={messageOn(SENSED, boundary)} />,
    );
    expect(markup).toContain(DIVERGENCE_TOPIC);
    expect(markup).toContain("2026-08-26T00:10:00.000000Z");
    expect(markup).toContain("divergence-0003");
    expect(markup).toContain('data-testid="inspected-schema-name"');
    expect(markup).toContain('data-validation="valid"');
  });

  it("shows the governing schema beside the instance", () => {
    const markup = renderToStaticMarkup(
      <MessageInspector boundary={boundary} message={messageOn(SENSED, boundary)} />,
    );
    expect(markup).toContain('data-testid="schema-panel" data-governed="true"');
    expect(markup).toContain("$schema");
  });

  it("marks a refused payload as refused and shows it anyway", () => {
    const state = loopAfter([[RUN_REQUEST_TOPIC, { component: "scheduler" }]]);
    const edge = boundaryId("scheduler", "model_runner");
    const markup = renderToStaticMarkup(<MessageInspector boundary={edge} message={messageOn(state, edge)} />);
    expect(markup).toContain('data-validation="invalid"');
    expect(markup).toContain("scheduler");
  });

  it("says a boundary carried nothing rather than showing an empty message", () => {
    const edge = boundaryId("ingest", "observation_store");
    const markup = renderToStaticMarkup(<MessageInspector boundary={edge} message={null} />);
    expect(markup).toContain('data-testid="inspector-empty"');
    expect(markup).toContain("No message has crossed this boundary");
  });

  it("carries the boundary's own classification and reason", () => {
    const markup = renderToStaticMarkup(
      <MessageInspector boundary={boundary} message={messageOn(SENSED, boundary)} />,
    );
    expect(markup).toContain('data-testid="boundary-classification" data-kind="bespoke"');
    expect(markup).toContain("divergence verdict");
  });

  it("shows a plan the planner's master refuses as refused, with its reason", () => {
    const state = loopAfter([[PLAN_TOPIC, { anything: true }]]);
    const edge = boundaryId("planner", "broker");
    const markup = renderToStaticMarkup(<MessageInspector boundary={edge} message={messageOn(state, edge)} />);
    expect(markup).toContain('data-validation="invalid"');
    expect(markup).toContain('data-governed="true"');
    expect(markup).toContain("sampling recommendation");
  });
});
