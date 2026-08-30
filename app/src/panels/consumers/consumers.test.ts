/**
 * The consumer tabs' reasoning, held to what the requirements actually say (feature 115).
 *
 * These are the properties a passing render would not catch: that the budget changes the
 * route's *shape*, that a drop is never anywhere the vessel does not go, that a
 * low-confidence source cannot veto a task on its own, and that the weighting can reorder
 * the candidates. Each of them is a requirement a plausible implementation fails silently
 * — the greedy planner that always heads for the worst cell passes every rendering test
 * ever written — which is why they are here as arithmetic rather than as pixels.
 *
 * Every bound the tests use comes from the shipped configuration document rather than
 * from a number typed here (CLAUDE.md, lesson 2).
 */
import { describe, expect, it } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun } from '../../generated/types.js';
import { consumerStream } from './rng.js';
import { coverDomain, isRefusal } from './hexes.js';
import { depthZones, domainFromRun, metresBetween, type Domain } from './domain.js';
import {
  coverageAtResolution,
  recordObservation,
  uncertaintyOf,
  type CoverageBin,
} from './sampling/uncertainty.js';
import { dropsFor, planRoute, type PlannableCell } from './sampling/plan.js';
import { concealmentFromField, seedCloud, type ClassHypothesis } from './courses/participants.js';
import { buildCandidates, rank } from './courses/candidates.js';
import { buildLanes } from './feasibility/lanes.js';
import { feasibleSets, type FeasibilityRequest } from './feasibility/sets.js';

const config = runConfigDocument as unknown as ConfigRun;
const consumers = config.shell.consumers;

/** The domain the shipped scenario actually publishes over. */
const domain: Domain = {
  west: config.env_generator.domain.longitude.minimum,
  east: config.env_generator.domain.longitude.maximum,
  south: config.env_generator.domain.latitude.minimum,
  north: config.env_generator.domain.latitude.maximum,
  minimumDepthM: config.env_generator.domain.depth.minimum,
  maximumDepthM: config.env_generator.domain.depth.maximum,
};

const model = {
  saturation: consumers.sampling.uncertainty.saturation,
  recencyTimescaleSeconds: consumers.sampling.uncertainty.recency_timescale_seconds,
  densityHalvingCount: consumers.sampling.uncertainty.density_halving_count,
};

function at(seconds: number): string {
  return `${new Date(Date.UTC(2026, 0, 1) + seconds * 1000).toISOString().slice(0, 23)}000Z`;
}

describe('observation-driven uncertainty (FR-75)', () => {
  it('sits at saturation where nothing has been heard', () => {
    expect(uncertaintyOf(undefined, at(0), model)).toBe(model.saturation);
  });

  it('grows monotonically with time since the last observation, and never past saturation', () => {
    const bin: CoverageBin = { count: 8, lastSimTime: at(0) };
    let previous = -1;
    for (let hours = 0; hours <= 48; hours += 2) {
      const value = uncertaintyOf(bin, at(hours * 3600), model);
      expect(value).toBeGreaterThan(previous);
      expect(value).toBeLessThanOrEqual(model.saturation + 1e-9);
      previous = value;
    }
  });

  it('falls with density: more observations leave a lower floor', () => {
    const sparse = uncertaintyOf({ count: 1, lastSimTime: at(0) }, at(60), model);
    const dense = uncertaintyOf({ count: 32, lastSimTime: at(0) }, at(60), model);
    expect(dense).toBeLessThan(sparse);
  });

  it('aggregates upward by containment without losing or double-counting anything', () => {
    const fine = new Map<string, CoverageBin>();
    const finest = consumers.hexes.maximum_resolution;
    const cover = coverDomain(domain, finest, Number.MAX_SAFE_INTEGER);
    if (isRefusal(cover)) throw new Error(cover.refused);
    for (const cell of cover.cells.slice(0, 40)) {
      recordObservation(fine, cell.index, 0, at(0));
      recordObservation(fine, cell.index, 0, at(60));
    }
    const coarse = coverageAtResolution(fine, consumers.hexes.minimum_resolution);
    const before = [...fine.values()].reduce((total, bin) => total + bin.count, 0);
    const after = [...coarse.values()].reduce((total, bin) => total + bin.count, 0);
    expect(after).toBe(before);
    expect(coarse.size).toBeLessThan(fine.size);
  });
});

