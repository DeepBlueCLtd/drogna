/**
 * The Holdings tab's pure halves (feature 114): the interval a manifest states, the axis
 * that carries twenty years and six hours at once, and the rules that decide what an
 * instance may honestly be compared against.
 *
 * The rules are the part worth testing here rather than through the panel, because each
 * of them is a refusal — and a refusal is exactly the behaviour a rendered test tends to
 * miss, since a panel showing nothing and a panel showing the reason both look like a
 * panel that did not draw a comparison.
 */
import { describe, expect, it } from 'vitest';
import type { CoverageHolding } from '../../generated/types.js';
import type { GridCoverage } from '../map/map-data.js';
import { compareFields, counterpartFor, isComparison, isCounterpart } from './compare.js';
import { coverageInterval, covers, describeSpan, simMillis } from './interval.js';
import { timeScaleFor } from './scale.js';

function holding(
  id: string,
  era: CoverageHolding['era'],
  publishedAt: string,
  origin: string,
  stepSeconds: number,
  count: number,
  generator = 'drogna-env-generator',
  variables = ['temperature', 'salinity'],
): CoverageHolding {
  return {
    schema_version: 1,
    holding_id: id,
    era,
    run_id: 'loiter-a',
    published_at: { sim_time: publishedAt, tick: Math.round(simMillis(publishedAt) / 1000) },
    field: { format: 'drogna-f32-v1', sha256: `sha256:${'0'.repeat(64)}`, byte_length: 8 },
    manifest: {
      generator: { name: generator, version: '2.0.0', analytic_form_version: 1 },
      variables: variables.map((name) => ({
        name,
        standard_name: name.includes('_') ? null : `sea_water_${name}`,
        long_name: name,
        units: 'degC',
        dtype: 'float32',
        tolerance_absolute: 0.001,
      })),
      grid: {
        longitude: { minimum: -2, maximum: -1, count: 2, spacing: 1, units: 'degrees_east', direction: 'east' },
        latitude: { minimum: 50, maximum: 51, count: 2, spacing: 1, units: 'degrees_north', direction: 'north' },
        depth: { minimum: 0, maximum: 50, count: 2, spacing: 50, units: 'm', direction: 'down' },
        time: {
          origin_sim_time: origin,
          start_offset_seconds: 0,
          step_seconds: stepSeconds,
          count,
          units: 'seconds since the origin sim time',
        },
      },
    },
  } as unknown as CoverageHolding;
}

const NOON = '2026-01-01T12:00:00.000000Z';

describe('the interval a manifest states', () => {
  it('reads origin, offset, step and count, and never assumes an era', () => {
    const interval = coverageInterval({
      origin_sim_time: '2026-01-01T00:00:00.000000Z',
      start_offset_seconds: 3600,
      step_seconds: 900,
      count: 5,
    });
    if (!interval) throw new Error('a well-formed time axis was not read');
    expect(interval.startSimTime).toBe('2026-01-01T01:00:00.000000Z');
    expect(interval.endSimTime).toBe('2026-01-01T02:00:00.000000Z');
    expect(covers(interval, simMillis('2026-01-01T01:30:00.000000Z'))).toBe(true);
    expect(covers(interval, simMillis('2026-01-01T02:30:00.000000Z'))).toBe(false);
  });

  it('reads a negative offset, which is how the archive reaches back before its origin', () => {
    const interval = coverageInterval({
      origin_sim_time: '2026-01-01T00:00:00.000000Z',
      start_offset_seconds: -622_080_000,
      step_seconds: 2_592_000,
      count: 240,
    });
    expect(interval?.startSimTime.startsWith('2006-')).toBe(true);
    expect(interval?.endSimTime.startsWith('2025-')).toBe(true);
  });

  it('refuses an axis it cannot read rather than guessing at one', () => {
    expect(coverageInterval({ origin_sim_time: 'not a time', start_offset_seconds: 0, step_seconds: 900, count: 4 })).toBeUndefined();
    expect(coverageInterval({ origin_sim_time: NOON, start_offset_seconds: 0, step_seconds: 0, count: 4 })).toBeUndefined();
    expect(coverageInterval({ origin_sim_time: NOON, start_offset_seconds: 0, step_seconds: 900, count: 0 })).toBeUndefined();
  });

  it('says a span the way a reader would say it', () => {
    expect(describeSpan(6 * 3600 * 1000)).toBe('6 hours');
    expect(describeSpan(20 * 365 * 24 * 3600 * 1000)).toBe('20 years');
    expect(describeSpan(0)).toBe('a single instant');
  });
});

