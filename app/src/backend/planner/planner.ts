/**
 * The planner (V2-C14, SRD-v2 FR-33, FR-34): where would sampling most reduce
 * uncertainty, from where the platform is, under a time budget — emitted as a
 * recommendation and nothing else (Constitution VIII). The formulation is
 * docs/algorithms/informative-path-planning.md, carried whole: routes are WALKED,
 * each vertex scored against the state as it stands at its arrival instant —
 * after every earlier visit's collapse and the regrowth since — and the naive
 * figure is published beside the honest one so the size of the avoided error is a
 * number somebody can see.
 */
import { cellToLatLng, latLngToCell, polygonToCells, gridDisk } from 'h3-js';
import type { SeamClient } from '../../seam/transport.js';
import type {
  ConfigPlanner,
  Observation,
  Plan,
  PlanProjectionEntry,
  PlanVertex,
  RunPublished,
} from '../../generated/types.js';
import { Rng, fnv1a32 } from '../lib/rng.js';
import { configDigest } from '../lib/sha256.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';
import { timescaleFromManifest, worldFromManifest } from '../lib/manifest-world.js';
import type { CoverageStore } from '../coverage-store/store.js';
import type { FeatureStore } from '../feature-store/store.js';
import {
  cellKey,
  createUncertaintyModel,
  type DeficitState,
  type PlanningCell,
  type UncertaintyModel,
} from './uncertainty.js';

type PlannerState = 'planning' | 'no-field' | 'nothing-worth-sampling';

export class Planner {
  private readonly heartbeat: HeartbeatEmitter;
  private simTime = { value: '', tick: 0 };
  private lastPlanTick = -1;
  private planOrdinal = 0;
  private previousPlanId: string | null = null;
  private previousRoute: { h3: string; band: number }[] = [];
  private previousValue = 0;
  private state: PlannerState = 'no-field';
  private deficits: DeficitState = new Map();
  private readonly informed = new Set<string>();
  /**
   * Soundings this planner has let inform its age field. Public for the same reason
   * the monitor's residual count is: whether an ownship observation was mistaken for a
   * measurement of the sea is a claim a test has to be able to check (FR-51).
   */
  soundingsInformed = 0;
  private platform: { latitude: number; longitude: number; depth_m: number } | undefined;
  private spreadHoldingId: string | undefined;
  private spreadDigest: string | null = null;
  private spreadRunId: string | undefined;
  private coverCells: PlanningCell[] | undefined;
  lastPlan: Plan | undefined;

  constructor(
    private readonly config: ConfigPlanner,
    private readonly client: SeamClient,
    private readonly store: CoverageStore,
    private readonly featureStore: FeatureStore,
    private readonly runId: string,
    private readonly rootSeed: number,
    private readonly secondsPerTick: number,
    private readonly epochPosixSeconds: number,
  ) {
    this.heartbeat = new HeartbeatEmitter(
      config.id,
      config.heartbeat,
      client,
      () => ({
        sim_time: this.simTime.value,
        tick: this.simTime.tick,
        status: 'ok',
        detail: `state ${this.state}; ${this.planOrdinal} recommendation(s) emitted`,
      }),
      runId,
      configDigest(config),
    );
  }

  start(): void {
    this.client.subscribe(this.config.topics.clock, (message) => {
      const sample = message.payload as { sim_time: string; tick: number };
      this.simTime = { value: sample.sim_time, tick: sample.tick };
      if (sample.tick - this.lastPlanTick >= this.config.replan_interval_ticks && sample.tick > 0) {
        this.lastPlanTick = sample.tick;
        this.replan();
      }
    });
    this.client.subscribe(this.config.topics.observations, (message) => {
      this.inform(message.payload as Observation);
    });
    this.client.subscribe(this.config.topics.run_published, (message) => {
      const published = message.payload as RunPublished;
      if (published.current) {
        this.spreadHoldingId = published.collections.uncertainty;
        this.spreadDigest = published.digests.uncertainty;
        this.spreadRunId = published.run_id;
        // The field the last plan was computed from has been replaced: replan on
        // the next tick rather than waiting out the cadence.
        this.lastPlanTick = -1;
      }
    });
    this.heartbeat.start();
  }