/**
 * A field with one isolated worst cell and a cluster of merely-bad ones near the vessel.
 *
 * The isolated cell is placed **within reach of the longest budget** on purpose. An
 * earlier version of this fixture put it in the far corner, where no budget could reach
 * it — and the cluster assertion below then passed against a planner deliberately rewired
 * to head for the worst cell first, because the worst cell was simply unreachable. A
 * check that cannot fail is worth nothing (CLAUDE.md, lesson 2); this one was watched
 * failing against that planted planner before it was kept.
 */
function plannableField(): {
  cells: PlannableCell[];
  start: { longitude: number; latitude: number };
  isolated: string;
} {
  const cover = coverDomain(domain, consumers.hexes.default_resolution, consumers.hexes.cell_ceiling);
  if (isRefusal(cover)) throw new Error(cover.refused);
  const start = { longitude: domain.west + 0.2, latitude: domain.south + 0.2 };
  const longest = Math.max(...consumers.sampling.time_budget_hours);
  const reach = longest * 3600 * consumers.sampling.nominal_speed_m_per_s;
  // Two thirds of the way to the edge of what the longest budget can reach: far enough
  // that going there first costs most of the budget, near enough that it is a choice.
  const wanted = reach * 0.66;
  const isolated = [...cover.cells].sort(
    (a, b) => Math.abs(metresBetween(start, a) - wanted) - Math.abs(metresBetween(start, b) - wanted),
  )[0];
  const cells = cover.cells.map((cell) => {
    const away = metresBetween(start, cell);
    return {
      hex: cell.index,
      longitude: cell.longitude,
      latitude: cell.latitude,
      reachableValue: cell.index === isolated.index ? 6 : away < 60_000 ? 2 : 0.2,
      deepValue: cell.index === isolated.index ? 4 : 0.1,
      deepestZone: consumers.sampling.depth_zones - 1,
    };
  });
  return { cells, start, isolated: isolated.index };
}

describe('the sampling plan (FR-78)', () => {
  const budgets = consumers.sampling.time_budget_hours;
  const shortest = Math.min(...budgets);
  const longest = Math.max(...budgets);

  it('changes the route’s shape between the shortest and the longest budget, not only its length', () => {
    const { cells, start } = plannableField();
    const request = {
      start,
      cells,
      speedMetresPerSecond: consumers.sampling.nominal_speed_m_per_s,
      dropCount: 0,
      draw: consumerStream(1, 'test'),
    };
    const short = planRoute({ ...request, budgetSeconds: shortest * 3600 });
    const long = planRoute({ ...request, budgetSeconds: longest * 3600 });
    expect(short.vertices.length).toBeGreaterThan(0);
    expect(long.vertices.length).toBeGreaterThan(short.vertices.length);
    // Shape, not length: the long plan reaches somewhere the short one never goes, and
    // a planner that merely walked further along the same line would fail this.
    const shortHexes = new Set(short.vertices.map((vertex) => vertex.hex));
    const reachedOnlyByTheLongPlan = long.vertices.filter((vertex) => !shortHexes.has(vertex.hex));
    expect(reachedOnlyByTheLongPlan.length).toBeGreaterThan(0);
  });

  it('prefers a cluster of merely-bad cells to the single worst cell it could have reached', () => {
    const { cells, start, isolated } = plannableField();
    const plan = planRoute({
      start,
      cells,
      budgetSeconds: longest * 3600,
      speedMetresPerSecond: consumers.sampling.nominal_speed_m_per_s,
      dropCount: 0,
      draw: consumerStream(1, 'test'),
    });
    // The worst cell is inside the budget — a planner that headed for it first could
    // have — and value per transit sends the vessel to the nearby cluster instead.
    const reachable = cells.find((cell) => cell.hex === isolated);
    expect(reachable).toBeTruthy();
    expect(metresBetween(start, reachable as PlannableCell)).toBeLessThan(
      longest * 3600 * consumers.sampling.nominal_speed_m_per_s,
    );
    expect(plan.vertices[0].hex).not.toBe(isolated);
    // Whether it ever gets there is deliberately *not* asserted. Value per transit may
    // legitimately spend the whole budget on nearer water that is worth more per mile,
    // and a test that demanded the visit would be demanding the behaviour this one
    // exists to forbid.
  });

  it('never places a drop anywhere the route does not go', () => {
    const { cells, start } = plannableField();
    const dropCount = dropsFor(longest, Math.min(...consumers.sampling.expendable_interval_hours));
    const plan = planRoute({
      start,
      cells,
      budgetSeconds: longest * 3600,
      speedMetresPerSecond: consumers.sampling.nominal_speed_m_per_s,
      dropCount,
      draw: consumerStream(1, 'test'),
    });
    expect(plan.drops.length).toBeGreaterThan(0);
    expect(plan.drops.length).toBeLessThanOrEqual(dropCount);
    for (const drop of plan.drops) {
      expect(plan.vertices[drop.vertexIndex].hex).toBe(drop.hex);
    }
  });

  it('stays inside the budget and ends where it expires, rather than returning', () => {
    const { cells, start } = plannableField();
    const plan = planRoute({
      start,
      cells,
      budgetSeconds: shortest * 3600,
      speedMetresPerSecond: consumers.sampling.nominal_speed_m_per_s,
      dropCount: 1,
      draw: consumerStream(1, 'test'),
    });
    expect(plan.consumedSeconds).toBeLessThanOrEqual(shortest * 3600);
    const last = plan.vertices[plan.vertices.length - 1];
    expect(metresBetween(start, last)).toBeGreaterThan(0);
  });

  it('couples the drop count to the budget, as a rate rather than a stock', () => {
    expect(dropsFor(12, 6)).toBe(2);
    expect(dropsFor(24, 6)).toBe(4);
    expect(dropsFor(3, 6)).toBe(0);
  });

  it('refuses a resolution that would exceed the configured ceiling rather than freezing', () => {
    const refused = coverDomain(domain, consumers.hexes.maximum_resolution + 3, consumers.hexes.cell_ceiling);
    expect(isRefusal(refused)).toBe(true);
    if (isRefusal(refused)) expect(refused.refused).toContain(String(consumers.hexes.cell_ceiling));
  });
});

