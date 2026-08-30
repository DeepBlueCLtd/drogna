/**
 * Feature 106: uncertainty and planning. The integration surface is the real
 * runtime — the planner reads only what publication released (the spread instance,
 * the ground-truth manifest, the read-only region feature) and emits
 * recommendations only. The uncertainty model's four load-bearing consequences
 * (informative-path-planning.md) are asserted directly against a genuinely
 * published field.
 */
import { describe, expect, it } from 'vitest';
import { latLngToCell } from 'h3-js';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { driveTicks } from '../test-support/drive.js';
import { buildBackend, type BackendRuntime } from '../runtime/runtime.js';
import { timescaleFromManifest, worldFromManifest } from '../lib/manifest-world.js';
import { cellKey, createUncertaintyModel, type PlanningCell } from './uncertainty.js';

const validator = createSeamValidator();

function lockstepConfig(): ConfigRun {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  return config;
}

const options = { rootSeed: 909, revision: 'test', dirty: false };

async function turnLoop(runtime: BackendRuntime, ticks: number): Promise<void> {
  await driveTicks(runtime.clock, ticks);
}

describe('the planner (feature 106)', { timeout: 60_000 }, () => {
  it('is honestly quiet before the loop turns: no field, no hollow message', async () => {
    const runtime = buildBackend(lockstepConfig(), options, validator);
    await turnLoop(runtime, 1200);
    expect(runtime.planner.lastPlan).toBeUndefined();
    runtime.stop();
  });

  it('emits a master-valid recommendation with a walked route once a spread field exists', async () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    await turnLoop(runtime, 2500);
    const plan = runtime.planner.lastPlan;
    expect(plan).toBeDefined();
    if (!plan) throw new Error('unreachable');
    expect(validator.validate('plan', plan).refusals).toEqual([]);
    expect(plan.kind).toBe('sampling-recommendation');
    expect(plan.state).toBe('planning');
    expect(plan.route.vertices.length).toBeGreaterThan(0);
    expect(plan.route.consumed_seconds).toBeLessThanOrEqual(plan.route.budget_seconds);
    // Arrival instants strictly increase: conditions at the moment of arrival.
    const arrivals = plan.route.vertices.map((vertex) => vertex.arrival_sim_time);
    expect([...arrivals].sort()).toEqual(arrivals);
    expect(new Set(arrivals).size).toBe(arrivals.length);
    // The naive figure is published beside the honest one so the size of the
    // avoided error is visible. On this field it is SMALLER than the walked value:
    // the ensemble spread grows with lead time, which is the doc's own second case
    // ("the field itself grew between the horizon's start and the arrivals") — a
    // present-scoring planner under-values every route on a growing field.
    expect(plan.route.value_without_collapse).toBeGreaterThan(0);
    expect(plan.route.value_without_collapse).not.toBe(plan.route.value);
    expect(plan.selection.visited_cell_count).toBe(plan.route.vertices.length);
    expect(plan.selection.candidate_cell_count).toBeGreaterThanOrEqual(plan.route.vertices.length);
    expect(plan.projection.region_count).toBeGreaterThan(0);
    expect(plan.uncertainty_field.variable).toBe('temperature_spread');
    // The digest names the exact bytes the recommendation was computed from.
    const spread = runtime.store.holding(`${plan.uncertainty_field.run_id}-spread`);
    expect(plan.uncertainty_field.digest).toBe(spread?.descriptor.field.sha256);
    runtime.stop();
  });

  it('holds the uncertainty model’s four consequences against a genuinely published field', async () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    await turnLoop(runtime, 2000);
    const plan = runtime.planner.lastPlan;
    const spread = runtime.store.holding(`${plan?.uncertainty_field.run_id}-spread`);
    const nowcast = runtime.store.currentNowcast();
    if (!spread || !nowcast || !plan) throw new Error('the loop did not turn');
    const centre: PlanningCell = {
      h3: latLngToCell(46.1, -11.2, config.planner.h3_resolution),
      band: 0,
      latitude: 46.1,
      longitude: -11.2,
      depthM: 60,
    };
    const model = createUncertaintyModel(
      config.planner,
      spread,
      worldFromManifest(nowcast.descriptor.manifest),
      timescaleFromManifest(nowcast.descriptor.manifest),
      [centre],
    );
    const t0 = Date.parse(plan.horizon.start_sim_time.slice(0, 23) + 'Z') / 1000;
    const uSat = model.saturation(centre, t0);
    if (uSat === undefined) throw new Error('no saturation at the centre');

    // 1. A cell never informed sits at the spread.
    const fresh = new Map();
    expect(model.uncertainty(centre, t0, fresh)).toBe(uSat);

    // 2. A cell just informed is worth nothing to inform again.
    model.collapse(centre, t0, fresh);
    const justInformed = model.uncertainty(centre, t0, fresh);
    expect(justInformed).toBeCloseTo(uSat * (1 - config.planner.footprint.peak), 9);

    // 3/4. The deficit decays at the local tau toward the saturation at the visit.
    const tau = model.tau(centre, t0);
    const later = model.uncertainty(centre, t0 + tau, fresh);
    const muchLater = model.uncertainty(centre, t0 + 20 * tau, fresh);
    if (justInformed === undefined || later === undefined || muchLater === undefined) throw new Error('undefined u');
    expect(later).toBeGreaterThan(justInformed);
    expect(muchLater).toBeCloseTo(model.saturation(centre, t0 + 20 * tau) ?? Number.NaN, 6);
    expect(fresh.has(cellKey(centre.h3, centre.band))).toBe(true);
    runtime.stop();
  });

  it('recommends deterministically: one seed, one plan, twice', async () => {
    const config = lockstepConfig();
    const first = buildBackend(config, options, validator);
    await turnLoop(first, 2500);
    const planA = JSON.stringify(first.planner.lastPlan);
    first.stop();
    const second = buildBackend(config, options, validator);
    await turnLoop(second, 2500);
    const planB = JSON.stringify(second.planner.lastPlan);
    second.stop();
    expect(planB).toBe(planA);
  });
});
