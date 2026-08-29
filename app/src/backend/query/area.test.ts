/**
 * Feature 109: the EDR area query — the subset grown one capability at a time
 * (E9) so the map has a genuine source of field pixels. Grid-domain CoverageJSON
 * of the stored points inside the requested box, never a resampling; refusals
 * name the thing refused.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { buildBackend, type BackendRuntime } from '../runtime/runtime.js';

interface GridCoverage {
  domain: { domainType: string; axes: { x: { values: number[] }; y: { values: number[] } } };
  ranges: Record<string, { shape: number[]; values: number[] }>;
}

const validator = createSeamValidator();

describe('the EDR area query (feature 109)', () => {
  let runtime: BackendRuntime;
  let config: ConfigRun;

  beforeAll(() => {
    config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
    config.clock.mode = 'lockstep';
    config.clock.rate = 0;
    runtime = buildBackend(config, { rootSeed: 4242, revision: 'test', dirty: false }, validator);
    runtime.clock.tickOnce();
  });

  afterAll(() => runtime.stop());

  const get = async (path: string) => {
    const response = await runtime.httpBackend.handle({ method: 'GET', path, body: '' });
    return { status: response.status, body: JSON.parse(response.body) as unknown };
  };

  it('serves the stored grid points inside the box as a master-valid Grid coverage', async () => {
    const domain = config.env_generator.domain;
    const wkt = `POLYGON((${domain.longitude.minimum} ${domain.latitude.minimum}, ${domain.longitude.maximum} ${domain.latitude.minimum}, ${domain.longitude.maximum} ${domain.latitude.maximum}, ${domain.longitude.minimum} ${domain.latitude.maximum}, ${domain.longitude.minimum} ${domain.latitude.minimum}))`;
    const { status, body } = await get(
      `/api/edr/collections/nowcast/area?coords=${encodeURIComponent(wkt)}&z=50&parameter-name=temperature`,
    );
    expect(status).toBe(200);
    expect(validator.validate('coveragejson', body).refusals).toEqual([]);
    const coverage = body as GridCoverage;
    expect(coverage.domain.domainType).toBe('Grid');
    const lons = coverage.domain.axes.x.values;
    const lats = coverage.domain.axes.y.values;
    expect(lons.length).toBe(config.env_generator.nowcast.grid.longitude);
    expect(lats.length).toBe(config.env_generator.nowcast.grid.latitude);
    const range = coverage.ranges['temperature'];
    expect(range.shape).toEqual([1, 1, lats.length, lons.length]);
    expect(range.values.length).toBe(lats.length * lons.length);

    // The grid answers with the same stored value the position query serves: one
    // implementation of nearest-neighbour, not two.
    const probeLon = lons[3];
    const probeLat = lats[5];
    const position = await get(
      `/api/edr/collections/nowcast/position?coords=${encodeURIComponent(`POINT(${probeLon} ${probeLat})`)}&z=50&parameter-name=temperature`,
    );
    const positionValue = (position.body as GridCoverage).ranges['temperature'].values[0];
    expect(range.values[5 * lons.length + 3]).toBe(positionValue);
  });

  it('a smaller box returns only the points inside it', async () => {
    const wkt = 'POLYGON((-12 45, -10 45, -10 47, -12 47, -12 45))';
    const { status, body } = await get(
      `/api/edr/collections/nowcast/area?coords=${encodeURIComponent(wkt)}&z=50`,
    );
    expect(status).toBe(200);
    const coverage = body as GridCoverage;
    for (const lon of coverage.domain.axes.x.values) {
      expect(lon).toBeGreaterThanOrEqual(-12);
      expect(lon).toBeLessThanOrEqual(-10);
    }
    for (const lat of coverage.domain.axes.y.values) {
      expect(lat).toBeGreaterThanOrEqual(45);
      expect(lat).toBeLessThanOrEqual(47);
    }
    // Both variables come back when no parameter-name narrows the request.
    expect(Object.keys(coverage.ranges).sort()).toEqual(['salinity', 'temperature']);
  });

  it('refuses with the thing refused named: no coords, a wrong shape, a box outside', async () => {
    const missing = await get('/api/edr/collections/nowcast/area?z=50');
    expect(missing.status).toBe(400);
    expect((missing.body as { refused: string }).refused).toMatch(/area query needs coords=POLYGON/);

    const wrongShape = await get(
      `/api/edr/collections/nowcast/area?coords=${encodeURIComponent('POINT(-11 46)')}&z=50`,
    );
    expect(wrongShape.status).toBe(400);
    expect((wrongShape.body as { refused: string }).refused).toMatch(/not the accepted shape POLYGON/);

    const outside = await get(
      `/api/edr/collections/nowcast/area?coords=${encodeURIComponent('POLYGON((10 10, 11 10, 11 11, 10 11, 10 10))')}&z=50`,
    );
    expect(outside.status).toBe(400);
    expect((outside.body as { refused: string }).refused).toMatch(/contains no grid point/);
  });

  it("the subset statement now states 'area' served and no longer refuses it by name", async () => {
    const { body } = await get('/api/ctl/query-subsets');
    const subsets = body as { edr: { query_types: string[]; refused_by_name: string[] } };
    expect(subsets.edr.query_types).toContain('area');
    expect(subsets.edr.refused_by_name).not.toContain('area');
  });
});
