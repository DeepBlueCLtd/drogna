/**
 * Feature 102's integration surface: the generator provisions through the store's
 * one seam, the manifests validate against their master and stay sufficient, the
 * digest check refuses tampered bytes with the pointer untouched, the now-cast
 * follows its cadence, an eddy is recoverable within a bound read from the manifest
 * (AT-03's descendant), and two runs from one seed are byte-identical (AT-04's
 * seed-level claim).
 */
import { describe, expect, it } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun, CoverageHolding, Manifest } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { buildBackend } from '../runtime/runtime.js';
import { sha256Hex } from '../lib/sha256.js';
import { kmOffsets, temperatureAt, thermoclineDepthAt, type WorldParameters } from './analytic.js';
import { estimateFeatures } from '../model-runner/features.js';
import { axisValues } from './generator.js';

const validator = createSeamValidator();

function lockstepConfig(): ConfigRun {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  return config;
}

const options = { rootSeed: 1234, startCondition: 'loitering', revision: 'test', dirty: false };

function worldFromManifest(manifest: Manifest): WorldParameters {
  const byId = Object.fromEntries(manifest.features.map((feature) => [feature.id, feature.parameters]));
  return {
    background: manifest.background.parameters,
    eddy: byId.eddy,
    front: byId.front,
    thermocline: byId.thermocline,
    moving: byId.moving,
  } as WorldParameters;
}

