/**
 * Feature 120: the four start conditions, driven exactly as the composition root drives
 * them, and held to what their cards promise.
 *
 * Nothing is mocked and nothing is stubbed. Each case builds the whole backend from the
 * configuration that condition runs under, drives that condition's pre-roll through the
 * release gate and the operator plane's own endpoints, and then reads the stores. A card
 * that says "not one measurement inside the work area itself" is therefore a claim this
 * file can fail, which is the only reason the card is worth printing.
 *
 * EXPECTED is keyed by condition id and is checked for completeness against the
 * configuration document: a fifth condition added to `run.json` fails here until somebody
 * says what it promises, rather than quietly arriving with nothing holding it to
 * anything.
 *
 * Watched failing, deliberately, before it was trusted (CLAUDE.md, lesson 2):
 *  - moving `arriving`'s platform to the work area's centre reports 760 measurements
 *    inside a region its card says holds none;
 *  - dropping `advisory-source` into `loitering`'s `stopped` lists reports one advisory
 *    where the cadence over that period warrants three.
 *
 * A third planted violation found a fault in the check rather than in the code, which is
 * the reason for planting them: deleting the `run-now` prompt from `leaving`'s second leg
 * changed nothing at all, because the cadence floor warrants that run at tick 1800
 * whether it is asked for or not. The prompt was removed rather than the check
 * strengthened — a line whose removal no test notices is a line doing no work.
 */
import { describe, expect, it } from 'vitest';
import runConfigDocument from '../../config/run.json';
import type { ConfigRun, ConfigStartConditionsCondition, Observation } from '../generated/types.js';
import { createSeamValidator } from '../seam/validate.js';
import { buildBackend, type BackendRuntime } from '../backend/runtime/runtime.js';
import {
  heldBackBySnapshot,
  configForCondition,
  defaultCondition,
  holdingBack,
  preRollTicks,
} from './start-condition.js';
import { runPreRoll } from './preroll.js';
import { decodeSnapshot, encodeSnapshot } from '../backend/snapshot/codec.js';
import { driveUntil } from '../backend/test-support/drive.js';

const validator = createSeamValidator();
const config = runConfigDocument as ConfigRun;

/**
 * `setImmediate` and not a timer: the yield exists to let the host's event loop turn
 * between bursts, arms nothing against host time, and reads no clock — the argument
 * `backend/test-support/drive.ts` sets out at length for the same call.
 */
const breathe = () => new Promise<void>((resolve) => setImmediate(resolve));

interface Reading {
  runtime: BackendRuntime;
  /** Observations from the ocean instruments — the ownship's own navigation excluded. */
  measurements: Observation[];
  ownship: Observation[];
  eras: string[];
  advisories: number;
  tick: number;
  /** Host milliseconds the pre-roll took, for the budget below. */
  millis: number;
}

const workArea = (() => {
  const feature = config.feature_store.features.find((candidate) => candidate.kind === 'loiter_region');
  if (!feature) throw new Error('the scenario declares no loiter region to hold the cards to');
  return feature.geometry.coordinates[0];
})();

