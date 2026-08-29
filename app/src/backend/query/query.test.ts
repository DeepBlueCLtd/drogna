/**
 * Feature 104's surface: the query seam. Every request here goes through the
 * release gate exactly as the browser's fetch would (E8: the allowed paths are
 * tested from the inside); every response is validated against its master (FR-03);
 * refusals name the thing refused (FR-27); the discovery extent is verified against
 * the store (FR-21); and AT-01 scores a trajectory answer against the ground-truth
 * manifest, with the tolerance read from it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun, HoldingsInventory, QuerySubsets } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { buildBackend, type BackendRuntime } from '../runtime/runtime.js';
import { temperatureAt, type WorldParameters } from '../env-generator/analytic.js';
import { timeAxisPosixOrigin } from './field-sampler.js';
import { SUBSET_STATEMENT } from './query.js';

const validator = createSeamValidator();

function lockstepConfig(): ConfigRun {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  return config;
}

const options = { rootSeed: 555, revision: 'test', dirty: false };

describe('the query seam (feature 104)', () => {
  let runtime: BackendRuntime;
  const config = lockstepConfig();

  const get = async (path: string) => {
    const response = await runtime.httpBackend.handle({ method: 'GET', path, body: '' });
    return { status: response.status, body: JSON.parse(response.body) as never };
  };

  beforeAll(() => {
    runtime = buildBackend(config, options, validator);
    for (let i = 0; i < 60; i++) runtime.clock.tickOnce();
  });
  afterAll(() => runtime.stop());

  it('serves discovery through the gate, master-valid, with truthful extents', async () => {
    const landing = await get('/api/edr/');
    expect(landing.status).toBe(200);
    expect(validator.validate('edr-collections#landing', landing.body).refusals).toEqual([]);
    const collections = await get('/api/edr/collections');
    expect(collections.status).toBe(200);
    expect(validator.validate('edr-collections#collections', collections.body).refusals).toEqual([]);
    const list = collections.body as { collections: { id: string; extent: { temporal: { interval: string[][] } } }[] };
    expect(list.collections.map((collection) => collection.id).sort()).toEqual(['archive', 'nowcast']);
    // The stated extent is the store's, not a wish: verified against the holding.
    const nowcast = runtime.store.currentNowcast();
    if (!nowcast) throw new Error('no nowcast');
    const served = list.collections.find((collection) => collection.id === 'nowcast');
    expect(served?.extent.temporal.interval[0][0]).toBe(nowcast.descriptor.manifest.grid.time.origin_sim_time);
  });

  it('answers a position query from the stored bytes, CoverageJSON, master-valid', async () => {
    const response = await get('/api/edr/collections/nowcast/position?coords=POINT(-11.2 46.1)&z=100');
    expect(response.status).toBe(200);
    const coverage = response.body as { domain: { domainType: string }; ranges: Record<string, { values: number[] }> };
    expect(validator.validate('coveragejson', coverage).refusals).toEqual([]);
    expect(coverage.domain.domainType).toBe('Point');
    expect(coverage.ranges.temperature.values).toHaveLength(1);
    expect(coverage.ranges.temperature.values[0]).toBeGreaterThan(-2);
    expect(coverage.ranges.temperature.values[0]).toBeLessThan(35);
  });

  it('AT-01: a trajectory through the seam returns values verified against the ground-truth manifest, within its recorded tolerance', async () => {
    const nowcast = runtime.store.currentNowcast();
    if (!nowcast) throw new Error('no nowcast');
    const manifest = nowcast.descriptor.manifest;
    const origin = timeAxisPosixOrigin(manifest);
    // A 4D route across the eddy: three vertices at different depths and times.
    const vertices = [
      { lon: -12.5, lat: 45.2, z: 50, t: origin + 0 },
      { lon: -11.2, lat: 46.1, z: 150, t: origin + 3600 },
      { lon: -10.0, lat: 47.0, z: 400, t: origin + 7200 },
    ];
    const coords = `LINESTRINGZM(${vertices.map((v) => `${v.lon} ${v.lat} ${v.z} ${v.t}`).join(', ')})`;
    const response = await get(
      `/api/edr/collections/nowcast/trajectory?coords=${encodeURIComponent(coords)}&parameter-name=temperature`,
    );
    expect(response.status).toBe(200);
    const coverage = response.body as {
      domain: { axes: { composite: { values: [string, number, number, number][] } } };
      ranges: { temperature: { values: number[] } };
    };
    expect(validator.validate('coveragejson', coverage).refusals).toEqual([]);

    // Ground truth: re-evaluate the analytic form from the manifest's own recorded
    // parameters at the snapped grid points the response reports, and hold the
    // served values inside the manifest's recorded tolerance — nothing typed here.
    const byId = Object.fromEntries(manifest.features.map((feature) => [feature.id, feature.parameters]));
    const world = { background: manifest.background.parameters, eddy: byId.eddy, front: byId.front, thermocline: byId.thermocline, moving: byId.moving } as WorldParameters;
    const tolerance = manifest.variables[0].tolerance_absolute;
    coverage.domain.axes.composite.values.forEach(([snappedTime, x, y, z], index) => {
      const seconds = Date.parse(snappedTime.slice(0, 23) + 'Z') / 1000 - origin;
      const expected = temperatureAt(world, x, y, z, seconds);
      expect(Math.abs(coverage.ranges.temperature.values[index] - expected)).toBeLessThanOrEqual(tolerance);
    });
    // And the per-vertex times genuinely differ: conditions at the moment of
    // arrival, not one instant for the whole route (FR-28).
    const times = coverage.domain.axes.composite.values.map(([time]) => time);
    expect(new Set(times).size).toBeGreaterThan(1);
  });

  it('refuses what it does not implement, naming the thing refused (FR-27)', async () => {
    const radius = await get('/api/edr/collections/nowcast/radius?coords=POINT(-11 46)');
    expect(radius.status).toBe(501);
    expect((radius.body as { refused: string }).refused).toMatch(/'radius' is not implemented; implemented: position, trajectory/);

    const badWkt = await get('/api/edr/collections/nowcast/position?coords=CIRCLE(1 2)&z=10');
    expect((badWkt.body as { refused: string }).refused).toMatch(/not the accepted shape POINT/);

    const badParameter = await get('/api/edr/collections/nowcast/position?coords=POINT(-11 46)&z=10&parameter-name=sound_speed');
    expect((badParameter.body as { refused: string }).refused).toMatch(/'sound_speed' is not served; served parameters: temperature, salinity/);

    const outside = await get('/api/edr/collections/nowcast/position?coords=POINT(5 5)&z=10');
    expect((outside.body as { refused: string }).refused).toMatch(/outside the collection's spatial extent/);

    const noCollection = await get('/api/edr/collections/mystery');
    expect(noCollection.status).toBe(404);
    expect((noCollection.body as { refused: string }).refused).toMatch(/no collection named 'mystery'; served: archive, nowcast/);
  });

  it('serves SensorThings over the store, read-only, master-valid, with honest paging', async () => {
    const root = await get('/api/st/v1.1/');
    expect(validator.validate('sensorthings-subset#service_root', root.body).refusals).toEqual([]);
    const things = await get('/api/st/v1.1/Things');
    expect(things.status).toBe(200);
    expect(validator.validate('sensorthings-subset#things_response', things.body).refusals).toEqual([]);
    // Two Things since feature 112: the sampling platform, and the ownship the
    // platform component reports on. Asserted as a set, because which sorts first is
    // the store's business and not this test's claim.
    expect(
      (things.body as { value: { name: string }[] }).value.map((thing) => thing.name).sort(),
    ).toEqual(['ownship', 'sampling platform A']);

    const observations = await get('/api/st/v1.1/Observations?%24top=5&%24skip=2');
    const page = observations.body as { '@iot.count': number; value: unknown[] };
    expect(page['@iot.count']).toBe(runtime.observationStore.count());
    expect(page.value).toHaveLength(5);

    const nested = await get("/api/st/v1.1/Datastreams('platform-a/temperature-050m')/Observations");
    const nestedPage = nested.body as { '@iot.count': number };
    // Sixty ticks, sampling every thirty, minus the tick-0 sample the sensors skip for
    // want of a position (FR-50): ticks 30 and 60.
    expect(nestedPage['@iot.count']).toBe(2);

    // The ownship datastreams are served by the same resource and no other: the track
    // the Map draws is this read, which is what makes it a query rather than a wire.
    const ownship = await get("/api/st/v1.1/Datastreams('ownship/ownship-course')/Observations");
    const ownshipPage = ownship.body as {
      '@iot.count': number;
      value: { phenomenonTime: string }[];
    };
    expect(ownshipPage['@iot.count']).toBe(3);
    expect(validator.validate('sensorthings-subset#observations_response', ownship.body).refusals).toEqual([]);

    // HistoricalLocations stays refused by name: the track has one representation, and
    // two that can disagree is what this refusal buys (FR-49).
    const historical = await get('/api/st/v1.1/HistoricalLocations');
    expect(historical.status).toBe(501);
    expect((historical.body as { refused: string }).refused).toMatch(/'HistoricalLocations' is not implemented/);

    const filter = await get('/api/st/v1.1/Observations?%24filter=result%20gt%2010');
    expect(filter.status).toBe(501);
    expect((filter.body as { refused: string }).refused).toMatch(/'\$filter' is not implemented; implemented options: \$top, \$skip/);

    const sensorsResource = await get('/api/st/v1.1/Sensors');
    expect(sensorsResource.status).toBe(501);
    expect((sensorsResource.body as { refused: string }).refused).toMatch(/'Sensors' is not implemented/);
  });

  it('holds the served subset statement equal to the documented one (E9)', async () => {
    const served = await get('/api/ctl/query-subsets');
    expect(served.status).toBe(200);
    expect(validator.validate('query-subsets', served.body).refusals).toEqual([]);
    expect(served.body).toEqual({ schema_version: 1, ...SUBSET_STATEMENT });
    const documented = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'docs', 'architecture', 'query-subsets.md'),
      'utf8',
    );
    const fenced = /```json\n([\s\S]*?)```/.exec(documented);
    expect(fenced, 'docs/architecture/query-subsets.md must carry the fenced JSON statement').not.toBeNull();
    const documentedStatement = JSON.parse(fenced?.[1] ?? '{}') as QuerySubsets;
    expect(served.body).toEqual(documentedStatement);
  });

  it('the inventory and the EDR collections describe the same holdings', async () => {
    const inventory = await get('/api/ctl/holdings');
    const document = inventory.body as HoldingsInventory;
    expect(validator.validate('holdings-inventory', document).refusals).toEqual([]);
    const collections = await get('/api/edr/collections');
    const ids = (collections.body as { collections: { id: string }[] }).collections.map((c) => c.id).sort();
    const eras = document.holdings.map((holding) => holding.era).sort();
    expect(ids).toEqual(eras);
  });
});
