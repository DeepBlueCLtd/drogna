/**
 * The planner's uncertainty model (SRD-v2 FR-33), the formulation of
 * docs/algorithms/informative-path-planning.md carried whole:
 *
 *   u(c, t) = u_sat(c, t) − (u_sat(c, t₀) − u₀) · exp(−(t − t₀) / τ(c, t))
 *
 * A cell never informed sits at the spread; a cell just informed is worth nothing
 * to inform again; quiet water is left alone and fast water resampled, because the
 * deficit decays at the local τ — evaluated from the published ground-truth
 * manifest at the instant asked about, never cached, with no fallback constant
 * anywhere in this package.
 */
import { cellToLatLng, getHexagonEdgeLengthAvg, gridDisk } from 'h3-js';
import type { ConfigAnalyst, ConfigPlanner, ConfigSensors, CoverageHolding } from '../../generated/types.js';
import { gaspariCohn } from '../analyst/kernel.js';
import { tauAt, type TimescaleParameters, type WorldParameters } from '../env-generator/analytic.js';
import { sampleHolding, timeAxisPosixOrigin } from '../query/field-sampler.js';

export interface PlanningCell {
  h3: string;
  band: number;
  latitude: number;
  longitude: number;
  depthM: number;
}

export function cellKey(h3: string, band: number): string {
  return `${h3}:${band}`;
}

/** A deficit record: what a visit (or measurement) left behind, and when. */
export interface Deficit {
  t0Seconds: number;
  uSatAtVisit: number;
  uAfterVisit: number;
}

export type DeficitState = Map<string, Deficit>;

export interface FootprintEntry {
  cell: PlanningCell;
  weight: number;
}

export interface UncertaintyModel {
  /** u_sat: the published spread at the cell, at a simulation instant (POSIX s). */
  saturation(cell: PlanningCell, posixSeconds: number): number | undefined;
  tau(cell: PlanningCell, posixSeconds: number): number;
  uncertainty(cell: PlanningCell, posixSeconds: number, state: DeficitState): number | undefined;
  excess(cell: PlanningCell, posixSeconds: number, state: DeficitState): number;
  /** Apply a visit's collapse at `visited` to every cover cell in its footprint. */
  collapse(visited: PlanningCell, posixSeconds: number, state: DeficitState): void;
  /** The visited cell's footprint over the cover, weights included, memoised. */
  footprint(visited: PlanningCell): readonly FootprintEntry[];
  footprintWeight(visited: PlanningCell, cell: PlanningCell): number;
}