/** Ray casting against the declared ring, so the check answers to the geometry on disk. */
function insideWorkArea(longitude: number, latitude: number): boolean {
  let inside = false;
  for (let i = 0, j = workArea.length - 1; i < workArea.length; j = i++) {
    const [xi, yi] = workArea[i];
    const [xj, yj] = workArea[j];
    if (yi > latitude !== yj > latitude && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

async function preRoll(condition: ConfigStartConditionsCondition): Promise<Reading> {
  const effective = configForCondition(config, condition);
  const runtime = buildBackend(
    effective,
    { rootSeed: 4242, startCondition: condition.id, revision: 'test', dirty: false },
    validator,
  );
  // harness:allow-wallclock a host-time budget for a host-time cost; no simulation time is read from it
  const started = performance.now();
  await runPreRoll(
    {
      backend: runtime.httpBackend,
      clock: effective.clock,
      operator: effective.operator,
      breathe,
      onProgress: () => undefined,
    },
    condition,
  );
  // harness:allow-wallclock the other end of the same budget
  const millis = performance.now() - started;
  runtime.clock.stop();
  const all = runtime.observationStore.all();
  return {
    runtime,
    measurements: all.filter((observation) => observation.thing_id === effective.sensors.platform.thing_id),
    ownship: all.filter((observation) => observation.thing_id === effective.platform.thing.thing_id),
    eras: runtime.store.holdings().map((holding) => holding.era),
    advisories: runtime.advisoryStore.all().length,
    tick: runtime.clock.currentTick(),
    millis,
  };
}

/**
 * What each card promises, as something a machine can check. The prose on the card and
 * the predicate here are two statements of one fact and are expected to be read
 * together: if they ever disagree, one of them is a lie.
 */
const EXPECTED: Record<string, (reading: Reading, condition: ConfigStartConditionsCondition) => void> = {
  leaving: (reading) => {
    // "the ownship track since the quay — and no measurement of the ocean"
    expect(reading.measurements).toEqual([]);
    expect(reading.ownship.length).toBeGreaterThan(20);
    // "a departure forecast, assimilated from the now-cast alone"
    expect(reading.eras).toContain('analysis');
    expect(reading.eras).toContain('instance');
    // Nothing was measured, so the analysis corrected the now-cast and nothing else.
    expect(reading.advisories).toBe(0);
  },
  arriving: (reading) => {
    // "measurements the length of the passage in"
    expect(reading.measurements.length).toBeGreaterThan(500);
    // "not one measurement inside the work area itself"
    const inside = reading.measurements.filter((observation) =>
      insideWorkArea(observation.location.longitude, observation.location.latitude),
    );
    expect(inside).toEqual([]);
    // "a now-cast, and the forecast the arrival warranted"
    expect(reading.eras).toContain('instance');
    expect(reading.advisories).toBe(0);
  },
  loitering: (reading, condition) => {
    // "measurements throughout the work area"
    const inside = reading.measurements.filter((observation) =>
      insideWorkArea(observation.location.longitude, observation.location.latitude),
    );
    expect(inside.length).toBe(reading.measurements.length);
    expect(inside.length).toBeGreaterThan(500);
    // "analyses corrected by what was measured there", and two forecasts
    expect(reading.eras.filter((era) => era === 'analysis').length).toBeGreaterThanOrEqual(3);
    expect(reading.eras.filter((era) => era === 'instance').length).toBeGreaterThanOrEqual(2);
    // "shore advisories received over the link" — held to the cadence the source
    // declares over the period the script covers, not to "more than none". More than
    // none was satisfied by an artefact: the source was restarted at the end of the
    // pre-roll, heard the acknowledgement sample the rate change republishes, found the
    // tick a multiple of its cadence and authored one. The check passed with the shore
    // link stopped for the whole run, which is the fault it exists to catch.
    expect(reading.advisories).toBeGreaterThanOrEqual(
      Math.floor(preRollTicks(condition) / config.advisory_source.cadence_ticks) - 1,
    );
  },
  returning: (reading, condition) => {
    // "measurements across the work area and out along the passage home"
    expect(reading.measurements.length).toBeGreaterThan(1000);
    expect(
      reading.measurements.filter((observation) =>
        insideWorkArea(observation.location.longitude, observation.location.latitude),
      ).length,
    ).toBeGreaterThan(500);
    expect(reading.advisories).toBeGreaterThanOrEqual(
      Math.floor(preRollTicks(condition) / config.advisory_source.cadence_ticks) - 1,
    );
    expect(reading.eras).toContain('instance');
    // "a package staged for offload, with the measurement geometry beside it"
    const staged = reading.runtime.offload.staged();
    expect(staged.length).toBeGreaterThan(0);
    expect(staged[staged.length - 1].sibling.measurement_geometry?.measurements.length).toBeGreaterThan(0);
  },
};

describe('the start conditions (feature 120)', () => {
  it('every condition the configuration offers is held to a promise here', () => {
    expect(config.start_conditions.conditions.map((condition) => condition.id).sort()).toEqual(
      Object.keys(EXPECTED).sort(),
    );
    // And the default is one of them, which is what stops the welcome page offering a
    // first card that does not exist.
    expect(defaultCondition(config.start_conditions).id).toBe(config.start_conditions.default);
  });

  it.each(config.start_conditions.conditions.map((condition) => [condition.id, condition] as const))(
    "'%s' leaves the run holding what its card says it holds",
    async (id, condition) => {
      const reading = await preRoll(condition);
      try {
        // True of every condition, and stated once: the archive and a now-cast are what
        // provisioning authors before a pre-roll does anything at all (FR-21).
        expect(reading.eras).toContain('archive');
        expect(reading.eras).toContain('nowcast');
        // The clock ended where the script said it would, which is what the pin is for:
        // a free-running tick between two stepped ones would put it somewhere else.
        expect(reading.tick).toBe(preRollTicks(condition));
        EXPECTED[id](reading, condition);
        // Reported rather than asserted: the budget is checked once, below, against the
        // condition a bare visit actually pays for.
        console.log(`${id}: ${reading.tick} ticks in ${reading.millis.toFixed(0)} ms host time`);
      } finally {
        reading.runtime.stop();
      }
    },
    180_000,
  );

  it('leaves every component it stopped running again, and the clock at its configured rate', async () => {
    // The condition that stops the most: a pre-roll that handed back a machine with
    // pieces missing would be a run the reader has to repair before using.
    const condition = config.start_conditions.conditions.find((candidate) => candidate.id === 'arriving');
    if (!condition) throw new Error('the arriving condition has gone');
    const reading = await preRoll(condition);
    try {
      const stoppedSomewhere = new Set(condition.legs.flatMap((leg) => leg.stopped ?? []));
      expect(stoppedSomewhere.size).toBeGreaterThan(0);
      for (const id of stoppedSomewhere) {
        expect(reading.runtime.control.isRunning(id), `${id} is running again`).toBe(true);
      }
      expect(reading.runtime.clock.currentRate()).toBe(config.clock.rate);
    } finally {
      reading.runtime.stop();
    }
  }, 180_000);

  // AT-04: byte-identity
  it('replays: one seed and one condition, the same run twice, byte for byte', async () => {
    // The pre-roll is a sequence of operator commands, which AT-04 puts outside its
    // claim — commands are ephemeral, and a demanded run replays identically only when
    // the same demands are issued at the same ticks. A condition's demands come from the
    // configuration document rather than from a reader's hand, so that proviso is met by
    // construction, and the whole pre-roll is back inside the claim. Which is the point
    // of scripting it in configuration rather than in a reader's session.
    const condition = config.start_conditions.conditions.find((candidate) => candidate.id === 'loitering');
    if (!condition) throw new Error('the loitering condition has gone');
    const fingerprint = async () => {
      const reading = await preRoll(condition);
      try {
        return {
          holdings: reading.runtime.store
            .holdings()
            .map((holding) => `${holding.holding_id} ${holding.field.sha256}`)
            .sort(),
          observations: reading.runtime.observationStore.all().map((o) => o.observation_id),
          advisories: reading.runtime.advisoryStore.all().map((a) => a.advisory_id),
        };
      } finally {
        reading.runtime.stop();
      }
    };
    const first = await fingerprint();
    expect(first.holdings.length).toBeGreaterThan(2);
    expect(await fingerprint()).toEqual(first);
  }, 180_000);

  it('refuses a script the control plane cannot honour, and unpins the clock as it goes', async () => {
    const condition = defaultCondition(config.start_conditions);
    const broken: ConfigStartConditionsCondition = {
      ...condition,
      legs: [{ note: 'a prompt this plane does not offer', ticks: 0, prompt: ['sail-home'] }],
    };
    const effective = configForCondition(config, broken);
    const runtime = buildBackend(
      effective,
      { rootSeed: 7, startCondition: broken.id, revision: 'test', dirty: false },
      validator,
    );
    try {
      await expect(
        runPreRoll(
          {
            backend: runtime.httpBackend,
            clock: effective.clock,
            operator: effective.operator,
            breathe,
            onProgress: () => undefined,
          },
          broken,
        ),
      ).rejects.toThrow(/sail-home/);
      // The clock is the reader's only sign that the page is alive, so a refused script
      // must not leave it pinned — that is what the `finally` in the driver is for.
      expect(runtime.clock.currentRate()).toBe(config.clock.rate);
    } finally {
      runtime.stop();
    }
  }, 60_000);

  it('reports its progress in the leg the configuration names, and reaches the end of it', async () => {
    const condition = config.start_conditions.conditions.find((candidate) => candidate.id === 'leaving');
    if (!condition) throw new Error('the leaving condition has gone');
    const effective = configForCondition(config, condition);
    const runtime = buildBackend(
      effective,
      { rootSeed: 91, startCondition: condition.id, revision: 'test', dirty: false },
      validator,
    );
    const seen: string[] = [];
    let last = { ticksDone: -1, ticksTotal: -1 };
    try {
      await runPreRoll(
        {
          backend: runtime.httpBackend,
          clock: effective.clock,
          operator: effective.operator,
          breathe,
          onProgress: (progress) => {
            if (seen[seen.length - 1] !== progress.note) seen.push(progress.note);
            last = { ticksDone: progress.ticksDone, ticksTotal: progress.ticksTotal };
          },
        },
        condition,
      );
      expect(seen).toEqual(condition.legs.map((leg) => leg.note));
      expect(last).toEqual({ ticksDone: preRollTicks(condition), ticksTotal: preRollTicks(condition) });
    } finally {
      runtime.stop();
    }
  }, 120_000);
  /**
   * ADR-0041's far half, and the test the refusal in `start-condition.test.ts` was standing
   * in for until this feature.
   *
   * The artefacts carry the forecast eras now, which means a run that replays one holds the
   * **analyst and the model runner** back for the whole pre-roll — not just the ocean. Two
   * things had to become true for that to be safe, and neither is visible in a snapshot's
   * bytes, so neither is covered by `check-snapshot-drift`:
   *
   *  - the run must *open* holding what a live run would have produced, and
   *  - the loop must still turn afterwards.
   *
   * The second is the one that was broken, and badly. Holding the analyst back means the
   * scheduler's run request reaches nobody at all — the analyst takes a request synchronously
   * and holds no pending state — so the outstanding-run guard latched and the console opened
   * onto a loop that never turned again. Measured before the watchdog: `returning` opened with
   * a run in flight that stayed in flight, and 5,400 further ticks produced not one analysis
   * and not one forecast.
   *
   * Driven against a real artefact built the way `pnpm snapshots` builds one, because an
   * artefact assembled by the test would prove the test's idea of a snapshot and not the
   * shipped one.
   */
  it('a run backed by the forecast eras opens like a live one, and keeps turning', async () => {
    const condition = config.start_conditions.conditions.find((candidate) => candidate.id === 'loitering');
    if (!condition) throw new Error('the configuration no longer offers loitering');
    const eras: ReadonlySet<string> = new Set<string>(condition.snapshot_eras ?? []);
    expect(eras.has('analysis') && eras.has('instance'), 'this case is about the forecast eras').toBe(true);

    /** Lockstep, so the ticks after the pre-roll are this test's and not the host's. */
    const effective = (() => {
      const copy = configForCondition(JSON.parse(JSON.stringify(config)) as ConfigRun, condition);
      copy.clock.mode = 'lockstep';
      copy.clock.rate = 0;
      return copy;
    })();
    const options = {
      rootSeed: condition.root_seed,
      startCondition: condition.id,
      revision: 'test',
      dirty: false,
    };
    const drive = async (runtime: BackendRuntime) =>
      runPreRoll(
        {
          backend: runtime.httpBackend,
          clock: effective.clock,
          operator: effective.operator,
          breathe,
          onProgress: () => undefined,
        },
        runtime === live ? condition : holdingBack(condition, held),
      );
    const countByEra = (runtime: BackendRuntime) => {
      const tally: Record<string, number> = {};
      for (const holding of runtime.store.holdings()) tally[holding.era] = (tally[holding.era] ?? 0) + 1;
      return tally;
    };

    // The control: everybody authors, which is exactly what `build-snapshots.ts` drives.
    const live = buildBackend(effective, { ...options, snapshot: undefined }, validator);
    await drive(live);
    const liveTally = countByEra(live);
    const staged = live.store
      .holdings()
      .filter((descriptor) => eras.has(descriptor.era))
      .map((descriptor) => {
        const holding = live.store.holding(descriptor.holding_id);
        if (!holding) throw new Error(`the store lost '${descriptor.holding_id}' between listing and reading it`);
        return holding;
      })
      .sort((a, b) => a.descriptor.published_at.tick - b.descriptor.published_at.tick);
    const artefact = await decodeSnapshot(
      await encodeSnapshot(
        {
          format: 'drogna-snapshot-1',
          start_condition: condition.id,
          run_id: live.runId,
          root_seed: condition.root_seed,
          config_digest: staged[0].descriptor.manifest.config_digest,
          code_revision: 'test',
        },
        staged,
      ),
    );
    live.stop();

    // The page's path: the artefact replayed, its authors held back.
    const held = heldBackBySnapshot(condition, effective.snapshot_source);
    expect([...held].sort()).toEqual(['analyst', 'env-generator', 'model-runner']);
    const page = buildBackend(effective, { ...options, snapshot: artefact }, validator);
    await drive(page);

    // It opens holding what the live run held. Era by era, so a missing forecast half is a
    // named difference rather than a count that happens to match.
    expect(countByEra(page)).toEqual(liveTally);

    // And it keeps turning. Without the scheduler's watchdog this waits out the limit with
    // the count exactly where the pre-roll left it.
    const forecasts = () => page.store.holdings().filter((holding) => holding.era === 'instance').length;
    const onOpening = forecasts();
    expect(onOpening, 'the run opened with no forecast at all').toBeGreaterThan(0);
    await driveUntil(page.clock, () => forecasts() > onOpening, effective.scheduler.max_interval_ticks * 6);
    expect(
      forecasts(),
      'the loop never turned after the console opened: a run was requested into the held-back analyst and never released',
    ).toBeGreaterThan(onOpening);
    page.stop();
  }, 180_000);
  /**
   * What a replayed run knows, as against what it holds.
   *
   * Committing the forecast eras holds the **model runner** back for the whole pre-roll, and
   * `run_published` is the only statement that a forecast stands. Four components hold
   * nothing but what it told them — the scheduler its remaining validity, the offload
   * packager the run it would stage, the analyst its background spread, telemetry its skill
   * ledger — so replaying the holdings left every one of them believing the run had no
   * forecast at all. The holdings were all there; the knowledge was not, and the per-era
   * counts the case above compares cannot see the difference.
   *
   * Two things it cost, both measured before the fix:
   *  - `returning`'s card promises "a package staged for offload, with the measurement
   *    geometry beside it". Its script prompts for one mid-pre-roll, at a tick where the
   *    runner is held back, and the packager declined: **zero** staged bundles against a live
   *    run's five, with the Offload surface telling the reader nothing had been released
   *    while the store held eight forecasts and the timeline drew them.
   *  - The scheduler, counting from a request nobody answered rather than from the standing
   *    forecast's validity, reached its next run at 611, 1,272, 1,514 and 1,790 ticks where a
   *    live run of the same conditions reaches it at 599, 1,794, 1,080 and 639.
   *
   * Both are held here, and the cadence one is held against a live run driven in the same
   * test rather than against a number typed into it — which is the assertion that would have
   * refused the first attempt at this, a quiesced scheduler that turned the loop 10 ticks
   * after opening and looked like an improvement.
   */
  // The bytes are held to identity by check-snapshot-drift and by the replay case above; what
  // this asks is whether replaying them leaves the components that learn from announcements
  // in the state a live run leaves them in.
  // AT-04: not byte-identity — two different runs compared on when their loop next turns, not one run reproduced
  it('a replayed run stages what its card promises, and keeps the cadence a live run keeps', async () => {
    /** Ticks from the console opening to the next forecast the loop computes for itself. */
    const ticksToNextForecast = async (runtime: BackendRuntime, limit: number) => {
      const forecasts = () => runtime.store.holdings().filter((holding) => holding.era === 'instance').length;
      const onOpening = forecasts();
      let waited = 0;
      while (waited < limit && forecasts() === onOpening) {
        runtime.clock.tickOnce();
        waited += 1;
        if (waited % 200 === 0) await breathe();
      }
      return forecasts() > onOpening ? waited : Number.POSITIVE_INFINITY;
    };

    const readings: string[] = [];
    for (const condition of config.start_conditions.conditions) {
      const effective = (() => {
        const copy = configForCondition(JSON.parse(JSON.stringify(config)) as ConfigRun, condition);
        copy.clock.mode = 'lockstep';
        copy.clock.rate = 0;
        return copy;
      })();
      const options = { rootSeed: condition.root_seed, startCondition: condition.id, revision: 'test', dirty: false };
      const held = heldBackBySnapshot(condition, effective.snapshot_source);
      const limit = effective.scheduler.max_interval_ticks * 6;
      const opened = async (artefact: Awaited<ReturnType<typeof decodeSnapshot>> | undefined) => {
        const runtime = buildBackend(effective, { ...options, snapshot: artefact }, validator);
        await runPreRoll(
          {
            backend: runtime.httpBackend,
            clock: effective.clock,
            operator: effective.operator,
            breathe,
            onProgress: () => undefined,
          },
          artefact ? holdingBack(condition, held) : condition,
        );
        return runtime;
      };

      // The control, and the artefact built from it exactly as `pnpm snapshots` builds one.
      const live = await opened(undefined);
      const eras: ReadonlySet<string> = new Set<string>(condition.snapshot_eras ?? []);
      const staged = live.store
        .holdings()
        .filter((descriptor) => eras.has(descriptor.era))
        .map((descriptor) => {
          const holding = live.store.holding(descriptor.holding_id);
          if (!holding) throw new Error(`the store lost '${descriptor.holding_id}'`);
          return holding;
        })
        .sort((a, b) => a.descriptor.published_at.tick - b.descriptor.published_at.tick);
      const artefact = await decodeSnapshot(
        await encodeSnapshot(
          {
            format: 'drogna-snapshot-1',
            start_condition: condition.id,
            run_id: live.runId,
            root_seed: condition.root_seed,
            config_digest: staged[0].descriptor.manifest.config_digest,
            code_revision: 'test',
          },
          staged,
        ),
      );
      const liveCadence = await ticksToNextForecast(live, limit);
      live.stop();

      const page = await opened(artefact);
      // The card's promise, where a card makes one. `returning` is the condition whose script
      // prompts for a package mid-pre-roll, at a tick where the model runner is held back.
      if (condition.id === 'returning') {
        const offload = page.offload as unknown as { stagedBundles: unknown[]; declined: string[] };
        expect(
          offload.stagedBundles.length,
          `returning's card promises a staged package and the replayed run staged none: ${offload.declined.join('; ')}`,
        ).toBeGreaterThan(0);
      }
      const pageCadence = await ticksToNextForecast(page, limit);
      page.stop();
      readings.push(`${condition.id}: live ${liveCadence}, replayed ${pageCadence}`);
      expect(Number.isFinite(liveCadence), `${condition.id}: the live run never computed a forecast`).toBe(true);
    }

    // Every condition, against its own live run rather than a number typed in here. Two of
    // the four agree by coincidence whichever way the fix goes — `leaving` and `returning`
    // both read 599 and 639 with the resume disabled — so a case that checked one condition
    // proved nothing, which is how the first draft of this passed against the unfixed tree.
    const differing = readings.filter((reading) => {
      const [, live, replayed] = /live (\S+), replayed (\S+)$/.exec(reading) ?? [];
      return live !== replayed;
    });
    expect(differing, `a replayed run reached its next forecast on a cadence the live run did not:\n${readings.join('\n')}`).toEqual([]);
  }, 600_000);
});
