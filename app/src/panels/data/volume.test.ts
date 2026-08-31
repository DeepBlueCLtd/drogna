/**
 * The volume's fourth axis (feature 121, FR-13, FR-14, SC-010).
 *
 * The rule under test is that an unfetched step is *absent* rather than approximated.
 * It is easy to write a cache that returns the nearest thing it has and very hard to
 * see that it has, because the picture is plausible either way — which is exactly why
 * the check is here and not left to a look at the running tab.
 */
import { describe, expect, it } from 'vitest';
import { VolumeCache, loadingSummary, type VolumeStep } from './volume.js';
import type { GridCoverage } from '../map/map-data.js';

const step = (instant: string, depthM: number): VolumeStep => ({
  instant,
  levels: [{ depthM, coverage: {} as GridCoverage }],
});

const INSTANTS = ['2026-01-01T00:00:00.000000Z', '2026-01-01T01:00:00.000000Z', '2026-01-01T02:00:00.000000Z'];

describe('the volume cache', () => {
  it('answers absent for a step nothing has fetched, rather than the nearest one it holds', () => {
    const cache = new VolumeCache();
    cache.set('archive', INSTANTS[0], { status: 'loaded', step: step(INSTANTS[0], 0) });
    expect(cache.get('archive', INSTANTS[1])).toEqual({ status: 'absent' });
    expect(cache.get('archive', INSTANTS[0]).status).toBe('loaded');
  });

  it('keeps two collections apart, so one holding’s field is never drawn as another’s', () => {
    const cache = new VolumeCache();
    cache.set('archive', INSTANTS[0], { status: 'loaded', step: step(INSTANTS[0], 0) });
    expect(cache.get('nowcast', INSTANTS[0])).toEqual({ status: 'absent' });
  });

  it('names the steps it holds, in the order the axis declares them', () => {
    const cache = new VolumeCache();
    cache.set('archive', INSTANTS[2], { status: 'loaded', step: step(INSTANTS[2], 0) });
    cache.set('archive', INSTANTS[0], { status: 'loaded', step: step(INSTANTS[0], 0) });
    cache.set('archive', INSTANTS[1], { status: 'loading' });
    expect(cache.loaded('archive', INSTANTS)).toEqual([INSTANTS[0], INSTANTS[2]]);
  });

  it('carries a refusal for a step the store would not answer for', () => {
    const cache = new VolumeCache();
    cache.set('archive', INSTANTS[0], { status: 'refused', refusal: 'no collection named it' });
    expect(cache.get('archive', INSTANTS[0])).toEqual({
      status: 'refused',
      refusal: 'no collection named it',
    });
  });

  it('keeps what it fetched across a clone, which is how a scrub back is free', () => {
    const cache = new VolumeCache();
    cache.set('archive', INSTANTS[0], { status: 'loaded', step: step(INSTANTS[0], 0) });
    const next = cache.clone();
    next.set('archive', INSTANTS[1], { status: 'loaded', step: step(INSTANTS[1], 0) });
    expect(next.loaded('archive', INSTANTS)).toEqual([INSTANTS[0], INSTANTS[1]]);
    expect(next).not.toBe(cache);
  });
});

describe('what the panel says about its own loading', () => {
  it('distinguishes nothing, some and all — a half-loaded volume must not read as whole', () => {
    expect(loadingSummary(0, 12)).toMatch(/nothing fetched yet of 12/);
    expect(loadingSummary(3, 12)).toMatch(/^3 of 12 step\(s\) fetched/);
    expect(loadingSummary(12, 12)).toMatch(/^all 12 step\(s\) fetched/);
    expect(loadingSummary(0, 0)).toMatch(/no time steps declared/);
  });
});
