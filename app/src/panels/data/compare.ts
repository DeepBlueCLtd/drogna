/**
 * Truth against forecast, the pure half (feature 115, FR-70, T027 and T029).
 *
 * The question the Holdings tab can now answer, and a table never could: *was the
 * forecast any good?* Three coverages, at one instant and one depth, all three genuine
 * EDR area queries through the seam — the **instance**, the **now-cast holding covering
 * that instant** (the truth), and the **persistence reference**, the field held constant
 * from the instance's own initial step. The panel draws where the forecast was wrong and
 * by how much, with the persistence error beside it.
 *
 * Three rules govern this file and each of them is a thing that would otherwise go wrong:
 *
 * 1. **Constitution IX admits no forecast-skill claim without a persistence reference.**
 *    A picture of forecast error alone *is* such a claim — a reader looking at a field of
 *    small differences concludes the model is working, and cannot know that holding the
 *    initial field constant would have done as well. So there is no code path here that
 *    produces one difference. `compareFields` takes three coverages or refuses.
 * 2. **The instance is never compared against itself, nor against another forecast.**
 *    `counterpartFor` refuses by name in both cases, and in the common one: an instance
 *    still inside its validity, whose truth has not happened yet.
 *
 *    The specification asked for the second rule in a different form — *never against a
 *    now-cast published before the instant it forecasts* — and that form, applied to this
 *    harness, refuses everything. The environment generator authors a now-cast covering
 *    three hours from the instant it publishes; a forecast instance reaches forty-five
 *    minutes past its own. So the now-cast that covers an instance's last step was, in
 *    every case, published before that step. The requirement's *intent* is right and its
 *    test was wrong: what makes a document truth here is not when it was written but who
 *    wrote it. The environment generator is the world and can evaluate the true field at
 *    any instant, which is why its later steps are measurements rather than predictions;
 *    the model runner's are predictions. The manifest names its generator, so the rule is
 *    read off the document: **the truth's manifest must name a different generator from
 *    the instance's.** Recorded in `tasks.md` T027 rather than left as a silent
 *    divergence.
 * 3. **The shell derives; it does not invent** (ADR-0036). Everything here is arithmetic
 *    on documents that crossed the seam, and the caller shows the URLs they came from.
 *
 * Nothing here fetches, and nothing here reads a clock — the "now" it judges validity
 * against is the simulation instant the caller passes, taken from the clock component's
 * own samples.
 */
import type { CoverageHolding } from '../../generated/types.js';
import type { GridCoverage } from '../map/map-data.js';
import { displayInstant } from '../../shell/display.js';
import { coverageInterval, covers, simMillis, type CoverageInterval } from './interval.js';

/** What a comparison needs, once a counterpart has been found. */
export interface Counterpart {
  /** The instance being scored. */
  readonly instance: CoverageHolding;
  /** The now-cast holding whose time axis covers the chosen instant: the truth. */
  readonly truth: CoverageHolding;
  /** The instant the three queries are made at, in the wire form. */
  readonly atSimTime: string;
  /** The instance's own initial step, which the persistence reference is held at. */
  readonly persistenceSimTime: string;
  readonly interval: CoverageInterval;
  /**
   * The variable to difference: one both manifests declare. Chosen from the documents
   * rather than typed in, which is also what keeps a run's *uncertainty* instance out —
   * its manifest declares `temperature_spread`, which no now-cast carries, so it is
   * refused by name rather than by a guess about its identifier.
   */
  readonly parameter: string;
}

export type CounterpartResult = Counterpart | { readonly refusal: string };

/**
 * Stated positively rather than as `isRefusal`. The negative form reads better at the
 * call site and does not narrow: TypeScript removes a union member in the false branch
 * only by assignability, and a `Counterpart` is structurally free to be checked against
 * `{ refusal: string }` at every use. Watched failing to narrow before this was written.
 */
export function isCounterpart(result: CounterpartResult): result is Counterpart {
  return !('refusal' in result);
}

/**
 * Find what an instance can honestly be compared against, at the instance's own last
 * forecast step — the furthest out it reached, and so the one worth scoring.
 *
 * Every refusal names the thing refused rather than returning nothing, because "no
 * comparison is offered" and "no comparison is possible, and here is why" are different
 * statements and a reader is owed the second.
 */
