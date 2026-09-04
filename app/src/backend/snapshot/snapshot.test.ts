/**
 * Feature 120, ADR-0041: the committed seed-data artefacts, and the source that
 * republishes them.
 *
 * The claim this file has to hold up is narrow and load-bearing: a snapshot is not a
 * fixture, because what it contains is what the components would author and because it
 * arrives through the same guarded path a live publication arrives through. Both halves
 * are checked here against the artefacts as shipped, not against something built in the
 * test — a round trip over bytes this file made itself would prove the codec self-
 * consistent and prove nothing at all about what is committed.
 *
 * Watched failing, before any of it was trusted (CLAUDE.md, lesson 2):
 *  - one byte of a field flipped after decoding: the coverage store refuses it by digest,
 *    the source counts the refusal, the store's holdings are untouched, and the run opens
 *    with the ocean missing rather than with a corrupted one presented as sound;
 *  - a header claiming another condition, another seed, another run, and another
 *    generator configuration: each refused at construction, by name, before the source
 *    subscribes to anything;
 *  - `snapshot_eras` emptied on every condition: `check-snapshot-drift` throws rather
 *    than passing over nothing, and the four artefacts are reported unclaimed.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun, ConfigStartConditionsCondition } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { Broker } from '../broker/broker.js';
import { createInBrowserTransport } from '../broker/transport-adapter.js';
import { CoverageStore } from '../coverage-store/store.js';
import { Router } from '../runtime/router.js';
import { deriveRunId } from '../runtime/manifest.js';
import { configDigest } from '../lib/sha256.js';
import { decodeSnapshot, encodeSnapshot, SNAPSHOT_FORMAT } from './codec.js';
import { SnapshotSource } from './source.js';

const config = runConfigDocument as ConfigRun;
const validator = createSeamValidator();
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const withArtefacts = config.start_conditions.conditions.filter(
  (condition) => (condition.snapshot_eras ?? []).length > 0,
);

function artefactBytes(condition: ConfigStartConditionsCondition): Uint8Array {
  return new Uint8Array(
    readFileSync(
      join(APP, 'public', 'snapshots', `${condition.id}${config.snapshot_source.artefacts.path_suffix}`),
    ),
  );
}

function expectationFor(condition: ConfigStartConditionsCondition) {
  return {
    runId: deriveRunId(config.scenario, condition.id, condition.root_seed),
    rootSeed: condition.root_seed,
    startCondition: condition.id,
    generatorDigest: configDigest(config.env_generator),
  };
}

/** A store with a live client on a real broker: the guarded path, not a stub. */
function freshStore(runId: string) {
  const broker = new Broker(config.broker);
  const transport = createInBrowserTransport(broker);
  const store = new CoverageStore(
    config.coverage_store,
    transport.connect(config.coverage_store.id, config.coverage_store.id),
    runId,
    new Router(),
  );
  return { broker, transport, store };
}

/**
 * How many of an artefact's own holdings a restart cannot write back, read off the artefact
 * rather than typed in or taken from the store. Only two eras carry a pointer, and a
 * publication is declined exactly when its era's pointer already names a *different* holding
 * published at a *later* tick — so within an era, everything behind that era's last tick.
 *
 * `leaving` yields zero by this rule and by the store's, because its one now-cast and its one
 * forecast pair are the last of their eras; a bare `> 0` would have had to exempt it, and an
 * exemption is where a number nobody can derive goes to hide.
 */
function expectedSuperseded(holdings: { descriptor: { era: string; published_at: { tick: number } } }[]): number {
  const POINTED = ['nowcast', 'departure', 'instance'];
  let count = 0;
  for (const era of POINTED) {
    const ticks = holdings.filter((h) => h.descriptor.era === era).map((h) => h.descriptor.published_at.tick);
    if (ticks.length === 0) continue;
    const last = Math.max(...ticks);
    count += ticks.filter((tick) => tick < last).length;
  }
  return count;
}