describe('depth (FR-77)', () => {
  it('divides the published column and marks only what the vessel reaches', () => {
    const zones = depthZones(domain, consumers.sampling.depth_zones, config.platform.limits.maximum_depth_m);
    expect(zones).toHaveLength(consumers.sampling.depth_zones);
    const reachable = zones.filter((zone) => zone.reachable);
    // The asymmetry the expendables exist for: some of the column, not all of it.
    expect(reachable.length).toBeGreaterThan(0);
    expect(reachable.length).toBeLessThan(zones.length);
  });

  it('marks nothing reachable while neither the platform nor the planner has been heard', () => {
    const zones = depthZones(domain, consumers.sampling.depth_zones, undefined);
    expect(zones.every((zone) => !zone.reachable)).toBe(true);
  });
});

function roster(overrides: Partial<Record<string, number>> = {}): ClassHypothesis[] {
  return consumers.courses.classes.map((entry) => ({
    id: entry.id,
    label: entry.label,
    motion: entry.motion,
    likelihood: overrides[entry.id] ?? entry.default_likelihood,
    included: entry.id in overrides ? (overrides[entry.id] ?? 0) > 0 : entry.included,
    speedMetresPerSecond: entry.speed_m_per_s,
  }));
}

function cloudFor(classes: ClassHypothesis[]) {
  return seedCloud({
    domain,
    resolution: consumers.hexes.default_resolution,
    classes,
    steps: consumers.courses.steps,
    stepSeconds: consumers.courses.step_seconds,
    samplesPerLikelihood: consumers.courses.samples_per_likelihood,
    bankCount: consumers.courses.bank_count,
    concealment: new Map(),
    draw: consumerStream(7, 'test', 'cloud'),
  });
}

describe('hypothetical classes (FR-79)', () => {
  it('gives each class a different cloud, because behaviour drives motion', () => {
    const only = (id: string) =>
      roster(Object.fromEntries(consumers.courses.classes.map((entry) => [entry.id, entry.id === id ? 5 : 0])));
    const shapes = consumers.courses.classes.map((entry) => cloudFor(only(entry.id)));
    const footprints = shapes.map((cloud) => [...cloud.density.keys()].sort().join(','));
    // If behaviour only weighted a score the three would be identical, and the roster
    // would be cosmetic — which is the failure the source SRD names by name.
    expect(new Set(footprints).size).toBe(footprints.length);
    // And they differ in character, not merely in the seed: a corridor is concentrated,
    // a loiter is clustered, and the two do not cover the same fraction of the domain.
    const spreads = shapes.map((cloud) => cloud.density.size);
    expect(Math.max(...spreads)).toBeGreaterThan(Math.min(...spreads));
  });

  it('seeds density in proportion to the likelihood', () => {
    const quiet = cloudFor(roster({ fishing: 1, ferry: 0, submarine: 0 }));
    const busy = cloudFor(roster({ fishing: 9, ferry: 0, submarine: 0 }));
    expect(busy.hypotheses).toBeGreaterThan(quiet.hypotheses * 4);
  });

  it('reads concealment out of a field rather than inventing it', () => {
    const values = new Map([
      ['a', 1],
      ['b', 5],
      ['c', 1],
    ]);
    const concealment = concealmentFromField(values, (hex) => (hex === 'b' ? ['a', 'c'] : ['b']));
    expect(concealment.get('b')).toBeGreaterThan(0);
    expect(Math.max(...concealment.values())).toBeCloseTo(1);
  });
});

