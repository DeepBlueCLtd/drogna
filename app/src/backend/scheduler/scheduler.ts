/**
 * The scheduler (V2-C12, SRD-v2 FR-30 to FR-32): whether a run is warranted.
 *
 * A divergence inside the minimum interval is declined by policy — and the decline
 * is legible, not silent. The cadence floor (FR-31, E1's resolution): when no run
 * has been requested within the maximum interval and the current run's validity has
 * lapsed (or no run exists at all), a run is warranted on schedule alone, labelled
 * 'scheduled' so the two causes never blur. One request in flight at a time.
 *
 * A reader may prompt a run from the operator plane (FR-65), and the prompt arrives
 * here rather than as a run request published around this component. That is the whole
 * point of routing it: the prompt is weighed under the policy a divergence is weighed
 * under, so it is declined inside the minimum interval and declined while a run is
 * outstanding, and the decline is published like any other decision. A control plane
 * that published the request itself would have been a second implementation of this
 * policy, able to start a run this component would have refused.
 *
 * Both intervals are tunable from that plane (FR-64). The configured values stay what
 * they were and a restart returns to them; the values in force are reported in the
 * heartbeat, which is where a display reads them from.
 *
 * From feature 123 the scheduler carries a second dimension beside *is a run warranted*:
 * **can a run be afforded now** (FR-115, ADR-0043). A run has a declared duration, published
 * by the model runner and by no other component; this one subscribes to that statement and
 * holds no cost figure of its own.
 *
 * **The rule runs the opposite way to the obvious reading, and the reason is the finding.**
 * Read naively — a run is affordable when it fits inside the standing forecast's remaining
 * validity — the loop becalms permanently: the cadence floor fires *precisely when* validity
 * has lapsed, at which point the headroom is zero, no run of any cost is ever affordable
 * again, and nothing runs. That is the exact fault FR-31 exists to forbid, and
 * `spikes/watched-turn/FINDING.md` has already watched it happen once for a different
 * reason. So a warranted run is **held while the standing forecast still has more life than
 * the run costs**, and released as the remaining validity falls to the cost plus a declared
 * margin, so the new run lands as the old one lapses. The hold cannot becalm the loop,
 * because it releases as validity decays and the cadence floor still backstops it.
 *
 * **A divergence is never held.** A hold is a bet that the standing forecast is still worth
 * something; a divergence is the world saying it is not.
 */
import type { SeamClient } from '../../seam/transport.js';
import type {
  ConfigScheduler,
  Divergence,
  OperatorCommand,
  RunCost,
  RunPublished,
  RunRequest,
} from '../../generated/types.js';
import { configDigest } from '../lib/sha256.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';

export class Scheduler {
  private readonly heartbeat: HeartbeatEmitter;
  private simTime = { value: '', tick: 0 };
  private lastRequestTick: number | undefined;
  private runSequence = 0;
  private inFlight: string | undefined;
  private validityEnd: string | undefined;
  declinedByPolicy = 0;
  heldForCost = 0;
  /** Outstanding runs released because the component that owed them said it would not. */
  abandoned = 0;
  requested: { run_id: string; cause: RunRequest['cause'] }[] = [];
  /**
   * What a run costs, in ticks, as the model runner stated it. Undefined until it has: a
   * scheduler that assumed a cost would be holding runs against a number nobody published,
   * and the component that will spend the compute is the only one entitled to declare it.
   */
  private runCostTicks: number | undefined;
  /**
   * Seconds of simulation time per tick, derived from consecutive clock samples rather than
   * configured. The clock publishes an instant and an index and not its own interval, and a
   * second copy of that interval in this document would be free to disagree with the clock.
   * Undefined until two samples have arrived, and while it is undefined nothing is held —
   * a hold whose duration cannot be measured is a hold that cannot be released.
   */
  private tickSeconds: number | undefined;
  private lastSample: { tick: number; millis: number } | undefined;
  /** The cause currently being held, so the hold is reported once and not on every tick. */
  private holding: RunRequest['cause'] | undefined;
  /** Intervals in force, where the operator plane has changed one from configuration. */
  private tunedMinimum: number | undefined;
  private tunedMaximum: number | undefined;
  private lastDecision = 'quiet: nothing has breached and the cadence floor has not come due';

