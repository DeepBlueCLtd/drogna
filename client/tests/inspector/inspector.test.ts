/**
 * The message that just passed, read in full and against its contract.
 *
 * FR-004 asks for four things on any boundary that has carried traffic: the topic, the
 * full payload, the simulation time the message carried, and the name of the schema it
 * validates against. FR-005 adds the case that is easiest to get wrong — a payload the
 * schema refuses is shown as received and marked invalid with the error, never hidden and
 * never dressed as valid.
 *
 * The third outcome is the one this client needs and the requirement does not name.
 * Where no master governs a topic, saying "valid" would assert a check that never
 * happened, which is the same class of error as lighting a component nothing was heard
 * from. So there is an `unvalidated` state, and this test holds it apart from the other
 * two.
 */
import { describe, expect, it } from "vitest";

import { CONTROL_SCHEMAS, schemaTitle } from "../../src/contracts/schemas";
import { messageOn, emptyLoop, receiveControl } from "../../src/data/controlSubscription";
import { CLOCK_TOPIC, DIVERGENCE_TOPIC, HEARTBEAT_TOPIC, PLAN_TOPIC, RUN_PUBLISHED_TOPIC, RUN_REQUEST_TOPIC, RUN_STARTED_TOPIC, TELEMETRY_TOPIC } from "../../src/data/topics";
import { inspect, schemaFor, schemaNameFor, UNGOVERNED_TOPICS, VALIDATION_WORDS } from "../../src/inspector/validation";
import { boundaryId } from "../../src/legibility/classification";

import { divergenceEvent, runPublished, runRequest, runStarted, wire } from "../control";
import { clockSample, heartbeat } from "../heartbeats";

describe("a message the contract accepts", () => {
  it("shows topic, full payload, carried simulation time and schema name", () => {
    const event = divergenceEvent();
    const seen = inspect(DIVERGENCE_TOPIC, wire(event));
    expect(seen.topic).toBe(DIVERGENCE_TOPIC);
    expect(seen.validation).toBe("valid");
    expect(seen.simTime).toBe(event.sim_time);
    expect(seen.tick).toBe(event.tick);
    expect(seen.schemaName).toBe(schemaTitle(CONTROL_SCHEMAS.divergence.schema));
    expect(JSON.parse(seen.payload ?? "{}")).toEqual(event);
  });

  it("shows the whole payload, not a summary of it", () => {
    const seen = inspect(RUN_REQUEST_TOPIC, wire(runRequest()));
    expect(seen.payload).toContain("ensemble_size");
    expect(seen.payload).toContain("sound_speed_equation");
  });

  it("finds the run identifier under either of the two names the contracts use", () => {
    expect(inspect(DIVERGENCE_TOPIC, wire(divergenceEvent())).runId).toBe("run-0007");
    expect(inspect(RUN_STARTED_TOPIC, wire(runStarted())).runId).toBe("run-0007");
    expect(inspect(RUN_PUBLISHED_TOPIC, wire(runPublished())).runId).toBe("run-0007");
  });

  it("carries no detail when there is nothing wrong to report", () => {
    expect(inspect(HEARTBEAT_TOPIC, wire(heartbeat())).detail).toBeNull();
    expect(inspect(CLOCK_TOPIC, wire(clockSample())).validation).toBe("valid");
  });
});

describe("a message the contract refuses", () => {
  it("is shown as received and marked invalid, with the reason", () => {
    const seen = inspect(RUN_STARTED_TOPIC, wire({ component: "model_runner", tick: 1 }));
    expect(seen.validation).toBe("invalid");
    expect(seen.detail).not.toBeNull();
    expect(seen.detail?.length).toBeGreaterThan(0);
    expect(seen.payload).toContain("model_runner");
    expect(seen.raw).toContain("model_runner");
  });

  it("is not hidden: the raw bytes survive even when nothing could be made of them", () => {
    const seen = inspect(DIVERGENCE_TOPIC, "this is not JSON at all");
    expect(seen.validation).toBe("invalid");
    expect(seen.raw).toBe("this is not JSON at all");
    expect(seen.payload).toBeNull();
    expect(seen.detail).toContain("not JSON");
  });

  it("still names the schema that refused it", () => {
    const seen = inspect(RUN_PUBLISHED_TOPIC, wire({ nonsense: true }));
    expect(seen.schemaName).toBe(schemaTitle(CONTROL_SCHEMAS.runPublished.schema));
  });
});

describe("a message no master in this build governs", () => {
  it("is shown as received and is not claimed to have passed anything", () => {
    const seen = inspect("ctl/a-topic-no-master-describes", wire({ anything: 1 }));
    expect(seen.validation).toBe("unvalidated");
    expect(seen.schemaName).toBeNull();
    expect(seen.detail).toContain("no schema");
    expect(seen.payload).toContain("anything");
  });

  it("governs every topic the client actually subscribes to", () => {
    // FR-019 wants the contract shown beside every instance, and the list below is
    // computed from the subscription rather than written out, so a topic added to the
    // subscription with no master behind it fails here instead of quietly rendering as
    // unvalidated.
    expect(UNGOVERNED_TOPICS).toEqual([]);
    const governed = [HEARTBEAT_TOPIC, CLOCK_TOPIC, DIVERGENCE_TOPIC, RUN_REQUEST_TOPIC, RUN_STARTED_TOPIC, RUN_PUBLISHED_TOPIC, PLAN_TOPIC, TELEMETRY_TOPIC];
    for (const topic of governed) {
      expect(schemaNameFor(topic), topic).not.toBeNull();
      expect(schemaFor(topic), topic).not.toBeNull();
    }
  });
});

describe("the words and marks the inspector uses", () => {
  it("carries a word and a mark for each outcome, so greyscale survives", () => {
    for (const state of ["valid", "invalid", "unvalidated"] as const) {
      expect(VALIDATION_WORDS[state].label.length, state).toBeGreaterThan(10);
      expect(VALIDATION_WORDS[state].glyph.length, state).toBeGreaterThan(0);
    }
    const glyphs = Object.values(VALIDATION_WORDS).map((words) => words.glyph);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });
});

describe("the inspector reached through a boundary", () => {
  it("reads the most recent message that crossed it, in full", () => {
    let state = receiveControl(emptyLoop(), DIVERGENCE_TOPIC, wire(divergenceEvent()));
    state = receiveControl(state, RUN_REQUEST_TOPIC, wire(runRequest()));
    const held = messageOn(state, boundaryId("scheduler", "model_runner"));
    expect(held).not.toBeNull();
    const seen = inspect(held!.topic, held!.payload);
    expect(seen.topic).toBe(RUN_REQUEST_TOPIC);
    expect(seen.validation).toBe("valid");
    expect(seen.schemaName).not.toBeNull();
  });
});
