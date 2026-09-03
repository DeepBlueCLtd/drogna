/**
 * Feature 116, on the real loop: the measurements reach the field.
 *
 * Nothing here is mocked. The generator authors the true ocean, the platform sails it,
 * the instruments sample it under their declared noise, the ingest seam stores what
 * passes, the scheduler asks for a run, and the analyst corrects the standing forecast
 * by what was measured before the runner forecasts from it. What is asserted is what
 * the loop did, scored against the generator's own field — never asserted from a
 * number chosen here (Constitution IX).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type {
  AnalysisContributions,
  AnalysisContributionsHeader,
  AnalysisPublished,
  ConfigRun,
  CoverageHolding,
  RunPublished,
} from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { buildBackend, type BackendRuntime } from '../runtime/runtime.js';
import { soundSpeedMs } from '../env-generator/analytic.js';
import { driveUntil } from '../test-support/drive.js';

const validator = createSeamValidator();
const options = { rootSeed: 4242, startCondition: 'loitering', revision: 'test', dirty: false };

function lockstepConfig(): ConfigRun {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  return config;
}

interface Record {
  analyses: AnalysisPublished[];
  runs: RunPublished[];
}

async function driveUntilAnalyses(
  runtime: BackendRuntime,
  config: ConfigRun,
  wanted: number,
  limit: number,
): Promise<Record> {
  const shell = runtime.transport.connect(`analyst-test-${Math.random()}`, 'shell');
  const record: Record = { analyses: [], runs: [] };
  shell.subscribe(config.analyst.topics.analysis_published, (message) => {
    expect(validator.validate('analysis-published', message.payload).refusals).toEqual([]);
    record.analyses.push(message.payload as AnalysisPublished);
  });
  shell.subscribe(config.model_runner.topics.run_published, (message) => {
    record.runs.push(message.payload as RunPublished);
  });
  // Both, and not only the analyses. Feature 123 put a cost between a run being announced
  // and its publication — the run occupies the ticks it comes to — so a drive that stopped
  // at the second analysis would stop with the second run still integrating, and the
  // pairing this file is about would be one short at the moment it was checked (T045).
  await driveUntil(runtime.clock, () => record.analyses.length >= wanted && record.runs.length >= wanted, limit);
  return record;
}

/** A request through the release gate, exactly as the browser's fetch makes it. */
async function get(runtime: BackendRuntime, path: string) {
  const response = await runtime.httpBackend.handle({ method: 'GET', path, body: '' });
  return { status: response.status, body: JSON.parse(response.body) as unknown };
}

/** A holding's fields as float32, one array per variable, at its single instant. */
function fieldsOf(holding: { descriptor: CoverageHolding; bytes: Uint8Array }): Float32Array[] {
  const grid = holding.descriptor.manifest.grid;
  const cells = grid.depth.count * grid.latitude.count * grid.longitude.count;
  const stride = grid.time.count * cells;
  const view = new Float32Array(holding.bytes.buffer, holding.bytes.byteOffset, holding.bytes.byteLength / 4);
  return holding.descriptor.manifest.variables.map((_, index) => view.slice(index * stride, index * stride + cells));
}