  stop(): void {
    this.heartbeat.stop();
  }

  /**
   * One sounding is one measurement of that water: the planner keeps no
   * observation, only the last cell and instant informed, and a second
   * observation naming the same pair informs nothing new.
   */
  private inform(observation: Observation): void {
    // The age field says when the ocean was last measured here. An ownship
    // observation measures the platform, so counting one would refresh confidence
    // everywhere the platform went without a single sounding being taken — the trap
    // this feature is most likely to spring, and the reason a test fails when this
    // line is removed (FR-51).
    if (this.config.excluded_datastreams?.includes(observation.datastream_id)) return;
    this.platform = { ...observation.location };
    const soundingKey = `${observation.thing_id}:${observation.tick}`;
    if (this.informed.has(soundingKey)) return;
    this.informed.add(soundingKey);
    this.soundingsInformed += 1;
    const model = this.model();
    if (!model) return;
    const band = this.bandFor(observation.location.depth_m);
    if (band === undefined) return;
    const visited: PlanningCell = {
      h3: latLngToCell(observation.location.latitude, observation.location.longitude, this.config.h3_resolution),
      band: band.index,
      latitude: observation.location.latitude,
      longitude: observation.location.longitude,
      depthM: observation.location.depth_m,
    };
    model.collapse(visited, this.posixNow(), this.deficits);
  }

  private posixNow(): number {
    return this.epochPosixSeconds + this.simTime.tick * this.secondsPerTick;
  }

  private bandFor(depthM: number) {
    return this.config.depth_bands.find(
      (band) => depthM >= band.minimum_depth_m && depthM <= band.maximum_depth_m,
    );
  }

  private cachedModel: { key: string; model: UncertaintyModel } | undefined;

  private model(): UncertaintyModel | undefined {
    if (!this.spreadHoldingId) return undefined;
    const holding = this.store.holding(this.spreadHoldingId);
    if (!holding) return undefined;
    const nowcast = this.store.currentNowcast();
    if (!nowcast) return undefined;
    // One model per (spread, now-cast) pairing: its memoised geometry and field
    // samples are what make the search affordable, and both inputs are immutable
    // once published.
    const key = `${holding.descriptor.holding_id}|${nowcast.descriptor.holding_id}`;
    if (this.cachedModel?.key === key) return this.cachedModel.model;
    // tau comes from the published ground-truth manifest — the generator's own
    // evaluation at a point, never a blend of the planner's own (ADR-0002).
    const model = createUncertaintyModel(
      this.config,
      holding,
      worldFromManifest(nowcast.descriptor.manifest),
      timescaleFromManifest(nowcast.descriptor.manifest),
      this.cover(),
    );
    this.cachedModel = { key, model };
    return model;
  }

  /** The cover: overlap over the configured region's polygon, sorted, × bands.
   *  Cached: the feature store is read-only for the life of the run. */
  private cover(): PlanningCell[] {
    if (this.coverCells) return this.coverCells;
    const feature = this.featureStore.feature(this.config.region_feature);
    if (!feature) throw new Error(`the feature store holds no '${this.config.region_feature}' to plan over`);
    const ring = feature.geometry.coordinates[0].map(([lon, lat]) => [lat, lon] as [number, number]);
    const inside = polygonToCells(ring, this.config.h3_resolution);
    const byOverlap = new Set(inside);
    for (const cell of inside) for (const neighbour of gridDisk(cell, 1)) byOverlap.add(neighbour);
    const sorted = [...byOverlap].sort();
    const cells: PlanningCell[] = [];
    for (const h3 of sorted) {
      const [latitude, longitude] = cellToLatLng(h3);
      for (const band of this.config.depth_bands) {
        cells.push({
          h3,
          band: band.index,
          latitude,
          longitude,
          depthM: (band.minimum_depth_m + band.maximum_depth_m) / 2,
        });
      }
    }
    this.coverCells = cells;
    return cells;
  }