describe('candidate courses (FR-79)', () => {
  const cover = coverDomain(domain, consumers.hexes.default_resolution, consumers.hexes.cell_ceiling);
  if (isRefusal(cover)) throw new Error(cover.refused);
  const cloud = cloudFor(roster());

  const candidates = buildCandidates({
    start: { longitude: domain.west + 0.3, latitude: domain.south + 0.3 },
    resolution: consumers.hexes.default_resolution,
    density: cloud.density,
    highestDensity: cloud.highest,
    concealment: new Map(),
    objective: 'investigation',
    count: consumers.courses.candidate_count,
    cells: cover.cells,
    legs: 14,
    draw: consumerStream(11, 'test', 'candidates'),
  });

  it('offers three or four, never one', () => {
    expect(candidates.length).toBe(consumers.courses.candidate_count);
    expect(candidates.length).toBeGreaterThanOrEqual(3);
    expect(candidates.length).toBeLessThanOrEqual(4);
  });

  it('spans the trade: the direct course is more exposed and gets more of the objective', () => {
    const direct = candidates[0];
    const widest = candidates[candidates.length - 1];
    expect(direct.exposure).toBeGreaterThan(widest.exposure);
    expect(direct.achievement).toBeGreaterThanOrEqual(widest.achievement);
  });

  it('reorders as the weighting moves — the moment worth engineering for', () => {
    const byObjective = rank(candidates, 0)[0];
    const byExposure = rank(candidates, 1)[0];
    expect(byObjective.id).not.toBe(byExposure.id);
  });
});

/** The feasibility request the shipped configuration produces, with everything at rest. */
function feasibilityRequest(overrides: Partial<FeasibilityRequest> = {}): FeasibilityRequest {
  const steps = 48;
  const lanes = buildLanes(consumers.feasibility.lanes, {
    steps,
    stepMinutes: consumers.feasibility.step_minutes,
    draw: consumerStream(3, 'test', 'lanes'),
    speedMetresPerSecond: 2.4,
    rangeMetres: Array.from({ length: steps }, (_, step) => 40_000 + step * 2_000),
    forecastSeries: [12, 13, 14, 13, 12],
  });
  return {
    tasks: consumers.feasibility.tasks,
    lanes,
    confidence: Object.fromEntries(
      consumers.feasibility.lanes.map((lane) => [lane.id, lane.default_confidence]),
    ),
    thresholds: Object.fromEntries(
      consumers.feasibility.tasks.map((task) => [
        task.id,
        Object.fromEntries(
          task.requirements
            .filter((requirement) => requirement.threshold !== undefined)
            .map((requirement) => [requirement.lane, requirement.threshold ?? 0]),
        ),
      ]),
    ),
    weights: consumers.feasibility.confidence_weights,
    vetoWeight: consumers.feasibility.veto_weight,
    stepMinutes: consumers.feasibility.step_minutes,
    steps,
    setCount: consumers.feasibility.set_count,
    locked: new Set(),
    ...overrides,
  };
}