describe('the axis that carries twenty years and six hours', () => {
  const archive = { startMillis: simMillis('2006-01-01T00:00:00.000000Z'), endMillis: simMillis('2026-01-01T00:00:00.000000Z') };
  const instance = { startMillis: simMillis('2026-01-01T00:00:00.000000Z'), endMillis: simMillis('2026-01-01T06:00:00.000000Z') };

  it('keeps the newest at the right edge and the oldest at the left', () => {
    const scale = timeScaleFor([archive, instance]);
    expect(scale?.place(archive.startMillis)).toBeCloseTo(0);
    expect(scale?.place(instance.endMillis)).toBeCloseTo(1);
  });

  it('leaves the six hours visible against the twenty years, which a linear axis does not', () => {
    const scale = timeScaleFor([archive, instance]);
    const width = (scale?.place(instance.endMillis) ?? 0) - (scale?.place(instance.startMillis) ?? 0);
    // Linearly this is six hours in twenty years: 0.003% of the width, a hairline.
    const linear = (instance.endMillis - instance.startMillis) / (instance.endMillis - archive.startMillis);
    expect(linear).toBeLessThan(0.0001);
    expect(width).toBeGreaterThan(0.1);
  });

  it('states what it is doing rather than leaving it to tick spacing', () => {
    expect(timeScaleFor([archive, instance])?.description).toContain('logarithmic');
    expect(timeScaleFor([archive, instance])?.ticks.length).toBeGreaterThan(1);
  });

  it('is undefined over an empty store: an axis over nothing is a picture of nothing', () => {
    expect(timeScaleFor([])).toBeUndefined();
  });

  it('handles a store holding one instant, rather than dividing by zero', () => {
    const scale = timeScaleFor([{ startMillis: 1000, endMillis: 1000 }]);
    expect(scale?.place(1000)).toBe(1);
    expect(scale?.description).toContain('one instant');
  });
});

describe('what an instance may honestly be compared against', () => {
  const nowcast = holding('nowcast-1', 'nowcast', '2026-01-01T00:45:00.000000Z', '2026-01-01T00:45:00.000000Z', 3600, 4);
  const instance = holding('run-0', 'instance', '2026-01-01T00:30:00.000000Z', '2026-01-01T00:30:00.000000Z', 900, 4, 'drogna-model-runner');

  it('finds the now-cast covering the instant an elapsed instance forecast', () => {
    const result = counterpartFor(instance, [nowcast, instance], '2026-01-01T02:00:00.000000Z');
    expect(isCounterpart(result)).toBe(true);
    if (!isCounterpart(result)) return;
    expect(result.truth.holding_id).toBe('nowcast-1');
    expect(result.atSimTime).toBe('2026-01-01T01:15:00.000000Z');
    expect(result.persistenceSimTime).toBe('2026-01-01T00:30:00.000000Z');
    // The variable both manifests declare, preferring the one with a standard name.
    expect(result.parameter).toBe('temperature');
  });

  it('SC-05: refuses an instance still inside its validity, and says why', () => {
    const result = counterpartFor(instance, [nowcast, instance], '2026-01-01T00:50:00.000000Z');
    expect(isCounterpart(result)).toBe(false);
    if (isCounterpart(result)) return;
    expect(result.refusal).toContain('validity has not elapsed');
  });

  it('refuses a holding that is not a forecast instance at all', () => {
    const result = counterpartFor(nowcast, [nowcast], '2026-01-01T09:00:00.000000Z');
    expect(isCounterpart(result)).toBe(false);
    if (isCounterpart(result)) return;
    expect(result.refusal).toContain('not a forecast instance');
  });

  it('refuses when no now-cast covers the instant, rather than reaching for the nearest', () => {
    const distant = holding('nowcast-far', 'nowcast', '2026-01-02T00:00:00.000000Z', '2026-01-02T00:00:00.000000Z', 3600, 4);
    const result = counterpartFor(instance, [distant, instance], '2026-01-03T00:00:00.000000Z');
    expect(isCounterpart(result)).toBe(false);
    if (isCounterpart(result)) return;
    expect(result.refusal).toContain('no now-cast holding covers');
  });

  it('refuses a counterpart written by the same generator: one forecast against another is not skill', () => {
    // The substantive form of the specification's rule; see the note at the head of
    // `compare.ts` for why the "published before the instant" form refuses everything.
    const modelled = holding('nowcast-modelled', 'nowcast', '2026-01-01T00:45:00.000000Z', '2026-01-01T00:45:00.000000Z', 3600, 4, 'drogna-model-runner');
    const result = counterpartFor(instance, [modelled, instance], '2026-01-01T02:00:00.000000Z');
    expect(isCounterpart(result)).toBe(false);
    if (isCounterpart(result)) return;
    expect(result.refusal).toContain('the same generator');
  });

  it('refuses a run’s uncertainty field, on the variables its own manifest declares', () => {
    const spread = holding(
      'run-0-spread',
      'instance',
      '2026-01-01T00:30:00.000000Z',
      '2026-01-01T00:30:00.000000Z',
      900,
      4,
      'drogna-model-runner',
      ['temperature_spread', 'salinity_spread'],
    );
    const result = counterpartFor(spread, [nowcast, spread], '2026-01-01T02:00:00.000000Z');
    expect(isCounterpart(result)).toBe(false);
    if (isCounterpart(result)) return;
    expect(result.refusal).toContain('share no variable');
    expect(result.refusal).toContain('temperature_spread');
  });

  it('refuses while no clock sample has arrived, rather than assuming the run has caught up', () => {
    const result = counterpartFor(instance, [nowcast, instance], undefined);
    expect(isCounterpart(result)).toBe(false);
    if (isCounterpart(result)) return;
    expect(result.refusal).toContain('no clock sample');
  });
});