  private travelSeconds(from: { latitude: number; longitude: number; depth_m: number }, to: PlanningCell): number {
    const dLat = (to.latitude - from.latitude) * 111_320;
    const dLon = (to.longitude - from.longitude) * 111_320 * Math.cos((from.latitude * Math.PI) / 180);
    return (
      Math.hypot(dLat, dLon) / this.config.speeds.horizontal_m_per_s +
      Math.abs(to.depthM - from.depth_m) / this.config.speeds.vertical_m_per_s
    );
  }

  /**
   * Walk a route: arrival instants from traversal cost, each vertex's gain scored
   * against the state as it stands at that instant, collapse applied as it goes.
   */
  private walk(
    route: PlanningCell[],
    model: UncertaintyModel,
    startState: DeficitState,
    collapseAware: boolean,
  ): { value: number; consumedSeconds: number; distanceM: number; marginals: number[]; arrivals: number[] } {
    const state: DeficitState = new Map(startState);
    let position = this.platform ?? { latitude: route[0]?.latitude ?? 0, longitude: route[0]?.longitude ?? 0, depth_m: 0 };
    let now = this.posixNow();
    let value = 0;
    let consumed = 0;
    let distance = 0;
    const marginals: number[] = [];
    const arrivals: number[] = [];
    for (const vertex of route) {
      const legSeconds = this.travelSeconds(position, vertex);
      const legDistance =
        Math.hypot(
          (vertex.latitude - position.latitude) * 111_320,
          (vertex.longitude - position.longitude) * 111_320 * Math.cos((position.latitude * Math.PI) / 180),
        ) + Math.abs(vertex.depthM - position.depth_m);
      consumed += legSeconds;
      distance += legDistance;
      now += legSeconds;
      arrivals.push(now);
      const scoreInstant = collapseAware ? now : this.posixNow();
      const scoreState = collapseAware ? state : startState;
      let gain = 0;
      for (const { cell, weight } of model.footprint(vertex)) {
        gain += model.excess(cell, scoreInstant, scoreState) * weight;
      }
      marginals.push(gain);
      value += gain;
      if (collapseAware) model.collapse(vertex, now, state);
      position = { latitude: vertex.latitude, longitude: vertex.longitude, depth_m: vertex.depthM };
    }
    return { value, consumedSeconds: consumed, distanceM: distance, marginals, arrivals };
  }

