/**
 * The conditions at the moment of arrival, and not the conditions at the moment of asking.
 *
 * This is the distinction the trajectory query exists for, and it is the one that fails
 * silently. A route rendered against the current forecast field draws the same curve, in
 * the same place, with plausible numbers along it, and answers a different question. The
 * provider's own docstring says the same thing from the other end: losing the per-vertex
 * time does not raise, it produces "a provider quietly evaluating a whole route at one
 * time and returning HTTP 200 with values that look entirely reasonable".
 *
 * So this file catches it from three directions, because one is not enough.
 *
 * 1. **The question asked.** The `coords` parameter must carry one *distinct* M ordinate
 *    per vertex, each equal to that vertex's published arrival instant. A request whose M
 *    ordinates are all the instant of asking is the bug, written down.
 * 2. **The answer read.** The response is built so that the value at the moment of asking
 *    differs from the value at every arrival. A display reading the wrong row gets a
 *    number that is wrong and would look fine.
 * 3. **The refusal.** A response that answered the whole route at one instant is refused
 *    rather than drawn, because a route claiming to show conditions at arrival while
 *    showing conditions now is worse than a route showing nothing.
 *
 * FR-027 is here too: a vertex outside the forecast's range says there is no forecast for
 * that moment, rather than substituting the nearest field.
 */
import { describe, expect, it } from "vitest";

import { routeDisplay } from "../../src/route/RouteLayer";
import { conditionsAtArrival, noConditionsWords, readTrajectory, trajectoryCoords, trajectoryRequest, VERTEX_TIME_ENCODING } from "../../src/route/trajectoryQuery";
import type { TrajectoryResult } from "../../src/route/trajectoryQuery";

import { samplingRecommendation } from "../control";

const ROUTE = routeDisplay(samplingRecommendation());
const PARAMETER = "sea_water_temperature";

/** The instant a careless implementation would use for the whole route. */
const THE_MOMENT_OF_ASKING = "2026-08-26T00:15:00.000000Z";
const VALUE_AT_ASKING = 11.5;

/** A value that could only have come from that vertex's own arrival instant. */
function valueAtArrival(sequence: number): number {
  return 20 + sequence;
}

/** A trajectory response of the shape `query/plugins/coveragejson.py` builds. */
function trajectoryResponse(options: { readonly atOneInstant?: boolean; readonly declineLast?: boolean } = {}) {
  const rows = ROUTE.vertices.map((vertex) => [
    options.atOneInstant === true ? THE_MOMENT_OF_ASKING : vertex.arrivalSimTime,
    vertex.longitude,
    vertex.latitude,
    vertex.depthM,
  ]);
  const values = ROUTE.vertices.map((vertex, sequence) => {
    if (options.declineLast === true && sequence === ROUTE.vertices.length - 1) {
      return null;
    }
    void vertex;
    return options.atOneInstant === true ? VALUE_AT_ASKING : valueAtArrival(sequence);
  });
  const document: Record<string, unknown> = {
    type: "Coverage",
    domain: {
      type: "Domain",
      domainType: "Trajectory",
      axes: { composite: { dataType: "tuple", coordinates: ["t", "x", "y", "z"], values: rows } },
    },
    parameters: { [PARAMETER]: { type: "Parameter" } },
    ranges: {
      [PARAMETER]: { type: "NdArray", dataType: "float", axisNames: ["composite"], shape: [rows.length], values },
    },
    "drogna:declined": options.declineLast === true
      ? [{ vertex: ROUTE.vertices.length - 1, reason: "beyond the forecast's valid time" }]
      : [],
  };
  return document;
}

function read(document: unknown): TrajectoryResult {
  const outcome = readTrajectory(document);
  if (!outcome.ok) {
    throw new Error(outcome.reason);
  }
  return outcome;
}

describe("the question the client asks", () => {
  it("carries one M ordinate per vertex, each the vertex's own arrival instant", () => {
    const coords = trajectoryCoords(ROUTE.vertices);
    expect(coords).not.toBeNull();
    const points = /LINESTRING ZM \((.*)\)$/.exec(coords ?? "")?.[1]?.split(", ") ?? [];
    expect(points).toHaveLength(ROUTE.vertices.length);
    const ordinates = points.map((point) => Number(point.split(" ")[3]));
    for (const [index, vertex] of ROUTE.vertices.entries()) {
      expect(ordinates[index], `vertex ${index}`).toBe(Date.parse(vertex.arrivalSimTime) / 1000);
    }
  });

  it("carries a different instant for every vertex, which is what makes it a trajectory", () => {
    // The bug, written down. A route asked for at one instant would produce a set of one.
    const coords = trajectoryCoords(ROUTE.vertices) ?? "";
    const ordinates = (/LINESTRING ZM \((.*)\)$/.exec(coords)?.[1] ?? "")
      .split(", ")
      .map((point) => point.split(" ")[3]);
    expect(new Set(ordinates).size).toBe(ROUTE.vertices.length);
    expect(ordinates).not.toContain(String(Date.parse(THE_MOMENT_OF_ASKING) / 1000));
  });

  it("turns depth into elevation exactly once, at the sign the provider expects", () => {
    const coords = trajectoryCoords(ROUTE.vertices) ?? "";
    const elevations = (/LINESTRING ZM \((.*)\)$/.exec(coords)?.[1] ?? "")
      .split(", ")
      .map((point) => Number(point.split(" ")[2]));
    for (const [index, vertex] of ROUTE.vertices.entries()) {
      expect(elevations[index], `vertex ${index}`).toBe(-vertex.depthM);
    }
  });

  it("agrees with the provider about what M means", () => {
    expect(VERTEX_TIME_ENCODING).toBe("seconds since 1970-01-01T00:00:00Z");
  });

  it("asks at the location the configuration named, and names the parameters wanted", () => {
    const request = trajectoryRequest("http://query.invalid/collections/forecast/trajectory", ROUTE.vertices, [PARAMETER]);
    expect(request?.url.startsWith("http://query.invalid/collections/forecast/trajectory?")).toBe(true);
    expect(request?.url).toContain("parameter-name=sea_water_temperature");
    expect(request?.url).toContain("coords=");
  });

  it("refuses to ask at all rather than sending a route with a gap in its times", () => {
    const broken = ROUTE.vertices.map((vertex, index) =>
      index === 1 ? { ...vertex, arrivalSimTime: "no such instant" } : vertex,
    );
    expect(trajectoryCoords(broken)).toBeNull();
    expect(trajectoryRequest("http://query.invalid/x", broken, [PARAMETER])).toBeNull();
  });

  it("refuses a route of fewer than two vertices, which is not a trajectory", () => {
    expect(trajectoryCoords(ROUTE.vertices.slice(0, 1))).toBeNull();
    expect(trajectoryCoords([])).toBeNull();
  });
});

