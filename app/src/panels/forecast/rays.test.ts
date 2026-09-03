/**
 * Feature 124: the ray arithmetic, on its own.
 *
 * The document these build is a served document's shape, not a fixture standing in for the
 * ocean: what is asserted here is what `raysFor` does to numbers, and the numbers themselves
 * are checked against a running loop in `forecast.test.tsx` (SC-001, AT-07), where they come
 * from the analyst rather than from this file.
 */
import { describe, expect, it } from 'vitest';
import type { AnalysisContributions, AnalysisContributionsSource } from '../../generated/types.js';
import { backgroundRaysIn, contributionResidual, raysFor, sourceLabels } from './rays.js';

function source(id: string, longitude: number, datastream = id): AnalysisContributionsSource {
  return {
    source_id: id,
    datastream_id: datastream,
    sensor_id: `${datastream}-sensor`,
    kind: 'measured',
    cell: { index: 0, longitude, latitude: 46, depth_m: 0 },
    observed: { longitude: longitude + 0.01, latitude: 46.01, depth_m: 50 },
    observation_count: 3,
    error_std: 0.02,
    background_error_std: 0.3,
    mean_innovation: -0.1,
  };
}

/**
 * Two levels, three sources. The surface level is dominated by `b`; the deep level by `a`,
 * which is what makes the re-weighting assertion mean something.
 */
function document(): AnalysisContributions {
  return {
    schema_version: 1,
    holding_id: 'analysis.run-0-contributions',
    run_id: 'run-0',
    variable: 'temperature',
    correlation: { horizontal_km: 30, vertical_m: 160 },
    column: { longitude: -11, latitude: 46, longitude_index: 4, latitude_index: 5 },
    sources: [source('c.cell-2', -10.6), source('a.cell-0', -11.4), source('b.cell-1', -11.0)],
    levels: [
      {
        depth_index: 0,
        depth_m: 0,
        cell_index: 10,
        reached: true,
        observation_weight: 0.9,
        remainder: 0.1,
        background_error_std: 0.3,
        contributions: [
          { source: 0, contribution: 0.1, separation: { horizontal_km: 30, vertical_m: 0 } },
          { source: 1, contribution: 0.2, separation: { horizontal_km: 25, vertical_m: 0 } },
          { source: 2, contribution: 0.5, separation: { horizontal_km: 5, vertical_m: 0 } },
        ],
      },
      {
        depth_index: 1,
        depth_m: 200,
        cell_index: 20,
        reached: true,
        observation_weight: 0.5,
        remainder: -0.05,
        background_error_std: 0.31,
        contributions: [
          { source: 1, contribution: 0.45, separation: { horizontal_km: 25, vertical_m: 200 } },
          { source: 2, contribution: 0.1, separation: { horizontal_km: 5, vertical_m: 200 } },
        ],
      },
    ],
  };
}

