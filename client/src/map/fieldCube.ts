/**
 * A CoverageJSON cube, read into the shape the map draws from.
 *
 * The response is the same boundary `trajectoryQuery.readTrajectory` reads and gets the
 * same treatment: read defensively into the client's own vocabulary, refuse with a reason
 * rather than construct something plausible out of a document that did not say what was
 * expected. There is no generated type for it, because there is no master for it — the
 * query layer emits CoverageJSON, which is a standard rather than a contract this
 * repository declares, and Constitution III's rule is about shapes drogna defines.
 *
 * The domain is a Grid: axes `x`, `y`, `z` and `t`, with each range's values in
 * `t, z, y, x` order. That order is not guessed; the response declares it in the range's
 * `axisNames`, and this module reads that declaration rather than assuming it — a provider
 * that reordered its axes would otherwise produce a map that was silently transposed, and a
 * transposed field of plausible numbers is the exact failure this repository keeps finding
 * in other forms.
 *
 * **A cell the response did not report refuses the whole slice.** The provider returns null
 * outside the run's domain, and this cube is asked for at the run's own announced bounds, so
 * a null here means the announcement and the store disagree about where the run is. Drawing
 * the reported nine tenths would be a field with holes in it presented as a field, and there
 * is no honest place to put the missing tenth: `FieldCell` carries a number, the
 * downsampling in feature 012 indexes positionally, and a shape that carried absence per
 * cell would have to be declared at the boundary before either could hold it. So the slice
 * is refused with the count, which is a statement a reader can act on, and the alternative —
 * a quietly incomplete field — is the one this repository has learnt to be most afraid of.
 */
import type { FieldGrid } from "../uncertainty/UncertaintyLayer";

/** One run's field as it was fetched: every depth, one instant, one parameter. */
export interface FieldCube {
  readonly runId: string;
  readonly collection: string;
  readonly parameter: string;
  /** The axes as the response declared them, in their own order. */
  readonly longitudes: readonly number[];
  readonly latitudes: readonly number[];
  /** Metres below the surface, positive downwards, as the coverage's convention has it. */
  readonly depths: readonly number[];
  readonly times: readonly string[];
  /** Values in `t, z, y, x` order, as many as the four axes imply. */
  readonly values: readonly (number | null)[];
  /** The parameter's unit, as the response labelled it, or null where it labelled none. */
  readonly unit: string | null;
}

export type CubeOutcome =
  | ({ readonly ok: true } & FieldCube)
  | { readonly ok: false; readonly reason: string };

function axisValues(axes: Record<string, unknown>, name: string): unknown[] | null {
  const axis = axes[name] as { values?: unknown } | undefined;
  return Array.isArray(axis?.values) ? axis.values : null;
}

function numbers(values: unknown[]): number[] | null {
  const found: number[] = [];
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }
    found.push(value);
  }
  return found;
}

function strings(values: unknown[]): string[] | null {
  const found: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") {
      return null;
    }
    found.push(value);
  }
  return found;
}

/** The axis order a range declares, so a transposed response is refused rather than drawn. */
const EXPECTED_AXIS_ORDER = ["t", "z", "y", "x"] as const;

/**
 * Read a cube response for one parameter.
 *
 * The run identifier, the collection and the parameter are the caller's, because they are
 * facts about the request rather than about the response: the response does not say which
 * run it belongs to, and a page that inferred one would be inventing provenance.
 */
