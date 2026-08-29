/**
 * Heartbeat emission (Constitution VII): the only thing that lights a component in
 * the shell is a message of heartbeat.schema.json shape genuinely published by that
 * component within its declared liveness window.
 *
 * Cadence is host time by ADR-0006 — "is this process alive?" is a fact about the
 * machinery with no simulation-time answer even in principle — which is the one
 * standing exemption to Principle I this file uses, marked inline. The simulation
 * time carried in the message is payload, not schedule: it is whatever the sender
 * last heard from the clock.
 */
import type { SeamClient } from '../../seam/transport.js';
import type { ConfigCommonHeartbeat } from '../../generated/types.js';

export interface HeartbeatBody {
  sim_time: string;
  tick: number | null;
  status: 'starting' | 'ok' | 'degraded' | 'stalled' | 'stopping';
  detail?: string;
}

export class HeartbeatEmitter {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly component: string,
    private readonly config: ConfigCommonHeartbeat,
    private readonly client: SeamClient,
    private readonly supply: () => HeartbeatBody,
    private readonly runId: string,
    private readonly configDigestValue: string,
  ) {}

  start(): void {
    this.emit();
    // harness:allow-wallclock heartbeat cadence is real time by ADR-0006
    this.timer = setInterval(() => this.emit(), this.config.interval_seconds * 1000);
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  emit(): void {
    const body = this.supply();
    this.client.publish(this.config.topic, {
      component: this.component,
      sim_time: body.sim_time,
      tick: body.tick,
      status: body.status,
      run_id: this.runId,
      config_digest: this.configDigestValue,
      heartbeat_interval_seconds: this.config.interval_seconds,
      liveness_window_seconds: this.config.liveness_window_seconds,
      ...(body.detail === undefined ? {} : { detail: body.detail }),
    });
  }
}
