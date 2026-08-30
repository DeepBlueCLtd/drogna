/**
 * The model runner (V2-C13, SRD-v2 FR-30): on a run request, initialises from the
 * current now-cast through the store interface, runs a small ensemble behind the
 * kernel port, and publishes the ensemble mean as the forecast with the spread as
 * the uncertainty field — both staged through the coverage store's digest-checked
 * seam and announced on the control namespace. Consumers subscribe; nothing polls.
 */
import type { SeamClient } from '../../seam/transport.js';
import type {
  AnalysisPublished,
  ConfigModelRunner,
  CoverageHolding,
  Manifest,
  RunPublished,
} from '../../generated/types.js';
import { Rng, SEED_DERIVATION, streamSeed } from '../lib/rng.js';
import { configDigest, sha256Hex } from '../lib/sha256.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';
import { KM_PER_DEGREE_LATITUDE, insideSoundSpeedValidity } from '../env-generator/analytic.js';
import type { CoverageStore } from '../coverage-store/store.js';
import { shiftAdvectKernel, type ModelKernel } from './kernel.js';

const KERNELS: Record<string, ModelKernel> = {
  [shiftAdvectKernel.name]: shiftAdvectKernel,
};

export class ModelRunner {
  private readonly heartbeat: HeartbeatEmitter;
  private readonly kernel: ModelKernel;
  private simTime = { value: '', tick: 0 };
  /**
   * Ensemble members the last run produced, and how many it asked for. Reported so
   * the Operator's face can draw the ensemble filling rather than a spinner that
   * means nothing; both are read from the run that happened.
   */
  membersDone = 0;
  ensembleSize = 0;
  runsCompleted = 0;