describe("the answer the client shows", () => {
  const result = read(trajectoryResponse());

  it("shows, for each vertex, the value the response gave for that vertex's arrival", () => {
    for (const vertex of ROUTE.vertices) {
      const answered = conditionsAtArrival(result, vertex);
      expect(answered, `vertex ${vertex.sequence}`).not.toBeNull();
      expect(answered?.forSimTime, `vertex ${vertex.sequence}`).toBe(vertex.arrivalSimTime);
      expect(answered?.values[PARAMETER], `vertex ${vertex.sequence}`).toBe(valueAtArrival(vertex.sequence));
    }
  });

  it("shows a different value at each vertex, because each is a different moment", () => {
    const shown = ROUTE.vertices.map((vertex) => conditionsAtArrival(result, vertex)?.values[PARAMETER]);
    expect(new Set(shown).size).toBe(ROUTE.vertices.length);
    expect(shown).not.toContain(VALUE_AT_ASKING);
  });

  it("carries each vertex's own position and depth back with its conditions", () => {
    for (const vertex of ROUTE.vertices) {
      const answered = conditionsAtArrival(result, vertex);
      expect(answered?.latitude).toBe(vertex.latitude);
      expect(answered?.longitude).toBe(vertex.longitude);
      expect(answered?.depthM).toBe(vertex.depthM);
    }
  });

  it("names the parameters the response carried", () => {
    expect(result.parameters).toEqual([PARAMETER]);
  });
});

describe("a response that answered the whole route at one instant", () => {
  const atOneInstant = read(trajectoryResponse({ atOneInstant: true }));

  it("is refused rather than drawn against the arrival times it does not describe", () => {
    // This is the failure the M ordinate exists to prevent, and the one that returns HTTP
    // 200 with reasonable-looking values. Every vertex is refused, including the ones
    // whose numbers would have looked entirely fine.
    for (const vertex of ROUTE.vertices) {
      expect(conditionsAtArrival(atOneInstant, vertex), `vertex ${vertex.sequence}`).toBeNull();
    }
  });

  it("says there is no forecast for that moment, rather than showing the nearest field", () => {
    const words = noConditionsWords(ROUTE.vertices[1]!, null);
    expect(words).toContain("There is no forecast for");
    expect(words).toContain(ROUTE.vertices[1]!.arrivalSimTime);
    expect(words).toContain("not shown in its place");
  });

  it("would have shown a wrong-and-plausible number if the check were dropped", () => {
    // Guarding the guard: the response really does carry values, so the test above is
    // refusing something rather than finding an empty response.
    expect(atOneInstant.conditions[1]?.values[PARAMETER]).toBe(VALUE_AT_ASKING);
    expect(atOneInstant.conditions[1]?.forSimTime).toBe(THE_MOMENT_OF_ASKING);
  });
});

describe("a vertex outside the forecast's range", () => {
  const declined = read(trajectoryResponse({ declineLast: true }));
  const last = ROUTE.vertices[ROUTE.vertices.length - 1]!;

  it("is reported as declined with the reason, and its value is null", () => {
    const answered = conditionsAtArrival(declined, last);
    expect(answered?.declined).toBe(true);
    expect(answered?.declinedReason).toContain("beyond the forecast");
    expect(answered?.values[PARAMETER]).toBeNull();
  });

  it("says so in words rather than substituting a field that describes another moment", () => {
    const words = noConditionsWords(last, conditionsAtArrival(declined, last));
    expect(words).toContain("Nothing is extrapolated");
    expect(words).toContain(last.arrivalSimTime);
  });

  it("leaves the vertices inside the range answered", () => {
    expect(conditionsAtArrival(declined, ROUTE.vertices[0]!)?.declined).toBe(false);
  });
});

describe("a response that cannot be read", () => {
  it("is reported as unreadable rather than rendered as an empty route", () => {
    expect(readTrajectory(null).ok).toBe(false);
    expect(readTrajectory({ domain: {} }).ok).toBe(false);
    const outcome = readTrajectory({ domain: {} });
    expect(outcome.ok === false ? outcome.reason : "").toContain("composite axis");
  });
});
