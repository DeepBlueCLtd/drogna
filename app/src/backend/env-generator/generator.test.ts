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
import { kmOffsets, temperatureAt, type WorldParameters } from './analytic.js';
import { axisValues } from './generator.js';

const validator = createSeamValidator();

function lockstepConfig(): ConfigRun {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  return config;
}

const options = { rootSeed: 1234, revision: 'test', dirty: false };

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
  it('provisions archive and now-cast through the publication seam at tick 0', () => {
    const runtime = buildBackend(lockstepConfig(), options, validator);
    const eras = runtime.store.holdings().map((holding) => holding.era).sort();
    expect(eras).toEqual(['archive', 'nowcast']);
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
    expect(verdict.published).toBe(false);
    expect(verdict.refusal).toMatch(/does not match the digest its descriptor records/);
    expect(verdict.refusal).toMatch(/pointer untouched/);
    expect(runtime.store.holdings().map((holding) => holding.holding_id)).toEqual(before);
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
    // The archive stays; the old now-cast was replaced, not accumulated.
    expect(runtime.store.holdings()).toHaveLength(2);
    expect(announcements).toEqual([
      { era: 'nowcast', tick: config.env_generator.nowcast.interval_ticks },
    ]);
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
    // The bound is read from the manifest's recorded resolution, never typed here:
    // a recovery from a grid cannot honestly beat the grid, so two cells is the claim.
    const boundKm = 2 * eddy.resolution.grid_spacing;
    console.log(`AT-03: eddy centre recovered with error ${errorKm.toFixed(1)} km (bound ${boundKm.toFixed(1)} km)`);
    expect(errorKm).toBeLessThanOrEqual(boundKm);
    runtime.stop();
  });

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
