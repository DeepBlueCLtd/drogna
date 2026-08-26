/**
 * The generated TypeScript types describe the messages that actually arrive.
 *
 * `tsc --noEmit` already proves the generated modules compile; what it cannot prove on its
 * own is that they describe anything real. So the recorded messages beside this file —
 * produced by `harness_core` and recorded verbatim, as `recorded.test.ts` explains — are
 * assigned to the generated types here. A field renamed in `contracts/schemas/` and
 * regenerated makes this file stop compiling, which is the point: the failure arrives at
 * the boundary rather than at run time in a browser.
 *
 * These are type assertions with a couple of value assertions to keep vitest honest about
 * having run them. The generated types carry no run-time value to test, by design.
 */
import { describe, expect, it } from "vitest";

import type { DrognaSimulationTimeSample } from "../src/generated/messages/clock";
import type { DrognaComponentHeartbeat } from "../src/generated/messages/heartbeat";
import type { DrognaSimulationTimeSample as SnapshotResponse } from "../src/generated/http/harness";

import recordedHeartbeat from "./recorded-heartbeat.json";
import recordedSample from "./recorded-clock-sample.json";

describe("the generated message types", () => {
  it("describes a recorded clock sample", () => {
    const sample: DrognaSimulationTimeSample = recordedSample as DrognaSimulationTimeSample;

    expect(sample.run_id).toBe("run-20260826-0001");
    expect(sample.tick).toBe(42);
    expect(sample.mode).toBe("accelerated");
  });

  it("describes a recorded heartbeat, including the fields the sender may omit", () => {
    const beat: DrognaComponentHeartbeat = recordedHeartbeat as DrognaComponentHeartbeat;

    expect(beat.component).toBe("clock");
    expect(beat.heartbeat_interval_seconds).toBeUndefined();
  });

  it("gives the HTTP surface the same type as the broker payload, not a second one", () => {
    // The alias is the whole point of the OpenAPI half of the chain: one shape, declared
    // once in contracts/schemas, referenced from the OpenAPI document, aliased here.
    const sample: SnapshotResponse = recordedSample as DrognaSimulationTimeSample;
    const alsoASample: DrognaSimulationTimeSample = sample;

    expect(alsoASample.sim_time).toBe(sample.sim_time);
  });

  it("refuses a mode the schema does not allow", () => {
    // @ts-expect-error "sideways" is not one of the modes the master enumerates.
    const wrong: DrognaSimulationTimeSample["mode"] = "sideways";

    expect(wrong).toBe("sideways");
  });
});
