/**
 * The departure brief (feature 121, FR-17 to FR-20): the forecast the vessel was
 * issued at the quay-side.
 *
 * The property under test is the one that makes it a forecast at all. This generator
 * evaluates the true ocean, so a brief whose steps were each evaluated at their own
 * instant would be right about the future — and the test that would have passed
 * against that mistake is "the departure holding exists", which is why the check here
 * is on the values rather than on the descriptor.
 */
import { describe, expect, it } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { buildBackend } from '../runtime/runtime.js';
import { axisValues } from './generator.js';
import { temperatureAt, type WorldParameters } from './analytic.js';

const validator = createSeamValidator();

function lockstepConfig(): ConfigRun {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  return config;
}

const options = { rootSeed: 4242, startCondition: 'loitering', revision: 'test', dirty: false };

describe('the departure brief (feature 121)', () => {
  it('is authored at provisioning, master-valid, and names persistence as its derivation', () => {
    const runtime = buildBackend(lockstepConfig(), options, validator);
    const brief = runtime.store.departureHolding();
    expect(brief).toBeDefined();
    if (!brief) throw new Error('unreachable');
    expect(brief.descriptor.era).toBe('departure');
    expect(validator.validate('coverage-holding', brief.descriptor).refusals).toEqual([]);
    expect(validator.validate('manifest', brief.descriptor.manifest).refusals).toEqual([]);
    expect(brief.descriptor.manifest.composition.rule).toBe('persistence');
    // Valid forward from the origin: the vessel sails with it.
    expect(brief.descriptor.manifest.grid.time.start_offset_seconds).toBe(0);
    expect(brief.descriptor.manifest.grid.time.count).toBeGreaterThan(1);
    runtime.stop();
  });

  it('holds every step at the value it was issued with: the axis runs forward and the field does not (SC-007)', () => {
    const runtime = buildBackend(lockstepConfig(), options, validator);
    const brief = runtime.store.departureHolding();
    if (!brief) throw new Error('no departure holding');
    const { grid } = brief.descriptor.manifest;
    const perStep = axisValues(grid.depth).length * axisValues(grid.latitude).length * axisValues(grid.longitude).length;
    const values = new Float32Array(brief.bytes.buffer, brief.bytes.byteOffset, brief.bytes.byteLength / 4);

    // Both variables, every step against the first: a brief that re-evaluated the
    // world at each step would differ here, and the eddy and the moving feature are
    // both live over this window, so the difference would be real rather than a
    // rounding artefact.
    // Counted, then asserted once. An `expect` per cell was a million assertions the
    // moment the depth axis was raised (#113) and timed this test out; it also reported
    // only the first offender, where the count says whether one cell drifted or the whole
    // brief was re-evaluated — which is the difference the test is actually about.
    let compared = 0;
    const drifted: string[] = [];
    for (let variable = 0; variable < grid.time.count * perStep * 2; variable += grid.time.count * perStep) {
      for (let step = 1; step < grid.time.count; step++) {
        for (let cell = 0; cell < perStep; cell++) {
          compared += 1;
          const held = values[variable + step * perStep + cell];
          const issued = values[variable + cell];
          if (held !== issued && drifted.length < 4) drifted.push(`step ${step} cell ${cell}: ${held} != ${issued}`);
        }
      }
    }
    expect(compared).toBe(grid.time.count > 1 ? 2 * (grid.time.count - 1) * perStep : 0);
    expect(drifted).toEqual([]);
    runtime.stop();
  });

  it('is the truth at the moment of issue, not an invented field', () => {
    const runtime = buildBackend(lockstepConfig(), options, validator);
    const brief = runtime.store.departureHolding();
    if (!brief) throw new Error('no departure holding');
    const manifest = brief.descriptor.manifest;
    const byId = Object.fromEntries(manifest.features.map((feature) => [feature.id, feature.parameters]));
    const world = {
      background: manifest.background.parameters,
      eddy: byId.eddy,
      front: byId.front,
      thermocline: byId.thermocline,
      moving: byId.moving,
    } as WorldParameters;
    const lons = axisValues(manifest.grid.longitude);
    const lats = axisValues(manifest.grid.latitude);
    const depths = axisValues(manifest.grid.depth);
    const temperature = new Float32Array(
      brief.bytes.buffer,
      brief.bytes.byteOffset,
      manifest.grid.time.count * depths.length * lats.length * lons.length,
    );
    const tolerance = manifest.variables[0].tolerance_absolute;
    // Probed at a later step, where the held value must still be the origin's.
    for (const [t, d, la, lo] of [
      [0, 0, 0, 0],
      [5, 2, 9, 17],
      [11, 4, 20, 31],
    ]) {
      const index = ((t * depths.length + d) * lats.length + la) * lons.length + lo;
      const expected = temperatureAt(world, lons[lo], lats[la], depths[d], 0);
      expect(Math.abs(temperature[index] - expected)).toBeLessThanOrEqual(tolerance);
    }
    runtime.stop();
  });
});