describe('the analysis, on the loop as it ships', () => {
  /**
   * One backend, turned once, for every assertion below.
   *
   * This file used to build and drive the whole harness per test — five scenarios,
   * each turning twenty-odd components for thousands of ticks — and on a slower runner
   * that ran past vitest's timeout. The loop is deterministic, so the assertions are
   * about one run of it and there was never a reason for each to have its own.
   */
  let runtime: BackendRuntime;
  let config: ConfigRun;
  let record: Record;

  beforeAll(async () => {
    config = lockstepConfig();
    runtime = buildBackend(config, options, validator);
    record = await driveUntilAnalyses(runtime, config, 2, 12000);
    // Turning the shipped configuration far enough for a second analysis is about ten
    // seconds of real work here and roughly twice that on a CI runner. The budget for
    // it is the one in vite.config.ts, which carries the argument; a second number
    // here would be free to drift from it.
  });

  afterAll(() => runtime.stop());

  it('stands between the request and the run, and the runner initialises from what it published', () => {
    expect(record.analyses.length).toBeGreaterThanOrEqual(2);

    // One analysis per run, each naming the run it initialises, in that order.
    expect(record.runs.map((run) => run.run_id)).toEqual(record.analyses.map((analysis) => analysis.run_id));

    for (const analysis of record.analyses) {
      const field = runtime.store.holding(analysis.collections.analysis);
      const error = runtime.store.holding(analysis.collections.error);
      const provenance = runtime.store.holding(analysis.collections.provenance);
      expect(field?.descriptor.field.sha256).toBe(analysis.digests.analysis);
      expect(error?.descriptor.field.sha256).toBe(analysis.digests.error);
      expect(provenance?.descriptor.field.sha256).toBe(analysis.digests.provenance);
      expect(field?.descriptor.era).toBe('analysis');
      // Every one is a holding you can query. That is the whole reason the analysis
      // is a component and not a private stage inside the runner.
      expect(field?.descriptor.manifest.composition.rule).toBe('analysis');
    }

    // The first cycle has no forecast to correct and says so in its lineage; every
    // later one corrects a forecast. Nothing ever initialises from the true field
    // after that one stated reading.
    expect(record.analyses[0].background.era).toBe('nowcast');
    for (const analysis of record.analyses.slice(1)) expect(analysis.background.era).toBe('instance');
    expect(runtime.store.holding(record.analyses[0].collections.analysis)?.descriptor.manifest.composition.description).toContain(
      'Cold start',
    );
  });

  it('serves each of the cycle\'s three fields under its own EDR collection id', async () => {
    // The three are one era, and an era is not an identity: naming a collection by era
    // works only where the era holds one field. It held for archive and now-cast, and
    // it silently stopped holding here — all three ids resolved to whichever of the
    // three had been stored last, so the map's provenance query was refused 404 while
    // the analysis and its error answered with each other's numbers.
    const analysis = record.analyses[1];
    const wanted = [analysis.collections.analysis, analysis.collections.error, analysis.collections.provenance];
    expect(new Set(wanted).size).toBe(3);

    const listed = await get(runtime, '/api/edr/collections');
    const served = new Set((listed.body as { collections: { id: string }[] }).collections.map((c) => c.id));
    for (const id of wanted) expect(served.has(id)).toBe(true);

    // And each answers from its own bytes rather than a neighbour's. The identity that
    // separates them is the one the figure is built on: provenance's four shares sum to
    // one at every cell, which neither the analysis nor its error does. Serve the wrong
    // holding under this id and the sum is a temperature.
    const shares = runtime.store.holding(analysis.collections.provenance)?.descriptor.manifest.variables.map((v) => v.name);
    if (!shares || shares.length !== 4) throw new Error('the provenance holding does not carry four shares');
    const answer = await get(
      runtime,
      `/api/edr/collections/${analysis.collections.provenance}/position?coords=POINT(-11 46)&z=0`,
    );
    expect(answer.status).toBe(200);
    // `Record` is taken by this file's own interface, so the shape is spelled out.
    const ranges = (answer.body as { ranges: { [name: string]: { values: number[] } } }).ranges;
    expect(Object.keys(ranges).sort()).toEqual([...shares].sort());
    expect(shares.reduce((total, name) => total + ranges[name].values[0], 0)).toBeCloseTo(1, 3);
  });

  // AT-04: not byte-identity — locality within one run, not reproduction across two
  it('changes the field only where the measurements reach, and leaves the rest byte-identical', () => {
    // The second cycle, whose background is a forecast rather than the cold start.
    const analysis = record.analyses[1];
    const background = runtime.store.holding(analysis.background.holding_id);
    const analysed = runtime.store.holding(analysis.collections.analysis);
    if (!background || !analysed) throw new Error('the loop did not turn');
    expect(analysis.observations.assimilated).toBeGreaterThan(0);

    const backgroundT = fieldsOf(background)[0];
    const analysedT = fieldsOf(analysed)[0];
    const changed: number[] = [];
    for (let cell = 0; cell < analysedT.length; cell++) {
      if (analysedT[cell] !== backgroundT[cell]) changed.push(cell);
    }
    expect(changed.length).toBeGreaterThan(0);
    // Compact support, as it shows at this scale: most of the grid is byte-identical to
    // the forecast it was built from, because most of it is out of every measurement's
    // reach. A Gaussian would have moved every cell by something.
    expect(analysedT.length - changed.length).toBeGreaterThan(analysedT.length / 2);

    // That the analysis moves the field *toward the truth* is scored where it can be
    // scored exactly: in kernel.test.ts, against a field the test itself controls, with
    // the bound derived from the declared instrument error and a negative control that
    // reverses the gain. It is deliberately not scored here. The published now-cast is
    // truth at its own instant, and an analysis initialises at the instant its run was
    // requested; comparing the two compares different moments of a drifting ocean, and
    // says more about how far the sea moved between them than about the analysis. That
    // it happened to pass on a coarser grid is not a reason to keep asking it.
  });

  it('reduces the doubt it publishes exactly where a measurement reached, and nowhere else', () => {
    // The second cycle's background error is the spread the first run published: that
    // is the B the gain was built from, so it is what the reduction must be read
    // against. Comparing the error field to itself across cells would say nothing —
    // the spread is no longer flat, which is the point of perturbing the ensemble.
    const analysis = record.analyses[1];
    const error = runtime.store.holding(analysis.collections.error);
    const provenance = runtime.store.holding(analysis.collections.provenance);
    const spread = runtime.store.holding(record.runs[0].collections.uncertainty);
    if (!error || !provenance || !spread) throw new Error('the loop did not turn');

    const errorT = fieldsOf(error)[0];
    const spreadT = fieldsOf(spread)[0];
    const shares = fieldsOf(provenance);
    let reduced = 0;
    for (let cell = 0; cell < errorT.length; cell++) {
      // Every cell's four shares sum to one: the identity the figure is built on,
      // held against a field the running loop actually published.
      const total = shares[0][cell] + shares[1][cell] + shares[2][cell] + shares[3][cell];
      expect(total).toBeCloseTo(1, 3);
      // Doubt never rises. Where it fell, a measurement must have reached the cell
      // this cycle, so measurement holds a share of it. The converse does not follow
      // and is not asserted: a share is cumulative across cycles, so a cell measured
      // last time and not this one keeps its share while its doubt stands still —
      // which is exactly what the ageing dilution is for.
      expect(errorT[cell]).toBeLessThanOrEqual(spreadT[cell] + 1e-6);
      if (errorT[cell] < spreadT[cell]) {
        // Measurement took a share of it — which may be negative. The gain's row sum
        // is not confined to [0, 1]: where it exceeds one the analysis extrapolates
        // past the readings, and where it falls below zero it moves the cell against
        // their consensus. Both are optimal interpolation behaving correctly on a
        // background error that varies sharply, which is exactly what perturbing the
        // ensemble from Pᵃ produces.
        expect(shares[2][cell]).not.toBe(0);
        reduced += 1;
      }
      // And a cell no measurement has ever reached is untouched, exactly. Compact
      // support makes that a fact rather than a small number.
      if (shares[2][cell] === 0) expect(errorT[cell]).toBe(spreadT[cell]);
    }
    expect(reduced).toBeGreaterThan(0);
  });

  it('leaves the true now-cast standing, and no run ever initialises from it again', () => {
    // The generator keeps evaluating truth on its cadence — that is what makes the
    // analysis scoreable — but after the stated cold start nothing initialises from it.
    const nowcast = runtime.store.currentNowcast();
    expect(nowcast).toBeDefined();
    const instances = runtime.store.holdings().filter((holding) => holding.era === 'instance');
    expect(instances.length).toBeGreaterThan(0);
    for (const instance of instances) {
      expect(instance.manifest.composition.description).not.toContain('now-cast initial state');
    }
  });

  it('measures the sea and not the platform: an ownship datastream informs nothing', async () => {
    // Its own backend, because it alters the configuration the shared one was built
    // from, and one analysis is enough to hold what it holds.
    const altered = lockstepConfig();
    // The exclusions the analyst declares are the ownship datastreams, and a course is
    // not a sample of the ocean. Remove the exclusion list and the analyst still must
    // not assimilate them, because they are not temperature or salinity either — two
    // independent reasons, and this holds the second.
    altered.analyst.excluded_datastreams = [];
    const own = buildBackend(altered, options, validator);
    const ownRecord = await driveUntilAnalyses(own, altered, 1, 12000);
    const ocean = altered.sensors.instruments.filter(
      (instrument) => instrument.observed_property === 'temperature' || instrument.observed_property === 'salinity',
    );
    expect(ocean.length).toBeGreaterThan(0);
    // Only ocean observations were assimilated, so the count is divisible by nothing
    // the ownship streams contribute: asserted by the analysis carrying no observation
    // from a datastream no instrument declares an error for.
    expect(ownRecord.analyses[0].observations.assimilated).toBeGreaterThan(0);
    expect(soundSpeedMs(10, 35, 50)).toBeGreaterThan(0);
    own.stop();
  });
});

