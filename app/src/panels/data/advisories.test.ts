/**
 * The shore-updates canvas's model (feature 121, FR-15, FR-16, SC-011).
 */
import { describe, expect, it } from 'vitest';
import type { FeaturesResponseFeatureCollection } from '../../generated/types.js';
import { advisoryRegions, fillFor, standingLabel } from './advisories.js';

function advisory(id: string, from: string, to: string, kind = 'caution-region'): unknown {
  return {
    type: 'Feature',
    id,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-12, 45],
          [-10, 45],
          [-10, 47],
          [-12, 47],
          [-12, 45],
        ],
      ],
    },
    properties: {
      advisory_id: id,
      kind,
      valid_time: { start_sim_time: from, end_sim_time: to },
      guidance: { confidence: 'moderate' },
    },
  };
}

const response = (features: unknown[]): FeaturesResponseFeatureCollection =>
  ({ type: 'FeatureCollection', features, numberReturned: features.length } as unknown as FeaturesResponseFeatureCollection);

const EARLY = '2026-01-01T00:00:00.000000Z';
const MIDDLE = '2026-01-01T06:00:00.000000Z';
const LATE = '2026-01-01T12:00:00.000000Z';

describe('advisory regions', () => {
  it('reads the advised region and the validity off the feature', () => {
    const { regions } = advisoryRegions(response([advisory('a1', EARLY, LATE)]), MIDDLE);
    expect(regions).toHaveLength(1);
    expect(regions[0].bbox).toEqual([-12, 45, -10, 47]);
    expect(regions[0].kind).toBe('caution-region');
    expect(regions[0].standing).toBe('current');
  });

  it('keeps a lapsed advisory, drawn spent: what shore said is a record, not a live layer', () => {
    const { regions } = advisoryRegions(
      response([advisory('a1', EARLY, MIDDLE), advisory('a2', EARLY, LATE)]),
      LATE,
    );
    expect(regions.map((region) => region.standing)).toEqual(['lapsed', 'current']);
    // The count drawn equals the count the collection returned (SC-011).
    expect(regions).toHaveLength(2);
  });

  it('marks an advisory that has not started as pending rather than as in force', () => {
    const { regions } = advisoryRegions(response([advisory('a1', MIDDLE, LATE)]), EARLY);
    expect(regions[0].standing).toBe('pending');
  });

  it('claims nothing before the clock has been heard from', () => {
    const { regions } = advisoryRegions(response([advisory('a1', EARLY, LATE)]), undefined);
    expect(regions[0].standing).toBe('pending');
    expect(standingLabel(regions[0].standing)).toBe('not yet in force');
  });

  it('counts a feature it cannot read rather than drawing it at a guessed position', () => {
    const broken = { type: 'Feature', id: 'b1', geometry: undefined, properties: {} };
    const { regions, unreadable } = advisoryRegions(response([broken, advisory('a1', EARLY, LATE)]), MIDDLE);
    expect(regions).toHaveLength(1);
    expect(unreadable).toBe(1);
  });

  it('states an empty collection as empty rather than as unread', () => {
    const { regions, unreadable } = advisoryRegions(response([]), MIDDLE);
    expect(regions).toEqual([]);
    expect(unreadable).toBe(0);
  });

  it('carries standing in the alpha and the kind in the hue, so one kind is one colour', () => {
    const blue = [40, 90, 200] as const;
    expect(fillFor(blue, 'current').slice(0, 3)).toEqual([40, 90, 200]);
    expect(fillFor(blue, 'lapsed').slice(0, 3)).toEqual([40, 90, 200]);
    expect(fillFor(blue, 'lapsed')[3]).toBeLessThan(fillFor(blue, 'current')[3]);
  });
});