  /**
   * Simulation ticks before another divergence could be accepted. Zero means the
   * minimum interval is spent and the next breach can be acted on.
   */
  ticksToMinimumInterval(): number {
    if (this.lastRequestTick === undefined) return 0;
    return Math.max(0, this.minimumInterval() - (this.simTime.tick - this.lastRequestTick));
  }

  /**
   * The intervals in force: what the operator plane last set, or what configuration
   * says. Read in one place each, so the rule that declines a divergence and the
   * figure that says how long until it stops declining cannot disagree.
   */
  minimumInterval(): number {
    return this.tunedMinimum ?? this.config.min_interval_ticks;
  }

  maximumInterval(): number {
    return this.tunedMaximum ?? this.config.max_interval_ticks;
  }

  constructor(
    private readonly config: ConfigScheduler,
    private readonly client: SeamClient,
    private readonly runId: string,
  ) {
    this.heartbeat = new HeartbeatEmitter(
      config.id,
      config.heartbeat,
      client,
      () => ({
        sim_time: this.simTime.value,
        tick: this.simTime.tick,
        status: 'ok',
        detail: `${this.lastDecision}; ${this.requested.length} run(s) requested, ${this.declinedByPolicy} declined by policy, ${this.heldForCost} held for cost`,
        figures: [
          { key: 'requested', value: this.requested.length, label: 'requested' },
          { key: 'declined', value: this.declinedByPolicy, label: 'declined' },
          { key: 'held_for_cost', value: this.heldForCost, label: 'held for cost' },
          { key: 'abandoned', value: this.abandoned, label: 'released unfinished' },
          // Reported as the runner stated it, never as a figure this component holds.
          //
          // The release margin is deliberately **not** among these. `heartbeat.schema.json`
          // caps a component at eight figures — a face has room to draw eight and a ninth
          // is a face inventing space — and this feature wanted four where there was room
          // for three. The margin is the one that goes: it is a configured constant that
          // never moves, it is named in the held-for-cost decision every time a hold is
          // reported, and a display drawing it would be drawing configuration back at the
          // reader. The other three each move while the run is going.
          {
            key: 'ticks_to_minimum',
            value: this.ticksToMinimumInterval(),
            of: this.minimumInterval(),
            unit: 'ticks',
            label: 'minimum interval',
          },
          { key: 'min_interval', value: this.minimumInterval(), unit: 'ticks', label: 'minimum interval' },
          { key: 'max_interval', value: this.maximumInterval(), unit: 'ticks', label: 'cadence floor' },
        ],
      }),
      runId,
      configDigest(config),
    );
  }

