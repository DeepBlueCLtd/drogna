/**
 * Feature 124: two readings the centre region makes of what it was served, on their own.
 *
 * Both are small functions guarding facts that were being got wrong silently, which is the
 * only interesting kind: a share the region could not find was drawn as a zero, and a level
 * nothing had reached was about to be drawn as a level that contributed nothing.
 */
import { describe, expect, it } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type { AnalysisContributions, ConfigRun } from '../../generated/types.js';
import { absenceOf } from './Profile.js';
import { sourceOf } from './shares.js';

const config = runConfigDocument as ConfigRun;

describe('which share a served parameter is', () => {
  /**
   * The names the analyst actually publishes, derived here the way the analyst derives them —
   * from the configured labels on disk — rather than typed out. A label edited in
   * `config.analyst.shares` moves this test with it, which is the point: the fault this guards
   * was a label ("departure forecast") that the shell's match did not survive.
   */
  const served = (label: string) => `temperature_share_${label.replace(/[^a-z]+/gi, '_').toLowerCase()}`;

  it('finds every share the shipped configuration names, including the one whose label is two words', () => {
    const shares = config.analyst.shares;
    expect(sourceOf(served(shares.archive))).toBe('archive');
    expect(sourceOf(served(shares.measurement))).toBe('measurement');
    expect(sourceOf(served(shares.model))).toBe('model');
    // The one that was broken: shipped as "departure forecast", served as
    // `temperature_share_departure_forecast`, and matched by `endsWith('_departure')` — which
    // it does not. Every cell of every column carried NaN for it, drawn as nothing.
    expect(shares.departure).toContain(' ');
    expect(sourceOf(served(shares.departure))).toBe('departure');
  });

  it('misses loudly rather than guessing when a name is not a share at all', () => {
    expect(sourceOf('temperature')).toBeUndefined();
    expect(sourceOf('temperature_error')).toBeUndefined();
    // A share whose label stopped beginning with its key is a vocabulary change, and the shell
    // is meant to miss it rather than match something near it.
    expect(sourceOf('temperature_share_what_the_boat_brought')).toBeUndefined();
  });
});

describe('which of the three facts a level with no contributions is', () => {
  const level = (over: Partial<AnalysisContributions['levels'][number]>) => ({
    depth_index: 0,
    depth_m: 0,
    cell_index: 0,
    reached: true,
    observation_weight: 0,
    remainder: 0,
    background_error_std: 0.3,
    contributions: [],
    ...over,
  });
  const document = (levels: AnalysisContributions['levels']): AnalysisContributions => ({
    schema_version: 1,
    holding_id: 'analysis.run-0-contributions',
    run_id: 'run-0',
    variable: 'temperature',
    correlation: { horizontal_km: 30, vertical_m: 160 },
    column: { longitude: -11, latitude: 46, longitude_index: 1, latitude_index: 1 },
    sources: [],
    levels,
  });

  it('tells the three apart, and says nothing at all about a level that has contributions', () => {
    // Absent: the document never arrived.
    expect(absenceOf(undefined, 0)).toMatch(/have not arrived/);
    // Absent in a different way: it arrived and carries no such level.
    expect(absenceOf(document([]), 0)).toMatch(/no entry for this level/);
    // Nothing was within reach — a fact the compact support makes exact.
    expect(absenceOf(document([level({ reached: false })]), 0)).toMatch(/within reach/);
    // Reached, and contributed nothing: the other fact, and it must not read as the one above.
    const summedToNothing = absenceOf(document([level({ reached: true })]), 0);
    expect(summedToNothing).toMatch(/contributed nothing/);
    expect(summedToNothing).not.toMatch(/within reach of this level/);
    // And a level that did contribute says nothing, rather than an empty statement.
    expect(
      absenceOf(
        document([level({ contributions: [{ source: 0, contribution: 0.4, separation: { horizontal_km: 1, vertical_m: 0 } }] })]),
        0,
      ),
    ).toBeUndefined();
  });
});
