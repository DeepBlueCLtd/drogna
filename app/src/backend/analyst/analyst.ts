/**
 * The analyst (V2-C19, SRD-v2 FR-30 as feature 115 amends it): the step the forecast
 * loop never had.
 *
 * Before this component the model runner initialised from a now-cast the environment
 * generator re-evaluated from the analytic true ocean on a cadence. Observations
 * decided *when* a run happened, through the monitor's residuals, and *where* the
 * platform sampled next, through the planner — but no measurement ever changed a
 * field value. The loop converged because truth leaked into it on a timer, and the
 * falling residuals said nothing about anything having been learned.
 *
 * On each run request this takes the current forecast as background, corrects it by
 * what the instruments have reported since the last cycle, and publishes three
 * holdings through the coverage store's one write seam: the analysis the runner
 * initialises from, the error that correction left, and where every cell's value came
 * from. Then it announces, and the runner proceeds from the announcement — so the
 * order between analysing and forecasting is a message you can watch rather than the
 * order two components happened to subscribe in.
 *
 * Nothing here reads the true field. B comes from the run's own published spread, R
 * from each instrument's declared noise, and the correlation from this component's
 * own configuration: the analyst may not read the world's feature scales, because
 * that document describes the truth, and the gate added by this feature says so.
 */
import type { SeamClient } from '../../seam/transport.js';
import type {
  AnalysisPublished,
  ConfigAnalyst,
  ConfigModelRunner,
  ConfigSensors,
  CoverageHolding,
  Manifest,
  Observation,
  RunPublished,
  RunRequest,
} from '../../generated/types.js';
import { configDigest, sha256Hex } from '../lib/sha256.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';
import { KM_PER_DEGREE_LATITUDE } from '../env-generator/analytic.js';
import type { CoverageStore } from '../coverage-store/store.js';
import {
  optimalInterpolationKernel,
  propagateShares,
  type AnalysisGrid,
  type AnalysisObservation,
  type AnalysisState,
} from './kernel.js';

/** The state variables an analysis corrects, in the order every holding stores them. */
const VARIABLES = ['temperature', 'salinity'] as const;
type Variable = (typeof VARIABLES)[number];

/** The provenance shares, in the order they are stored and drawn. */
const ARCHIVE = 0;
const DEPARTURE = 1;
const MEASUREMENT = 2;
const MODEL = 3;

interface CarriedState {
  /** What the last analysis left, per variable: its error, and its shares. */
  readonly errorStd: Record<Variable, Float32Array>;
  readonly shares: Record<Variable, Float32Array[]>;
}

export class Analyst {
  private readonly heartbeat: HeartbeatEmitter;
  private readonly observationErrorByDatastream: ReadonlyMap<string, number>;
  private simTime = { value: '', tick: 0 };
  private pending: Observation[] = [];
  private carried: CarriedState | undefined;
  /** The uncertainty holding of the run currently standing: B for the next cycle. */
  private spreadHoldingId: string | undefined;
  /** Set once the archive share has been relabelled as what the platform sailed with. */
  private departed = false;

  cyclesCompleted = 0;
  lastAssimilated = 0;
  lastClamped = 0;

  constructor(
    private readonly config: ConfigAnalyst,
    private readonly client: SeamClient,
    private readonly store: CoverageStore,
    sensors: ConfigSensors,
    private readonly modelRunner: ConfigModelRunner,
    private readonly runId: string,
  ) {
    // R is read from the instruments that declare it, never restated here: a number
    // typed into the analyst would be a second declaration of the same limit, free to
    // drift from the one the sensors actually obey (the pattern ingest already uses
    // for the platform's ranges).
    this.observationErrorByDatastream = new Map(
      sensors.instruments.map((instrument) => [instrument.datastream_id, instrument.noise_std]),
    );
    this.heartbeat = new HeartbeatEmitter(
      config.id,
      config.heartbeat,
      client,
      () => ({
        sim_time: this.simTime.value,
        tick: this.simTime.tick,
        status: 'ok',
        detail: `${this.cyclesCompleted} cycle(s); last assimilated ${this.lastAssimilated} observation(s)`,
        figures: [
          { key: 'cycles', value: this.cyclesCompleted, label: 'cycles' },
          { key: 'assimilated', value: this.lastAssimilated, label: 'assimilated' },
          { key: 'waiting', value: this.pending.length, label: 'waiting' },
        ],
      }),
      runId,
      configDigest(config),
    );
  }

