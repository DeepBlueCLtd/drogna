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
 *
 * Three commands beyond stop and start, all on the same rule (feature 114). A **step**
 * may ask for a burst of ticks, bounded by the declared maximum. A **tuning** sets one
 * named numeric setting on one component, within the bound this surface's own
 * configuration declares for it; a **prompted event** asks a component to do now what
 * it would otherwise do on its cadence. Both cross the broker as operator commands
 * addressed to a target, and both are dispatched rather than applied: what the setting
 * did is the target's answer, reported in its heartbeat, and whether a prompt is acted
 * on is the target's decision — the scheduler declines one inside its minimum interval
 * exactly as it declines a divergence.
 *
 * What the plane offers is served rather than known by the reader (FR-63): the controls
 * statement is this configuration's own declarations, so a panel offers exactly what
 * this surface would accept and holds no second copy of a bound (Constitution IV).
 */
import type { SeamClient } from '../../seam/transport.js';
import type { SeamHttpResponse, SeamRequest } from '../../seam/http.js';
import type {
  ConfigOperator,
  Heartbeat,
  OperatorCommand,
  OperatorControls,
  PlatformDemand,
} from '../../generated/types.js';
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
  tuningsPublished = 0;
  eventsPublished = 0;

  constructor(
    private readonly config: ConfigOperator,
    private readonly client: SeamClient,
    private readonly control: ComponentControl,
    private readonly runId: string,
    router: Router,
  ) {
    router.register('GET', config.http.components_path, () => this.components());
    router.register('POST', config.http.step_path, (request) => this.step(request));
    router.registerPrefix('POST', config.http.command_prefix, (request) => this.command(request));
    router.register('POST', config.http.platform_demand_path, (request) => this.demand(request));
    router.register('GET', config.http.controls_path, () => this.controls());
    router.register('POST', config.http.tuning_path, (request) => this.tune(request));
    router.registerPrefix('POST', config.http.event_prefix, (request) => this.event(request));
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
          { key: 'tunings', value: this.tuningsPublished, label: 'tunings' },
          { key: 'events', value: this.eventsPublished, label: 'prompts' },
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

  /**
   * What this plane offers, in its own declarations (feature 114). Served rather than
   * assumed so a panel cannot draw a control this surface would refuse, and so a bound
   * exists once: here, in configuration, enforced below and published above.
   *
   * No value in force appears in it. What a setting is currently doing is the target
   * component's answer and arrives in that component's heartbeat; a control plane that
   * also reported the setting would be a second source for one fact, free to disagree
   * with the component about what the component is doing.
   */
  private controls(): SeamHttpResponse {
    const document: OperatorControls = {
      schema_version: 1,
      step: { maximum_ticks: this.config.step.maximum_ticks },
      demand: { target: this.config.demand.target },
      tunables: this.config.tunables.map((tunable) => ({ ...tunable })),
      events: this.config.events.map((event) => ({ ...event })),
    };
    return { status: 200, body: JSON.stringify(document) };
  }

  /**
   * Advance the clock. An absent body is one tick, which is what this endpoint has
   * always meant; a { ticks } body asks for a burst, and the burst is a loop over the
   * clock's own step rather than a second way of moving time — every tick in it is
   * published, heard and acted on exactly as a single step's is.
   *
   * The bound is declared, not assumed: an unbounded burst blocks the page it is
   * drawing, and "how long may a reader stop the world for" is a policy, not a number
   * for this file to hold.
   */
  private step(request: SeamRequest): SeamHttpResponse {
    let ticks = 1;
    if ((request.body ?? '').trim() !== '') {
      let asked: { ticks?: unknown };
      try {
        asked = JSON.parse(request.body) as { ticks?: unknown };
      } catch {
        this.commandsRefused += 1;
        return refusal(400, 'a step body is JSON of the shape { "ticks": <integer> }, or no body at all for one tick');
      }
      if (asked.ticks !== undefined) {
        if (typeof asked.ticks !== 'number' || !Number.isInteger(asked.ticks) || asked.ticks < 1) {
          this.commandsRefused += 1;
          return refusal(400, `'${String(asked.ticks)}' is not a number of ticks: a step advances whole ticks, one or more`);
        }
        if (asked.ticks > this.config.step.maximum_ticks) {
          this.commandsRefused += 1;
          return refusal(
            400,
            `${asked.ticks} ticks is beyond the declared bound of ${this.config.step.maximum_ticks} for one step command; ask again, or raise the clock rate and let time pass`,
          );
        }
        ticks = asked.ticks;
      }
    }
    for (let index = 0; index < ticks; index += 1) this.control.stepClock();
    this.commandsDispatched += 1;
    return { status: 200, body: JSON.stringify({ applied: true, command: 'step', ticks }) };
  }

  /**
   * Set one declared setting on one component (FR-64). The bound is enforced here and
   * the change is published; the value in force is the target's own answer.
   *
   * A tuning does not survive a restart, and the response says so: a restarted
   * component is rebuilt from its configuration document by the same factory that
   * built the first one, so it comes back reporting the configured value. That is the
   * ephemerality stop and start already have, and it is stated rather than discovered.
   */
  private tune(request: SeamRequest): SeamHttpResponse {
    let asked: { target?: unknown; setting?: unknown; value?: unknown };
    try {
      asked = JSON.parse(request.body ?? '') as typeof asked;
    } catch {
      this.commandsRefused += 1;
      return refusal(400, 'a tuning is a JSON body of the shape { "target": <component>, "setting": <name>, "value": <number> }');
    }
    const tunable = this.config.tunables.find(
      (candidate) => candidate.target === asked.target && candidate.setting === asked.setting,
    );
    if (!tunable) {
      this.commandsRefused += 1;
      return refusal(
        404,
        `nothing tunable named '${String(asked.setting)}' on '${String(asked.target)}'; tunable: ${this.config.tunables
          .map((candidate) => `${candidate.target}/${candidate.setting}`)
          .sort()
          .join(', ')}`,
      );
    }
    const value = asked.value;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.commandsRefused += 1;
      return refusal(400, `'${String(value)}' is not a number: ${tunable.label} is measured, not named`);
    }
    if (tunable.integer && !Number.isInteger(value)) {
      this.commandsRefused += 1;
      return refusal(400, `${tunable.label} counts ${tunable.unit ?? 'things'}, so ${value} is not a stricter setting but a nonsense`);
    }
    if (value < tunable.minimum || value > tunable.maximum) {
      this.commandsRefused += 1;
      return refusal(
        400,
        `${value}${tunable.unit ? ` ${tunable.unit}` : ''} is outside the declared bound for ${tunable.label} (${tunable.minimum} to ${tunable.maximum})`,
      );
    }
    const command: OperatorCommand = {
      component: this.config.id,
      scenario_run_id: this.runId,
      sim_time: this.simTime.value,
      tick: this.simTime.tick ?? 0,
      kind: 'tuning',
      target: tunable.target,
      setting: tunable.setting,
      value,
    };
    this.client.publish(this.config.topics.command, command);
    this.tuningsPublished += 1;
    this.commandsDispatched += 1;
    return {
      status: 200,
      body: JSON.stringify({
        applied: false,
        published: true,
        target: tunable.target,
        setting: tunable.setting,
        value,
        note: `published to ${tunable.target}; the value in force is what ${tunable.target} reports in its heartbeat, and a restart rebuilds it from configuration, so a tuning does not outlive one`,
      }),
    };
  }

  /**
   * Ask a component to do now what it would otherwise do on its own cadence (FR-65).
   *
   * The prompt goes to the component, not around it. A run could have been requested
   * from here directly — the operator role would have carried the topic and the loop
   * would have turned on demand — and that would have put a second implementation of
   * the scheduler's policy in the control plane, able to start a run the scheduler
   * would have declined. So the prompt is published, the scheduler decides under the
   * rule it already has, and a decline is published like any other decision.
   */
  private event(request: SeamRequest): SeamHttpResponse {
    const rest = request.path.split('?')[0].slice(this.config.http.event_prefix.length + 1);
    const declared = this.config.events.find((candidate) => candidate.id === rest);
    if (!declared) {
      this.commandsRefused += 1;
      return refusal(
        404,
        `'${rest}' is not an event this plane offers; offered: ${this.config.events.map((candidate) => candidate.id).sort().join(', ')}`,
      );
    }
    const command: OperatorCommand = {
      component: this.config.id,
      scenario_run_id: this.runId,
      sim_time: this.simTime.value,
      tick: this.simTime.tick ?? 0,
      kind: 'event',
      target: declared.target,
      event: declared.id,
    };
    this.client.publish(this.config.topics.command, command);
    this.eventsPublished += 1;
    this.commandsDispatched += 1;
    return {
      status: 200,
      body: JSON.stringify({
        applied: false,
        published: true,
        event: declared.id,
        target: declared.target,
        note: `the prompt is published; whether ${declared.target} acts on it is its own decision, published on its own topics — it may decline`,
      }),
    };
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
