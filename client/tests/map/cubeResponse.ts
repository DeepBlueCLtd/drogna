/**
 * A CoverageJSON cube response, built here so a reader can be tested against one.
 *
 * Constructed input to a pure reader, which FR-023 permits explicitly and which
 * `no-mock.test.ts` excludes the test directory from the scan for: what must not exist is a
 * path in the *built client* that draws from anything but a fetched response, and there is
 * none. This is the response's shape, written once, so a test that cares about one field of
 * it does not have to spell the other four.
 *
 * The shape follows `query/plugins/coveragejson.py`'s `grid_coverage` exactly — axes `x`,
 * `y`, `z` and `t`, ranges declaring `axisNames` of `t, z, y, x` — because a reader tested
 * against a shape the server does not produce is a reader that has been tested against
 * nothing.
 */

export interface CubeShape {
  readonly longitudes?: readonly number[];
  readonly latitudes?: readonly number[];
  readonly depths?: readonly number[];
  readonly times?: readonly string[];
  readonly parameter?: string;
  readonly unit?: string;
  /** Values in `t, z, y, x` order. Built from the axes where none is given. */
  readonly values?: readonly (number | null)[];
}

export const CUBE_PARAMETER = "temperature_uncertainty";

export function cubeResponse(shape: CubeShape = {}): Record<string, unknown> {
  const longitudes = shape.longitudes ?? [-4, -3.5, -3];
  const latitudes = shape.latitudes ?? [49.5, 50, 50.5];
  const depths = shape.depths ?? [0, 100];
  const times = shape.times ?? ["2026-08-26T00:10:00.000000Z"];
  const parameter = shape.parameter ?? CUBE_PARAMETER;
  const count = times.length * depths.length * latitudes.length * longitudes.length;
  // Values that increase along the ordering, so a test that reads the wrong cell reads a
  // number that could not belong to the cell it asked for.
  const values =
    shape.values ?? Array.from({ length: count }, (_unused, index) => (index + 1) / 10);
  return {
    type: "Coverage",
    domain: {
      type: "Domain",
      domainType: "Grid",
      axes: {
        x: { values: [...longitudes] },
        y: { values: [...latitudes] },
        z: { values: [...depths] },
        t: { values: [...times] },
      },
    },
    parameters: {
      [parameter]: {
        type: "Parameter",
        unit: { symbol: shape.unit ?? "degree_C" },
      },
    },
    ranges: {
      [parameter]: {
        type: "NdArray",
        dataType: "float",
        axisNames: ["t", "z", "y", "x"],
        shape: [times.length, depths.length, latitudes.length, longitudes.length],
        values: [...values],
      },
    },
  };
}