  private replan(): void {
    const model = this.model();
    if (!model || !this.platform) {
      this.state = 'no-field';
      // A plan message requires the uncertainty field it was computed from; with
      // none, the state is carried by the heartbeat rather than a hollow message.
      return;
    }
    const cells = this.cover();
    const now = this.posixNow();
    const candidates = cells.filter((cell) => model.excess(cell, now, this.deficits) > 0);
    const budget = this.config.budget_seconds;

    let best: PlanningCell[] = [];
    let bestWalk = this.walk([], model, this.deficits, true);
    let secondValue = 0;
    const memo = new Map<string, ReturnType<Planner['walk']>>();
    const walkMemo = (route: PlanningCell[]) => {
      const key = route.map((cell) => cellKey(cell.h3, cell.band)).join('|');
      let result = memo.get(key);
      if (!result) {
        result = this.walk(route, model, this.deficits, true);
        memo.set(key, result);
      }
      return result;
    };

    const rng = new Rng(this.rootSeed, `${this.config.stream}:${this.planOrdinal}`);
    for (let restart = 0; restart < this.config.restarts; restart++) {
      let route: PlanningCell[] = [];
      let routeWalk = walkMemo(route);
      for (;;) {
        // Every affordable insertion of every remaining candidate, in cell order.
        const options: { route: PlanningCell[]; walk: ReturnType<Planner['walk']>; ratio: number }[] = [];
        for (const candidate of candidates) {
          if (route.some((vertex) => vertex.h3 === candidate.h3 && vertex.band === candidate.band)) continue;
          for (let position = 0; position <= route.length; position++) {
            const attempt = [...route.slice(0, position), candidate, ...route.slice(position)];
            const attemptWalk = walkMemo(attempt);
            if (attemptWalk.consumedSeconds > budget) continue;
            const timeAdded = attemptWalk.consumedSeconds - routeWalk.consumedSeconds;
            const valueAdded = attemptWalk.value - routeWalk.value;
            if (valueAdded <= 0) continue;
            options.push({ route: attempt, walk: attemptWalk, ratio: valueAdded / Math.max(timeAdded, 1) });
          }
        }
        if (options.length === 0) break;
        options.sort((a, b) => b.ratio - a.ratio);
        // The first restart is the pure greedy insertion; later restarts draw from
        // the shortlist, every draw from the named stream.
        const pick =
          restart === 0 ? options[0] : options[rng.int(Math.min(this.config.shortlist, options.length))];
        route = pick.route;
        routeWalk = pick.walk;
      }
      if (routeWalk.value > bestWalk.value) {
        secondValue = bestWalk.value;
        best = route;
        bestWalk = routeWalk;
      } else if (routeWalk.value > secondValue && route.length > 0) {
        secondValue = routeWalk.value;
      }
    }

    const naive = this.walk(best, model, this.deficits, false);
    this.state = candidates.length === 0 ? 'nothing-worth-sampling' : 'planning';
    this.publish(best, bestWalk, naive.value, cells, model, candidates.length, secondValue);
  }

  private publish(
    route: PlanningCell[],
    walk: ReturnType<Planner['walk']>,
    naiveValue: number,
    cells: readonly PlanningCell[],
    model: UncertaintyModel,
    candidateCount: number,
    secondValue: number,
  ): void {
    if (!this.platform || !this.spreadRunId) return;
    const planId = fnv1a32(`${this.runId}:plan:${this.planOrdinal}`).toString(16).padStart(8, '0');
    const now = this.posixNow();
    const horizonEnd = now + this.config.budget_seconds;

    const vertices: PlanVertex[] = route.map((cell, index) => ({
      sequence: index,
      h3_index: cell.h3,
      depth_band: cell.band,
      arrival_sim_time: isoMicros(walk.arrivals[index]),
      latitude: round6(cell.latitude),
      longitude: round6(cell.longitude),
      depth_m: cell.depthM,
      marginal_value: round6(Math.max(0, walk.marginals[index])),
    }));

    const retained = countRetainedPrefix(this.previousRoute, route);
    const projection = this.project(cells, model, now);

    const plan: Plan = {
      component: this.config.id,
      scenario_run_id: this.runId,
      sim_time: this.simTime.value,
      tick: this.simTime.tick,
      kind: 'sampling-recommendation',
      plan_id: planId,
      supersedes: this.previousPlanId,
      state: this.state,
      empty_reason: route.length > 0 ? null : candidateCount === 0 ? 'nothing-worth-sampling' : 'budget-too-small',
      horizon: {
        start_sim_time: isoMicros(now),
        end_sim_time: isoMicros(horizonEnd),
        span_seconds: this.config.budget_seconds,
      },
      uncertainty_field: {
        run_id: this.spreadRunId,
        variable: 'temperature_spread',
        digest: this.spreadDigest,
      },
      indexing: {
        h3_resolution: this.config.h3_resolution,
        depth_bands: this.config.depth_bands.map((band) => ({ ...band })),
      },
      platform: {
        latitude: round6(this.platform.latitude),
        longitude: round6(this.platform.longitude),
        depth_m: this.platform.depth_m,
      },
      route: {
        vertices,
        value: round6(walk.value),
        value_without_collapse: round6(naiveValue),
        budget_seconds: this.config.budget_seconds,
        consumed_seconds: round6(walk.consumedSeconds),
        distance_m: round6(walk.distanceM),
      },
      selection: {
        formulation: 'orienteering-prize-collecting',
        heuristic: 'greedy-insertion-seeded-restarts',
        candidate_cell_count: candidateCount,
        visited_cell_count: route.length,
        restarts: this.config.restarts,
      },
      commitment: {
        window_seconds: this.config.replan_interval_ticks * this.secondsPerTick,
        retained_vertex_count: retained,
        departed_from_previous: !routesEqual(this.previousRoute, route),
        improvement_over_retained: round6(Math.max(0, walk.value - this.previousValue)),
        margin: round6(Math.max(0, walk.value - secondValue)),
      },
      projection,
    };
    this.client.publish(this.config.topics.plan, plan);
    this.lastPlan = plan;
    this.previousPlanId = planId;
    this.previousRoute = route.map((cell) => ({ h3: cell.h3, band: cell.band }));
    this.previousValue = walk.value;
    this.planOrdinal += 1;
  }