describe('the difference between three served coverages', () => {
  const coverage = (values: number[]): GridCoverage => ({
    domain: {
      domainType: 'Grid',
      axes: { x: { values: [0, 1] }, y: { values: [0, 1] }, z: { values: [0] }, t: { values: [NOON] } },
    },
    ranges: { temperature: { shape: [1, 1, 2, 2], values } },
    parameters: { temperature: { unit: { symbol: 'degC' } } },
  });

  it('differences both against the truth, on one shared scale', () => {
    const result = compareFields(
      coverage([10.5, 10.5, 10.5, 10.5]),
      coverage([10, 10, 10, 10]),
      coverage([12, 12, 12, 12]),
      'temperature',
    );
    expect(isComparison(result)).toBe(true);
    if (!isComparison(result)) return;
    expect(result.forecast.rms).toBeCloseTo(0.5);
    expect(result.persistence.rms).toBeCloseTo(2);
    // One scale, the larger magnitude of the two, so the plots are comparable by eye.
    expect(result.scale).toBeCloseTo(2);
    expect(result.unit).toBe('degC');
    expect(result.forecastIsCloser).toBe(true);
    expect(result.verdict).toContain('The forecast is closer');
  });

  it('says the unflattering thing in Principle IX’s own words when it is the true one', () => {
    const result = compareFields(
      coverage([13, 13, 13, 13]),
      coverage([10, 10, 10, 10]),
      coverage([10.2, 10.2, 10.2, 10.2]),
      'temperature',
    );
    expect(isComparison(result)).toBe(true);
    if (!isComparison(result)) return;
    expect(result.forecastIsCloser).toBe(false);
    expect(result.verdict).toContain('not earning its compute');
  });

  it('refuses coverages of different shapes rather than producing a field that looks like an answer', () => {
    const wrong: GridCoverage = {
      domain: {
        domainType: 'Grid',
        axes: { x: { values: [0] }, y: { values: [0] }, z: { values: [0] }, t: { values: [NOON] } },
      },
      ranges: { temperature: { shape: [1, 1, 1, 1], values: [10] } },
    };
    const result = compareFields(coverage([1, 1, 1, 1]), wrong, coverage([1, 1, 1, 1]), 'temperature');
    expect(isComparison(result)).toBe(false);
    if (isComparison(result)) return;
    expect(result.refusal).toContain('different questions');
  });

  it('refuses when a coverage does not carry the parameter, rather than differencing nothing', () => {
    const other: GridCoverage = {
      domain: {
        domainType: 'Grid',
        axes: { x: { values: [0, 1] }, y: { values: [0, 1] }, z: { values: [0] }, t: { values: [NOON] } },
      },
      ranges: { salinity: { shape: [1, 1, 2, 2], values: [1, 1, 1, 1] } },
    };
    const result = compareFields(coverage([1, 1, 1, 1]), other, coverage([1, 1, 1, 1]), 'temperature');
    expect(isComparison(result)).toBe(false);
    if (isComparison(result)) return;
    expect(result.refusal).toContain("does not carry 'temperature'");
  });
});
