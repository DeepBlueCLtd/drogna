/**
 * AT-04 with the platform in the loop (feature 113, T020).
 *
 * The platform changed what replay has to mean, and the change is easy to miss.
 * Before it, `Sensors.positionAt(seconds)` was a closed form: where the sensors
 * sampled was a pure function of simulation time, and no message ever entered the
 * answer. Now the sensors sample at the last ownship position they heard, so their
 * output depends on delivery order — and a claim that has not been re-read against a
 * change it covers is a claim nobody has checked.
 *
 * Two facts, and they are not the same fact:
 *
 * 1. The dependency is real but not a divergence. Delivery is deterministic in
 *    lockstep, and registration order is subscription order — the composition root
 *    puts the platform before the sensors deliberately (runtime.ts), so the ordering
 *    is a property of the wiring rather than of a race, and the cold start is one
 *    sampling tick rather than an unbounded silence (`sensing.test.ts` holds that
 *    end). The first test drives the whole loop twice and compares every ownship
 *    observation, every platform state and every published holding byte for byte.
 * 2. A demand is an operator command, and AT-04's boundary already holds operator
 *    commands outside the claim: the manifest does not carry them. So a demanded run
 *    replays byte-identically only when the same demands are issued at the same
 *    ticks — the second test issues one at a recorded tick in both runs and gets
 *    identity, and the third shows the manifest alone does not get you there,
 *    because a run with the demand and a run without it genuinely differ. Without
 *    that third assertion the second would be satisfied by a platform that ignored
 *    demands entirely.
 *
 * The demand is issued through the operator component's HTTP endpoint, which is the
 * path the panel's own control takes. A first draft published it straight onto the
 * broker and was refused — `role 'shell' may not publish on 'ctl/platform/demand'` —
 * which is the default-deny rule doing its job: the shell asks a component to
 * command, it does not command.
 */
import { describe, expect, it } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun, Observation, PlatformState } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { buildBackend, type BackendRuntime } from '../runtime/runtime.js';

const validator = createSeamValidator();
const options = { rootSeed: 5150, startCondition: 'loitering', revision: 'test', dirty: false };

function lockstepConfig(): ConfigRun {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  return config;
}

interface Trace {
  readonly observations: Observation[];
  readonly states: PlatformState[];
  readonly holdings: string[];
}

/**
 * Drive a run, optionally issuing one demand at a named tick. The demand goes in
 * through the same topic the Operator tab publishes on — nothing here reaches into
 * the component — and its `sim_time` is the clock's, never a host clock.
 */
async function drive(
  runtime: BackendRuntime,
  config: ConfigRun,
  ticks: number,
  demand?: { atTick: number; course: number; speed: number; depth: number },
): Promise<Trace> {
  const shell = runtime.transport.connect(`replay-observer-${demand ? 'demanded' : 'plain'}`, 'shell');
  const observations: Observation[] = [];
  const states: PlatformState[] = [];
  const ownship = config.platform.thing.thing_id;
  for (const instrument of config.platform.instruments) {
    shell.subscribe(`${config.platform.topics.observation_prefix}/${ownship}/${instrument.datastream_id}`, (message) => {
      expect(validator.validate('observation', message.payload).refusals).toEqual([]);
      observations.push(message.payload as Observation);
    });
  }
  shell.subscribe(config.platform.topics.state, (message) => {
    expect(validator.validate('platform-state', message.payload).refusals).toEqual([]);
    states.push(message.payload as PlatformState);
  });
  let issued = false;
  for (let i = 0; i < ticks; i++) {
    runtime.clock.tickOnce();
    if (demand && !issued && runtime.platform.state().tick >= demand.atTick) {
      issued = true;
      const response = await runtime.httpBackend.handle({
        method: 'POST',
        path: config.operator.http.platform_demand_path,
        body: JSON.stringify({
          course_degrees: demand.course,
          speed_m_per_s: demand.speed,
          depth_m: demand.depth,
        }),
      });
      expect(response.status).toBe(200);
    }
  }
  if (demand) expect(issued).toBe(true);
  return {
    observations,
    states,
    holdings: runtime.store.holdings().map((h) => `${h.holding_id}:${h.field.sha256}`).sort(),
  };
}

async function run(ticks: number, demand?: Parameters<typeof drive>[3]): Promise<Trace> {
  const config = lockstepConfig();
  const runtime = buildBackend(config, options, validator);
  const trace = await drive(runtime, config, ticks, demand);
  runtime.stop();
  return trace;
}

const TICKS = 1200;
const DEMAND = { atTick: 400, course: 215, speed: 3.6, depth: 180 };

describe('replay with the platform in the loop (AT-04, feature 113)', { timeout: 180_000 }, () => {
  it('replays byte-identically although the sensors now depend on delivery order', async () => {
    const first = await run(TICKS);
    const second = await run(TICKS);
    // Not a smoke test on an empty trace: the ownship series has to exist for its
    // identity to mean anything, and the sensors have to have sampled at it.
    expect(first.observations.length).toBeGreaterThan(0);
    expect(first.holdings.length).toBeGreaterThan(0);
    expect(JSON.stringify(second.observations)).toBe(JSON.stringify(first.observations));
    expect(JSON.stringify(second.states)).toBe(JSON.stringify(first.states));
    expect(second.holdings).toEqual(first.holdings);
  });

  it('replays byte-identically when the same demand is issued at the same tick', async () => {
    const first = await run(TICKS, DEMAND);
    const second = await run(TICKS, DEMAND);
    expect(JSON.stringify(second.observations)).toBe(JSON.stringify(first.observations));
    expect(JSON.stringify(second.states)).toBe(JSON.stringify(first.states));
    expect(second.holdings).toEqual(first.holdings);
    // The demand was heard and acted on, rather than replayed identically by being
    // ignored: the platform ends up somewhere the configured course would not take it.
    const last = first.states[first.states.length - 1];
    expect(last.demanded?.course_degrees).toBe(DEMAND.course);
    expect(last.current.course_degrees).toBeCloseTo(DEMAND.course, 0);
    expect(last.current.course_degrees).not.toBeCloseTo(lockstepConfig().platform.initial.course_degrees, 0);
  });

  it('the manifest does not carry the demand, so the demanded run is not the manifest’s run', async () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    // The manifest names seeds, clock, participants and code version — no command
    // and no demand. This is AT-04's stated boundary, asserted rather than assumed.
    const manifestText = JSON.stringify(runtime.manifest);
    expect(manifestText).not.toContain(config.platform.topics.demand);
    expect(manifestText).not.toContain('course_degrees');
    runtime.stop();

    const undemanded = await run(TICKS);
    const demanded = await run(TICKS, DEMAND);
    expect(JSON.stringify(demanded.states)).not.toBe(JSON.stringify(undemanded.states));
    expect(JSON.stringify(demanded.observations)).not.toBe(JSON.stringify(undemanded.observations));
  });
});
