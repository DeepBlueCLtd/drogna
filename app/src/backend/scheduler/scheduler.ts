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
 */
import type { SeamClient } from '../../seam/transport.js';
import type {
  ConfigScheduler,
  Divergence,
  OperatorCommand,
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
  requested: { run_id: string; cause: RunRequest['cause'] }[] = [];
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
        detail: `${this.lastDecision}; ${this.requested.length} run(s) requested, ${this.declinedByPolicy} declined by policy`,
        figures: [
          { key: 'requested', value: this.requested.length, label: 'requested' },
          { key: 'declined', value: this.declinedByPolicy, label: 'declined' },
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
      this.simTime = { value: sample.sim_time, tick: sample.tick };
      this.considerCadenceFloor();
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
    this.request('divergence', divergence);
  }

  /** Every decision on a divergence is a telemetry fact, not only the accepted ones. */
  private reportDecision(
    divergenceId: string | null,
    decision: 'accepted' | 'minimum-interval' | 'duplicate-outstanding',
    detail: string,
    runIdentifier: string | null,
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
    });
  }

  /** FR-31: the loop cannot be permanently becalmed. */
  private considerCadenceFloor(): void {
    if (this.inFlight !== undefined) return;
    const sinceLast = this.lastRequestTick === undefined ? Number.POSITIVE_INFINITY : this.simTime.tick - this.lastRequestTick;
    if (sinceLast < this.maximumInterval()) return;
    if (this.simTime.tick < this.maximumInterval()) return; // give the loop its first interval
    const validityLapsed = this.validityEnd === undefined || this.validityEnd <= this.simTime.value;
    if (!validityLapsed) return;
    this.request('scheduled', undefined);
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
          : `requested ${runIdentifier} on the cadence floor alone (no run within ${this.maximumInterval()} ticks and validity lapsed)`;
    return runIdentifier;
  }
}
