/**
 * The model runner (V2-C13, SRD-v2 FR-30): on a run request, initialises from the
 * current now-cast through the store interface, runs a small ensemble behind the
 * kernel port, and publishes the ensemble mean as the forecast with the spread as
 * the uncertainty field — both staged through the coverage store's digest-checked
 * seam and announced on the control namespace. Consumers subscribe; nothing polls.
 *
 * From feature 123 a run **occupies** what it costs (FR-114, ADR-0043). The runner is the
 * sole publisher of that figure: it states the cost on its declared topic, announces the
 * start, integrates, and then holds the publication until the ticks the cost comes to have
 * been spent on the clock it already subscribes to. Nothing is smoothed, hidden behind a
 * spinner, or amortised across ticks — a forecast that is expensive in the real system and
 * free in the harness would teach the wrong lesson. The cost is simulation time, never host
 * time: a host-clock duration is a fact about the machine the tab happens to be open on, and
 * admitting one would put a figure inside a run that differs between two replays of the same
 * manifest (AT-04).
 */
import type { SeamClient } from '../../seam/transport.js';
import type {
  AnalysisPublished,
  ConfigModelRunner,
  CoverageHolding,
  ForecastFeatures,
  ForecastFeaturesFeature,
  ForecastFeaturesStep,
  Manifest,
  RunCost,
  RunPublished,
  TelemetryRunFailed,
} from '../../generated/types.js';
import { Rng, SEED_DERIVATION, streamSeed } from '../lib/rng.js';
import { ulpAt } from '../lib/ulp.js';
import { configDigest, sha256Hex } from '../lib/sha256.js';
import { standingRunFromStore } from '../lib/standing-run.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';
import { KM_PER_DEGREE_LATITUDE, insideSoundSpeedValidity } from '../env-generator/analytic.js';
import type { CoverageStore } from '../coverage-store/store.js';
import { shallowTwoLayerKernel, shiftAdvectKernel, type KernelParameters, type ModelKernel } from './kernel.js';
import { carryFeatures, estimateFeatures, type FeatureGrid } from './features.js';

/**
 * The implementations behind the port (Constitution VI). Two of them, which is the whole
 * difference between a claim about pluggability and a fact about it: `shift-advect-v1`
 * stays registered and stays tested precisely so that a change bending the interface to
 * fit the newcomer is caught by tests written against the interface as it was (ADR-0042).
 */