  /** When each region's confidence falls below usable (FR-33's projections). */
  private project(cells: readonly PlanningCell[], model: UncertaintyModel, now: number): Plan['projection'] {
    const regions: PlanProjectionEntry[] = [];
    for (const cell of cells) {
      const uNow = model.uncertainty(cell, now, this.deficits);
      if (uNow === undefined) continue;
      const tau = model.tau(cell, now);
      if (uNow > this.config.usable_threshold) {
        regions.push(entry(cell, 'already-lapsed', null, uNow, model.saturation(cell, now) ?? uNow, tau));
        continue;
      }
      let crossing: number | null = null;
      for (let t = now; t <= now + this.config.projection.horizon_seconds; t += this.config.projection.step_seconds) {
        const u = model.uncertainty(cell, t, this.deficits);
        if (u !== undefined && u > this.config.usable_threshold) {
          crossing = t;
          break;
        }
      }
      regions.push(
        entry(
          cell,
          crossing === null ? 'no-crossing-within-horizon' : 'crossing',
          crossing,
          uNow,
          model.saturation(cell, now) ?? uNow,
          tau,
        ),
      );
    }
    return {
      step_seconds: this.config.projection.step_seconds,
      horizon_seconds: this.config.projection.horizon_seconds,
      usable_threshold: this.config.usable_threshold,
      region_count: regions.length,
      regions,
    };
  }
}

function entry(
  cell: PlanningCell,
  state: 'crossing' | 'already-lapsed' | 'no-crossing-within-horizon',
  crossing: number | null,
  uNow: number,
  uSat: number,
  tau: number,
): PlanProjectionEntry {
  return {
    h3_index: cell.h3,
    depth_band: cell.band,
    state,
    crossing_sim_time: crossing === null ? null : isoMicros(crossing),
    uncertainty_now: round6(uNow),
    saturated_uncertainty: round6(uSat),
    timescale_seconds: round6(tau),
  };
}

function countRetainedPrefix(previous: { h3: string; band: number }[], route: PlanningCell[]): number {
  let count = 0;
  while (count < previous.length && count < route.length) {
    if (previous[count].h3 !== route[count].h3 || previous[count].band !== route[count].band) break;
    count += 1;
  }
  return count;
}

function routesEqual(previous: { h3: string; band: number }[], route: PlanningCell[]): boolean {
  return (
    previous.length === route.length &&
    previous.every((vertex, index) => vertex.h3 === route[index].h3 && vertex.band === route[index].band)
  );
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Millisecond precision padded to the master's microsecond spelling. */
function isoMicros(posixSeconds: number): string {
  const millis = Math.round(posixSeconds * 1000);
  return `${new Date(millis).toISOString().slice(0, 23)}000Z`;
}
