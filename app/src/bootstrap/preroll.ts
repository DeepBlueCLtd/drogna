/**
 * The pre-roll (feature 120): how a start condition's situation comes to be true.
 *
 * A reader who picks "loitering in the work area" is asking for a run that has already
 * been somewhere and already measured something. There are two ways to give them one.
 * The cheap way is to write the measurements into the observation store and the
 * forecasts into the coverage store, and the harness has said since SRD-v2 FR-11 that it
 * will not do that: seed data is authored by the components and seams that author it
 * during a run, so the guards a run enforces — validation, digests, publication
 * atomicity — are the guards the seed data passed through.
 *
 * So this module is a **scripted operator**. It holds the clock still, then drives the
 * run forward through the operator plane's own HTTP endpoints: stop and start a
 * component, tune a declared setting, publish a demand, prompt an event, step the clock. Every one of those is a
 * control a reader can work by hand in the Operator tab, and every message the run
 * produces on the way is on the broker where the Messages tab can see it. Nothing here
 * reaches past the release gate; nothing here writes to a store; nothing here knows what
 * a holding is.
 *
 * Two consequences worth stating rather than discovering.
 *
 * The clock is pinned to rate zero for the duration and restored to the configured rate
 * at the end. Without that the free-running driver would be emitting ticks *between* the
 * stepped ones, and a pre-roll of "4,800 ticks" would end at whatever tick the host
 * happened to reach — the run would still be honest and would no longer be the run the
 * condition describes.
 *
 * The steps are issued in bursts of the bound the plane declares, and control returns to
 * the host between bursts through `breathe`. The bound belongs to the plane (a reader
 * may not stop the world for an unbounded stretch) and the yield belongs to the caller
 * (this module reads no host clock). Simulation time advances on the step and on nothing
 * else, so a pause between two bursts is not a pause the run can see — the same argument
 * `backend/test-support/drive.ts` makes for the same reason.
 */
import type { SeamHttpBackend, SeamHttpResponse } from '../seam/http.js';
import type {
  ConfigClock,
  ConfigOperator,
  ConfigStartConditionsCondition,
  ConfigStartConditionsLeg,
} from '../generated/types.js';

/** Where the pre-roll has got to, for a reader watching it happen. */
export interface PreRollProgress {
  /** 1-based, so it reads as "leg 2 of 4" without arithmetic at the call site. */
  readonly leg: number;
  readonly legs: number;
  /** The leg's own note: what is happening, in the words the configuration uses. */
  readonly note: string;
  readonly ticksDone: number;
  readonly ticksTotal: number;
}

export interface PreRollPorts {
  readonly backend: SeamHttpBackend;
  readonly clock: ConfigClock;
  readonly operator: ConfigOperator;
  /** Hand the host back its event loop, so a progress reading can paint. */
  readonly breathe: () => Promise<void>;
  readonly onProgress: (progress: PreRollProgress) => void;
}

/**
 * A refusal from the control plane during a pre-roll is a fault in the *script*, not a
 * decision by a component: a leg naming a component that cannot be stopped, or an event
 * this plane does not offer. A component declining something it was prompted to do —
 * the scheduler declining a run inside its minimum interval — is answered 200 by the
 * plane and published on the component's own topics, exactly as it is when a reader
 * prompts by hand, and is not this.
 */
export class PreRollRefused extends Error {
  constructor(
    readonly path: string,
    readonly status: number,
    readonly detail: string,
  ) {
    super(`the pre-roll was refused at ${path}: ${status} ${detail}`);
    this.name = 'PreRollRefused';
  }
}

async function insist(
  ports: PreRollPorts,
  method: string,
  path: string,
  body?: unknown,
): Promise<SeamHttpResponse> {
  const answer = await ports.backend.handle({
    method,
    path,
    body: body === undefined ? '' : JSON.stringify(body),
  });
  if (answer.status < 200 || answer.status >= 300) {
    throw new PreRollRefused(path, answer.status, answer.body);
  }
  return answer;
}

/**
 * Which components a leg wants stopped, as a set. Absent means none: a leg that says
 * nothing about the crew is a leg with the whole crew running, which is the reading that
 * makes an ordinary leg the short one to write.
 */
function stoppedDuring(leg: ConfigStartConditionsLeg): ReadonlySet<string> {
  return new Set(leg.stopped ?? []);
}

/**
 * Run one condition's pre-roll. Returns when the last leg's last tick has been stepped
 * and the clock has been given its configured rate back.
 *
 * The caller is expected to have built the backend from `configForCondition(...)`
 * already: the platform's position is configuration and is in place before the first
 * tick, whereas everything below is a thing that happens after it.
 */
