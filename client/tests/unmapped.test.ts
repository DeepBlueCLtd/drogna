/**
 * A live component is never hidden.
 *
 * A heartbeat whose component id is not in the drawing is the most interesting message
 * this page can receive: something is running that the picture does not account for.
 * Dropping it would be the display tidying away a genuinely live component, which is the
 * failure Constitution VII exists to prevent, pointing the other way.
 */
import { describe, expect, it } from "vitest";

import { COMPONENTS } from "../src/layout/components";
import { interpret } from "../src/liveness/ingest";
import { emptyLiveness, receive } from "../src/liveness/reducer";
import { describeShell } from "../src/liveness/view";
import { emptyClock } from "../src/transport/clock";

import { heartbeat, HEARING_CONNECTED, TOLERANCES } from "./heartbeats";

function shellAfter(components: readonly string[], now: number) {
  let liveness = emptyLiveness;
  for (const component of components) {
    const interpretation = interpret(heartbeat({ component }), 1000, TOLERANCES);
    if (!interpretation.accepted) {
      throw new Error(interpretation.reason);
    }
    liveness = receive(liveness, interpretation.evidence);
  }
  return describeShell({
    liveness,
    clockState: emptyClock,
    connection: "receiving",
    now,
    hearing: HEARING_CONNECTED,
    clockStaleAfterSeconds: 10,
  });
}

describe("a component id the layout does not know", () => {
  it("appears as an unmapped live component rather than being dropped", () => {
    const view = shellAfter(["weather_oracle"], 1000);
    expect(view.unmapped.map((entry) => entry.componentId)).toEqual(["weather_oracle"]);
    expect(view.unmapped[0]?.illumination).toBe("lit");
  });

  it("does not appear in the drawing, because the drawing has no box for it", () => {
    const view = shellAfter(["weather_oracle"], 1000);
    expect(view.nodes.map((node) => node.componentId)).toEqual(COMPONENTS.map((node) => node.id));
  });

  it("goes quiet like anything else once its window has passed", () => {
    const view = shellAfter(["weather_oracle"], 1000 + 60_000);
    expect(view.unmapped[0]?.illumination).toBe("dark");
  });

  it("leaves the unmapped region empty when everything heard from has a box", () => {
    expect(shellAfter(["clock"], 1000).unmapped).toEqual([]);
  });
});