  start(): void {
    this.client.subscribe(this.config.topics.clock, (message) => {
      const sample = message.payload as { sim_time: string; tick: number };
      const millis = Date.parse(sample.sim_time.slice(0, 23) + 'Z');
      if (this.lastSample && sample.tick > this.lastSample.tick) {
        const seconds = (millis - this.lastSample.millis) / 1000 / (sample.tick - this.lastSample.tick);
        if (seconds > 0) this.tickSeconds = seconds;
      }
      this.lastSample = { tick: sample.tick, millis };
      this.simTime = { value: sample.sim_time, tick: sample.tick };
      this.considerCadenceFloor();
    });
    this.client.subscribe(this.config.topics.run_cost, (message) => {
      this.runCostTicks = (message.payload as RunCost).cost_ticks;
    });
    // A run that will not be published, released rather than waited on for ever.
    //
    // The outstanding-run guard clears on a publication and on nothing else, which was
    // safe while a run published in the tick it was requested. A run now occupies the
    // ticks it costs, so there is an interval in which the runner can be stopped with the
    // publication staged and undelivered — and this component would then decline every
    // divergence and every cadence floor for the rest of the run, waiting on a message
    // nobody is going to send. That is the permanently becalmed loop FR-31 forbids, and
    // it is reachable through an ordinary operator verb. The runner says so on its way
    // out; this is the other half of that sentence.
    this.client.subscribe(this.config.topics.telemetry, (message) => {
      const report = message.payload as { kind?: string; run_id?: string; detail?: string };
      if (report.kind !== 'run-failed' || report.run_id !== this.inFlight) return;
      this.inFlight = undefined;
      this.lastDecision = `released run ${report.run_id}, which will not be published: ${report.detail ?? 'no reason given'}`;
      this.abandoned += 1;
    });
    this.client.subscribe(this.config.topics.divergence, (message) => {
      this.considerDivergence(message.payload as Divergence);
    });
    this.client.subscribe(this.config.topics.command, (message) => {
      this.obey(message.payload as OperatorCommand);
    });
    this.client.subscribe(this.config.topics.run_published, (message) => {
      const published = message.payload as RunPublished;
      if (published.run_id === this.inFlight) this.inFlight = undefined;
      if (published.current) this.validityEnd = published.valid_time.end_sim_time;
    });
    this.heartbeat.start();
  }

  stop(): void {
    this.heartbeat.stop();
  }

  /**
   * An operator command addressed to this scheduler: a tuning of either interval, or
   * the prompt this component declares it answers to. A command for anything else on
   * the topic is ignored.
   */
  private obey(command: OperatorCommand): void {
    if (command.target !== this.config.id) return;
    if (command.kind === 'tuning') {
      if (command.setting === 'min_interval_ticks') this.tunedMinimum = command.value;
      if (command.setting === 'max_interval_ticks') this.tunedMaximum = command.value;
      return;
    }
    if (command.event === this.config.prompt_event) this.considerPrompt();
  }

  /**
   * A prompted run, under the policy a divergence gets. The decision is published with
   * no divergence named, because a prompt has none: naming one would be an invention,
   * and an accepted prompt is labelled 'operator' in the request so a run a reader
   * asked for is never read back as one the world asked for.
   */
  private considerPrompt(): void {
    if (this.inFlight !== undefined) {
      this.declinedByPolicy += 1;
      this.lastDecision = `declined by policy: an operator prompt while run ${this.inFlight} is in flight`;
      this.reportDecision(null, 'duplicate-outstanding', this.lastDecision, null);
      return;
    }
    if (this.lastRequestTick !== undefined && this.simTime.tick - this.lastRequestTick < this.minimumInterval()) {
      this.declinedByPolicy += 1;
      this.lastDecision = `declined by policy: an operator prompt at tick ${this.simTime.tick} inside the minimum interval (${this.minimumInterval()} ticks since tick ${this.lastRequestTick})`;
      this.reportDecision(null, 'minimum-interval', this.lastDecision, null);
      return;
    }
    // FR-116: a reader commits a run against the stated cost, and is weighed under exactly
    // the policy a divergence is weighed under — which includes being held. A prompt that is
    // held is not an oversight: it is the surface saying what the cost buys and when.
    const shortfall = this.holdShortfall();
    if (shortfall > 0) {
      this.hold('operator', null, shortfall, 'a reader prompted a run');
      return;
    }
    this.holding = undefined;
    const runIdentifier = this.request('operator', undefined);
    this.reportDecision(null, 'accepted', `requested ${runIdentifier} on an operator prompt`, runIdentifier);
  }