describe('the rays a column is made of', () => {
  it('gives one ray per contributing source, ordered by source id rather than by the holding’s order', () => {
    const set = raysFor(document());
    // The document lists c, a, b. The drawn order is a, b, c — declared, so a source keeps its
    // place between levels and between runs (FR-123).
    expect(set.rays.map((ray) => ray.sourceId)).toEqual(['a.cell-0', 'b.cell-1', 'c.cell-2']);
    expect(set.rays).toHaveLength(3);
  });

  it('draws from where the instrument was, and states the separation the gain used', () => {
    const set = raysFor(document());
    const a = set.rays[0];
    // The line ends at the observed position…
    expect(a.longitude).toBeCloseTo(-11.39, 10);
    expect(a.latitude).toBeCloseTo(46.01, 10);
    // …and the cell the gain attributed it to is carried beside it, which is what the
    // separation is measured between. Two distances, both stated, neither pretending to be
    // the other.
    expect(a.cellLongitude).toBe(-11.4);
    expect(a.separationKm).toBe(25);
    expect(a.errorStd).toBe(0.02);
    expect(a.backgroundErrorStd).toBe(0.3);
  });

  it('makes widths the true fraction of the widest, and prints the magnitude the width cannot carry', () => {
    const set = raysFor(document());
    // Summed over the column: a = 0.2 + 0.45 = 0.65, b = 0.5 + 0.1 = 0.6, c = 0.1.
    const [a, b, c] = set.rays;
    expect(a.contribution).toBeCloseTo(0.65, 10);
    expect(b.contribution).toBeCloseTo(0.6, 10);
    expect(c.contribution).toBeCloseTo(0.1, 10);
    expect(set.widest).toBeCloseTo(0.65, 10);
    expect(a.weight).toBe(1);
    expect(b.weight).toBeCloseTo(0.6 / 0.65, 10);
    expect(c.weight).toBeCloseTo(0.1 / 0.65, 10);
    // The ratios the picture carries are the contributions' own.
    expect(b.weight / c.weight).toBeCloseTo(b.contribution / c.contribution, 10);
  });

  it('SC-003: selecting a level re-weights the rays without moving them or changing their count', () => {
    const whole = raysFor(document());
    const surface = raysFor(document(), 0);
    const deep = raysFor(document(), 1);

    // Same origins, in the same order, at every level — the volume carries *which* sources and
    // the profile carries *where they mattered*, and neither is read through the other.
    const origins = (set: ReturnType<typeof raysFor>) =>
      set.rays.map((ray) => `${ray.sourceId}@${ray.longitude},${ray.latitude}`);
    expect(origins(surface)).toEqual(origins(whole));

    // Different widths, and the dominant source changes between the two levels — which is the
    // thing a reader is looking for and the reason the re-weighting exists.
    expect(surface.rays.map((ray) => ray.weight)).not.toEqual(deep.rays.map((ray) => ray.weight));
    expect(surface.rays.find((ray) => ray.sourceId === 'b.cell-1')?.weight).toBe(1);
    expect(deep.rays.find((ray) => ray.sourceId === 'a.cell-0')?.weight).toBe(1);

    // A level a source did not reach drops its ray rather than drawing it at zero width: an
    // absent contribution and a contribution of nothing are different facts (FR-129).
    expect(deep.rays.map((ray) => ray.sourceId)).toEqual(['a.cell-0', 'b.cell-1']);
  });

  it('carries the remainder beside the rays and never as one of them', () => {
    const set = raysFor(document());
    expect(set.remainder).toBeCloseTo(0.05, 10);
    // No ray is the remainder: the drawn set is exactly the sources.
    expect(set.rays.some((ray) => ray.contribution === set.remainder)).toBe(false);
    expect(set.rays).toHaveLength(3);
  });

  it('SC-001: the drawn contributions and the remainder sum to the weight the holding published', () => {
    for (const level of [undefined, 0, 1]) {
      const set = raysFor(document(), level);
      const residual = contributionResidual(set);
      expect(residual.published).toBeCloseTo(set.observationWeight, 10);
      // Exact in this arithmetic; the running loop's own tolerance is the holding's, and that
      // assertion is in forecast.test.tsx where the numbers are the analyst's.
      expect(residual.difference).toBeCloseTo(0, 10);
    }
  });

  it('says a column nothing reached is unreached, rather than drawing it as nothing contributing', () => {
    const empty = document();
    const unreachedDocument: AnalysisContributions = {
      ...empty,
      levels: empty.levels.map((level) => ({
        ...level,
        reached: false,
        observation_weight: 0,
        remainder: 0,
        background_error_std: null,
        contributions: [],
      })),
    };
    const set = raysFor(unreachedDocument);
    expect(set.unreached).toBe(true);
    expect(set.rays).toEqual([]);
    expect(set.widest).toBe(0);

    // And a column that *was* reached and whose contributions summed to nothing is the other
    // fact: reached, no rays worth drawing, and it does not claim to be unsampled.
    const summedToNothing: AnalysisContributions = {
      ...empty,
      levels: [{ ...empty.levels[0], reached: true, observation_weight: 0, remainder: 0, contributions: [] }],
    };
    expect(raysFor(summedToNothing).unreached).toBe(false);
  });

  it('SC-005: the standing forecast is not a ray, and a source table that admitted one is named', () => {
    const clean = raysFor(document());
    expect(backgroundRaysIn(clean)).toEqual([]);

    // The named condition doing its work: a source table that admitted the background — which
    // no analyst in this harness produces, because the shore broadcast enters as background and
    // the archive is a share rather than an observation — is reported rather than drawn.
    const admitted = document();
    admitted.sources = [source('c.cell-2', -10.6), source('a.cell-0', -11.4), source('d.cell-3', -11.0, 'archive')];
    const named = backgroundRaysIn(raysFor(admitted));
    expect(named.map((ray) => ray.datastreamId)).toEqual(['archive']);
  });
});

describe('telling two sources of one instrument apart', () => {
  it('names a lone datastream plainly and an ambiguous one by its ordinal', () => {
    // The case a capture found: one instrument sampling either side of a cell boundary is two
    // sources, and the profile printed both as `temperature-200m` at different widths.
    const twice = [source('a.cell-0', -11.4, 'temperature-200m'), source('b.cell-1', -11.0, 'temperature-050m'), source('c.cell-2', -10.6, 'temperature-200m')];
    expect(sourceLabels(twice)).toEqual(['temperature-200m ·1', 'temperature-050m', 'temperature-200m ·2']);
    // And a column where every instrument appears once keeps the plain names: the ordinal is
    // there to remove an ambiguity, not as decoration.
    expect(sourceLabels([source('a.cell-0', -11.4, 'temperature-050m')])).toEqual(['temperature-050m']);
  });
});