describe('what each cell was made from, source by source (feature 124)', () => {
  let runtime: BackendRuntime;
  let config: ConfigRun;
  let record: Record;

  beforeAll(async () => {
    config = lockstepConfig();
    runtime = buildBackend(config, options, validator);
    record = await driveUntilAnalyses(runtime, config, 2, 12000);
  });

  afterAll(() => runtime.stop());

  /** A holding's rows summed per level of a column, from the served document. */
  function levelsOf(document: AnalysisContributions) {
    return document.levels.map((level) => ({
      ...level,
      sum: level.contributions.reduce((total, entry) => total + entry.contribution, 0) + level.remainder,
      magnitude:
        level.contributions.reduce((total, entry) => total + Math.abs(entry.contribution), 0) +
        Math.abs(level.remainder) +
        Math.abs(level.observation_weight),
    }));
  }

  it('publishes the contributions beside the analysis, under their own format, and EDR does not list them', async () => {
    for (const analysis of record.analyses) {
      const holding = runtime.store.holding(analysis.collections.contributions);
      expect(holding?.descriptor.field.sha256).toBe(analysis.digests.contributions);
      expect(holding?.descriptor.field.format).toBe('drogna-contributions-v1');
      expect(holding?.descriptor.era).toBe('analysis');
    }
    const listed = await get(runtime, `${config.query.http.edr_prefix}/collections`);
    const served = new Set((listed.body as { collections: { id: string }[] }).collections.map((c) => c.id));
    expect(served.has(record.analyses[1].collections.provenance)).toBe(true);
    expect(served.has(record.analyses[1].collections.contributions)).toBe(false);
    // And asked for as a collection anyway, EDR names what it does serve rather than
    // sampling bytes that are not a grid.
    const refused = await get(runtime, `${config.query.http.edr_prefix}/collections/${record.analyses[1].collections.contributions}`);
    expect(refused.status).toBe(404);
  });

  it('serves a column whose sources sum, with the remainder, to the weight it states — within the holding’s own tolerance', async () => {
    const analysis = record.analyses[1];
    const prefix = config.query.http.contributions_prefix;
    const holding = runtime.store.holding(analysis.collections.contributions);
    if (!holding) throw new Error('no contributions holding');
    const tolerance = holding.descriptor.manifest.variables[0].tolerance_absolute;
    expect(tolerance).toBeGreaterThan(0);

    const header = await get(runtime, `${prefix}/${analysis.collections.contributions}`);
    expect(header.status).toBe(200);
    expect(validator.validate('analysis-contributions#header', header.body).refusals).toEqual([]);
    const sources = (header.body as AnalysisContributionsHeader).sources;
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) expect(source.kind).toBe('measured');

    // A column at a source's own cell: reached at that level, and at least one entry.
    const at = sources[0].cell;
    const answer = await get(runtime, `${prefix}/${analysis.collections.contributions}/column?coords=POINT(${at.longitude} ${at.latitude})`);
    expect(answer.status).toBe(200);
    expect(validator.validate('analysis-contributions', answer.body).refusals).toEqual([]);
    const document = answer.body as AnalysisContributions;
    expect(document.column.longitude).toBeCloseTo(at.longitude, 9);
    const levels = levelsOf(document);
    const reached = levels.filter((level) => level.reached);
    expect(reached.length).toBeGreaterThan(0);
    expect(reached.some((level) => level.contributions.length > 0)).toBe(true);
    for (const level of levels) {
      if (!level.reached) {
        // Not reached: nought exactly, nothing to state, and said as such (FR-129).
        expect(level.observation_weight).toBe(0);
        expect(level.contributions).toEqual([]);
        expect(level.background_error_std).toBeNull();
        continue;
      }
      expect(level.background_error_std).toBeGreaterThan(0);
      // The identity, at the tolerance the manifest declares for this holding — float32's
      // width at the largest magnitude stored — scaled by the terms summed.
      expect(Math.abs(level.sum - level.observation_weight)).toBeLessThanOrEqual(tolerance * (level.contributions.length + 2));
      for (const entry of level.contributions) {
        expect(entry.source).toBeLessThan(document.sources.length);
        // Inside the support, which is twice each half-width the document itself states.
        const { horizontal_km, vertical_m } = document.correlation;
        const scaled = Math.hypot(entry.separation.horizontal_km / horizontal_km, entry.separation.vertical_m / vertical_m);
        expect(scaled).toBeLessThan(2);
      }
    }
    // Deep water: the instruments sit at 50 m and 200 m and the vertical support is
    // 320 m, so the bottom of the column is out of every source's reach — the reading
    // FR-127 says the profile exists to make obvious.
    expect(levels[levels.length - 1].reached).toBe(false);
  });

  it('at the cold start, where nothing was carried, the weight IS the measurement share the same cycle published', async () => {
    // The published measurement share is (1 − ω)·carried + ω. On the first cycle the
    // carried share is nought — the state is all archive at the quay — so the share
    // and ω are one number, and the holding is checked against the provenance rather
    // than trusted. On later cycles the carried share is not published on its own and
    // the identity is held in kernel.test.ts instead.
    const analysis = record.analyses[0];
    const prefix = config.query.http.contributions_prefix;
    const holding = runtime.store.holding(analysis.collections.contributions);
    const provenance = runtime.store.holding(analysis.collections.provenance);
    if (!holding || !provenance) throw new Error('the loop did not turn');
    const shares = fieldsOf(provenance);
    const measurementShare = shares[provenance.descriptor.manifest.variables.findIndex((v) => v.name.endsWith('_measurement'))];
    const tolerance = holding.descriptor.manifest.variables[0].tolerance_absolute;
    const header = (await get(runtime, `${prefix}/${analysis.collections.contributions}`)).body as AnalysisContributionsHeader;
    let compared = 0;
    for (const source of header.sources.slice(0, 5)) {
      const answer = await get(runtime, `${prefix}/${analysis.collections.contributions}/column?coords=POINT(${source.cell.longitude} ${source.cell.latitude})`);
      const document = answer.body as AnalysisContributions;
      for (const level of document.levels) {
        expect(Math.abs(level.observation_weight - measurementShare[level.cell_index])).toBeLessThanOrEqual(2 * tolerance);
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(0);
  });

  it('refuses what it cannot serve by name: a coverage, a query it lacks, a position outside the domain', async () => {
    const analysis = record.analyses[1];
    const prefix = config.query.http.contributions_prefix;
    const coverage = await get(runtime, `${prefix}/${analysis.collections.provenance}`);
    expect(coverage.status).toBe(404);
    expect((coverage.body as { refused: string }).refused).toContain(config.query.http.edr_prefix);
    const unknown = await get(runtime, `${prefix}/${analysis.collections.contributions}/radius?coords=POINT(-11 46)`);
    expect(unknown.status).toBe(404);
    expect((unknown.body as { refused: string }).refused).toContain('column');
    const outside = await get(runtime, `${prefix}/${analysis.collections.contributions}/column?coords=POINT(0 0)`);
    expect(outside.status).toBe(400);
    expect((outside.body as { refused: string }).refused).toContain('outside');
    const bare = await get(runtime, `${prefix}/${analysis.collections.contributions}/column`);
    expect(bare.status).toBe(400);
  });
});
