/**
 * Feature 109: the composer's pure half. The URL shown is the URL fetched — one
 * function builds both — so these tests hold the literal strings (FR-41).
 */
import { describe, expect, it } from 'vitest';
import type { QuerySubsets } from '../../generated/types.js';
import { classifyResponse, composeUrl, offeringFrom } from './composer.js';

const subsets: QuerySubsets = {
  schema_version: 1,
  edr: {
    standard: 'OGC API - Environmental Data Retrieval 1.1',
    query_types: ['position', 'trajectory', 'area'],
    parameters: ['temperature', 'salinity'],
    interpolation: 'nearest neighbour',
    refused_by_name: ['radius'],
  },
  sensorthings: { standard: 's', resources: [], query_options: [], refused_by_name: [] },
  features: { standard: 'f', resources: [], refused_by_name: [] },
};

describe('the EDR composer (feature 109)', () => {
  it('offers only what the server states it serves, enumerated, never stubbed', () => {
    const offering = offeringFrom(subsets, ['nowcast', 'archive']);
    expect(offering.collections).toEqual(['archive', 'nowcast']);
    expect(offering.queryTypes).toEqual(['position', 'trajectory', 'area']);
    expect(offering.parameters).toEqual(['temperature', 'salinity']);
  });

  it('names the missing step until the URL can assemble, then assembles it literally', () => {
    expect(composeUrl('/api/edr', { parameters: [] })).toMatchObject({ ok: false, missing: 'choose a collection' });
    expect(composeUrl('/api/edr', { parameters: [], collection: 'nowcast' })).toMatchObject({
      ok: false,
      missing: 'choose a query type',
    });
    expect(
      composeUrl('/api/edr', { parameters: [], collection: 'nowcast', queryType: 'position' }),
    ).toMatchObject({ ok: false, missing: expect.stringContaining('set a position') });

    const composed = composeUrl('/api/edr', {
      collection: 'nowcast',
      queryType: 'position',
      parameters: ['temperature'],
      longitude: -11.25,
      latitude: 46.5,
      depthM: 50,
      datetime: '2026-01-01T00:00:00.000000Z',
    });
    expect(composed).toEqual({
      ok: true,
      url: '/api/edr/collections/nowcast/position?coords=POINT%28-11.25+46.5%29&z=50&datetime=2026-01-01T00%3A00%3A00.000000Z&parameter-name=temperature',
    });
  });

  it('guides an area query into a half-degree box around the chosen position', () => {
    const composed = composeUrl('/api/edr', {
      collection: 'nowcast',
      queryType: 'area',
      parameters: [],
      longitude: -11,
      latitude: 46,
      depthM: 50,
    });
    expect(composed.ok).toBe(true);
    if (composed.ok) {
      const coords = new URLSearchParams(composed.url.split('?')[1]).get('coords');
      expect(coords).toBe('POLYGON((-11.25 45.75, -10.75 45.75, -10.75 46.25, -11.25 46.25, -11.25 45.75))');
    }
  });

  it('declines to guide a trajectory, saying why, rather than guessing per-vertex times', () => {
    const composed = composeUrl('/api/edr', {
      collection: 'nowcast',
      queryType: 'trajectory',
      parameters: [],
    });
    expect(composed).toMatchObject({ ok: false, missing: expect.stringContaining('per-vertex depth and time') });
  });

  it('keeps null, declined and absent as three different facts (FR-41)', () => {
    expect(classifyResponse(200, { ranges: { temperature: { values: [null] } } })).toMatchObject({
      fact: 'value',
    });
    expect(classifyResponse(400, { refused: "query option 'within' is not implemented" })).toEqual({
      fact: 'declined',
      refusal: "query option 'within' is not implemented",
    });
    expect(classifyResponse(404, { refused: "no collection named 'mystery'" })).toEqual({
      fact: 'absent',
      detail: "no collection named 'mystery'",
    });
  });
});