  start(): void {
    this.client.subscribe(this.config.topics.clock, (message) => {
      const sample = message.payload as { sim_time: string; tick: number };
      this.simTime = { value: sample.sim_time, tick: sample.tick };
    });
    this.client.subscribe(this.config.topics.observations, (message) => {
      const observation = message.payload as Observation;
      if (this.config.excluded_datastreams.includes(observation.datastream_id)) return;
      if (!VARIABLES.includes(observation.observed_property as Variable)) return;
      this.pending.push(observation);
    });
    this.client.subscribe(this.config.topics.run_published, (message) => {
      const published = message.payload as RunPublished;
      if (published.current) this.spreadHoldingId = published.collections.uncertainty;
    });
    this.client.subscribe(this.config.topics.run_request, (message) => {
      this.cycle(message.payload as RunRequest);
    });
    this.heartbeat.start();
  }

  stop(): void {
    this.heartbeat.stop();
  }

  private cycle(request: RunRequest): void {
    // The background is the forecast that stands. Only the first cycle of a scenario
    // has none, and that one initialises from the now-cast — one deliberate reading
    // of the true field, at the instant the platform leaves, recorded in the message
    // and in the manifest rather than hidden (specs/115, Open Question 3 resolved).
    const instance = this.store.currentInstance();
    const background = instance ?? this.store.currentNowcast();
    if (!background) {
      throw new Error('an analysis was requested before any field exists to correct');
    }
    const backgroundEra = background.descriptor.era;
    const manifest = background.descriptor.manifest;
    const grid = manifest.grid;
    const cellsPerStep = grid.depth.count * grid.latitude.count * grid.longitude.count;
    const midLatitude = (grid.latitude.minimum + grid.latitude.maximum) / 2;
    const analysisGrid: AnalysisGrid = {
      longitude: { minimum: grid.longitude.minimum, spacing: grid.longitude.spacing, count: grid.longitude.count },
      latitude: { minimum: grid.latitude.minimum, spacing: grid.latitude.spacing, count: grid.latitude.count },
      depth: { minimum: grid.depth.minimum, spacing: grid.depth.spacing, count: grid.depth.count },
      cellKmEast: grid.longitude.spacing * KM_PER_DEGREE_LATITUDE * Math.cos((midLatitude * Math.PI) / 180),
      cellKmNorth: grid.latitude.spacing * KM_PER_DEGREE_LATITUDE,
    };

    const view = floatsOf(background.bytes);
    const stride = grid.time.count * cellsPerStep;
    const spread = this.spreadHoldingId ? this.store.holding(this.spreadHoldingId) : undefined;
    const spreadView = spread ? floatsOf(spread.bytes) : undefined;
    const spreadStride = spread ? spread.descriptor.manifest.grid.time.count * cellsPerStep : 0;

    // Taken once, for the whole cycle: an observation that arrives while the analysis
    // is running belongs to the next cycle, not to a variable half-way through this one.
    this.cycleObservations = this.pending;
    this.pending = [];

    const analysedValues: Float32Array[] = [];
    const analysedError: Float32Array[] = [];
    const analysedShares: Float32Array[][] = [];
    let assimilated = 0;
    let clamped = 0;
    let worstDisplacementKm = 0;

    for (let v = 0; v < VARIABLES.length; v++) {
      const variable = VARIABLES[v];
      const values = view.slice(v * stride, v * stride + cellsPerStep);

      // B's diagonal: the run's own published spread where there is one. At the cold
      // start there is no run yet, so the model's declared noise stands in — the
      // harness's one statement of how wrong a forecast of its own is.
      const declared = variable === 'temperature' ? this.modelRunner.noise_std.temperature : this.modelRunner.noise_std.salinity;
      const forecastError =
        spreadView && spreadStride > 0
          ? spreadView.slice(v * spreadStride, v * spreadStride + cellsPerStep)
          : new Float32Array(cellsPerStep).fill(declared);

      // The forecast between analyses added error of its own, and that added variance
      // belongs to no observation. Every carried share is diluted by what it still
      // explains and the remainder credited to the model, which is what makes a
      // measurement's share decay as its forecast ages instead of standing for ever.
      const shares = this.carried
        ? propagateShares(this.carried.shares[variable], this.carried.errorStd[variable], forecastError, MODEL)
        : freshShares(cellsPerStep);

      // The platform has sailed: what the state knew beforehand is now what it left
      // the quay with. A relabelling and nothing more — the departure share's content
      // is archive, because a forecast propagates information without creating any,
      // and specs/115 requires the explainer to say exactly that.
      if (!this.departed) {
        for (let cell = 0; cell < cellsPerStep; cell++) {
          shares[DEPARTURE][cell] += shares[ARCHIVE][cell];
          shares[ARCHIVE][cell] = 0;
        }
      }

      const state: AnalysisState = { values, errorStd: forecastError, shares };
      const forVariable = this.observationsFor(variable);
      const analysis = optimalInterpolationKernel.analyse(state, forVariable, analysisGrid, {
        horizontalKm: this.config.correlation.horizontal_km,
        verticalM: this.config.correlation.vertical_m,
        measurementShareIndex: MEASUREMENT,
      });
      assimilated += analysis.observations.length;
      for (const entry of analysis.observations) {
        if (entry.clamped) clamped += 1;
        if (entry.displacementKm > worstDisplacementKm) worstDisplacementKm = entry.displacementKm;
      }
      analysedValues.push(analysis.values);
      analysedError.push(analysis.errorStd);
      analysedShares.push(analysis.shares.map((share) => Float32Array.from(share)));
    }
    this.departed = true;

    this.carried = {
      errorStd: { temperature: analysedError[0], salinity: analysedError[1] },
      shares: { temperature: analysedShares[0], salinity: analysedShares[1] },
    };
    this.lastAssimilated = assimilated;
    this.lastClamped = clamped;

    const analysisId = `analysis.${request.run_id}`;
    const errorId = `${analysisId}-error`;
    const provenanceId = `${analysisId}-provenance`;
    const observationNote =
      `${assimilated} observation(s) assimilated` +
      (clamped > 0 ? `, ${clamped} clamped to the domain edge, worst ${worstDisplacementKm.toFixed(1)} km` : '') +
      (backgroundEra === 'nowcast'
        ? '. Cold start: initialised from the now-cast, which the environment generator evaluates from the true field. One deliberate reading, at the instant the platform leaves.'
        : `. Background: ${background.descriptor.holding_id}.`);

    const analysisDigest = this.publish(analysisId, 'analysis', request, manifest, analysedValues, VARIABLES.map((name) => name), `optimal-interpolation-v1: xᵃ = xᵇ + K(y − Hxᵇ), K = BHᵀ(HBHᵀ + R)⁻¹, B from the published spread tapered by Gaspari–Cohn at ${this.config.correlation.horizontal_km} km and ${this.config.correlation.vertical_m} m half-widths, R from each instrument's declared noise. ${observationNote}`);
    const errorDigest = this.publish(errorId, 'analysis', request, manifest, analysedError, VARIABLES.map((name) => `${name}_error`), `The diagonal of Pᵃ = (I − KH)B: what the correction left. Doubt falls only where a measurement reached, and the taper's support says exactly how far that is.`);
    const provenanceValues: Float32Array[] = [];
    const provenanceNames: string[] = [];
    const shareNames = [this.config.shares.archive, this.config.shares.departure, this.config.shares.measurement, this.config.shares.model];
    for (let v = 0; v < VARIABLES.length; v++) {
      for (let s = 0; s < shareNames.length; s++) {
        provenanceValues.push(analysedShares[v][s]);
        provenanceNames.push(`${VARIABLES[v]}_share_${shareNames[s].replace(/[^a-z]+/gi, '_').toLowerCase()}`);
      }
    }
    const provenanceDigest = this.publish(provenanceId, 'analysis', request, manifest, provenanceValues, provenanceNames, `Where each cell's value came from. Because H selects a cell, xᵃ = (I − KH)xᵇ + Ky exactly, so these shares are read off the gain rather than approximated, and they sum to one. A share may be negative: where a cell's background error greatly exceeds the observed cell's, the gain extrapolates, ω passes one, and that is optimal interpolation behaving correctly rather than a fault to clamp away.`);

    this.client.publish(this.config.topics.analysis_published, {
      component: this.config.id,
      scenario_run_id: this.runId,
      sim_time: this.simTime.value,
      tick: this.simTime.tick,
      run_id: request.run_id,
      initialisation_sim_time: request.initialisation_sim_time,
      ensemble_size: request.ensemble_size,
      background: { holding_id: background.descriptor.holding_id, era: backgroundEra },
      collections: { analysis: analysisId, error: errorId, provenance: provenanceId },
      digests: { analysis: analysisDigest, error: errorDigest, provenance: provenanceDigest },
      observations: { assimilated, clamped, worst_displacement_km: worstDisplacementKm },
    } satisfies AnalysisPublished);
    this.cyclesCompleted += 1;
  }