export function counterpartFor(
  instance: CoverageHolding,
  holdings: readonly CoverageHolding[],
  nowSimTime: string | undefined,
): CounterpartResult {
  if (instance.era !== 'instance') {
    return { refusal: `${instance.holding_id} is a ${instance.era} holding, not a forecast instance: there is nothing to score` };
  }
  const interval = coverageInterval(instance.manifest.grid.time);
  if (!interval) {
    return { refusal: `${instance.holding_id}'s time axis could not be read, so the instant it forecasts is unknown` };
  }
  if (nowSimTime === undefined) {
    return { refusal: 'no clock sample has arrived yet, so whether this instance’s validity has elapsed is unknown' };
  }
  const nowMillis = simMillis(nowSimTime);
  if (!Number.isFinite(nowMillis)) {
    return { refusal: 'the clock sample could not be read, so whether this instance’s validity has elapsed is unknown' };
  }
  const atMillis = interval.endMillis;
  if (atMillis > nowMillis) {
    // The common case, and the one SC-05 plants: an instance still inside its validity
    // forecasts an instant the truth has not reached.
    return {
      refusal: `${instance.holding_id} forecasts ${displayInstant(interval.endSimTime)}, which the run has not reached: its validity has not elapsed and there is no truth to compare against yet`,
    };
  }

  const candidates = holdings.filter((holding) => holding.era === 'nowcast');
  if (candidates.length === 0) {
    return { refusal: 'the store holds no now-cast, so there is nothing to call the truth' };
  }
  // The now-cast whose own time axis covers the instant — and, where more than one does,
  // the one published latest, which is the one that saw the most of what happened.
  const covering = candidates
    .flatMap((holding) => {
      const its = coverageInterval(holding.manifest.grid.time);
      return its && covers(its, atMillis) ? [{ holding, its }] : [];
    })
    .sort((a, b) => simMillis(b.holding.published_at.sim_time) - simMillis(a.holding.published_at.sim_time));
  if (covering.length === 0) {
    return {
      refusal: `no now-cast holding covers ${displayInstant(interval.endSimTime)}: the truth for that instant has not been published, so there is nothing to compare against`,
    };
  }
  const truth = covering[0].holding;
  if (truth.holding_id === instance.holding_id) {
    return { refusal: 'the only holding covering that instant is the instance itself, and an instance is never scored against itself' };
  }
  // What makes a document truth is who wrote it, not when. See the note at the head of
  // this file: the environment generator is the world and evaluates the true field at any
  // instant; the model runner predicts. Comparing one forecast against another is not a
  // skill claim, whichever era the second one is filed under.
  if (truth.manifest.generator.name === instance.manifest.generator.name) {
    return {
      refusal: `${truth.holding_id} was produced by ${truth.manifest.generator.name}, the same generator as ${instance.holding_id} — comparing one forecast against another is not a skill claim`,
    };
  }
  const parameter = sharedParameter(instance, truth);
  if (!parameter) {
    return {
      refusal: `${instance.holding_id} declares ${names(instance).join(', ')} and ${truth.holding_id} declares ${names(truth).join(', ')}: they share no variable, so there is nothing to difference. A run's uncertainty field is refused here — the spread is doubt about a forecast, not a prediction of the ocean.`,
    };
  }
  return {
    instance,
    truth,
    atSimTime: interval.endSimTime,
    persistenceSimTime: interval.startSimTime,
    interval,
    parameter,
  };
}

function names(holding: CoverageHolding): string[] {
  return holding.manifest.variables.map((variable) => variable.name);
}

/**
 * A variable both manifests declare, preferring one with a CF standard name. The
 * preference is not cosmetic: a standard name is the vocabulary's own statement that two
 * documents mean the same quantity by the same word, and an incidental match on a
 * project-local name is exactly the coincidence it exists to rule out.
 */
function sharedParameter(instance: CoverageHolding, truth: CoverageHolding): string | undefined {
  const shared = instance.manifest.variables.filter((variable) =>
    truth.manifest.variables.some((other) => other.name === variable.name),
  );
  return (shared.find((variable) => variable.standard_name) ?? shared[0])?.name;
}

/** One cell of a difference field: where it is, and by how much the forecast was wrong. */
export interface DifferenceCell {
  readonly bounds: readonly [number, number, number, number];
  readonly value: number;
}

export interface DifferenceField {
  readonly cells: readonly DifferenceCell[];
  /** Root mean square of the differences: the one figure that summarises the field. */
  readonly rms: number;
  readonly minimum: number;
  readonly maximum: number;
}

export interface Comparison {
  readonly parameter: string;
  readonly unit?: string;
  readonly forecast: DifferenceField;
  readonly persistence: DifferenceField;
  /** The shared scale both fields are drawn on: the larger magnitude of the two. */
  readonly scale: number;
  /** Which is closer to the truth, and the sentence Principle IX asks for. */
  readonly verdict: string;
  readonly forecastIsCloser: boolean;
}

export type ComparisonResult = Comparison | { readonly refusal: string };