describe('the synthetic ocean (feature 102)', () => {
  it('provisions archive, departure brief and now-cast through the publication seam at tick 0', () => {
    const runtime = buildBackend(lockstepConfig(), options, validator);
    const eras = runtime.store.holdings().map((holding) => holding.era).sort();
    expect(eras).toEqual(['archive', 'departure', 'nowcast']);
    runtime.stop();
  });

  it('every holding and its embedded manifest validate against their masters', () => {
    const runtime = buildBackend(lockstepConfig(), options, validator);
    for (const holding of runtime.store.holdings()) {
      expect(validator.validate('coverage-holding', holding).refusals).toEqual([]);
      expect(validator.validate('manifest', holding.manifest).refusals).toEqual([]);
    }
    runtime.stop();
  });

  it('stored bytes match their recorded digest, and the manifest is sufficient: the analytic form reproduces stored values within the recorded tolerance', () => {
    const runtime = buildBackend(lockstepConfig(), options, validator);
    const nowcast = runtime.store.currentNowcast();
    expect(nowcast).toBeDefined();
    if (!nowcast) throw new Error('unreachable');
    expect(`sha256:${sha256Hex(nowcast.bytes)}`).toBe(nowcast.descriptor.field.sha256);

    const manifest = nowcast.descriptor.manifest;
    const world = worldFromManifest(manifest);
    const lons = axisValues(manifest.grid.longitude);
    const lats = axisValues(manifest.grid.latitude);
    const depths = axisValues(manifest.grid.depth);
    const cells = manifest.grid.time.count * depths.length * lats.length * lons.length;
    const temperature = new Float32Array(nowcast.bytes.buffer, 0, cells);
    const tolerance = manifest.variables[0].tolerance_absolute;
    // A spread of probes across the volume, not a corner: index (t, d, la, lo).
    for (const [t, d, la, lo] of [
      [0, 0, 0, 0],
      [1, 2, 7, 11],
      [3, 5, 19, 23],
      [2, 3, 10, 5],
    ]) {
      const index = ((t * depths.length + d) * lats.length + la) * lons.length + lo;
      const seconds = manifest.grid.time.start_offset_seconds + t * manifest.grid.time.step_seconds;
      const expected = temperatureAt(world, lons[lo], lats[la], depths[d], seconds);
      expect(Math.abs(temperature[index] - expected)).toBeLessThanOrEqual(tolerance);
    }
    runtime.stop();
  });

  it('refuses tampered bytes with the mismatch named, the holdings untouched (FR-13, watched)', () => {
    const runtime = buildBackend(lockstepConfig(), options, validator);
    const nowcast = runtime.store.currentNowcast();
    if (!nowcast) throw new Error('no nowcast');
    const before = runtime.store.holdings().map((holding) => holding.holding_id);
    const tampered = new Uint8Array(nowcast.bytes);
    tampered[42] ^= 0xff;
    const descriptor: CoverageHolding = {
      ...nowcast.descriptor,
      holding_id: 'nowcast.tampered.t0',
    };
    const verdict = runtime.store.publish({ descriptor, bytes: tampered });
    expect(verdict.outcome).toBe('refused');
    if (verdict.outcome !== 'refused') throw new Error('unreachable');
    expect(verdict.refusal).toMatch(/does not match the digest its descriptor records/);
    expect(verdict.refusal).toMatch(/pointer untouched/);
    expect(runtime.store.holdings().map((holding) => holding.holding_id)).toEqual(before);
    runtime.stop();
  });

  it('refuses a second set of bytes under a holding id it already holds (feature 125, watched)', () => {
    /**
     * The digest check above proves the staged bytes match the descriptor that travelled
     * with them. A *replacement* satisfies that exactly — both holdings are internally
     * consistent, both digests check out — so it passed, the map entry was overwritten, and
     * the reader found the field they were looking at replaced by a different one under the
     * same name. Perfectly silent.
     *
     * Watched happening from the Operator tab with the clock stopped: restart the scheduler
     * at the tick a run was requested at, and a rate change republishes that tick to the
     * fresh instance, whose cadence floor fires and reissues the same tick-derived
     * identifier. Four analysis holdings replaced, clock never moving.
     */
    const runtime = buildBackend(lockstepConfig(), options, validator);
    const nowcast = runtime.store.currentNowcast();
    if (!nowcast) throw new Error('no nowcast');
    const standing = runtime.store.holding(nowcast.descriptor.holding_id);
    if (!standing) throw new Error('the store lost the now-cast between reading it twice');

    // Different bytes, honestly described: a descriptor whose digest matches what it carries.
    const different = new Uint8Array(nowcast.bytes);
    different[7] ^= 0xff;
    const descriptor: CoverageHolding = {
      ...nowcast.descriptor,
      field: { ...nowcast.descriptor.field, sha256: `sha256:${sha256Hex(different)}` },
    };
    const verdict = runtime.store.publish({ descriptor, bytes: different });
    expect(verdict.outcome).toBe('refused');
    if (verdict.outcome !== 'refused') throw new Error('unreachable');
    expect(verdict.refusal).toMatch(/already held/);
    expect(verdict.refusal).toMatch(/one set of bytes for the life of a run/);
    // And the bytes that were there are the bytes that are there.
    expect(runtime.store.holding(nowcast.descriptor.holding_id)?.descriptor.field.sha256).toBe(
      standing.descriptor.field.sha256,
    );

    // Restating what is already held is not a loss, and the snapshot source depends on it.
    expect(runtime.store.publish({ descriptor: nowcast.descriptor, bytes: nowcast.bytes }).outcome).toBe('written');
    runtime.stop();
  });

  it('will not let a republication rewind an era pointer (feature 125, watched)', () => {
    /**
     * Identical bytes are allowed — the snapshot source's whole job is to put back what was
     * authored — but "these are the bytes that were there" is not "this should move the
     * pointer forward", and everything downstream reads the pointer.
     *
     * Watched happening on `returning` through the plane's own verbs, by pressing restart on
     * the snapshot source: a fresh instance holds the whole artefact again and republishes it,
     * and the `instance` pointer went from `…-run-t9930` back to `…-run-t9171` while the live
     * now-cast holding was deleted. The monitor then scored live soundings against a
     * 759-tick-stale forecast, and telemetry — keyed on the live run — dropped every residual
     * it published. The now-cast half predates the forecast eras; the `instance` half arrived
     * with them, because until this feature an artefact carried no instance holdings.
     */
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    const first = runtime.store.currentNowcast();
    if (!first) throw new Error('no nowcast');
    const stale = { descriptor: first.descriptor, bytes: first.bytes };

    // Let the cadence move the pointer on.
    for (let i = 0; i < config.env_generator.nowcast.interval_ticks; i++) runtime.clock.tickOnce();
    const standing = runtime.store.currentNowcast();
    expect(standing?.descriptor.holding_id, 'the cadence did not move the pointer').not.toBe(
      first.descriptor.holding_id,
    );

    // The older holding, republished byte for byte, exactly as a restarted source would.
    // Accounted for and not written — the outcome that names the difference, and the one the
    // snapshot source counts apart from both a replay and a refusal.
    expect(
      runtime.store.publish(stale).outcome,
      'identical bytes behind the era pointer are superseded, neither written nor refused',
    ).toBe('superseded');
    expect(
      runtime.store.currentNowcast()?.descriptor.holding_id,
      'a republication of an older holding rewound the era pointer',
    ).toBe(standing?.descriptor.holding_id);
    const inventory = runtime.store.holdings().map((holding) => holding.holding_id);
    expect(inventory, 'the standing holding was deleted by a republication of its predecessor').toContain(
      String(standing?.descriptor.holding_id),
    );
    // **And the superseded holding is not resurrected.** The first version of this guard held
    // the pointer back and left the insert unconditional, which put the discarded now-cast
    // back into the inventory where no pointer named it — worse than the fault it replaced,
    // because three readers resolve the now-cast by scanning the inventory rather than by
    // asking the pointer, and they disagree the moment there is more than one: the EDR
    // collection takes the last, the map's axis lookup the first, and the environment
    // generator reads its cadence from whichever it finds.
    expect(
      inventory.filter((id) => id.startsWith('nowcast.')),
      'a republication of a superseded now-cast put it back in the inventory',
    ).toEqual([String(standing?.descriptor.holding_id)]);
    runtime.stop();
  });

  it('replaces the now-cast on its configured cadence, announced not polled', () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    const shell = runtime.transport.connect('shell', 'shell');
    const announcements: { era: string; tick: number }[] = [];
    shell.subscribe(config.coverage_store.topics.published, (message) => {
      const payload = message.payload as { era: string; tick: number };
      announcements.push({ era: payload.era, tick: payload.tick });
    });
    const first = runtime.store.currentNowcast()?.descriptor.holding_id;
    for (let i = 0; i < config.env_generator.nowcast.interval_ticks; i++) runtime.clock.tickOnce();
    const second = runtime.store.currentNowcast()?.descriptor.holding_id;
    expect(second).not.toBe(first);
    // The archive and the departure brief stay; the old now-cast was replaced, not
    // accumulated. The brief being here after a cadence turn is the point of it: it is
    // issued once and never refreshed (feature 121).
    expect(runtime.store.holdings().map((holding) => holding.era).sort()).toEqual([
      'archive',
      'departure',
      'nowcast',
    ]);
    expect(announcements).toEqual([
      { era: 'nowcast', tick: config.env_generator.nowcast.interval_ticks },
    ]);
    runtime.stop();
  });

  it('the thermocline surface recovered from the stored bytes has the shape the manifest predicts (issue #113, analytic form 2)', () => {
    const runtime = buildBackend(lockstepConfig(), options, validator);
    const nowcast = runtime.store.currentNowcast();
    if (!nowcast) throw new Error('no nowcast');
    const manifest = nowcast.descriptor.manifest;
    const world = worldFromManifest(manifest);

    const lons = axisValues(manifest.grid.longitude);
    const lats = axisValues(manifest.grid.latitude);
    const depths = axisValues(manifest.grid.depth);
    const perLevel = lats.length * lons.length;
    const cells = manifest.grid.time.count * depths.length * perLevel;
    const temperature = new Float32Array(nowcast.bytes.buffer, 0, cells);

    // One column at a time through the *published* estimator, rather than a second pick
    // written here: a one-cell grid's domain mean is that column, so `estimateFeatures`
    // answers the question it already answers for the whole domain. A transcription of
    // its argmax would keep passing after the estimator changed, which is how this
    // repository has been caught before.
    const columnGrid = (longitude: number, latitude: number) => ({
      longitudes: [longitude],
      latitudes: [latitude],
      depthsM: depths,
      cellKmEast: manifest.grid.longitude.spacing,
      cellKmNorth: manifest.grid.latitude.spacing,
      referenceLatitude: latitude,
    });
    const column = new Float32Array(depths.length);
    const recovered: { picked: number; predicted: number }[] = [];
    lats.forEach((latitude, la) =>
      lons.forEach((longitude, lo) => {
        for (let level = 0; level < depths.length; level++) column[level] = temperature[level * perLevel + la * lons.length + lo];
        // A column whose profile never falls has no thermocline, and `estimateFeatures` says so
        // by returning nothing for it. (An earlier version also tested `'reason' in estimate`,
        // which selects no reachable state — `ThermoclineEstimate` has no such field — and read
        // as a guard against something that cannot happen.)
        const estimate = estimateFeatures(column, columnGrid(longitude, latitude)).thermocline;
        if (!estimate) return;
        recovered.push({ picked: estimate.depthM, predicted: thermoclineDepthAt(world, longitude, latitude, 0) });
      }),
    );
    expect(recovered.length).toBe(perLevel);

    /*
     * **The bound is the manifest's own arithmetic, never a number typed here.** The layer
     * spans `displacement_m_per_c` times the range of the feature anomalies at its nominal
     * depth; divided by the depth spacing that is how many level boundaries the dome
     * crosses, and a pick quantised to midpoints therefore takes at least that many values
     * plus one.
     *
     * Analytic form 1 had no displacement term, so this predicted relief was nought and
     * the assertion below reduced to "at least one distinct depth" — trivially true, which
     * is exactly why form 1's flatness went unnoticed until #113 measured it. The bound
     * has teeth only because the manifest now carries a displacement to derive it from.
     */
    const predicted = recovered.map((entry) => entry.predicted);
    const relief = Math.max(...predicted) - Math.min(...predicted);
    const expected = Math.floor(relief / manifest.grid.depth.spacing) + 1;
    expect(expected).toBeGreaterThan(1);
    const distinct = new Set(recovered.map((entry) => entry.picked));
    expect(distinct.size).toBeGreaterThanOrEqual(expected);

    /*
     * Variety alone would pass on noise, so the shape is tied back to the manifest: the
     * columns the bytes place the layer deepest in must be the columns the manifest
     * predicts deepest. Grouped by the recovered depth, the mean predicted depth has to
     * rise with it.
     */
    const groups = new Map<number, number[]>();
    for (const entry of recovered) groups.set(entry.picked, [...(groups.get(entry.picked) ?? []), entry.predicted]);
    const ordered = [...groups.entries()]
      .filter(([, values]) => values.length >= 8)
      .sort((a, b) => a[0] - b[0])
      .map(([picked, values]) => ({ picked, mean: values.reduce((sum, v) => sum + v, 0) / values.length }));
    expect(ordered.length).toBeGreaterThanOrEqual(2);
    for (let at = 1; at < ordered.length; at++) expect(ordered[at].mean).toBeGreaterThan(ordered[at - 1].mean);

    runtime.stop();
  });

  it('AT-03 descendant: the eddy is recoverable from the stored bytes, with the error reported against a bound read from the manifest', () => {
    const runtime = buildBackend(lockstepConfig(), options, validator);
    const nowcast = runtime.store.currentNowcast();
    if (!nowcast) throw new Error('no nowcast');
    const manifest = nowcast.descriptor.manifest;
    const eddy = manifest.features.find((feature) => feature.kind === 'eddy');
    if (!eddy || eddy.kind !== 'eddy') throw new Error('no eddy in the manifest');

    const lons = axisValues(manifest.grid.longitude);
    const lats = axisValues(manifest.grid.latitude);
    const depths = axisValues(manifest.grid.depth);
    const cells = manifest.grid.time.count * depths.length * lats.length * lons.length;
    const temperature = new Float32Array(nowcast.bytes.buffer, 0, cells);

    // The level nearest the eddy's authored depth, at the first time step.
    const level = depths.reduce(
      (best, depth, index) =>
        Math.abs(depth - eddy.parameters.depth_centre_m) < Math.abs(depths[best] - eddy.parameters.depth_centre_m)
          ? index
          : best,
      0,
    );
    const slice: number[][] = lats.map((_, la) =>
      lons.map((_, lo) => temperature[(level * lats.length + la) * lons.length + lo]),
    );
    const flat = slice.flat().sort((a, b) => a - b);
    const median = flat[Math.floor(flat.length / 2)];
    let peak = 0;
    for (const row of slice) for (const value of row) peak = Math.max(peak, value - median);
    let weightSum = 0;
    let lonSum = 0;
    let latSum = 0;
    slice.forEach((row, la) =>
      row.forEach((value, lo) => {
        const anomaly = value - median;
        if (anomaly > 0.5 * peak) {
          weightSum += anomaly;
          lonSum += anomaly * lons[lo];
          latSum += anomaly * lats[la];
        }
      }),
    );
    const recovered = { longitude: lonSum / weightSum, latitude: latSum / weightSum };
    const { eastKm, northKm } = kmOffsets(
      recovered.longitude,
      recovered.latitude,
      eddy.parameters.centre_longitude,
      eddy.parameters.centre_latitude,
      eddy.parameters.centre_latitude,
    );
    const errorKm = Math.hypot(eastKm, northKm);
    /*
     * The bound is still read from the manifest and never typed here, but it is the
     * eddy's own radius rather than two grid cells, and the change is a finding.
     *
     * Two cells held while the now-cast was 24 x 20, where two cells is 47 km.
     * Quadrupling both horizontal axes tightened it to 11 km and this test failed at
     * 13.9 km. Measuring the same recovery at 24 x 20, 48 x 40, 72 x 60, 96 x 80 and
     * 192 x 160 said why: the error converges — 13.3, 14.4, 14.0, 13.9, 14.1 km at this
     * seed — instead of falling with the spacing, and it converges at every seed tried.
     * It was never the grid. The other three features are composed into the same slice,
     * and the centroid of everything above half the peak is pulled by them; a finer grid
     * measures that pull more precisely rather than removing it. Two cells was a claim
     * about what a grid can resolve — a floor under the achievable error — being read as
     * a ceiling over this estimator's, and it was true only while the grid was coarser
     * than the bias.
     *
     * What AT-03 is for survives the correction: an authored feature is recoverable from
     * the stored product. So the claim is that the centre recovered from the bytes falls
     * inside the eddy those bytes carry. It fails if the eddy is not there, if the slice
     * is the wrong one, or if composition stops putting it where the parameters say.
     */
    const boundKm = eddy.parameters.radius_km;
    console.log(
      `AT-03: eddy centre recovered with error ${errorKm.toFixed(1)} km (bound ${boundKm.toFixed(1)} km, ` +
        `the eddy's own radius; the grid resolves ${(2 * eddy.resolution.grid_spacing).toFixed(1)} km)`,
    );
    expect(errorKm).toBeLessThanOrEqual(boundKm);
    runtime.stop();
  });

  /**
   * The cost guard on the density. Publishing a now-cast is one synchronous pass —
   * every cell evaluated from the analytic form, then SHA-256 over the bytes, and again
   * in the store's own digest check — and the generator repeats it every
   * `interval_ticks` for as long as the run lasts. At the shipped 96 x 80 x 6 x 4 that
   * pass measures about 270 ms on a development machine against 18 ms at 24 x 20, and a
   * forecast run over the same grid about 420 ms against 27 ms.
   *
   * At the rate the map is watched that is one pass every fifteen minutes of wall time
   * and nobody sees it. Wound forward it is what the clock's pace is spent on: the
   * shell's fast buttons already deliver less than the rate they name, and this density
   * roughly halves what they do deliver. Doubling the cells again would spend the rest.
   *
   * So the ceiling is a decision recorded here rather than one left to be rediscovered
   * from a stuttering map. The grid may be made denser again — and then this line moves
   * with it, deliberately, against a fresh measurement.
   */
  it('the shipped now-cast field stays inside the publication budget the fast clock absorbs', () => {
    const CEILING_BYTES = 2 * 1024 * 1024;
    const runtime = buildBackend(lockstepConfig(), options, validator);
    const nowcast = runtime.store.currentNowcast();
    if (!nowcast) throw new Error('no nowcast');
    // The model runner initialises from this grid and publishes its forecast and
    // spread instances on it, so this one figure bounds those two publications too.
    expect(nowcast.bytes.byteLength).toBeLessThanOrEqual(CEILING_BYTES);
    runtime.stop();
  });

  // AT-04: byte-identity
  it('AT-04 seed: two runs from one root seed are byte-identical across every holding and every seam message', () => {
    const config = lockstepConfig();
    const record = (label: string) => {
      const runtime = buildBackend(config, options, validator);
      const shell = runtime.transport.connect(`shell-${label}`, 'shell');
      const messages: string[] = [];
      shell.subscribe('#', (message) => messages.push(`${message.topic} ${JSON.stringify(message.payload)}`));
      for (let i = 0; i < 30; i++) runtime.clock.tickOnce();
      const holdings = runtime.store
        .holdings()
        .map((holding) => ({ descriptor: holding, digest: runtime.store.holding(holding.holding_id)?.descriptor.field.sha256 }));
      runtime.stop();
      return { messages, holdings: JSON.stringify(holdings) };
    };
    const first = record('a');
    const second = record('b');
    expect(second.holdings).toBe(first.holdings);
    expect(second.messages).toEqual(first.messages);
    // And a different seed is a different world — the comparison can fail.
    const other = buildBackend(config, { ...options, rootSeed: 999 }, validator);
    expect(other.store.currentNowcast()?.descriptor.field.sha256).not.toBe(
      JSON.parse(first.holdings)[0].digest,
    );
    other.stop();
  });
});