export function createUncertaintyModel(
  config: ConfigPlanner,
  analyst: ConfigAnalyst,
  sensors: ConfigSensors,
  errorHolding: { descriptor: CoverageHolding; bytes: Uint8Array },
  world: WorldParameters,
  timescale: TimescaleParameters,
  cover: readonly PlanningCell[],
): UncertaintyModel {
  const manifest = errorHolding.descriptor.manifest;
  const origin = timeAxisPosixOrigin(manifest);
  const errorVariableIndex = manifest.variables.findIndex((v) => v.name === 'temperature_error');
  if (errorVariableIndex < 0) throw new Error('the supplied holding carries no temperature_error variable');

  /**
   * The observation error a visit would bring: the smallest declared among the
   * instruments that measure temperature, because a visit brings all of them and the
   * best is what sets how much the analysis can learn. Read from the instruments that
   * declare it, never restated — the analyst reads the same numbers for the same
   * reason.
   */
  const observationErrorStd = Math.min(
    ...sensors.instruments
      .filter((instrument) => instrument.observed_property === 'temperature')
      .map((instrument) => instrument.noise_std),
  );

  // Both u_sat and τ are memoised per (cell, time step): the spread is only ever
  // sampled at its axis steps, and τ at the step quantum loses nothing a walk of
  // thousands of candidate routes could see. The search's cost lives here.
  const stepSeconds = manifest.grid.time.step_seconds;
  const stepIndexFor = (posixSeconds: number): number => {
    const clamped = clampToAxis(posixSeconds, manifest, origin);
    return Math.round((clamped - origin - manifest.grid.time.start_offset_seconds) / stepSeconds);
  };
  const satCache = new Map<string, number | undefined>();
  const saturation = (cell: PlanningCell, posixSeconds: number): number | undefined => {
    const step = stepIndexFor(posixSeconds);
    const key = `${cellKey(cell.h3, cell.band)}:${step}`;
    if (satCache.has(key)) return satCache.get(key);
    const sampled = sampleHolding(errorHolding, {
      longitude: cell.longitude,
      latitude: cell.latitude,
      depthM: cell.depthM,
      // The error field is defined over the run's validity; beyond it the last step
      // stands (the field does not vanish, it ages — the deficit term handles age).
      posixSeconds: clampToAxis(posixSeconds, manifest, origin),
    });
    const value = sampled.ok ? sampled.value.values[errorVariableIndex] : undefined;
    satCache.set(key, value);
    return value;
  };

  const horizontalDistanceM = (a: PlanningCell, b: PlanningCell): number => {
    const dLat = (b.latitude - a.latitude) * 111_320;
    const dLon = (b.longitude - a.longitude) * 111_320 * Math.cos((a.latitude * Math.PI) / 180);
    return Math.hypot(dLat, dLon);
  };

  /**
   * How far a visit reaches, and how much it collapses — both taken from the analysis
   * rather than declared here.
   *
   * Until feature 115 this was a `footprint` block in the planner's own configuration:
   * a peak of 0.85, two exponential e-foldings and two hard ring cutoffs, hand-authored
   * before there was an analysis to imitate. Every one of those numbers was a second
   * declaration of something the analysis now actually does, and they disagreed with it
   * — the real collapse at an observed cell is σ²ᵦ/(σ²ᵦ+σ²ₒ), which for the declared
   * deviations is 0.997, not 0.85. A planner scoring a collapse of uncertainty at one
   * scale while the analysis applies it at another is scoring a system that does not
   * exist, so the block is gone and the reach is read from the analyst's covariance.
   */
  const footprintWeight = (visited: PlanningCell, cell: PlanningCell): number => {
    const horizontalKm = horizontalDistanceM(visited, cell) / 1000;
    const verticalM = Math.abs(cell.depthM - visited.depthM);
    return gaspariCohn(
      Math.sqrt(
        (horizontalKm * horizontalKm) / (analyst.correlation.horizontal_km * analyst.correlation.horizontal_km) +
          (verticalM * verticalM) / (analyst.correlation.vertical_m * analyst.correlation.vertical_m),
      ),
    );
  };

  /**
   * The rings the search must enumerate to cover the taper's support. Derived from the
   * declared half-width and the resolution's own hexagon size, so a wider correlation
   * widens the search by itself and no ring count is carried anywhere.
   */
  const supportRings = Math.max(
    1,
    Math.ceil((2 * analyst.correlation.horizontal_km) / getHexagonEdgeLengthAvg(config.h3_resolution, 'km')),
  );

  const tauCache = new Map<string, number>();
  const tau = (cell: PlanningCell, posixSeconds: number): number => {
    const key = `${cellKey(cell.h3, cell.band)}:${Math.round((posixSeconds - origin) / stepSeconds)}`;
    let value = tauCache.get(key);
    if (value === undefined) {
      value = tauAt(world, timescale, cell.longitude, cell.latitude, cell.depthM, posixSeconds - origin);
      tauCache.set(key, value);
    }
    return value;
  };

  const uncertainty = (cell: PlanningCell, posixSeconds: number, state: DeficitState): number | undefined => {
    const uSat = saturation(cell, posixSeconds);
    if (uSat === undefined) return undefined;
    const deficit = state.get(cellKey(cell.h3, cell.band));
    if (!deficit) return uSat;
    const decay = Math.exp(-(posixSeconds - deficit.t0Seconds) / tau(cell, posixSeconds));
    // Floored at zero: where the saturation itself shrank below the standing
    // deficit, the honest reading is "fully resolved", not negative uncertainty.
    return Math.max(0, uSat - (deficit.uSatAtVisit - deficit.uAfterVisit) * decay);
  };

  // Footprints memoised per visited cell: the search walks thousands of candidate
  // routes over the same geometry, and the geometry does not move.
  const coverByH3 = new Map<string, PlanningCell[]>();
  for (const cell of cover) {
    const list = coverByH3.get(cell.h3) ?? [];
    list.push(cell);
    coverByH3.set(cell.h3, list);
  }
  const footprints = new Map<string, FootprintEntry[]>();
  const footprint = (visited: PlanningCell): readonly FootprintEntry[] => {
    const key = cellKey(visited.h3, visited.band);
    let entries = footprints.get(key);
    if (!entries) {
      entries = [];
      for (const h3 of gridDisk(visited.h3, supportRings)) {
        for (const cell of coverByH3.get(h3) ?? []) {
          const weight = footprintWeight(visited, cell);
          if (weight > 0) entries.push({ cell, weight });
        }
      }
      footprints.set(key, entries);
    }
    return entries;
  };

  return {
    saturation,
    tau,
    uncertainty,
    excess(cell, posixSeconds, state) {
      const u = uncertainty(cell, posixSeconds, state);
      return u === undefined ? 0 : Math.max(0, u - config.usable_threshold);
    },
    collapse(visited, posixSeconds, state) {
      for (const { cell, weight } of footprint(visited)) {
        const uSat = saturation(cell, posixSeconds);
        const before = uncertainty(cell, posixSeconds, state);
        if (uSat === undefined || before === undefined) continue;
        // What the analysis would actually leave, from its own closed form:
        //   σ²ᵃ = σ²ᵇ − σ⁴ᵇρ² / (σ²ᵇ + σ²ₒ)
        // so the collapse is not a declared peak times a declared decay — it is the
        // arithmetic the analyst will perform when the platform gets there.
        const variance = before * before;
        const explained = (variance * variance * weight * weight) / (variance + observationErrorStd * observationErrorStd);
        state.set(cellKey(cell.h3, cell.band), {
          t0Seconds: posixSeconds,
          uSatAtVisit: uSat,
          uAfterVisit: Math.sqrt(Math.max(variance - explained, 0)),
        });
      }
    },
    footprint,
    footprintWeight,
  };
}

function clampToAxis(posixSeconds: number, manifest: CoverageHolding['manifest'], origin: number): number {
  const time = manifest.grid.time;
  const start = origin + time.start_offset_seconds;
  const end = start + (time.count - 1) * time.step_seconds;
  return Math.min(Math.max(posixSeconds, start), end);
}

export { cellToLatLng };