  private considerDivergence(divergence: Divergence): void {
    if (this.inFlight !== undefined) {
      this.declinedByPolicy += 1;
      this.lastDecision = `declined by policy: divergence ${divergence.divergence_id} while run ${this.inFlight} is in flight`;
      this.reportDecision(divergence.divergence_id, 'duplicate-outstanding', this.lastDecision, null);
      return;
    }
    if (this.lastRequestTick !== undefined && this.simTime.tick - this.lastRequestTick < this.minimumInterval()) {
      this.declinedByPolicy += 1;
      this.lastDecision = `declined by policy: divergence ${divergence.divergence_id} at tick ${this.simTime.tick} inside the minimum interval (${this.minimumInterval()} ticks since tick ${this.lastRequestTick})`;
      this.reportDecision(divergence.divergence_id, 'minimum-interval', this.lastDecision, null);
      return;
    }
    // No affordability test here, and the omission is deliberate rather than an oversight
    // (ADR-0043). A hold is a bet that the standing forecast is still worth something; a
    // divergence is the world saying it is not, so its nominal remaining validity is worth
    // nothing and there is nothing to wait for.
    this.holding = undefined;
    this.request('divergence', divergence);
  }

  /**
   * Every decision on a divergence is a telemetry fact, not only the accepted ones — and
   * from feature 123 there are four of them where FR-32 asked for three. `held-for-cost` is
   * not a decline: the run is warranted and affordable later, and the shortfall says how
   * much of the standing forecast's validity must still decay before it is released. Four
   * facts, four appearances (FR-115).
   */
  private reportDecision(
    divergenceId: string | null,
    decision: 'accepted' | 'minimum-interval' | 'duplicate-outstanding' | 'held-for-cost',
    detail: string,
    runIdentifier: string | null,
    shortfallTicks: number | null = null,
  ): void {
    this.client.publish(this.config.topics.telemetry, {
      component: this.config.id,
      scenario_run_id: this.runId,
      sim_time: this.simTime.value,
      tick: this.simTime.tick,
      kind: 'scheduler-decision',
      divergence_id: divergenceId,
      decision,
      detail,
      run_id: runIdentifier,
      shortfall_ticks: shortfallTicks,
    });
  }

  /**
   * Ticks of the standing forecast's validity still to run, or zero where there is no
   * standing forecast, where its validity has lapsed, or where the tick length has not yet
   * been observed. Zero always means "nothing to wait for", which is what makes the hold
   * below fail open: a scheduler that cannot measure the headroom requests rather than
   * waits, and the loop is never becalmed by the absence of a figure.
   */
  private remainingValidityTicks(): number {
    if (this.validityEnd === undefined || this.tickSeconds === undefined) return 0;
    const seconds =
      (Date.parse(this.validityEnd.slice(0, 23) + 'Z') - Date.parse(this.simTime.value.slice(0, 23) + 'Z')) / 1000;
    return Math.max(0, Math.floor(seconds / this.tickSeconds));
  }

  /**
   * How many ticks a warranted run must still wait, or zero to release it now.
   *
   * The rule is inverted on purpose (ADR-0043): a run is held **while** the standing
   * forecast has more life left than the run costs plus the declared margin, and released as
   * that headroom decays — never "held until it fits inside the remaining validity", which
   * is the formulation that becalms the loop for good.
   */
  private holdShortfall(): number {
    // An unstated cost is treated as nothing, and a kernel that declares no work costs
    // nothing — but neither is a reason to stop looking at the standing forecast.
    //
    // This is subtler than it looks, and getting it wrong was a real regression. The old
    // cadence floor returned early while the standing forecast's validity had not lapsed.
    // Replacing that test with "is the shortfall positive" and then short-circuiting the
    // shortfall to zero whenever the cost was zero deleted the validity gate outright: with
    // `shift-advect-v1` configured — which ADR-0042 keeps registered precisely so it stays
    // a real second implementation, and which declares no work — every cadence floor would
    // have fired on a forecast with most of its life still to run. The margin alone is
    // still a validity rule, so a zero cost holds while more than the margin is left, which
    // is the old behaviour with a declared lead time in front of it.
    const cost = this.runCostTicks ?? 0;
    const threshold = cost + this.config.release_margin_ticks;
    return Math.max(0, this.remainingValidityTicks() - threshold);
  }