describe('feasible sets (FR-80)', () => {
  it('builds every configured lane, and says where each one came from', () => {
    const request = feasibilityRequest();
    expect(request.lanes).toHaveLength(consumers.feasibility.lanes.length);
    expect(request.lanes.some((lane) => lane.provenance === 'seam')).toBe(true);
    expect(request.lanes.some((lane) => lane.provenance === 'synthesised')).toBe(true);
    for (const lane of request.lanes) expect(lane.says.length).toBeGreaterThan(10);
  });

  it('returns two or three sets, each of them maximal', () => {
    const { sets } = feasibleSets(feasibilityRequest());
    expect(sets.length).toBeGreaterThan(0);
    expect(sets.length).toBeLessThanOrEqual(consumers.feasibility.set_count);
    // Maximal: no set is a subset of another that was returned.
    for (const set of sets) {
      for (const other of sets) {
        if (set === other) continue;
        const contained = set.taskIds.every((id) => other.taskIds.includes(id));
        expect(contained && other.taskIds.length > set.taskIds.length).toBe(false);
      }
    }
  });

  it('states what each set gives up, which is the whole output', () => {
    const { sets } = feasibleSets(feasibilityRequest());
    for (const set of sets) {
      expect(set.taskIds.length + set.givesUp.length).toBe(consumers.feasibility.tasks.length);
    }
  });

  it('does not let a low-confidence source veto a task on its own', () => {
    const request = feasibilityRequest();
    // One task, one requirement, and a lane that fails at every step: at high confidence
    // the task is impossible; at low confidence it is merely marginal.
    const impossible = {
      id: 'probe',
      label: 'probe',
      duration_minutes: consumers.feasibility.step_minutes,
      requirements: [{ lane: 'sea-state', sense: 'at-most' as const, threshold: -1 }],
    };
    const high = feasibleSets({
      ...request,
      tasks: [impossible],
      confidence: { ...request.confidence, 'sea-state': 'high' },
      thresholds: { probe: { 'sea-state': -1 } },
    });
    const low = feasibleSets({
      ...request,
      tasks: [impossible],
      confidence: { ...request.confidence, 'sea-state': 'low' },
      thresholds: { probe: { 'sea-state': -1 } },
    });
    expect(high.perTask[0].windows).toHaveLength(0);
    expect(low.perTask[0].windows.length).toBeGreaterThan(0);
  });

  it('removes a source entirely when it is switched off', () => {
    const request = feasibilityRequest();
    const blocked = {
      id: 'probe',
      label: 'probe',
      duration_minutes: consumers.feasibility.step_minutes,
      requirements: [{ lane: 'sea-state', sense: 'at-most' as const, threshold: -1 }],
    };
    const on = feasibleSets({
      ...request,
      tasks: [blocked],
      thresholds: { probe: { 'sea-state': -1 } },
      confidence: { ...request.confidence, 'sea-state': 'high' },
    });
    const off = feasibleSets({
      ...request,
      tasks: [blocked],
      thresholds: { probe: { 'sea-state': -1 } },
      confidence: { ...request.confidence, 'sea-state': 'off' },
    });
    expect(on.perTask[0].windows).toHaveLength(0);
    expect(off.perTask[0].windows.length).toBeGreaterThan(0);
  });

  it('recomputes around a locked task, and every set then carries it', () => {
    const request = feasibilityRequest();
    const free = feasibleSets(request);
    const candidate = free.sets[0]?.givesUp[0] ?? consumers.feasibility.tasks[0].id;
    const locked = feasibleSets({ ...request, locked: new Set([candidate]) });
    for (const set of locked.sets) expect(set.taskIds).toContain(candidate);
  });

  it('names the source that closed every window, where a task has none', () => {
    const request = feasibilityRequest();
    const impossible = {
      id: 'probe',
      label: 'probe',
      duration_minutes: consumers.feasibility.step_minutes,
      requirements: [{ lane: 'sea-state', sense: 'at-most' as const, threshold: -1 }],
    };
    const { perTask } = feasibleSets({
      ...request,
      tasks: [impossible],
      thresholds: { probe: { 'sea-state': -1 } },
      confidence: { ...request.confidence, 'sea-state': 'high' },
    });
    expect(perTask[0].blockedBy).toContain('Sea state');
  });
});

describe('the seeded streams (Constitution II)', () => {
  it('gives one sequence per seed and name, and different sequences for different names', () => {
    const first = consumerStream(42, 'consumer', 'sampling');
    const again = consumerStream(42, 'consumer', 'sampling');
    const other = consumerStream(42, 'consumer', 'courses');
    const take = (draw: () => number) => Array.from({ length: 8 }, draw);
    expect(take(first)).toEqual(take(again));
    expect(take(consumerStream(42, 'consumer', 'sampling'))).not.toEqual(take(other));
  });
});

describe('the domain arrives over the seam, not from a constant', () => {
  it('reads all three axes off a published run', () => {
    const read = domainFromRun({
      grid_bounds: {
        minimum_latitude: 1,
        maximum_latitude: 2,
        minimum_longitude: 3,
        maximum_longitude: 4,
        minimum_depth_m: 5,
        maximum_depth_m: 6,
      },
    } as never);
    expect(read).toEqual({
      south: 1,
      north: 2,
      west: 3,
      east: 4,
      minimumDepthM: 5,
      maximumDepthM: 6,
    });
  });
});
