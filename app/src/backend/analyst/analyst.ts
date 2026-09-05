/**
 * The analyst (V2-C19, SRD-v2 FR-30 as feature 116 amends it): the step the forecast
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
  AnalysisContributionsHeader,
  AnalysisContributionsSource,
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
import { publicationFault } from '../coverage-store/store.js';
import type { CoverageStore } from '../coverage-store/store.js';
import { CONTRIBUTIONS_FORMAT, encodeContributions } from '../lib/contributions-format.js';
import { F32_FORMAT } from '../lib/holding-format.js';
import { ulpAt } from '../lib/ulp.js';
import {
  optimalInterpolationKernel,
  propagateShares,
  type AnalysisContributions,
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
  /** Which instrument a datastream is, for the contributions holding's source table. */
  private readonly sensorByDatastream: ReadonlyMap<string, string>;
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
  /**
   * The last announcement, and the tick it was last said at.
   *
   * **A cycle's collections are a standing fact, not an event.** The provenance of a cell is
   * still what the current analysis made it until another cycle replaces it, and a surface
   * showing what a cell's value was made from needs those collection names to ask for it at
   * all. Announced on the cycle alone, a console mounting afterwards — which every console
   * does, since the shell opens after the pre-roll — had nothing to name for up to a whole
   * cadence, and said so where the reading should have been. This is the same argument the
   * model runner's cost and feature statements already make for themselves.
   */
  private lastAnnouncement: AnalysisPublished | undefined;
  private announcedAtTick: number | undefined;

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
    this.sensorByDatastream = new Map(sensors.instruments.map((instrument) => [instrument.datastream_id, instrument.sensor_id]));
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
      this.restateLastAnalysis();
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
    // and in the manifest rather than hidden (specs/116, Open Question 3 resolved).
    const instance = this.store.currentInstance();
    const background = instance ?? this.store.currentNowcast();
    if (!background) {
      throw new Error('an analysis was requested before any field exists to correct');
    }
    const backgroundEra = background.descriptor.era;
    if (backgroundEra !== 'instance' && backgroundEra !== 'nowcast') {
      // The two eras an analysis can stand on: the forecast that stands, or the
      // now-cast at cold start. Feature 121 added a third truth-derived era — the
      // departure brief, truth held constant from the origin — and a background
      // reaching here from it would be the leak feature 116 closed, arriving by a
      // different door. Refused by name rather than published as a background.
      throw new Error(
        `an analysis cannot be built on a '${backgroundEra}' holding: the background is the standing forecast, or the now-cast at cold start`,
      );
    }
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
    /** Temperature's, for the same reason the provenance is temperature's: see below. */
    let contributions: AnalysisContributions | undefined;
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
      // and specs/116 requires the explainer to say exactly that.
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
        // Temperature's alone, as the provenance is: see the note at the publication.
        retainContributions: v === 0,
      });
      assimilated += analysis.observations.length;
      for (const entry of analysis.observations) {
        if (entry.clamped) clamped += 1;
        if (entry.displacementKm > worstDisplacementKm) worstDisplacementKm = entry.displacementKm;
      }
      analysedValues.push(analysis.values);
      analysedError.push(analysis.errorStd);
      analysedShares.push(analysis.shares.map((share) => Float32Array.from(share)));
      if (v === 0) contributions = analysis.contributions;
    }
    this.departed = true;
    if (!contributions) throw new Error('the temperature analysis published no contributions');

    this.carried = {
      errorStd: { temperature: analysedError[0], salinity: analysedError[1] },
      shares: { temperature: analysedShares[0], salinity: analysedShares[1] },
    };
    this.lastAssimilated = assimilated;
    this.lastClamped = clamped;

    const analysisId = `analysis.${request.run_id}`;
    const errorId = `${analysisId}-error`;
    const provenanceId = `${analysisId}-provenance`;
    const contributionsId = `${analysisId}-contributions`;
    const observationNote =
      `${assimilated} observation(s) assimilated` +
      (clamped > 0 ? `, ${clamped} clamped to the domain edge, worst ${worstDisplacementKm.toFixed(1)} km` : '') +
      (backgroundEra === 'nowcast'
        ? '. Cold start: initialised from the now-cast, which the environment generator evaluates from the true field. One deliberate reading, at the instant the platform leaves.'
        : `. Background: ${background.descriptor.holding_id}.`);

    const analysisDigest = this.publish(analysisId, 'analysis', request, manifest, analysedValues, VARIABLES.map((name) => name), `optimal-interpolation-v1: xᵃ = xᵇ + K(y − Hxᵇ), K = BHᵀ(HBHᵀ + R)⁻¹, B from the published spread tapered by Gaspari–Cohn at ${this.config.correlation.horizontal_km} km and ${this.config.correlation.vertical_m} m half-widths, R from each instrument's declared noise. ${observationNote}`);
    const errorDigest = this.publish(errorId, 'analysis', request, manifest, analysedError, VARIABLES.map((name) => `${name}_error`), `The diagonal of Pᵃ = (I − KH)B: what the correction left. Doubt falls only where a measurement reached, and the taper's support says exactly how far that is.`);
    // Provenance is published for temperature alone, and deliberately.
    //
    // Both variables are analysed — sound speed is derived from the pair, so correcting
    // one and not the other would bias every residual the monitor scores. But nothing
    // reads salinity's shares: the Map tints by temperature's, and the explainer follows
    // one cell of it. Publishing them would add four more full-grid fields to hash and
    // hold on every cycle — at the shipped grid, three quarters of a megabyte a cycle,
    // kept for the life of the run — to answer a question nothing asks. If something
    // comes to ask it, this loop is where it is answered.
    const provenanceValues: Float32Array[] = [];
    const provenanceNames: string[] = [];
    const shareNames = [this.config.shares.archive, this.config.shares.departure, this.config.shares.measurement, this.config.shares.model];
    for (let s = 0; s < shareNames.length; s++) {
      provenanceValues.push(analysedShares[0][s]);
      provenanceNames.push(`${VARIABLES[0]}_share_${shareNames[s].replace(/[^a-z]+/gi, '_').toLowerCase()}`);
    }
    const provenanceDigest = this.publish(provenanceId, 'analysis', request, manifest, provenanceValues, provenanceNames, `Where each cell's value came from. Because H selects a cell, xᵃ = (I − KH)xᵇ + Ky exactly, so these shares are read off the gain rather than approximated, and they sum to one. A share may be negative: where a cell's background error greatly exceeds the observed cell's, the gain extrapolates, ω passes one, and that is optimal interpolation behaving correctly rather than a fault to clamp away.`);

    // What the measurement share is the row sum of (feature 124): each source's
    // contribution to each cell it reached, with the remainder — the coupling from
    // beyond a cell's reach — so the sum is ω exactly. Temperature alone, as the
    // provenance is, and for the same reason. The bytes are their own format: a sparse
    // per-source holding is not a coverage, and EDR does not list it.
    const contributionsDigest = this.publishBytes(
      contributionsId,
      'analysis',
      request,
      manifest,
      encodeContributions(this.contributionsHeader(contributions, analysisGrid, request.run_id), contributions),
      CONTRIBUTIONS_FORMAT,
      [contributionVariable(manifest.variables[0], contributions)],
      `Not a gridded coverage: a sparse holding in the ${CONTRIBUTIONS_FORMAT} format, whose rows are keyed on the cells of the grid this manifest declares — the grid is the coordinate reference, not a claim that every cell holds a value. Each source's contribution to each cell within its support — Σⱼ K_aj over the observations an instrument made in one cell, read off the gain the analysis was built with — and, per cell, ω and the remainder, ω less the in-support sum: what observations beyond the cell's reach did to it through the inverse's coupling with those within. Σ sources + remainder = ω. ${contributions.sources.length} source(s), ${contributions.cells.length} cell(s) reached, ${contributions.entrySource.length} entries.`,
      'analysis-contributions',
    );

    const announcement: AnalysisPublished = {
      component: this.config.id,
      scenario_run_id: this.runId,
      sim_time: this.simTime.value,
      tick: this.simTime.tick,
      run_id: request.run_id,
      initialisation_sim_time: request.initialisation_sim_time,
      ensemble_size: request.ensemble_size,
      background: { holding_id: background.descriptor.holding_id, era: backgroundEra },
      collections: { analysis: analysisId, error: errorId, provenance: provenanceId, contributions: contributionsId },
      digests: { analysis: analysisDigest, error: errorDigest, provenance: provenanceDigest, contributions: contributionsDigest },
      observations: { assimilated, clamped, worst_displacement_km: worstDisplacementKm },
    };
    this.client.publish(this.config.topics.analysis_published, announcement);
    // Declared beside the announcement, so a console already listening does not wait out the
    // restatement cadence to learn what it could have been told at once.
    this.declareStanding(announcement);
    // Kept so a console that mounts after this cycle still learns what to read.
    this.lastAnnouncement = announcement;
    this.announcedAtTick = this.simTime.tick;
    this.cyclesCompleted += 1;
  }

  /**
   * The standing analysis, named again for a listener that was not there.
   *
   * Nothing is recomputed and no field is re-published: the announcement made on the cycle is
   * republished with the instant it is being said at. A restatement that re-analysed would be
   * a second opinion about one cycle, which is the fault the one-publisher rule exists
   * against — and it would burn a full analysis to answer a question already answered.
   */
  private restateLastAnalysis(): void {
    const standing = this.lastAnnouncement;
    if (!standing) return;
    if (
      this.announcedAtTick !== undefined &&
      this.simTime.tick - this.announcedAtTick < this.config.restate_every_ticks
    ) {
      return;
    }
    this.declareStanding(standing);
    this.announcedAtTick = this.simTime.tick;
  }

  /**
   * The standing analysis, on the topic that declares rather than the one that commands.
   *
   * **This is the whole of what the first attempt got wrong, and it is worth stating.**
   * `analysis_published` looks like an announcement and is a trigger: the model runner starts
   * a forecast on it — that is feature 116's design, the reason the runner waits for the
   * analysis rather than the request — and the planner re-plans on it. Restating it therefore
   * re-ran the loop. Measured: ten tests failed across seven files, replay determinism among
   * them, and two timed out with the runner refusing runs it had just been asked to repeat.
   *
   * A declaration commands nothing. It carries the same message, governed by the same master,
   * and its topic has no subscriber that acts — the same separation the model runner already
   * keeps between `run_started`, which reports an event, and `run_cost`, which declares a
   * standing figure and is restated for exactly this reason.
   */
  private declareStanding(announcement: AnalysisPublished): void {
    this.client.publish(this.config.topics.analysis_standing, {
      ...announcement,
      sim_time: this.simTime.value,
      tick: this.simTime.tick,
    } satisfies AnalysisPublished);
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
        sourceKey: observation.datastream_id,
      });
    }
    return out;
  }

  private cycleObservations: Observation[] = [];
  private pendingFor(variable: Variable): Observation[] {
    return this.cycleObservations.filter((observation) => observation.observed_property === variable);
  }

  /**
   * The contributions holding's header: the kernel's sources named as the harness
   * names them — a datastream, its instrument, the cell's centre — with the correlation
   * the support is read from. Every source is measured: the analyst assimilates the
   * vessel's instruments and nothing else, and the shore broadcast enters as background
   * (FR-125), so the flag is stated rather than left for the reader to assume.
   */
  private contributionsHeader(contributions: AnalysisContributions, grid: AnalysisGrid, runId: string): AnalysisContributionsHeader {
    const perLevel = grid.latitude.count * grid.longitude.count;
    const sources: AnalysisContributionsSource[] = contributions.sources.map((source) => {
      const lonIndex = source.cellIndex % grid.longitude.count;
      const latIndex = Math.floor(source.cellIndex / grid.longitude.count) % grid.latitude.count;
      const depthIndex = Math.floor(source.cellIndex / perLevel);
      return {
        source_id: `${source.sourceKey}.cell-${source.cellIndex}`,
        datastream_id: source.sourceKey,
        sensor_id: this.sensorByDatastream.get(source.sourceKey) ?? source.sourceKey,
        kind: 'measured',
        cell: {
          index: source.cellIndex,
          longitude: grid.longitude.minimum + lonIndex * grid.longitude.spacing,
          latitude: grid.latitude.minimum + latIndex * grid.latitude.spacing,
          depth_m: grid.depth.minimum + depthIndex * grid.depth.spacing,
        },
        observed: { longitude: source.longitude, latitude: source.latitude, depth_m: source.depthM },
        observation_count: source.observationCount,
        error_std: source.errorStd,
        background_error_std: source.backgroundErrorStd,
        mean_innovation: source.meanInnovation,
      };
    });
    return {
      schema_version: 1,
      format: CONTRIBUTIONS_FORMAT,
      run_id: runId,
      variable: VARIABLES[0],
      correlation: { horizontal_km: this.config.correlation.horizontal_km, vertical_m: this.config.correlation.vertical_m },
      sources,
      cells: contributions.cells.length,
      entries: contributions.entrySource.length,
      layout:
        'u32[cells] cell; f32[cells] observation_weight; f32[cells] remainder; f32[cells] background_error_std; u32[cells+1] offsets; u32[entries] source; f32[entries] contribution; f32[entries] horizontal_km; f32[entries] vertical_m',
    };
  }

  /** Gridded fields, concatenated in the manifest's variable order: `drogna-f32-v1`. */
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
    const template = baseManifest.variables[0];
    return this.publishBytes(
      holdingId,
      era,
      request,
      baseManifest,
      bytes,
      F32_FORMAT,
      names.map((name) => ({ ...template, name, standard_name: null, long_name: name.replace(/_/g, ' ') })),
      rule,
    );
  }

  /** Staged through the store's one write seam, digest-checked like everything else. */
  private publishBytes(
    holdingId: string,
    era: CoverageHolding['era'],
    request: RunRequest,
    baseManifest: Manifest,
    bytes: Uint8Array,
    format: CoverageHolding['field']['format'],
    variables: Manifest['variables'],
    rule: string,
    compositionRule = 'analysis',
  ): string {
    const digest = `sha256:${sha256Hex(bytes)}`;
    const manifest: Manifest = {
      ...baseManifest,
      // The form version travels with the parameters, and the parameters come from the
      // manifest spread above. Typed here it was correct only while there was one form:
      // the moment the env-generator reached form 2 (#113) this document would have
      // carried form 2's thermocline parameters under a form 1 label, telling a reader it
      // could reconstruct a doming layer with the flat rule. Read from the base and it
      // cannot drift again.
      generator: {
        name: 'drogna-analyst',
        version: '2.0.0',
        analytic_form_version: baseManifest.generator.analytic_form_version,
      },
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
      variables,
      composition: { rule: compositionRule, description: rule },
      outputs: {
        field: { name: holdingId, format, sha256: digest },
        manifest: { name: `${holdingId}.manifest`, format: 'application/json' },
      },
    };
    const descriptor: CoverageHolding = {
      schema_version: 1,
      holding_id: holdingId,
      era,
      run_id: this.runId,
      published_at: { sim_time: this.simTime.value, tick: this.simTime.tick },
      field: { format, sha256: digest, byte_length: bytes.byteLength },
      manifest,
    };
    const verdict = this.store.publish({ descriptor, bytes });
    if (verdict.outcome !== 'written') throw publicationFault(verdict, holdingId);
    return digest;
  }
}

/**
 * The contributions holding's one manifest variable: a weight, dimensionless, with the
 * tolerance derived from float32's width at the largest magnitude stored — the same
 * derivation the generator and the runner use, so a comparison against the holding has
 * a stated threshold rather than a chosen one.
 */
function contributionVariable(template: Manifest['variables'][number], contributions: AnalysisContributions): Manifest['variables'][number] {
  let magnitude = 0;
  for (const array of [contributions.weight, contributions.remainder, contributions.entryContribution]) {
    for (const value of array) magnitude = Math.max(magnitude, Math.abs(value));
  }
  return {
    ...template,
    name: `${VARIABLES[0]}_contribution`,
    standard_name: null,
    long_name: `${VARIABLES[0]} contribution by source`,
    units: '1',
    dtype: 'float32',
    tolerance_absolute: 4 * ulpAt(magnitude),
  };
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
