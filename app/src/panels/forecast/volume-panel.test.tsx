// @vitest-environment jsdom
/**
 * The volume as a component: its three states, and the caption's arithmetic against the field it
 * was actually served.
 *
 * `volume.ts` is tested thoroughly and the component that consumes it was not tested at all — the
 * capture proof was the whole of its cover, and a capture measures one shipped configuration on a
 * built page. The states worth holding here are the ones a capture never reaches: a refusal, a
 * response that is a 200 but not the master's shape, and a caption's numbers against an input this
 * test chose. The picking guard is covered by construction — the click handler only acts on
 * `info.layer?.id === 'forecast-volume-picker'`, and nothing else in the file can call
 * `onPickColumn`.
 *
 * **deck.gl is not exercised.** There is no WebGL in jsdom, so `DeckGL` renders nothing useful and
 * `SolidPolygonLayer`'s geometry cannot be inspected here; `capture:forecast` is what looks at the
 * drawing, and says so. What this file holds is the markup around it, which is where the states a
 * reader meets live.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeamValidator } from '../../seam/validate.js';
import { Volume } from './Volume.js';
import { thermoclineSurface, type LevelField } from './volume.js';
import type { ColumnGrid } from './ColumnProvenance.js';

const validator = createSeamValidator();

const grid: ColumnGrid = {
  minimumLongitude: -14,
  maximumLongitude: -8,
  minimumLatitude: 44,
  maximumLatitude: 48,
  depthsM: [0, 40, 80, 120],
};

/** Two columns by two, four levels: small enough to reason about, real CoverageJSON shape. */
const LONS = [-14, -8];
const LATS = [44, 48];
/** A layer that falls between 40 and 80 m in one column and between 80 and 120 in the others. */
const TEMPERATURE: Record<number, number[]> = {
  0: [18, 18, 18, 18],
  40: [17.8, 17.9, 17.9, 17.9],
  80: [11.0, 17.5, 17.6, 17.6],
  120: [10.6, 10.9, 11.0, 11.0],
};

function coverage(depthM: number, names: readonly string[]): unknown {
  const ranges: Record<string, unknown> = {};
  for (const name of names) {
    ranges[name] =
      name === 'temperature'
        ? { type: 'NdArray', dataType: 'float', axisNames: ['t', 'z', 'y', 'x'], shape: [1, 1, 2, 2], values: TEMPERATURE[depthM] }
        : { type: 'NdArray', dataType: 'float', axisNames: ['t', 'z', 'y', 'x'], shape: [1, 1, 2, 2], values: [35, 35, 35, 35] };
  }
  return {
    type: 'Coverage',
    domain: {
      type: 'Domain',
      domainType: 'Grid',
      axes: {
        x: { values: LONS },
        y: { values: LATS },
        z: { values: [depthM] },
        t: { values: ['2026-01-01T00:00:00Z'] },
      },
      // Master-shaped rather than minimal: a fixture that failed validation would exercise the
      // refusal path in every test below and prove nothing about the drawn one.
      referencing: [
        { coordinates: ['x', 'y'], system: { type: 'GeographicCRS', id: 'http://www.opengis.net/def/crs/EPSG/0/4326' } },
      ],
    },
    parameters: Object.fromEntries(
      names.map((name) => [
        name,
        {
          type: 'Parameter',
          description: { en: name },
          observedProperty: { id: `https://drogna.invalid/${name}`, label: { en: name } },
          unit: { symbol: 'x' },
        },
      ]),
    ),
    ranges,
  };
}

const props = {
  collectionId: 'analysis.test',
  grid,
  edrPrefix: '/api/edr',
  validator,
  parameter: 'temperature' as const,
  column: undefined,
  onPickColumn: () => undefined,
};