  constructor(
    private readonly config: ConfigModelRunner,
    private readonly client: SeamClient,
    private readonly store: CoverageStore,
    private readonly runId: string,
    private readonly rootSeed: number,
  ) {
    const kernel = KERNELS[config.kernel];
    if (!kernel) {
      throw new Error(`no kernel named '${config.kernel}' behind the port; known: ${Object.keys(KERNELS).join(', ')}`);
    }
    this.kernel = kernel;
    this.heartbeat = new HeartbeatEmitter(
      config.id,
      config.heartbeat,
      client,
      () => ({
        sim_time: this.simTime.value,
        tick: this.simTime.tick,
        status: 'ok',
        detail: `${this.runsCompleted} run(s) completed; kernel ${this.kernel.name}, ${this.config.steps} step(s)`,
        figures: [
          { key: 'runs_completed', value: this.runsCompleted, label: 'runs' },
          {
            key: 'members_done',
            value: this.membersDone,
            of: this.ensembleSize,
            label: 'ensemble',
          },
          { key: 'horizon_seconds', value: this.config.steps * this.config.step_seconds, unit: 's', label: 'horizon' },
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
    // Feature 115: the runner waits for the analysis, not for the request. Until then
    // it subscribed to the request directly and initialised from a now-cast the
    // environment generator evaluated from the true ocean, so nothing the platform
    // measured ever reached a forecast. The ordering between analysing and forecasting
    // is now a message rather than the order two components happened to subscribe in.
    this.client.subscribe(this.config.topics.analysis_published, (message) => {
      this.run(message.payload as AnalysisPublished);
    });
    this.heartbeat.start();
  }

  stop(): void {
    this.heartbeat.stop();
  }

  private run(request: AnalysisPublished): void {
    const analysis = this.store.holding(request.collections.analysis);
    if (!analysis) {
      throw new Error(
        `the analysis '${request.collections.analysis}' this run initialises from is not in the store; a run never falls back to the true field`,
      );
    }
    const errorHolding = this.store.holding(request.collections.error);
    if (!errorHolding) {
      throw new Error(`the analysis error '${request.collections.error}' is not in the store; the ensemble has nothing to be perturbed by`);
    }
    const baseManifest = analysis.descriptor.manifest;
    const grid = baseManifest.grid;
    const cellsPerStep = grid.depth.count * grid.latitude.count * grid.longitude.count;

    this.client.publish(this.config.topics.run_started, {
      component: this.config.id,
      scenario_run_id: this.runId,
      sim_time: this.simTime.value,
      tick: this.simTime.tick,
      run_id: request.run_id,
      divergence_id: null,
      member_count: request.ensemble_size,
      kernel: this.kernel.name,
      initialisation_sim_time: request.initialisation_sim_time,
    });

    // Initial state: the analysis, through the store interface. It carries one instant,
    // so a variable's field is one stride of cells rather than a slice out of a series.
    const analysisView = new Float32Array(analysis.bytes.buffer, analysis.bytes.byteOffset, analysis.bytes.byteLength / 4);
    const errorView = new Float32Array(errorHolding.bytes.buffer, errorHolding.bytes.byteOffset, errorHolding.bytes.byteLength / 4);
    const midLatitude = (grid.latitude.minimum + grid.latitude.maximum) / 2;
    const kernelGrid = {
      lonCount: grid.longitude.count,
      latCount: grid.latitude.count,
      depthCount: grid.depth.count,
      cellKmEast: grid.longitude.spacing * KM_PER_DEGREE_LATITUDE * Math.cos((midLatitude * Math.PI) / 180),
      cellKmNorth: grid.latitude.spacing * KM_PER_DEGREE_LATITUDE,
    };
    const analysedTemperature = analysisView.slice(0, cellsPerStep);
    const analysedSalinity = analysisView.slice(cellsPerStep, 2 * cellsPerStep);
    const errorTemperature = errorView.slice(0, cellsPerStep);
    const errorSalinity = errorView.slice(cellsPerStep, 2 * cellsPerStep);
    const parameters = {
      steps: this.config.steps,
      stepSeconds: this.config.step_seconds,
      advectionEastKmPerDay: this.config.advection.east_km_per_day,
      advectionNorthKmPerDay: this.config.advection.north_km_per_day,
      noiseStdTemperature: this.config.noise_std.temperature,
      noiseStdSalinity: this.config.noise_std.salinity,
    };

    const drawOrder: string[] = [];
    this.ensembleSize = request.ensemble_size;
    this.membersDone = 0;
    const members = Array.from({ length: request.ensemble_size }, (_, member) => {
      const streamName = `${this.config.stream}:${request.run_id}:m${member}`;
      drawOrder.push(streamName);
      const rng = new Rng(this.rootSeed, streamName);
      // Each member starts from the analysis plus a draw scaled by the error the
      // analysis left. Before feature 115 every member began from the identical state,
      // so the ensemble's only divergence was the kernel's own noise and the published
      // spread was a function of lead time with no spatial structure whatever — the
      // planner needed an observation-age field to supply the structure the spread
      // lacked. Perturbing from Pᵃ is what makes the spread mean 'how well is this
      // state known', and what lets a measurement's effect survive into the next cycle.
      const temperature = new Float32Array(cellsPerStep);
      const salinity = new Float32Array(cellsPerStep);
      for (let cell = 0; cell < cellsPerStep; cell++) {
        temperature[cell] = analysedTemperature[cell] + rng.normal(0, errorTemperature[cell]);
        salinity[cell] = analysedSalinity[cell] + rng.normal(0, errorSalinity[cell]);
      }
      return this.kernel.memberField({ grid: kernelGrid, temperature, salinity }, parameters, rng);
    });

    // Ensemble mean and spread, per variable per cell.
    const totalCells = this.config.steps * cellsPerStep;
    const mean = { temperature: new Float32Array(totalCells), salinity: new Float32Array(totalCells) };
    const spread = { temperature: new Float32Array(totalCells), salinity: new Float32Array(totalCells) };
    for (const variable of ['temperature', 'salinity'] as const) {
      for (let cell = 0; cell < totalCells; cell++) {
        let sum = 0;
        for (const member of members) sum += member[variable][cell];
        const cellMean = sum / members.length;
        let variance = 0;
        for (const member of members) variance += (member[variable][cell] - cellMean) ** 2;
        mean[variable][cell] = cellMean;
        spread[variable][cell] = Math.sqrt(variance / (members.length - 1));
      }
    }

    const forecastId = request.run_id;
    const spreadId = `${request.run_id}-spread`;
    // Spread first, forecast second: the store's instance pointer names the most
    // recent publication, and the monitor scores against the forecast.
    const spreadDigest = this.publishInstance(spreadId, request, baseManifest, spread.temperature, spread.salinity, drawOrder, true);
    const forecastDigest = this.publishInstance(forecastId, request, baseManifest, mean.temperature, mean.salinity, drawOrder, false);

    const validityEnd = this.isoPlusSeconds(request.initialisation_sim_time, (this.config.steps - 1) * this.config.step_seconds);
    this.client.publish(this.config.topics.run_published, {
      component: this.config.id,
      scenario_run_id: this.runId,
      sim_time: this.simTime.value,
      tick: this.simTime.tick,
      run_id: request.run_id,
      current: true,
      valid_time: { start_sim_time: request.initialisation_sim_time, end_sim_time: validityEnd },
      grid_bounds: {
        minimum_latitude: grid.latitude.minimum,
        maximum_latitude: grid.latitude.maximum,
        minimum_longitude: grid.longitude.minimum,
        maximum_longitude: grid.longitude.maximum,
        minimum_depth_m: grid.depth.minimum,
        maximum_depth_m: grid.depth.maximum,
      },
      collections: { forecast: forecastId, uncertainty: spreadId },
      digests: { forecast: forecastDigest, uncertainty: spreadDigest },
    } satisfies RunPublished);
    // The run finished, so every member it asked for was produced: reported from the
    // run that happened rather than counted up by the display.
    this.membersDone = this.ensembleSize;
    this.runsCompleted += 1;
  }

  private publishInstance(
    holdingId: string,
    request: AnalysisPublished,
    baseManifest: Manifest,
    temperature: Float32Array,
    salinity: Float32Array,
    drawOrder: string[],
    isSpread: boolean,
  ): string {
    const bytes = new Uint8Array(temperature.byteLength + salinity.byteLength);
    bytes.set(new Uint8Array(temperature.buffer, temperature.byteOffset, temperature.byteLength), 0);
    bytes.set(new Uint8Array(salinity.buffer, salinity.byteOffset, salinity.byteLength), temperature.byteLength);
    const digest = `sha256:${sha256Hex(bytes)}`;

    let maxAbsT = 0;
    let maxAbsS = 0;
    let outside = 0;
    let firstOutside: Manifest['sound_speed']['outside_validity']['first_point'] = null;
    const grid = baseManifest.grid;
    const depths = Array.from({ length: grid.depth.count }, (_, i) => grid.depth.minimum + i * grid.depth.spacing);
    for (let cell = 0; cell < temperature.length; cell++) {
      if (Math.abs(temperature[cell]) > maxAbsT) maxAbsT = Math.abs(temperature[cell]);
      if (Math.abs(salinity[cell]) > maxAbsS) maxAbsS = Math.abs(salinity[cell]);
      if (!isSpread) {
        const depthIndex = Math.floor(cell / (grid.latitude.count * grid.longitude.count)) % grid.depth.count;
        if (!insideSoundSpeedValidity(temperature[cell], salinity[cell], depths[depthIndex])) {
          outside += 1;
          firstOutside ??= { latitude: grid.latitude.minimum, longitude: grid.longitude.minimum, depth_m: depths[depthIndex], time_seconds: 0 };
        }
      }
    }
    const ulpAt = (magnitude: number) => Math.pow(2, Math.max(Math.floor(Math.log2(Math.max(magnitude, 1))) - 23, -149));

    const manifest: Manifest = {
      ...baseManifest,
      generator: { name: 'drogna-model-runner', version: '2.0.0', analytic_form_version: 1 },
      config_digest: configDigest(this.config),
      seed: {
        root: this.rootSeed,
        stream: this.config.stream,
        derived_entropy: streamSeed(this.rootSeed, this.config.stream).toString(16),
        derivation: { rule: SEED_DERIVATION.rule, version: SEED_DERIVATION.version },
        draw_order: drawOrder,
      },
      generated_at: { sim_time: this.simTime.value, tick: this.simTime.tick },
      grid: {
        ...baseManifest.grid,
        time: {
          origin_sim_time: request.initialisation_sim_time,
          start_offset_seconds: 0,
          step_seconds: this.config.step_seconds,
          count: this.config.steps,
          units: 'seconds since the origin sim time',
        },
      },
      variables: baseManifest.variables.map((variable, index) => ({
        ...variable,
        name: isSpread ? `${variable.name}_spread` : variable.name,
        standard_name: isSpread ? null : variable.standard_name,
        long_name: isSpread ? `ensemble spread of ${variable.long_name}` : variable.long_name,
        tolerance_absolute: 4 * ulpAt(index === 0 ? maxAbsT : maxAbsS),
      })),
      composition: {
        rule: isSpread ? 'ensemble-spread' : 'ensemble-mean',
        description: `${this.kernel.name} members from the analysis, each perturbed by the error the analysis left; ${
          isSpread ? 'per-cell sample standard deviation across members' : 'per-cell mean across members'
        }. The advection velocity is a modelling assumption, deliberately not the true drift. Before feature 115 every member began from an identical now-cast the generator evaluated from the true field, so the spread carried no spatial structure and no measurement reached a forecast.`,
      },
      sound_speed: {
        ...baseManifest.sound_speed,
        outside_validity: { count: outside, first_point: firstOutside },
      },
      outputs: {
        field: { name: holdingId, format: 'drogna-f32-v1', sha256: digest },
        manifest: { name: `${holdingId}.manifest`, format: 'application/json' },
      },
    };

    const descriptor: CoverageHolding = {
      schema_version: 1,
      holding_id: holdingId,
      era: 'instance',
      run_id: this.runId,
      published_at: { sim_time: this.simTime.value, tick: this.simTime.tick },
      field: { format: 'drogna-f32-v1', sha256: digest, byte_length: bytes.byteLength },
      manifest,
    };
    const verdict = this.store.publish({ descriptor, bytes });
    if (!verdict.published) {
      throw new Error(`coverage store refused instance ${holdingId}: ${verdict.refusal}`);
    }
    return digest;
  }

  private isoPlusSeconds(iso: string, seconds: number): string {
    const millis = Date.parse(iso.slice(0, 23) + 'Z') + seconds * 1000;
    return `${new Date(millis).toISOString().slice(0, 19)}.000000Z`;
  }
}