  /** The cycle's observations of one variable, with each instrument's declared error. */
  private observationsFor(variable: Variable): AnalysisObservation[] {
    const out: AnalysisObservation[] = [];
    for (const observation of this.pendingFor(variable)) {
      const errorStd = this.observationErrorByDatastream.get(observation.datastream_id);
      // An observation from a datastream no instrument declares has no error to weigh
      // it by, and a default here would be a number nobody wrote down.
      if (errorStd === undefined) continue;
      out.push({
        longitude: observation.location.longitude,
        latitude: observation.location.latitude,
        depthM: observation.location.depth_m,
        value: observation.result,
        errorStd,
      });
    }
    return out;
  }

  private cycleObservations: Observation[] = [];
  private pendingFor(variable: Variable): Observation[] {
    return this.cycleObservations.filter((observation) => observation.observed_property === variable);
  }

  /** Staged through the store's one write seam, digest-checked like everything else. */
  private publish(
    holdingId: string,
    era: CoverageHolding['era'],
    request: RunRequest,
    baseManifest: Manifest,
    fields: readonly Float32Array[],
    names: readonly string[],
    rule: string,
  ): string {
    let byteLength = 0;
    for (const field of fields) byteLength += field.byteLength;
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const field of fields) {
      bytes.set(new Uint8Array(field.buffer, field.byteOffset, field.byteLength), offset);
      offset += field.byteLength;
    }
    const digest = `sha256:${sha256Hex(bytes)}`;
    const template = baseManifest.variables[0];
    const manifest: Manifest = {
      ...baseManifest,
      generator: { name: 'drogna-analyst', version: '2.0.0', analytic_form_version: 1 },
      config_digest: configDigest(this.config),
      generated_at: { sim_time: this.simTime.value, tick: this.simTime.tick },
      grid: {
        ...baseManifest.grid,
        time: {
          origin_sim_time: request.initialisation_sim_time,
          start_offset_seconds: 0,
          step_seconds: baseManifest.grid.time.step_seconds,
          count: 1,
          units: 'seconds since the origin sim time',
        },
      },
      variables: names.map((name) => ({ ...template, name, standard_name: null, long_name: name.replace(/_/g, ' ') })),
      composition: { rule: 'analysis', description: rule },
      outputs: {
        field: { name: holdingId, format: 'drogna-f32-v1', sha256: digest },
        manifest: { name: `${holdingId}.manifest`, format: 'application/json' },
      },
    };
    const descriptor: CoverageHolding = {
      schema_version: 1,
      holding_id: holdingId,
      era,
      run_id: this.runId,
      published_at: { sim_time: this.simTime.value, tick: this.simTime.tick },
      field: { format: 'drogna-f32-v1', sha256: digest, byte_length: bytes.byteLength },
      manifest,
    };
    const verdict = this.store.publish({ descriptor, bytes });
    if (!verdict.published) throw new Error(`coverage store refused ${holdingId}: ${verdict.refusal}`);
    return digest;
  }
}

function floatsOf(bytes: Uint8Array): Float32Array {
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

/** At the cold start the whole state is what was known before the scenario began. */
function freshShares(cells: number): Float32Array[] {
  const shares = [new Float32Array(cells), new Float32Array(cells), new Float32Array(cells), new Float32Array(cells)];
  shares[ARCHIVE].fill(1);
  return shares;
}
