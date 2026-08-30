/**
 * Feature 109: the composer's pure half. The URL shown is the URL fetched — one
 * function builds both — so these tests hold the literal strings (FR-41).
 */
import { describe, expect, it } from 'vitest';
import type { QuerySubsets } from '../../generated/types.js';
import {
  areaRing,
  classifyResponse,
  composeUrl,
  offeringFrom,
  pickPrompt,
  pickedPosition,
} from './composer.js';

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

  it('draws the same ring it queries: the WKT is the drawn ring, coordinate for coordinate', () => {
    const ring = areaRing(-11, 46);
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
      expect(coords).toBe(`POLYGON((${ring.map(([lon, lat]) => `${lon} ${lat}`).join(', ')}))`);
    }
    // Closed, and closed on the corner it opened at: an open ring is not a polygon.
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('takes a position off the canvas, wrapping the globe and refusing a miss (issue #53)', () => {
    // The plan view, clicked inside the domain: three decimals, as typed.
    expect(pickedPosition([-11.23456, 46.51234])).toEqual({ longitude: -11.235, latitude: 46.512 });
    // The globe, dragged past the seam: deck.gl unprojects to a wound longitude,
    // and the same place must compose the same URL as the unwound click.
    expect(pickedPosition([348.765, 46.512])).toEqual({ longitude: -11.235, latitude: 46.512 });
    expect(pickedPosition([-371.235, 46.512])).toEqual({ longitude: -11.235, latitude: 46.512 });
    // A click off the sphere unprojects to nothing, or to a latitude no place has.
    expect(pickedPosition(undefined)).toBeUndefined();
    expect(pickedPosition(null)).toBeUndefined();
    expect(pickedPosition([-11.2])).toBeUndefined();
    expect(pickedPosition([-11.2, 96])).toBeUndefined();
    expect(pickedPosition([Number.NaN, 46])).toBeUndefined();
  });

  it('says on the canvas what the click will do, and what it has done (issue #53)', () => {
    // Nothing placed yet: the instruction, and on the cube the extra thing a click
    // there does — the slice carries the depth as well.
    expect(pickPrompt('flat')).toBe('click the map to place the position of the query');
    expect(pickPrompt('globe')).toBe('click the map to place the position of the query');
    expect(pickPrompt('cube')).toBe('click a slice to place the position and depth of the query');
    // Placed: the map's own account of it, and the fact that it is not final.
    expect(pickPrompt('flat', 'position -11.235, 46.512 — inside the domain')).toBe(
      'position -11.235, 46.512 — inside the domain · click again to move it',
    );
    // The note is the map's, verbatim: a warning about the domain is never softened
    // here, because the server's own refusal is the authority (Constitution VII).
    expect(pickPrompt('cube', 'position -25, 46.512 — outside the domain')).toContain(
      'outside the domain',
    );
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