export async function runPreRoll(
  ports: PreRollPorts,
  condition: ConfigStartConditionsCondition,
): Promise<void> {
  const { operator, clock } = ports;
  const burst = operator.step.maximum_ticks;
  const ticksTotal = condition.legs.reduce((total, leg) => total + leg.ticks, 0);

  // Pinned, so the pre-roll's ticks are the only ticks. Rate zero is the same pin a
  // capture uses (FR-19), asked for the same way.
  await insist(ports, 'PUT', clock.http.rate_path, { rate: 0 });

  /** Component ids currently stopped, so each leg issues only the changes it makes. */
  let stopped = new Set<string>();
  let ticksDone = 0;

  try {
    for (const [index, leg] of condition.legs.entries()) {
      const report = () =>
        ports.onProgress({
          leg: index + 1,
          legs: condition.legs.length,
          note: leg.note,
          ticksDone,
          ticksTotal,
        });
      report();

      // The crew for this leg, as a difference from the last one: a component already
      // stopped is not stopped again, so the Messages tab shows the changes of state
      // rather than a command per leg per component.
      const wanted = stoppedDuring(leg);
      for (const id of wanted) {
        if (stopped.has(id)) continue;
        await insist(ports, 'POST', `${operator.http.command_prefix}/${id}/stop`);
      }
      let started = false;
      for (const id of stopped) {
        if (wanted.has(id)) continue;
        await insist(ports, 'POST', `${operator.http.command_prefix}/${id}/start`);
        started = true;
      }
      stopped = new Set(wanted);

      /**
       * A component the plane has just started is a fresh instance that has heard no
       * clock sample yet, and the harness's rule is that no component claims a time it
       * has not heard. Prompt one in that state and it answers at the empty instant: the
       * scheduler published a run request dated `''` at tick 0, the analyst dated the
       * holding it authored the same way, and the offload packager then staged a window
       * ending before the run began and declined it for holding no measurements. All
       * three were watched happening before this line existed.
       *
       * So a leg that brings anyone back gives the crew one of its own ticks to hear the
       * time before anything is asked of them. It comes out of the leg's budget rather
       * than being added to it, because the number in the configuration is how far the
       * run advances and a driver that quietly added to it would make that untrue.
       */
      const settle = started && leg.ticks > 0 ? 1 : 0;
      if (settle > 0) {
        await insist(ports, 'POST', operator.http.step_path, { ticks: settle });
        ticksDone += settle;
        report();
      }

      // Tunings before the demand and the prompts, because a leg's settings are the
      // terms the rest of it runs under: a run prompted before the cadence it is to be
      // scored at is in force would be scored at the previous leg's.
      for (const wanted of leg.tune ?? []) {
        const tunable = operator.tunables.find((candidate) => candidate.id === wanted.id);
        if (!tunable) {
          throw new PreRollRefused(
            operator.http.tuning_path,
            400,
            `'${wanted.id}' is not a setting this plane offers; offered: ${operator.tunables
              .map((candidate) => candidate.id)
              .sort()
              .join(', ')}`,
          );
        }
        await insist(ports, 'POST', operator.http.tuning_path, {
          target: tunable.target,
          setting: tunable.setting,
          value: wanted.value,
        });
      }

      if (leg.demand) {
        await insist(ports, 'POST', operator.http.platform_demand_path, leg.demand);
      }
      for (const event of leg.prompt ?? []) {
        await insist(ports, 'POST', `${operator.http.event_prefix}/${event}`);
      }

      for (let stepped = settle; stepped < leg.ticks; stepped += burst) {
        const ticks = Math.min(burst, leg.ticks - stepped);
        await insist(ports, 'POST', operator.http.step_path, { ticks });
        ticksDone += ticks;
        report();
        await ports.breathe();
      }
    }

  } finally {
    // In a `finally` because a refused script must not leave the clock pinned: a page
    // whose time has stopped looks exactly like a page that is broken, and the refusal
    // is the thing the reader needs to see.
    //
    // The rate goes back BEFORE the crew does, and the order is load-bearing. A rate
    // change is acknowledged by republishing the tick in force (`clock.ts`), so a
    // component started first hears that sample the moment it subscribes — and acts on
    // it. The shore source authored an advisory off exactly that, because the pre-roll
    // happened to end on a multiple of its cadence, and the run then held one advisory
    // more than the script had asked for. Watched happening; this order is the fix.
    await insist(ports, 'PUT', clock.http.rate_path, { rate: clock.rate });
    // Whatever the last leg stopped is started again: the condition describes how the
    // run got here, not a machine with pieces missing. A reader who wants the analyst
    // off can stop it in the Operator tab, and then it is their doing and it says so.
    for (const id of stopped) {
      await insist(ports, 'POST', `${operator.http.command_prefix}/${id}/start`);
    }
    stopped = new Set();
  }
}