const KERNELS: Record<string, ModelKernel> = {
  [shiftAdvectKernel.name]: shiftAdvectKernel,
  [shallowTwoLayerKernel.name]: shallowTwoLayerKernel,
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
  /**
   * A run that has been computed and is waiting out the ticks it costs. One at a time,
   * because the scheduler allows one request in flight at a time; a second arriving while
   * one is occupied would mean the loop's own policy had been bypassed, and it throws
   * rather than quietly replacing the first.
   */
  private occupying:
    | { runIdentifier: string; publishAtTick: number; startedAtTick: number; emit: () => void }
    | undefined;
  /**
   * The tick the cost was last stated at. It waits for a clock sample — a component that
   * dated a message before simulation time existed would be claiming a time it had not
   * heard — and is restated on the cadence configuration declares, because a declaration
   * published once, before the shell had mounted, is a fact no listener can learn.
   */
  private costStatedAtTick: number | undefined;
  /**
   * The standing forecast's features, and when they were last said out loud.
   *
   * **The same argument as the cost above, about a different declaration.** A run's features
   * are a standing fact about the forecast that is current, not an event that happened once:
   * the eddy is still where the run said it would be until another run says otherwise. They
   * were published on the run alone, so a console that mounted afterwards — which every
   * console does, since the shell opens after the pre-roll — had nothing to draw and waited
   * for the next run. At the shipped cadence and the default rate that is 1800 ticks, half an
   * hour of a reader looking at a surface that says the forecast has not spoken yet.
   *
   * So the last statement is kept and restated on the cadence the cost already declares. It
   * carries the same `run_id`, so a listener can tell a restatement from a new run; what
   * changes is `sim_time` and `tick`, which say when it was said, not when it was made.
   */
  private lastFeatures: ForecastFeatures | undefined;
  private featuresStatedAtTick: number | undefined;
  /** Whether this instance has already looked in the store for a run it did not publish. */
  private resumeConsidered = false;

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
        detail: this.occupying
          ? `run ${this.occupying.runIdentifier} is occupying its cost: ${
              this.simTime.tick - this.occupying.startedAtTick
            } of ${this.costTicks()} tick(s) spent, and it publishes when they are`
          : `${this.runsCompleted} run(s) completed; kernel ${this.kernel.name}, ${this.config.steps} step(s), a run costs ${this.costTicks()} tick(s)`,
        figures: [
          { key: 'runs_completed', value: this.runsCompleted, label: 'runs' },
          { key: 'cost_ticks', value: this.costTicks(), unit: 'ticks', label: 'a run costs' },
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

  /**
   * The kernel parameters this configuration produces, in one place. The two-layer block
   * is passed whether or not the configured kernel wants it: `shift-advect-v1` ignores it,
   * and a runner that decided which kernel gets which parameters would be holding a second
   * copy of the knowledge each kernel already has about itself.
   */
  private kernelParameters(): KernelParameters {
    return {
      steps: this.config.steps,
      stepSeconds: this.config.step_seconds,
      advectionEastKmPerDay: this.config.advection.east_km_per_day,
      advectionNorthKmPerDay: this.config.advection.north_km_per_day,
      noiseStdTemperature: this.config.noise_std.temperature,
      noiseStdSalinity: this.config.noise_std.salinity,
      twoLayer: {
        interfaceDepthM: this.config.two_layer.interface_depth_m,
        upper: {
          eastKmPerDay: this.config.two_layer.upper.east_km_per_day,
          northKmPerDay: this.config.two_layer.upper.north_km_per_day,
        },
        lower: {
          eastKmPerDay: this.config.two_layer.lower.east_km_per_day,
          northKmPerDay: this.config.two_layer.lower.north_km_per_day,
        },
        horizontalDiffusivityM2PerS: this.config.two_layer.horizontal_diffusivity_m2_per_s,
        interfacialExchangePerDay: this.config.two_layer.interfacial_exchange_per_day,
        maxCourant: this.config.two_layer.max_courant,
        maxSubSteps: this.config.two_layer.max_sub_steps,
      },
    };
  }

  /**
   * Sub-steps per forecast step at a given horizontal cell size, or zero where the
   * configured kernel declares no work. Zero is a true statement about a kernel that
   * translates a field rather than integrating a state, and it is said plainly rather than
   * dressed up as a nominal figure.
   */
  private subStepsAt(cellKmEast: number, cellKmNorth: number): number {
    return this.kernel.subStepsPerStep?.(this.kernelParameters(), cellKmEast, cellKmNorth) ?? 0;
  }

  /**
   * What a run costs, in ticks. **This component is the only one entitled to answer**
   * (FR-115, ADR-0043): the thing that will spend the compute is the thing that declares
   * what it comes to, and `check-declared-cost` fails the build if a cost figure appears in
   * any other component's configuration master.
   *
   * The declaration is made against the nominal cell size configuration names, because a
   * cost has to be stateable before any analysis has arrived for the scheduler to weigh it.
   * What actually ran is reported separately, on the run-started message, as the sub-step
   * count the grid the run was handed required — a declared figure and a reported one, never
   * the same figure twice (ADR-0036).
   */
  costTicks(): number {
    return Math.ceil(this.workUnits() / this.config.cost.rate_work_per_tick);
  }

  /**
   * Integration steps, which is one fewer than output steps.
   *
   * Step 0 of a run's output is the state it initialises from — the lead convention the
   * manifest declares — so a run of four steps integrates three times. The cost arithmetic
   * kept multiplying by the output count after that convention was corrected, and stated
   * "4 step(s)" in a `basis` string whose whole purpose is that a reader who disagrees with
   * the cost can see which assumption to argue with. Self-consistent, since the declared
   * cost was also the occupied one, and wrong by a third as a statement.
   */
  private integrationSteps(): number {
    return Math.max(0, this.config.steps - 1);
  }

  private workUnits(): number {
    const nominal = this.config.cost.nominal_cell_km;
    return this.integrationSteps() * this.subStepsAt(nominal, nominal) * this.config.cost.work_per_sub_step;
  }

  private stateCost(): void {
    const nominal = this.config.cost.nominal_cell_km;
    const subSteps = this.subStepsAt(nominal, nominal);
    this.client.publish(this.config.topics.run_cost, {
      component: this.config.id,
      scenario_run_id: this.runId,
      sim_time: this.simTime.value,
      tick: this.simTime.tick,
      kernel: this.kernel.name,
      cost_ticks: this.costTicks(),
      work_units: this.workUnits(),
      rate_work_per_tick: this.config.cost.rate_work_per_tick,
      basis:
        subSteps === 0
          ? `${this.kernel.name} declares no work, so a run costs nothing and is never held for cost`
          : `${this.integrationSteps()} integration step(s) — one fewer than the ${this.config.steps} the run outputs, ` +
            `because step 0 is the state it initialises from — x ${subSteps} sub-step(s) x ${this.config.cost.work_per_sub_step} work unit(s), ` +
            `declared against a nominal cell of ${nominal} km; the rate is a declaration about an afloat appliance nobody here has measured`,
    } satisfies RunCost);
    this.costStatedAtTick = this.simTime.tick;
  }

  /**
   * The standing forecast's features, said again for a listener that was not there.
   *
   * Nothing is recomputed: the message published on the run is republished with the instant
   * it is being said at. A restatement that re-estimated would be a second opinion about the
   * same run, and two components — or one component twice — disagreeing about where the eddy
   * is, is the fault the one-publisher rule exists against.
   */
  private restateFeatures(): void {
    const standing = this.lastFeatures;
    if (!standing) return;
    if (
      this.featuresStatedAtTick !== undefined &&
      this.simTime.tick - this.featuresStatedAtTick < this.config.cost.restate_every_ticks
    ) {
      return;
    }
    this.client.publish(this.config.topics.forecast_features, {
      ...standing,
      sim_time: this.simTime.value,
      tick: this.simTime.tick,
    } satisfies ForecastFeatures);
    this.featuresStatedAtTick = this.simTime.tick;
  }

  /**
   * A standing run this instance did not publish, restated once so the components that
   * learn from the announcement rather than from the store are not left behind.
   *
   * `run_published` is the only statement that a forecast stands, and four components hold
   * nothing but what it told them: the scheduler its validity, the offload packager the run
   * it would stage, the analyst the spread field its next background covariance is built
   * from, and telemetry the run its skill is scored against. All four learn it once and keep
   * it in memory, so an instance of *this* component that did not publish the run cannot
   * hand it on — and there are two ordinary ways to be that instance. A reader restarts the
   * runner from the Operator tab; or a start condition's artefact carries the forecast eras,
   * which holds this component back for the whole pre-roll while the snapshot source replays
   * what it would have authored.
   *
   * The second was measured and is why this exists. `returning`'s card promises "a package
   * staged for offload, with the measurement geometry beside it"; replaying its artefact
   * produced **zero** staged bundles against a live run's five, and the Offload surface told
   * the reader nothing had been released while the store held eight forecasts and the
   * timeline was drawing them.
   *
   * **Reconstructed from what this component itself wrote, and by this component.** Every
   * field comes off the stored descriptor and the manifest embedded in it — the run id, the
   * two collection ids, their digests, the grid, and the time axis the validity is read from.
   * The snapshot source could not do this: it would be composing a statement no component
   * made, which is the fixture hazard ADR-0041 exists to forbid. The environment generator
   * already resumes from the store's inventory on a restart for the same reason and under
   * the same rule — descriptors, never a truth-derived field.
   *
   * Nothing is recomputed and no forecast is re-run, exactly as `restateFeatures` recomputes
   * nothing: the instant is the one it is being said at and the run id is the run's own, so a
   * listener tells a restatement from a new run the way it always has. The features cannot be
   * restated with it — they are derived per step and are not in the store — so the feature
   * surface stays empty until the first live run, which is what a restarted runner has always
   * done.
   */
  private resumeStandingRun(): void {
    if (this.resumeConsidered) return;
    // Once per instance whether or not it finds anything: a cold run has an empty store on
    // its first sample and must not keep asking.
    this.resumeConsidered = true;
    const standing = standingRunFromStore(this.store, this.config.id, this.runId, this.simTime);
    if (!standing) return;
    this.client.publish(this.config.topics.run_published, standing);
  }

  start(): void {
    this.client.subscribe(this.config.topics.clock, (message) => {
      const sample = message.payload as { sim_time: string; tick: number };
      this.simTime = { value: sample.sim_time, tick: sample.tick };
      // Before the cost, because a listener that learns a run stands and then learns what one
      // costs is in the state a continuously running instance leaves it in.
      this.resumeStandingRun();
      // The cost is stated once simulation time exists, and before any run could be
      // warranted: the scheduler holds a run against this figure, so a figure that arrived
      // after the first decision would have been a decision made in its absence. It is then
      // restated on the declared cadence, so a listener that arrived later — the shell,
      // which mounts after the backend is built and pre-rolled — learns the same figure
      // rather than waiting for the first run to imply it.
      if (
        this.costStatedAtTick === undefined ||
        this.simTime.tick - this.costStatedAtTick >= this.config.cost.restate_every_ticks
      ) {
        this.stateCost();
      }
      this.restateFeatures();
      this.releaseIfSpent();
    });
    // Feature 116: the runner waits for the analysis, not for the request. Until then
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
    this.abandonOccupyingRun();
    this.heartbeat.stop();
  }

  /**
   * A run staged and not yet published, given up on out loud.
   *
   * **This is the fault a cost introduced, and it is the one worth understanding.** Before
   * a run occupied anything, the whole chain — request, analysis, started, published —
   * completed inside one tick, so there was no interval in which this component could be
   * stopped with work outstanding. There is now one on every run, exactly as long as the
   * cost, and the Forecast tab advertises it by drawing what the run is occupying.
   *
   * Stopping the runner in that window discards the staged closure. The scheduler clears
   * its outstanding run only on a publication, so it would wait for one that is never
   * coming: no cadence floor, no divergence, nothing, for the rest of the run. That is the
   * permanently becalmed loop FR-31 forbids, arriving silently — and it would arrive
   * through an ordinary operator verb that this feature made dangerous.
   *
   * So a run that will not finish says so, on the branch the loop already reports failures
   * on, and the scheduler releases what it was holding. `control.stop` calls this before it
   * disconnects the client, which is what makes the last message possible.
   */
  private abandonOccupyingRun(): void {
    const abandoned = this.occupying;
    if (!abandoned) return;
    this.occupying = undefined;
    this.client.publish(this.config.topics.telemetry, {
      component: this.config.id,
      scenario_run_id: this.runId,
      sim_time: this.simTime.value,
      tick: this.simTime.tick,
      kind: 'run-failed',
      run_id: abandoned.runIdentifier,
      detail:
        `the model runner was stopped at tick ${this.simTime.tick} with run ${abandoned.runIdentifier} ` +
        `${this.simTime.tick - abandoned.startedAtTick} of ${abandoned.publishAtTick - abandoned.startedAtTick} tick(s) ` +
        'through the cost it was occupying; the staged publication is discarded and this run will not be published',
    } satisfies TelemetryRunFailed);
  }

  private run(request: AnalysisPublished): void {
    // Refused before any work, not after it: a second analysis must never announce a run
    // and burn an ensemble on its way to being told no.
    //
    // **This branch said "cannot be reached from the shipped loop", and it was wrong.**
    // Restarting the scheduler — an ordinary Operator verb — inside the window a run
    // occupies is enough: the fresh scheduler has no `inFlight` and no validity to hold
    // against, so its cadence floor fires at once, the analyst obliges, and a second
    // analysis lands here while the first run is still spending its cost. Measured on the
    // shipped configuration at `loitering`, seed 4242, with the restart at tick 4420:
    // twenty thousand ticks and eleven cadence floors afterwards with nothing requested,
    // started or published.
    //
    // The becalm was not the refusal; it was that the refusal was a `throw`. This runs
    // inside a broker subscription handler, and the broker catches handler faults and
    // increments `deliveryFaults` — so the scheduler was never told, went on waiting for a
    // publication that had been refused, and no surface said anything. A refusal whose
    // only consumer is a counter is not a refusal anybody hears.
    //
    // So it is answered the way the stopped-runner case is answered, on the same branch:
    // `run-failed` for the run being refused, which is the run the scheduler is holding.
    // The occupying run is untouched and publishes when its cost is spent.
    if (this.occupying) {
      this.client.publish(this.config.topics.telemetry, {
        component: this.config.id,
        scenario_run_id: this.runId,
        sim_time: this.simTime.value,
        tick: this.simTime.tick,
        kind: 'run-failed',
        run_id: request.run_id,
        detail:
          `run ${request.run_id} arrived while ${this.occupying.runIdentifier} is still occupying its cost ` +
          `(${this.simTime.tick - this.occupying.startedAtTick} of ${this.costTicks()} tick(s) spent); the runner takes ` +
          'one run at a time and refuses this one rather than dropping either silently',
      } satisfies TelemetryRunFailed);
      return;
    }
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
      depthsM: Array.from({ length: grid.depth.count }, (_, index) => grid.depth.minimum + index * grid.depth.spacing),
    };
    const analysedTemperature = analysisView.slice(0, cellsPerStep);
    const analysedSalinity = analysisView.slice(cellsPerStep, 2 * cellsPerStep);
    const errorTemperature = errorView.slice(0, cellsPerStep);
    const errorSalinity = errorView.slice(cellsPerStep, 2 * cellsPerStep);
    const parameters = this.kernelParameters();

    // Announced before anything is computed, so that a run which then fails is still
    // visible as a run that was attempted — and now carrying both the cost it will occupy
    // and the sub-steps the grid it was actually handed requires.
    // Null, not one, where the kernel declares no work. `shift-advect-v1` translates a
    // field and integrates nothing, and clamping its zero to one had the same component
    // publishing "declares no work, so a run costs nothing" on one topic and "took one
    // integration sub-step" on another, about the same run. Absent and zero are different
    // facts here exactly as they are on the indicator socket.
    const declared = this.subStepsAt(kernelGrid.cellKmEast, kernelGrid.cellKmNorth);
    const subStepsPerStep = declared > 0 ? declared : null;
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
      cost_ticks: this.costTicks(),
      sub_steps_per_step: subStepsPerStep,
    });

    const drawOrder: string[] = [];
    this.ensembleSize = request.ensemble_size;
    this.membersDone = 0;
    const members = Array.from({ length: request.ensemble_size }, (_, member) => {
      const streamName = `${this.config.stream}:${request.run_id}:m${member}`;
      drawOrder.push(streamName);
      const rng = new Rng(this.rootSeed, streamName);
      // Each member starts from the analysis plus a draw scaled by the error the
      // analysis left. Before feature 116 every member began from the identical state,
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

    // Every member the run asked for has been produced. Reported here rather than at
    // publication, because that is when it became true: the run then waits out the ticks it
    // costs, and a face drawing five empty pips through the whole visible duration of a run
    // whose ensemble is complete is a display claiming less work than has been done — on
    // the one figure that exists so the ensemble can be seen filling rather than spinning.
    this.membersDone = this.ensembleSize;

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

    // The features, estimated from the analysis this run initialises from and from nothing
    // else, then carried forward by the kernel's own layer velocity (FR-113). The mean
    // analysis error is what the uncertainty grows from, so a forecast made from a
    // well-known state claims more than one made from a poorly known one.
    const featureGrid: FeatureGrid = {
      longitudes: Array.from({ length: grid.longitude.count }, (_, i) => grid.longitude.minimum + i * grid.longitude.spacing),
      latitudes: Array.from({ length: grid.latitude.count }, (_, i) => grid.latitude.minimum + i * grid.latitude.spacing),
      depthsM: kernelGrid.depthsM,
      cellKmEast: kernelGrid.cellKmEast,
      cellKmNorth: kernelGrid.cellKmNorth,
      referenceLatitude: midLatitude,
    };
    let errorSum = 0;
    for (const value of errorTemperature) errorSum += value;
    const carried = carryFeatures(
      estimateFeatures(analysedTemperature, featureGrid),
      featureGrid,
      parameters,
      errorSum / Math.max(errorTemperature.length, 1),
      this.kernel,
    );

    const forecastId = request.run_id;
    const spreadId = `${request.run_id}-spread`;
    const validityEnd = this.isoPlusSeconds(request.initialisation_sim_time, (this.config.steps - 1) * this.config.step_seconds);

    // Everything above has been computed. Nothing below has happened yet: the publication
    // waits out the ticks the run costs (ADR-0043), released by the clock subscription this
    // component already holds. Staging it as a closure rather than recomputing later is
    // what makes the wait a wait and not a second run.
    const emit = (): void => {
      // Spread first, forecast second: the store's instance pointer names the most
      // recent publication, and the monitor scores against the forecast.
      const spreadDigest = this.publishInstance(spreadId, request, baseManifest, spread.temperature, spread.salinity, drawOrder, true);
      const forecastDigest = this.publishInstance(forecastId, request, baseManifest, mean.temperature, mean.salinity, drawOrder, false);
      const features: ForecastFeatures = {
        component: this.config.id,
        scenario_run_id: this.runId,
        sim_time: this.simTime.value,
        tick: this.simTime.tick,
        run_id: request.run_id,
        kernel: this.kernel.name,
        initialisation_sim_time: request.initialisation_sim_time,
        step_seconds: this.config.step_seconds,
        steps: carried.map((entry) => this.featureStep(entry)),
        // On the message, once: what could not be estimated is a property of the estimate,
        // which is made from the analysis and carried forward, so it cannot differ by lead.
        ...(carried[0]?.declined.length ? { not_estimated: [...carried[0].declined] } : {}),
      };
      this.client.publish(this.config.topics.forecast_features, features);
      // Kept so a console that mounts after this run still learns what it said.
      this.lastFeatures = features;
      this.featuresStatedAtTick = this.simTime.tick;
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
      this.runsCompleted += 1;
    };

    const cost = this.costTicks();
    if (cost <= 0) {
      emit();
      return;
    }
    this.occupying = {
      runIdentifier: request.run_id,
      startedAtTick: this.simTime.tick,
      publishAtTick: this.simTime.tick + cost,
      emit,
    };
  }

  /** The staged publication, once the ticks it costs have been spent and not before. */
  private releaseIfSpent(): void {
    const waiting = this.occupying;
    if (!waiting || this.simTime.tick < waiting.publishAtTick) return;
    this.occupying = undefined;
    waiting.emit();
  }

  /**
   * One step's features in the published shape. A feature the estimator declined is absent
   * here, with its reason in the message's own `not_estimated` list, never present with a
   * widened uncertainty: softening a bound until it passes is the failure mode this shape
   * exists to make visible (Constitution IX).
   */
  private featureStep(entry: ReturnType<typeof carryFeatures>[number]): ForecastFeaturesStep {
    const features: ForecastFeaturesFeature[] = [];
    if (entry.eddy) {
      features.push({
        id: 'eddy',
        kind: 'eddy',
        parameters: {
          centre_latitude: entry.eddy.centreLatitude,
          centre_longitude: entry.eddy.centreLongitude,
          radius_km: entry.eddy.radiusKm,
          anomaly_peak_c: entry.eddy.anomalyPeakC,
        },
        uncertainty: {
          centre_km: entry.uncertainty.eddy.positionKm,
          radius_km: entry.uncertainty.eddy.radiusKm,
          anomaly_peak_c: entry.uncertainty.eddy.anomalyC,
        },
      } as ForecastFeaturesFeature);
    }
    if (entry.moving) {
      features.push({
        id: 'moving',
        kind: 'moving',
        parameters: {
          centre_latitude: entry.moving.centreLatitude,
          centre_longitude: entry.moving.centreLongitude,
          radius_km: entry.moving.radiusKm,
          anomaly_peak_c: entry.moving.anomalyPeakC,
        },
        uncertainty: {
          centre_km: entry.uncertainty.moving.positionKm,
          radius_km: entry.uncertainty.moving.radiusKm,
          anomaly_peak_c: entry.uncertainty.moving.anomalyC,
        },
      } as ForecastFeaturesFeature);
    }
    if (entry.front) {
      features.push({
        id: 'front',
        kind: 'front',
        parameters: {
          anchor_latitude: entry.front.anchorLatitude,
          anchor_longitude: entry.front.anchorLongitude,
          bearing_degrees: entry.front.bearingDegrees,
          anomaly_step_c: entry.front.anomalyStepC,
        },
        uncertainty: {
          anchor_km: entry.uncertainty.front.positionKm,
          bearing_degrees: entry.uncertainty.front.bearingDegrees,
          anomaly_step_c: entry.uncertainty.front.anomalyC,
        },
      } as ForecastFeaturesFeature);
    }
    if (entry.thermocline) {
      features.push({
        id: 'thermocline',
        kind: 'thermocline',
        parameters: {
          depth_m: entry.thermocline.depthM,
          thickness_m: entry.thermocline.thicknessM,
          layer_drop_c: entry.thermocline.layerDropC,
        },
        uncertainty: {
          depth_m: entry.uncertainty.thermocline.depthM,
          layer_drop_c: entry.uncertainty.thermocline.anomalyC,
        },
      } as ForecastFeaturesFeature);
    }
    return { step: entry.step, lead_seconds: entry.leadSeconds, features };
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
        }. The advection velocity is a modelling assumption, deliberately not the true drift. Before feature 116 every member began from an identical now-cast the generator evaluated from the true field, so the spread carried no spatial structure and no measurement reached a forecast.`,
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