export function readFieldCube(
  document: unknown,
  asked: { readonly runId: string; readonly collection: string; readonly parameter: string },
): CubeOutcome {
  if (typeof document !== "object" || document === null) {
    return { ok: false, reason: "the cube response was not an object" };
  }
  const record = document as Record<string, unknown>;
  const domain = record["domain"] as Record<string, unknown> | undefined;
  const axes = domain?.["axes"] as Record<string, unknown> | undefined;
  if (axes === undefined) {
    return { ok: false, reason: "the cube response carried no domain axes" };
  }
  const rawX = axisValues(axes, "x");
  const rawY = axisValues(axes, "y");
  const rawZ = axisValues(axes, "z");
  const rawT = axisValues(axes, "t");
  if (rawX === null || rawY === null || rawZ === null || rawT === null) {
    return {
      ok: false,
      reason:
        "the cube response did not carry all four axes — x, y, z and t — so there is no " +
        "grid to place values on",
    };
  }
  const longitudes = numbers(rawX);
  const latitudes = numbers(rawY);
  const depths = numbers(rawZ);
  const times = strings(rawT);
  if (longitudes === null || latitudes === null || depths === null || times === null) {
    return {
      ok: false,
      reason: "an axis of the cube response held something other than the values it declares",
    };
  }
  const ranges = record["ranges"] as Record<string, unknown> | undefined;
  const block = ranges?.[asked.parameter] as Record<string, unknown> | undefined;
  if (block === undefined) {
    const served = ranges === undefined ? "none" : Object.keys(ranges).join(", ");
    return {
      ok: false,
      reason: `the cube response carried no range for ${asked.parameter}; it carried ${served}`,
    };
  }
  const axisNames = block["axisNames"];
  if (
    !Array.isArray(axisNames) ||
    axisNames.length !== EXPECTED_AXIS_ORDER.length ||
    axisNames.some((name, index) => name !== EXPECTED_AXIS_ORDER[index])
  ) {
    return {
      ok: false,
      reason:
        `the range for ${asked.parameter} declares its axes as ` +
        `${JSON.stringify(axisNames)} and this reads ${JSON.stringify(EXPECTED_AXIS_ORDER)}. ` +
        "A field read in the wrong axis order draws plausible numbers in the wrong places, " +
        "so it is refused rather than transposed",
    };
  }
  const raw = block["values"];
  if (!Array.isArray(raw)) {
    return { ok: false, reason: `the range for ${asked.parameter} carried no values` };
  }
  const expected = times.length * depths.length * latitudes.length * longitudes.length;
  if (raw.length !== expected) {
    return {
      ok: false,
      reason:
        `the range for ${asked.parameter} holds ${raw.length} values and its four axes ` +
        `imply ${expected}. A grid whose values and axes disagree cannot be placed`,
    };
  }
  const values: (number | null)[] = raw.map((value) =>
    typeof value === "number" && Number.isFinite(value) ? value : null,
  );
  const unit = readUnit(record, asked.parameter);
  return {
    ok: true,
    runId: asked.runId,
    collection: asked.collection,
    parameter: asked.parameter,
    longitudes,
    latitudes,
    depths,
    times,
    values,
    unit,
  };
}

function readUnit(record: Record<string, unknown>, parameter: string): string | null {
  const parameters = record["parameters"] as Record<string, unknown> | undefined;
  const declared = parameters?.[parameter] as Record<string, unknown> | undefined;
  const unit = declared?.["unit"] as Record<string, unknown> | undefined;
  const symbol = unit?.["symbol"];
  return typeof symbol === "string" ? symbol : null;
}

/** Where one value sits in the `t, z, y, x` ordering. */
export function valueIndex(
  cube: FieldCube,
  timeIndex: number,
  depthIndex: number,
  latitudeIndex: number,
  longitudeIndex: number,
): number {
  const perDepth = cube.latitudes.length * cube.longitudes.length;
  const perTime = cube.depths.length * perDepth;
  return (
    timeIndex * perTime +
    depthIndex * perDepth +
    latitudeIndex * cube.longitudes.length +
    longitudeIndex
  );
}

/** How many cells the cube holds across every axis. */
export function cellCount(cube: FieldCube): number {
  return cube.times.length * cube.depths.length * cube.latitudes.length * cube.longitudes.length;
}

export type SliceOutcome =
  | { readonly ok: true; readonly grid: FieldGrid }
  | { readonly ok: false; readonly reason: string };

/**
 * One horizontal slice, in the shape feature 012's downsampling reads.
 *
 * Row-major over latitude then longitude, which is what `FieldGrid` documents and what
 * `drawnField` indexes with. The grid it returns is feature 012's own type, so the
 * stride, the stated resolution and the layer accessors are 012's behaviour unchanged —
 * this feature mounts that work rather than reimplementing it.
 */
export function sliceAt(cube: FieldCube, timeIndex: number, depthIndex: number): SliceOutcome {
  if (cube.times[timeIndex] === undefined || cube.depths[depthIndex] === undefined) {
    return {
      ok: false,
      reason:
        `this cube has ${cube.times.length} instants and ${cube.depths.length} depths, and ` +
        `neither has an entry at instant ${timeIndex}, depth ${depthIndex}`,
    };
  }
  const cells = [];
  let unreported = 0;
  for (let y = 0; y < cube.latitudes.length; y += 1) {
    for (let x = 0; x < cube.longitudes.length; x += 1) {
      const value = cube.values[valueIndex(cube, timeIndex, depthIndex, y, x)];
      if (value === null || value === undefined) {
        unreported += 1;
        continue;
      }
      cells.push({
        latitude: cube.latitudes[y] as number,
        longitude: cube.longitudes[x] as number,
        spread: value,
      });
    }
  }
  if (unreported > 0) {
    return {
      ok: false,
      reason:
        `the response reported no value for ${unreported} of ` +
        `${cube.latitudes.length * cube.longitudes.length} cells at ` +
        `${cube.depths[depthIndex]} m. This cube was asked for at the bounds the run itself ` +
        "announced, so a cell outside the run's domain means the announcement and the store " +
        "disagree about where the run is. The slice is not drawn: a field with holes in it, " +
        "drawn as a field, is the misstatement this refusal exists to prevent",
    };
  }
  return {
    ok: true,
    grid: {
      runId: cube.runId,
      cells,
      columns: cube.longitudes.length,
      rows: cube.latitudes.length,
    },
  };
}