/**
 * The difference between three served coverages. The arithmetic is the whole of the
 * derivation, and it is here rather than in the panel so that it can be tested against
 * documents rather than against pixels.
 *
 * A shape mismatch is refused rather than broadcast over: two coverages of different
 * grids are two different questions, and subtracting them cell by cell would produce a
 * field that looked like an answer.
 */
export function compareFields(
  forecast: GridCoverage,
  truth: GridCoverage,
  persistence: GridCoverage,
  parameter: string,
): ComparisonResult {
  const ranges = [forecast, truth, persistence].map((coverage) => coverage.ranges?.[parameter]);
  if (ranges.some((range) => range === undefined)) {
    return { refusal: `one of the three coverages does not carry '${parameter}', so there is nothing to difference` };
  }
  const lons = forecast.domain.axes.x.values;
  const lats = forecast.domain.axes.y.values;
  const sizes = ranges.map((range) => range?.values.length ?? -1);
  if (new Set(sizes).size !== 1 || sizes[0] !== lons.length * lats.length) {
    return {
      refusal: `the three coverages disagree about their shape (${sizes.join(', ')} values against a ${lons.length}×${lats.length} grid): they answer different questions and differencing them would produce a field that looked like an answer`,
    };
  }
  for (const other of [truth, persistence]) {
    if (
      other.domain.axes.x.values.length !== lons.length ||
      other.domain.axes.y.values.length !== lats.length
    ) {
      return { refusal: 'the three coverages are on different grids, so they cannot be differenced cell by cell' };
    }
  }

  const truthValues = ranges[1]?.values ?? [];
  const field = (values: readonly number[]): DifferenceField => {
    const cells: DifferenceCell[] = [];
    let sumSquares = 0;
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    let counted = 0;
    for (let row = 0; row < lats.length; row++) {
      for (let column = 0; column < lons.length; column++) {
        const index = row * lons.length + column;
        const difference = values[index] - truthValues[index];
        if (!Number.isFinite(difference)) continue;
        cells.push({ bounds: cellBounds(lons, lats, column, row), value: difference });
        sumSquares += difference * difference;
        counted += 1;
        minimum = Math.min(minimum, difference);
        maximum = Math.max(maximum, difference);
      }
    }
    return {
      cells,
      rms: counted === 0 ? Number.NaN : Math.sqrt(sumSquares / counted),
      minimum: counted === 0 ? Number.NaN : minimum,
      maximum: counted === 0 ? Number.NaN : maximum,
    };
  };

  const forecastField = field(ranges[0]?.values ?? []);
  const persistenceField = field(ranges[2]?.values ?? []);
  if (!Number.isFinite(forecastField.rms) || !Number.isFinite(persistenceField.rms)) {
    return { refusal: 'the served coverages carried no finite values at this instant and depth, so no difference could be taken' };
  }
  const scale = Math.max(
    Math.abs(forecastField.minimum),
    Math.abs(forecastField.maximum),
    Math.abs(persistenceField.minimum),
    Math.abs(persistenceField.maximum),
  );
  const forecastIsCloser = forecastField.rms < persistenceField.rms;
  return {
    parameter,
    unit: forecast.parameters?.[parameter]?.unit?.symbol,
    forecast: forecastField,
    persistence: persistenceField,
    scale: scale > 0 ? scale : 1,
    forecastIsCloser,
    // Principle IX's own words where they are the honest ones. A display that only ever
    // congratulated the model would be the one thing this harness exists not to be.
    verdict: forecastIsCloser
      ? `The forecast is closer to the truth than persistence at this instant and depth: ${format(forecastField.rms)} against ${format(persistenceField.rms)} RMS.`
      : `Persistence is closer to the truth than the forecast at this instant and depth: ${format(persistenceField.rms)} against ${format(forecastField.rms)} RMS. The model is not earning its compute here.`,
  };
}

/** As `isCounterpart`, and for the same reason: the positive form is the one that narrows. */
export function isComparison(result: ComparisonResult): result is Comparison {
  return !('refusal' in result);
}

export function format(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(3);
}

/**
 * A cell's bounds from the axis values it sits between, half a step each way — the same
 * construction `map-data.ts` has used since feature 109, and for the same reason: a
 * coverage states cell centres, and a display has to draw areas.
 */
function cellBounds(
  lons: readonly number[],
  lats: readonly number[],
  column: number,
  row: number,
): [number, number, number, number] {
  const halfLon = Math.abs((lons[1] ?? lons[0] + 1) - lons[0]) / 2;
  const halfLat = Math.abs((lats[1] ?? lats[0] + 1) - lats[0]) / 2;
  return [
    lons[column] - halfLon,
    lats[row] - halfLat,
    lons[column] + halfLon,
    lats[row] + halfLat,
  ];
}
