/**
 * The messages the other tests build are messages the contracts accept.
 *
 * Without this, a drifted master weakens every test that constructs a control message:
 * the reducer under test would go on folding a payload nothing would accept on the wire,
 * and the suite would stay green while the client stopped working. So each builder is put
 * through the client's own compiled validator here, once, and every other test can build
 * on them.
 */
import { describe, expect, it } from "vitest";

import { CONTROL_SCHEMAS, rejectionReason } from "../src/contracts/schemas";

import { divergenceEvent, emptyRecommendation, forecastSkill, runPublished, runRequest, runStarted, samplingRecommendation } from "./control";
import { clockSample, heartbeat } from "./heartbeats";

const CASES = [
  ["heartbeat", CONTROL_SCHEMAS.heartbeat, heartbeat()],
  ["clock sample", CONTROL_SCHEMAS.clock, clockSample()],
  ["divergence", CONTROL_SCHEMAS.divergence, divergenceEvent()],
  ["run request", CONTROL_SCHEMAS.runRequest, runRequest()],
  ["run started", CONTROL_SCHEMAS.runStarted, runStarted()],
  ["run published", CONTROL_SCHEMAS.runPublished, runPublished()],
  ["sampling recommendation", CONTROL_SCHEMAS.plan, samplingRecommendation()],
  ["empty recommendation", CONTROL_SCHEMAS.plan, emptyRecommendation()],
  ["forecast skill", CONTROL_SCHEMAS.telemetry, forecastSkill()],
] as const;

describe("the messages these tests build", () => {
  for (const [name, governing, message] of CASES) {
    it(`is a ${name} its master accepts`, () => {
      const accepted = governing.validate(message);
      expect(accepted, `${name}: ${rejectionReason(governing.validate)}`).toBe(true);
    });
  }
});