async function settle() {
  await act(async () => {
    for (let flush = 0; flush < 24; flush++) await Promise.resolve();
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the volume (feature 124, FR-120)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('names the refusal rather than leaving a blank where a drawing would be', async () => {
    vi.stubGlobal('fetch', async () => new Response('no', { status: 503 }));
    render(<Volume {...props} />);
    await settle();
    expect(screen.getByTestId('forecast-volume-state').textContent).toMatch(/refused \(503\)/);
  });

  it('refuses a 200 that is not the master’s shape, rather than reading it', async () => {
    // The seam's rule, at this crossing: a response that validates is a document and one that does
    // not is a refusal, whatever its status code.
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ type: 'Coverage' }), { status: 200 }));
    render(<Volume {...props} />);
    await settle();
    expect(screen.getByTestId('forecast-volume-state').textContent).toMatch(/did not match its master/);
  });

  it('says which parameter was missing when the field carries no values for it', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      const depthM = Number(new URL(url, 'http://x').searchParams.get('z'));
      // Served, master-valid, and carrying only temperature — so sound speed cannot be derived.
      return new Response(JSON.stringify(coverage(depthM, ['temperature'])), { status: 200 });
    });
    render(<Volume {...props} parameter="sound_speed" />);
    await settle();
    expect(screen.getByTestId('forecast-volume-state').textContent).toMatch(/carried no sound_speed to draw/);
  });

  it('says there is no thermocline to place, rather than calling an empty surface level', async () => {
    // A column that warms with depth has no thermocline, and `thermoclineIn` declines it. With
    // every column declining, `coreSpanM` is 0 and the level branch's test (`0 <= spacing`) is
    // true — so the caption read "0 of 4 columns have one, over 0 distinct depths — so it is
    // level to within one 40 m level", which is a statement about a field it placed nothing in.
    const WARMING: Record<number, number[]> = { 0: [4, 4, 4, 4], 40: [6, 6, 6, 6], 80: [8, 8, 8, 8], 120: [10, 10, 10, 10] };
    vi.stubGlobal('fetch', async (url: string) => {
      const depthM = Number(new URL(url, 'http://x').searchParams.get('z'));
      const body = coverage(depthM, ['temperature']) as { ranges: Record<string, { values: number[] }> };
      body.ranges.temperature.values = WARMING[depthM];
      return new Response(JSON.stringify(body), { status: 200 });
    });
    render(<Volume {...props} />);
    await settle();
    const caption = screen.getByTestId('forecast-volume-caption').textContent ?? '';
    expect(caption).toContain('0 of 4 columns');
    expect(caption).toMatch(/no thermocline to place/);
    expect(caption, 'an empty surface was captioned as a level one').not.toMatch(/level to within/);
  });

  it('captions the surface with the count and level its own input implies', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      const depthM = Number(new URL(url, 'http://x').searchParams.get('z'));
      return new Response(JSON.stringify(coverage(depthM, ['temperature'])), { status: 200 });
    });
    render(<Volume {...props} />);
    await settle();

    // The expectation is computed from the fixture through the same pure function the component
    // uses, so it moves when the fixture moves — a transcribed "3 distinct depths" would be a
    // number to update rather than a claim to hold.
    const levels: LevelField[] = grid.depthsM.map((depthM) => ({ depthM, temperatureC: TEMPERATURE[depthM] }));
    const surface = thermoclineSurface(levels);
    const placed = surface.filter((cell) => cell !== undefined).length;
    const distinct = new Set(surface.flatMap((cell) => (cell ? [cell.depthM] : []))).size;
    expect(placed, 'the fixture places no thermocline, so this test would hold nothing').toBeGreaterThan(0);
    expect(distinct, 'the fixture is flat, so the caption cannot be checked against a shape').toBeGreaterThan(1);

    const caption = screen.getByTestId('forecast-volume-caption').textContent ?? '';
    expect(caption).toContain(`${placed} of ${surface.length} columns`);
    expect(caption).toContain(`over ${distinct} distinct depths`);
    // And a measured figure beside the count, in whichever branch the field selects — the thing
    // `capture:forecast` asserts on the shipped configuration, held here on a chosen one.
    expect(caption).toMatch(/% of them at \d+ m|within one \d+ m level/);
  });
});