describe('the committed seed-data artefacts (feature 120)', () => {
  it('every condition that declares eras has an artefact, and it validates against its master', async () => {
    expect(withArtefacts.length).toBeGreaterThan(0);
    for (const condition of withArtefacts) {
      const { header, holdings } = await decodeSnapshot(artefactBytes(condition));
      expect(validator.validate('snapshot', header).refusals, condition.id).toEqual([]);
      expect(header.format).toBe(SNAPSHOT_FORMAT);
      expect(header.start_condition).toBe(condition.id);
      expect(header.root_seed).toBe(condition.root_seed);
      expect(holdings.length).toBe(header.holdings.length);
      // It carries the eras the condition declares, and no others: an artefact holding
      // an era nobody held back would republish beside the component still authoring it.
      expect([...new Set(holdings.map((h) => h.descriptor.era))].sort()).toEqual(
        [...(condition.snapshot_eras ?? [])].sort(),
      );
    }
  });

  it('carries bytes that answer to their own descriptors, at their own instants', async () => {
    for (const condition of withArtefacts) {
      const { holdings } = await decodeSnapshot(artefactBytes(condition));
      for (const holding of holdings) {
        expect(holding.bytes.byteLength, holding.descriptor.holding_id).toBe(
          holding.descriptor.field.byte_length,
        );
        expect(holding.descriptor.run_id).toBe(expectationFor(condition).runId);
      }
      // Publication order is ascending in the instant each records. A twenty-year
      // archive and a now-cast published in the wrong order would move the era pointers
      // in the wrong order too.
      const ticks = holdings.map((holding) => holding.descriptor.published_at.tick);
      expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
    }
  });

  it('the source republishes through the store, which checks the digests as it always does', async () => {
    for (const condition of withArtefacts) {
      const expectation = expectationFor(condition);
      const { transport, store } = freshStore(expectation.runId);
      const contents = await decodeSnapshot(artefactBytes(condition));
      const source = new SnapshotSource(
        config.snapshot_source,
        transport.connect(config.snapshot_source.id, config.snapshot_source.id),
        store,
        expectation,
        contents,
      );
      source.start();
      // Nothing is published until time exists: the source releases on the clock, and a
      // holding dated at an instant that has not happened has not been published yet.
      expect(store.holdings()).toEqual([]);
      const last = contents.holdings[contents.holdings.length - 1].descriptor.published_at.tick;
      const clock = transport.connect(config.clock.id, config.clock.id);
      clock.publish(config.clock.topics.clock, { run_id: expectation.runId, tick: last, sim_time: 'x', mode: 'lockstep', rate: 0 });
      expect(source.refused, condition.id).toEqual([]);
      expect(source.outstanding()).toBe(0);
      expect(store.holdings().map((h) => h.holding_id)).toEqual(
        contents.holdings.map((h) => h.descriptor.holding_id),
      );
      source.stop();
    }
  });

  it('a restart reports what the store already held newer, and no refusal it did not make', async () => {
    vi.useFakeTimers();
    // The restart path, which is a reader's path: the snapshot-source node in the Operator
    // tab has a restart verb, and the Intro copy this feature rewrote sends a reader to that
    // node to check whether the run took the artefact. A restarted source is a fresh instance
    // holding the whole artefact again, so it republishes every holding over a store whose
    // era pointers have already reached the artefact's own last one. Each republication is
    // byte-identical and accepted; each earlier one would rewind a pointer, and the store
    // declines to write it.
    //
    // Watched failing twice, which is why the assertions are shaped this way. The first
    // version of the source counted a superseded publication as replayed and drew
    // '26 of 26 holding(s) replayed' over holdings the store had not written — so the count
    // is asserted. The correction that only excluded it from `published` pushed it into the
    // refusals instead, so the same restart reported '9 refused by the store' with no reason
    // against a store that refused nothing, and turned the node's status to `degraded` — so
    // the refusals, the status and the detail line are asserted too, and the second fault
    // passes the first assertion.
    for (const condition of withArtefacts) {
      const expectation = expectationFor(condition);
      const { transport, store } = freshStore(expectation.runId);
      const clock = transport.connect(config.clock.id, config.clock.id);
      const beats: { status: string; detail: string; figures: { key: string; value: number }[] }[] = [];
      // Read as the Operator plane reads it — through the broker, under the role the rules
      // grant `ctl/heartbeat` to — rather than by reaching into the component.
      transport
        .connect('operator-observer', config.operator.id)
        .subscribe(config.snapshot_source.heartbeat.topic, (message) => {
          const payload = message.payload as {
            component: string;
            status: string;
            detail: string;
            figures: { key: string; value: number }[];
          };
          if (payload.component === config.snapshot_source.id) beats.push(payload);
        });

      const contents = await decodeSnapshot(artefactBytes(condition));
      const held = contents.holdings.length;
      const last = Math.max(...contents.holdings.map((holding) => holding.descriptor.published_at.tick));
      const sample = { run_id: expectation.runId, tick: last, sim_time: 'x', mode: 'lockstep', rate: 0 };
      const first = new SnapshotSource(
        config.snapshot_source,
        transport.connect(config.snapshot_source.id, config.snapshot_source.id),
        store,
        expectation,
        contents,
      );
      first.start();
      clock.publish(config.clock.topics.clock, sample);
      first.stop();
      const inventoryBefore = store.holdings().map((holding) => holding.holding_id);

      // The restart. A second instance on the same store, exactly as `ComponentControl`
      // constructs one.
      const restarted = new SnapshotSource(
        config.snapshot_source,
        transport.connect(config.snapshot_source.id, config.snapshot_source.id),
        store,
        expectation,
        await decodeSnapshot(artefactBytes(condition)),
      );
      restarted.start();
      clock.publish(config.clock.topics.clock, sample);
      // The face is read at the next beat, which is what the Operator plane reads: the
      // emitter's cadence is host time by ADR-0006, so the timer is advanced rather than
      // waited on, and rather than the component being asked directly for its counters.
      beats.length = 0;
      vi.advanceTimersByTime(config.snapshot_source.heartbeat.interval_seconds * 1000);

      expect(
        restarted.refused,
        `${condition.id}: the store refused nothing on the restart; every holding it declined ` +
          'to write was one it already held something newer than',
      ).toEqual([]);
      const beat = beats.at(-1);
      expect(beat, `${condition.id}: the node published no heartbeat after the restart`).toBeDefined();
      expect(beat?.status, `${condition.id}: ${beat?.detail}`).toBe('ok');
      expect(beat?.detail, condition.id).not.toContain('refused by the store');
      const replayed = beat?.figures.find((figure) => figure.key === 'replayed')?.value ?? -1;
      const superseded = beat?.figures.find((figure) => figure.key === 'superseded')?.value ?? 0;
      expect(restarted.outstanding(), `${condition.id}: the restart left holdings unreleased`).toBe(0);
      expect(
        replayed + superseded,
        `${condition.id}: the two counters do not account for every holding in the artefact`,
      ).toBe(held);
      expect(superseded, `${condition.id}`).toBe(expectedSuperseded(contents.holdings));
      expect(
        store.holdings().map((holding) => holding.holding_id),
        `${condition.id}: the restart changed the store's inventory`,
      ).toEqual(inventoryBefore);
      restarted.stop();
    }
    vi.useRealTimers();
  });

  it('a corrupted field is refused by the store, counted, and never lands', async () => {
    const condition = withArtefacts[0];
    const expectation = expectationFor(condition);
    const { transport, store } = freshStore(expectation.runId);
    const contents = await decodeSnapshot(artefactBytes(condition));
    // One byte, in the middle of the first field. This is the fault the digest check
    // exists for and the reason the codec does not check digests itself: the guard is
    // the store's, applied to an artefact exactly as it is applied to a generator.
    contents.holdings[0].bytes[contents.holdings[0].bytes.byteLength >> 1] ^= 0xff;
    const source = new SnapshotSource(
      config.snapshot_source,
      transport.connect(config.snapshot_source.id, config.snapshot_source.id),
      store,
      expectation,
      contents,
    );
    source.start();
    const clock = transport.connect(config.clock.id, config.clock.id);
    clock.publish(config.clock.topics.clock, { run_id: expectation.runId, tick: 1_000_000, sim_time: 'x', mode: 'lockstep', rate: 0 });
    expect(source.refused.length).toBe(1);
    expect(source.refused[0]).toContain('does not match the digest');
    expect(store.holdings().map((h) => h.holding_id)).not.toContain(
      contents.holdings[0].descriptor.holding_id,
    );
    source.stop();
  });

  it.each([
    ['start_condition', { start_condition: 'alongside' }, /start condition 'alongside'/],
    ['root_seed', { root_seed: 999 }, /built from seed 999/],
    ['run_id', { run_id: 'someone-elses-run' }, /name run 'someone-elses-run'/],
    ['config_digest', { config_digest: `sha256:${'0'.repeat(64)}` }, /environment-generator configuration/],
  ])('refuses an artefact whose %s does not describe this run, by name', async (_key, patch, message) => {
    const condition = withArtefacts[0];
    const expectation = expectationFor(condition);
    const { transport, store } = freshStore(expectation.runId);
    const contents = await decodeSnapshot(artefactBytes(condition));
    const spoiled = { ...contents, header: { ...contents.header, ...patch } };
    expect(
      () =>
        new SnapshotSource(
          config.snapshot_source,
          transport.connect(config.snapshot_source.id, config.snapshot_source.id),
          store,
          expectation,
          spoiled,
        ),
    ).toThrow(message);
  });

  it.each([
    // The forecasts, not just the ocean: since feature 125 the artefact carries all four eras,
    // so a run without one computes the analyses and the forecast instances too. The tour and
    // the Intro panel send the reader to this node for exactly that statement.
    ['no artefact was expected', undefined, /no committed artefact.*forecasts were computed live/, 'ok'],
    [
      'one was expected and could not be fetched',
      './snapshots/arriving.snapshot answered 404',
      /could not be used.*404.*/,
      'degraded',
    ],
  ])('says so in its own heartbeat when %s', (_case, unavailable, expected, status) => {
    const condition = withArtefacts[0];
    const expectation = expectationFor(condition);
    const { transport, store } = freshStore(expectation.runId);
    // Subscribed before the source starts, because `start()` emits at once: a reader
    // that connected afterwards would be asserting on the second beat, two seconds of
    // host time later, and this is exactly the fact a reader needs on the first frame.
    const heard: { detail?: string; status?: string }[] = [];
    transport
      .connect('reader', 'shell')
      .subscribe(config.snapshot_source.heartbeat.topic, (message) =>
        heard.push(message.payload as { detail?: string; status?: string }),
      );
    const source = new SnapshotSource(
      config.snapshot_source,
      transport.connect(config.snapshot_source.id, config.snapshot_source.id),
      store,
      expectation,
      undefined,
      unavailable,
    );
    source.start();
    source.stop();
    expect(heard.length).toBeGreaterThan(0);
    expect(heard[0].detail).toMatch(expected);
    // Degraded, not ok: a run that expected an artefact and is authoring live is not a
    // run in the state its deployment intended, and the Operator tab should show it.
    expect(heard[0].status).toBe(status);
  });

  it('round-trips: what the codec writes is what it reads, over the shipped artefacts', async () => {
    for (const condition of withArtefacts) {
      const original = await decodeSnapshot(artefactBytes(condition));
      const rewritten = await encodeSnapshot(
        {
          format: SNAPSHOT_FORMAT,
          start_condition: original.header.start_condition,
          run_id: original.header.run_id,
          root_seed: original.header.root_seed,
          config_digest: original.header.config_digest,
          code_revision: original.header.code_revision,
        },
        original.holdings.map((holding) => ({ descriptor: holding.descriptor, bytes: holding.bytes })),
      );
      const again = await decodeSnapshot(rewritten);
      expect(again.holdings.length).toBe(original.holdings.length);
      for (const [index, holding] of again.holdings.entries()) {
        expect(holding.descriptor).toEqual(original.holdings[index].descriptor);
        // A typed-array walk, not `expect([...a]).toEqual([...b])`. The spread built two JS
        // number arrays per holding and handed them to a deep-equality that reports every
        // element; over the four artefacts' 54.7 MB that took 36.6 s of this file's 60 s
        // budget on an idle machine and timed out at 65.9 s under load — a CI flake that
        // arrived with the forecast eras, the artefacts having grown from 9.6 MB decoded.
        // The same comparison this way is 2.8 s, and it still names the first byte that
        // differs, which is all a failure needs to say.
        const mine = holding.bytes;
        const theirs = original.holdings[index].bytes;
        expect(mine.byteLength).toBe(theirs.byteLength);
        let differsAt = -1;
        for (let i = 0; i < mine.length && differsAt < 0; i += 1) if (mine[i] !== theirs[i]) differsAt = i;
        expect(
          differsAt,
          `'${holding.descriptor.holding_id}' differs at byte ${differsAt}: wrote ${theirs[differsAt]}, read back ${mine[differsAt]}`,
        ).toBe(-1);
      }
    }
  });

  it('refuses a truncated artefact rather than publishing a short ocean', async () => {
    const bytes = artefactBytes(withArtefacts[0]);
    // Decompression of a cut gzip stream is itself the refusal here, which is the point:
    // there is no reading of a truncated artefact that yields fewer, whole holdings.
    await expect(decodeSnapshot(bytes.subarray(0, bytes.byteLength >> 1))).rejects.toThrow();
  });
});
