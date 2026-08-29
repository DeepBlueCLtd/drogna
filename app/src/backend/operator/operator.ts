/**
 * The operator surface (V2-C18, SRD-v2 FR-36): aggregates what components report
 * about themselves — a component never heard from is reported unheard, not
 * absent — and dispatches commands: clock step, and stop/start/restart of the
 * in-browser components through the control registry the runtime hands it.
 *
 * A refused command names the bound or rule. A stopped component goes dark
 * because its heartbeats cease — this surface reports the command it dispatched
 * and nothing more, and can light nothing (Constitution VII). Commands are
 * ephemeral and outside AT-04's replay claim, stated wherever replay is claimed.
 */
import type { SeamClient } from '../../seam/transport.js';
import type { SeamHttpResponse, SeamRequest } from '../../seam/http.js';
import type { ConfigOperator, Heartbeat, PlatformDemand } from '../../generated/types.js';
import { configDigest } from '../lib/sha256.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';
import type { Router } from '../runtime/router.js';

/** The runtime's registry of what can genuinely be stopped and started. */
export interface ComponentControl {
  ids(): string[];
  isRunning(id: string): boolean;
  stop(id: string): void;
  start(id: string): void;
  stepClock(): void;
}

export class OperatorSurface {
  private readonly heartbeat: HeartbeatEmitter;
  private simTime = { value: '', tick: null as number | null };
  private readonly heard = new Map<string, Heartbeat>();
  commandsDispatched = 0;
  commandsRefused = 0;
  demandsPublished = 0;

  constructor(
    private readonly config: ConfigOperator,
    private readonly client: SeamClient,
    private readonly control: ComponentControl,
    private readonly runId: string,
    router: Router,
  ) {
    router.register('GET', config.http.components_path, () => this.components());
    router.register('POST', config.http.step_path, () => this.step());
    router.registerPrefix('POST', config.http.command_prefix, (request) => this.command(request));
    router.register('POST', config.http.platform_demand_path, (request) => this.demand(request));
    this.heartbeat = new HeartbeatEmitter(
      config.id,
      config.heartbeat,
      client,
      () => ({
        sim_time: this.simTime.value,
        tick: this.simTime.tick,
        status: 'ok',
        detail: `${this.commandsDispatched} command(s) dispatched, ${this.commandsRefused} refused by rule`,
        figures: [
          { key: 'dispatched', value: this.commandsDispatched, label: 'dispatched' },
          { key: 'refused', value: this.commandsRefused, label: 'refused' },
          { key: 'demands', value: this.demandsPublished, label: 'demands' },
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
    this.client.subscribe(this.config.topics.heartbeat, (message) => {
      const heartbeat = message.payload as Heartbeat;
      this.heard.set(heartbeat.component, heartbeat);
    });
    this.heartbeat.start();
  }

  stop(): void {
    this.heartbeat.stop();
  }

  private components(): SeamHttpResponse {
    const ids = new Set([...this.control.ids(), ...this.heard.keys()]);
    const components = [...ids].sort().map((id) => ({
      id,
      heard: this.heard.has(id),
      stoppable: this.control.ids().includes(id) && !this.config.protected.includes(id),
      running: this.control.ids().includes(id) ? this.control.isRunning(id) : true,
      last_heartbeat: this.heard.get(id) ?? null,
    }));
    return { status: 200, body: JSON.stringify({ schema_version: 1, components }) };
  }

  /**
   * A demanded course, speed and depth (FR-53). The surface publishes it and says so;
   * it does not apply it and does not claim it was reached. Whether the platform can
   * get there is the platform's own answer, and it arrives on the state topic like
   * everything else a component says about itself — which is the same rule that keeps
   * a stop command from lighting anything.
   *
   * The shell reaches the demand topic through here because the shell's broker role
   * carries an empty publish list (E13): a front-end that published would have
   * stopped being one.
   */
  private demand(request: SeamRequest): SeamHttpResponse {
    let asked: Partial<PlatformDemand>;
    try {
      asked = JSON.parse(request.body ?? '') as Partial<PlatformDemand>;
    } catch {
      this.commandsRefused += 1;
      return refusal(400, 'a demand is a JSON body of platform-demand.schema.json shape');
    }
    const named = (['course_degrees', 'speed_m_per_s', 'depth_m'] as const).filter(
      (key) => asked[key] !== undefined,
    );
    if (named.length === 0) {
      this.commandsRefused += 1;
      return refusal(
        400,
        'a demand names at least one of course_degrees, speed_m_per_s or depth_m; an empty demand would be an order to keep doing what you are doing, which is not an order',
      );
    }
    const demand: PlatformDemand = {
      component: this.config.id,
      scenario_run_id: this.runId,
      sim_time: this.simTime.value,
      tick: this.simTime.tick ?? 0,
      ...(asked.course_degrees === undefined ? {} : { course_degrees: asked.course_degrees }),
      ...(asked.speed_m_per_s === undefined ? {} : { speed_m_per_s: asked.speed_m_per_s }),
      ...(asked.depth_m === undefined ? {} : { depth_m: asked.depth_m }),
      ...(asked.note === undefined ? {} : { note: asked.note }),
    };
    this.client.publish(this.config.topics.platform_demand, demand);
    this.demandsPublished += 1;
    this.commandsDispatched += 1;
    return {
      status: 200,
      body: JSON.stringify({
        applied: false,
        published: true,
        demanded: named,
        note: 'the demand is published, not applied; what the platform does with it arrives on its state topic, and a limit it cannot reach is stated there',
      }),
    };
  }

  private step(): SeamHttpResponse {
    this.control.stepClock();
    this.commandsDispatched += 1;
    return { status: 200, body: JSON.stringify({ applied: true, command: 'step' }) };
  }

  private command(request: SeamRequest): SeamHttpResponse {
    const rest = request.path.split('?')[0].slice(this.config.http.command_prefix.length + 1);
    const [id, verb] = rest.split('/');
    if (!id || !verb) {
      return refusal(400, `commands are POST ${this.config.http.command_prefix}/<component-id>/stop|start|restart`);
    }
    if (!['stop', 'start', 'restart'].includes(verb)) {
      return refusal(400, `'${verb}' is not a command; commands: stop, start, restart`);
    }
    // Protection outranks controllability: the clock is protected whether or not
    // anything registered it, and the refusal names the rule, not a lookup miss.
    if (this.config.protected.includes(id)) {
      this.commandsRefused += 1;
      return refusal(
        403,
        `'${id}' is protected from the operator plane by rule: stopping it would take the evidence of the stopping with it`,
      );
    }
    if (!this.control.ids().includes(id)) {
      this.commandsRefused += 1;
      return refusal(404, `no controllable component named '${id}'; controllable: ${this.control.ids().sort().join(', ')}`);
    }
    const running = this.control.isRunning(id);
    if (verb === 'stop' && !running) {
      this.commandsRefused += 1;
      return refusal(409, `'${id}' is already stopped`);
    }
    if (verb === 'start' && running) {
      this.commandsRefused += 1;
      return refusal(409, `'${id}' is already running; restart stops it first`);
    }
    if (verb === 'stop' || verb === 'restart') this.control.stop(id);
    if (verb === 'start' || verb === 'restart') this.control.start(id);
    this.commandsDispatched += 1;
    return {
      status: 200,
      body: JSON.stringify({
        applied: true,
        command: verb,
        component: id,
        note: 'a stopped component goes dark because its heartbeats cease; watch System, not this response',
      }),
    };
  }
}

function refusal(status: number, text: string): SeamHttpResponse {
  return { status, body: JSON.stringify({ refused: text }) };
}
