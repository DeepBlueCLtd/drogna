/**
 * The simulation clock (V2-C01): the single source of time (SRD-v2 FR-09,
 * Constitution I). Publishes samples of clock.schema.json shape on its declared
 * topic; every other component reads time by subscribing, never from the host.
 *
 * Tick values follow from epoch and interval alone and are unaffected by rate: a
 * rate change alters the pace of emission, never the contents. Rate zero pins the
 * clock (capture, FR-19). A command that stops emission is acknowledged by
 * re-publishing the tick in force with the new rate, because a clock that will emit
 * no further tick has no other way to say so.
 *
 * The real-time driver below is the clock's own and is the one place scheduled
 * emission may consult the host (Constitution I's clock-driver exemption).
 */
import type { SeamClient } from '../../seam/transport.js';
import type { SeamHttpResponse, SeamRequest } from '../../seam/http.js';
import type { ConfigClock } from '../../generated/types.js';
import { parseEpochMicros, simTimeAtTick } from '../lib/sim-time.js';

export interface RateVerdict {
  readonly applied: boolean;
  /** When refused, names the bound that refused it (FR-36's discipline). */
  readonly refusal?: string;
}

export class Clock {
  private readonly epochMicros: bigint;
  private tick = 0;
  private rate: number;
  private mode: ConfigClock['mode'];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;

  constructor(
    private readonly config: ConfigClock,
    private readonly client: SeamClient,
    private readonly runId: string,
  ) {
    this.epochMicros = parseEpochMicros(config.epoch);
    this.rate = config.rate;
    this.mode = config.mode;
  }

  currentTick(): number {
    return this.tick;
  }

  currentRate(): number {
    return this.rate;
  }

  simTime(): string {
    return simTimeAtTick(this.epochMicros, this.config.tick_interval_us, this.tick);
  }

  start(): void {
    this.running = true;
    this.publishSample();
    this.schedule();
  }

  stop(): void {
    this.running = false;
    this.cancel();
  }

  /** Advance one tick by hand; legitimate whatever the rate (FR-09's step). */
  step(): void {
    this.advance();
  }

  /** Lockstep driver hook: the replay proof advances the clock, nothing else does. */
  tickOnce(): void {
    if (this.mode !== 'lockstep') throw new Error(`tickOnce is lockstep-only; mode is '${this.mode}'`);
    this.advance();
  }

  setRate(requested: number): RateVerdict {
    if (!Number.isFinite(requested) || requested < this.config.min_rate) {
      return { applied: false, refusal: `rate ${requested} is below min_rate ${this.config.min_rate}` };
    }
    if (requested > this.config.max_rate) {
      return { applied: false, refusal: `rate ${requested} is above max_rate ${this.config.max_rate}` };
    }
    this.rate = requested;
    this.cancel();
    // The acknowledgement: the tick in force, re-published with the rate now in force.
    this.publishSample();
    this.schedule();
    return { applied: true };
  }

  /** The clock's one HTTP interface: PUT { "rate": number } on its configured path. */
  handleRateRequest(request: SeamRequest): SeamHttpResponse {
    if (request.method !== 'PUT') {
      return { status: 405, body: JSON.stringify({ refused: `method ${request.method}; the rate accepts PUT` }) };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(request.body);
    } catch {
      return { status: 400, body: JSON.stringify({ refused: 'body is not JSON' }) };
    }
    const rate = (parsed as { rate?: unknown }).rate;
    if (typeof rate !== 'number') {
      return { status: 400, body: JSON.stringify({ refused: 'body must be {"rate": number}' }) };
    }
    const verdict = this.setRate(rate);
    if (!verdict.applied) {
      return { status: 422, body: JSON.stringify({ refused: verdict.refusal }) };
    }
    return { status: 200, body: JSON.stringify({ applied: true, rate: this.rate, tick: this.tick }) };
  }

  private advance(): void {
    this.tick += 1;
    this.publishSample();
  }

  private publishSample(): void {
    this.client.publish(this.config.topics.clock, {
      run_id: this.runId,
      tick: this.tick,
      sim_time: this.simTime(),
      mode: this.mode,
      rate: this.rate,
    });
  }

  private emitting(): boolean {
    return this.running && this.rate > 0 && (this.mode === 'realtime' || this.mode === 'accelerated');
  }

  private schedule(): void {
    if (!this.emitting()) return;
    const hostMillisPerTick = this.config.tick_interval_us / 1000 / this.rate;
    // harness:allow-wallclock the clock's own real-time driver (Constitution I)
    this.timer = setTimeout(() => {
      if (!this.emitting()) return;
      this.advance();
      this.schedule();
    }, hostMillisPerTick);
  }

  private cancel(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