  /**
   * FR-31: the loop cannot be permanently becalmed — and FR-115's hold is applied here
   * rather than beside it.
   *
   * Before feature 123 this returned while the standing forecast's validity had not lapsed,
   * so a run was warranted exactly at the lapse. The hold replaces that test with a
   * quantitative one: while the headroom exceeds the cost plus the margin there is no need
   * to spend the compute yet, and it releases as the headroom decays so the new run lands as
   * the old one lapses. The lapse case is unchanged — with validity spent the headroom is
   * zero, the shortfall is zero and the run is requested — which is why FR-31 still holds by
   * construction rather than by argument.
   */
  private considerCadenceFloor(): void {
    if (this.inFlight !== undefined) return;
    const sinceLast = this.lastRequestTick === undefined ? Number.POSITIVE_INFINITY : this.simTime.tick - this.lastRequestTick;
    if (sinceLast < this.maximumInterval()) return;
    if (this.simTime.tick < this.maximumInterval()) return; // give the loop its first interval
    const shortfall = this.holdShortfall();
    if (shortfall > 0) {
      this.hold('scheduled', null, shortfall, 'the cadence floor has come due');
      return;
    }
    this.holding = undefined;
    this.request('scheduled', undefined);
  }

  /**
   * Record a hold, once per episode. Reported every tick it persisted it would drown the
   * telemetry branch in a fact that has not changed; reported never, a run held for a
   * thousand ticks would be indistinguishable from a run nothing asked for, which is
   * precisely the confusion FR-115 forbids.
   */
  private hold(cause: RunRequest['cause'], divergenceId: string | null, shortfall: number, why: string): void {
    if (this.holding === cause) return;
    this.holding = cause;
    this.heldForCost += 1;
    this.lastDecision =
      `held for cost: ${why}, but the standing forecast has ${this.remainingValidityTicks()} tick(s) of validity left ` +
      `against a run costing ${this.runCostTicks ?? 0} plus a ${this.config.release_margin_ticks}-tick margin — ` +
      `${shortfall} tick(s) to go, and it is released as that headroom decays`;
    this.reportDecision(divergenceId, 'held-for-cost', this.lastDecision, null, shortfall);
  }

  private request(cause: RunRequest['cause'], divergence: Divergence | undefined): string {
    const runIdentifier = `${this.runId}-run-${this.runSequence}`;
    const request: RunRequest = {
      component: this.config.id,
      scenario_run_id: this.runId,
      sim_time: this.simTime.value,
      tick: this.simTime.tick,
      run_id: runIdentifier,
      run_sequence: this.runSequence,
      initialisation_sim_time: this.simTime.value,
      ensemble_size: this.config.ensemble_size,
      cause,
      region: divergence?.region ?? null,
      divergence: divergence ?? null,
    };
    this.client.publish(this.config.topics.run_request, request);
    if (divergence) {
      this.reportDecision(divergence.divergence_id, 'accepted', `requested ${runIdentifier}`, runIdentifier);
    }
    this.runSequence += 1;
    this.lastRequestTick = this.simTime.tick;
    this.inFlight = runIdentifier;
    this.requested.push({ run_id: runIdentifier, cause });
    this.lastDecision =
      cause === 'divergence'
        ? `requested ${runIdentifier} for divergence ${divergence?.divergence_id ?? '?'}`
        : cause === 'operator'
          ? `requested ${runIdentifier} on an operator prompt`
          : `requested ${runIdentifier} on the cadence floor alone (no run within ${this.maximumInterval()} ticks, and the standing forecast is down to its last ${this.remainingValidityTicks()} tick(s) of validity)`;
    return runIdentifier;
  }
}
