/**
 * Feature 108: shore advisories, the offload packager, and the Features face.
 * Nothing mocked: the source authors from its seed stream on the real clock, the
 * store refuses at its own seam, the packager stages from genuine published runs,
 * and every document is validated against its master as it crosses.
 */
import { describe, expect, it } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import { schemaDocuments } from '../../generated/schema-documents.js';
import type {
  Advisory,
  ConfigRun,
  FeaturesResponseCollections,
  FeaturesResponseFeatureCollection,
  OffloadTelemetry,
  RunPublished,
} from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { driveTicks, driveUntil } from '../test-support/drive.js';
import { buildBackend, type BackendRuntime } from '../runtime/runtime.js';
import {
  measurementSpanMetres,
  releasedProduct,
  scoreUpdatedRegion,
} from '../offload/leakage.js';

const validator = createSeamValidator();

function lockstepConfig(): ConfigRun {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  return config;
}

const options = { rootSeed: 4242, startCondition: 'loitering', revision: 'test', dirty: false };

interface AdvisoryRecord {
  advisories: Advisory[];
  published: RunPublished[];
  offloadReports: OffloadTelemetry[];
}

async function drive(runtime: BackendRuntime, config: ConfigRun, ticks: number): Promise<AdvisoryRecord> {
  const shell = runtime.transport.connect(`shell-${Math.random()}`, 'shell');
  const record: AdvisoryRecord = { advisories: [], published: [], offloadReports: [] };
  shell.subscribe(config.advisory_source.topics.advisory, (message) => {
    expect(validator.validate('advisory', message.payload).refusals).toEqual([]);
    record.advisories.push(message.payload as Advisory);
  });
  shell.subscribe(config.model_runner.topics.run_published, (message) => {
    record.published.push(message.payload as RunPublished);
  });
  shell.subscribe(config.offload.topics.offload, (message) => {
    expect(validator.validate('offload-telemetry', message.payload).refusals).toEqual([]);
    record.offloadReports.push(message.payload as OffloadTelemetry);
  });
  await driveTicks(runtime.clock, ticks);
  return record;
}

/** Every string-typed schema node reachable from the given node. */
function stringNodes(node: unknown, path: string, found: { path: string; node: Record<string, unknown> }[]): void {
  if (typeof node !== 'object' || node === null) return;
  const record = node as Record<string, unknown>;
  if (record.type === 'string') found.push({ path, node: record });
  for (const [key, value] of Object.entries(record)) {
    if (key === 'description' || key === 'title' || key === '$schema' || key === '$id') continue;
    stringNodes(value, `${path}/${key}`, found);
  }
}


/**
 * Turn the loop until it has published `wanted` runs, or give up at `limit` ticks.
 *
 * A fixed tick count used to be enough because the loop breached often. Feature 116 put
 * an analysis in front of the runner, so the forecast is corrected by what the platform
 * measured and the residual stays under the monitor's threshold far longer: over 3700
 * ticks the shipped configuration now publishes one run where it used to publish two.
 * Waiting for the runs the test actually needs says what it needs, rather than encoding
 * how excitable the sea happened to be.
 */
async function driveUntilRuns(
  runtime: BackendRuntime,
  config: ConfigRun,
  wanted: number,
  limit: number,
): Promise<AdvisoryRecord> {
  const record: AdvisoryRecord = { advisories: [], published: [], offloadReports: [] };
  const shell = runtime.transport.connect(`until-${Math.random()}`, 'shell');
  shell.subscribe(config.advisory_source.topics.advisory, (message) => {
    record.advisories.push(message.payload as Advisory);
  });
  shell.subscribe(config.model_runner.topics.run_published, (message) => {
    record.published.push(message.payload as RunPublished);
  });
  shell.subscribe(config.offload.topics.offload, (message) => {
    record.offloadReports.push(message.payload as OffloadTelemetry);
  });
  await driveUntil(runtime.clock, () => record.published.length >= wanted, limit);
  return record;
}

describe('shore advisories and the boundary (feature 108)', { timeout: 120_000 }, () => {
  it('the advisory master admits no free text: every string is an enum, a const, or a bounded pattern', () => {
    const found: { path: string; node: Record<string, unknown> }[] = [];
    stringNodes(schemaDocuments['advisory'], '', found);
    expect(found.length).toBeGreaterThanOrEqual(5);
    for (const { path, node } of found) {
      const constrained = 'enum' in node || 'const' in node || 'pattern' in node;
      expect(constrained, `${path} admits free text — no advisory field may name what the harness did not place`).toBe(true);
    }
    // The property is structural, so a free-text field planted in a copy is caught.
    const loosened = JSON.parse(JSON.stringify(schemaDocuments['advisory'])) as {
      properties: { advisory_id: Record<string, unknown> };
    };
    delete loosened.properties.advisory_id.pattern;
    const loosenedFound: { path: string; node: Record<string, unknown> }[] = [];
    stringNodes(loosened, '', loosenedFound);
    expect(loosenedFound.some(({ node }) => !('enum' in node || 'const' in node || 'pattern' in node))).toBe(true);
  });

  it('authors on cadence, stores append-only, absorbs redelivery, refuses oversize naming the limit, and serves it all as features', async () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);

    // Present and stating empty (before any advisory exists): an answer, not an error.
    const empty = await runtime.httpBackend.handle({
      method: 'GET',
      path: `${config.query.http.features_prefix}/collections/advisories/items`,
      body: '',
    });
    expect(empty.status).toBe(200);
    const emptyPage = JSON.parse(empty.body) as FeaturesResponseFeatureCollection;
    expect(validator.validate('features-response#feature_collection', emptyPage).refusals).toEqual([]);
    expect(emptyPage.numberReturned).toBe(0);

    const record = await drive(runtime, config, 3700);
    // Snapshot what the source authored, before this test redelivers copies below.
    const authored = [...record.advisories];

    // Authored on the configured cadence, deterministically identified.
    expect(authored.length).toBe(Math.floor(3700 / config.advisory_source.cadence_ticks));
    expect(authored.map((a) => a.tick)).toEqual(
      authored.map((_, i) => (i + 1) * config.advisory_source.cadence_ticks),
    );
    expect(authored[0].advisory_id).toBe(`adv-${config.advisory_source.id}-0`);

    // The store holds them all, append-only, in sequence order.
    expect(runtime.advisoryStore.count()).toBe(authored.length);
    expect(runtime.advisoryStore.all().map((a) => a.sequence)).toEqual(authored.map((a) => a.sequence));

    // Redelivery is absorbed on the deterministic id, not appended twice.
    const redeliverer = runtime.transport.connect('test-redeliverer', 'advisory-source');
    redeliverer.publish(config.advisory_source.topics.advisory, authored[0]);
    expect(runtime.advisoryStore.count()).toBe(authored.length);
    expect(runtime.advisoryStore.absorbed).toBe(1);

    // The size ceiling refuses with the limit named: advice travels light.
    const bloated = {
      ...authored[0],
      advisory_id: `adv-${'a'.repeat(3000)}-0`,
    };
    redeliverer.publish(config.advisory_source.topics.advisory, bloated);
    expect(runtime.advisoryStore.refused).toBe(1);
    expect(runtime.advisoryStore.recentRefusals[0]).toContain(`${config.advisory_store.size_ceiling_bytes} bytes`);
    expect(runtime.advisoryStore.count()).toBe(authored.length);

    // …and 'light' is measured, not asserted: the largest advisory on the wire is
    // smaller than the smallest gridded holding the coverage store released.
    const largestAdvisory = Math.max(
      ...authored.map((a) => new TextEncoder().encode(JSON.stringify(a)).byteLength),
    );
    const smallestHolding = Math.min(...runtime.store.holdings().map((h) => h.field.byte_length));
    expect(largestAdvisory).toBeLessThan(smallestHolding);
    expect(largestAdvisory).toBeLessThanOrEqual(config.advisory_store.size_ceiling_bytes);

    // The Features face serves them through the release gate (E8: the prefix is allowed).
    const collections = await runtime.httpBackend.handle({
      method: 'GET',
      path: `${config.query.http.features_prefix}/collections`,
      body: '',
    });
    expect(collections.status).toBe(200);
    const collectionsBody = JSON.parse(collections.body) as FeaturesResponseCollections;
    expect(validator.validate('features-response#collections', collectionsBody).refusals).toEqual([]);
    expect(collectionsBody.collections.map((c) => c.id).sort()).toEqual(['advisories', 'reference']);

    const items = await runtime.httpBackend.handle({
      method: 'GET',
      path: `${config.query.http.features_prefix}/collections/advisories/items`,
      body: '',
    });
    const page = JSON.parse(items.body) as FeaturesResponseFeatureCollection;
    expect(validator.validate('features-response#feature_collection', page).refusals).toEqual([]);
    expect(page.numberReturned).toBe(authored.length);
    // Geometry carries the region; properties carry the advisory minus it.
    expect(page.features[0].id).toBe(authored[0].advisory_id);
    expect(page.features[0].properties).not.toHaveProperty('region');
    expect(page.features[0].properties.kind).toBe(authored[0].kind);

    // The reference geometry deferred from 104 is served the same way.
    const reference = await runtime.httpBackend.handle({
      method: 'GET',
      path: `${config.query.http.features_prefix}/collections/reference/items`,
      body: '',
    });
    const referencePage = JSON.parse(reference.body) as FeaturesResponseFeatureCollection;
    expect(validator.validate('features-response#feature_collection', referencePage).refusals).toEqual([]);
    expect(referencePage.features.map((f) => f.id).sort()).toEqual(
      config.feature_store.features.map((feature) => feature.feature_id).sort(),
    );

    // Refusals name the thing refused (E9): the filter option, the resource.
    const filtered = await runtime.httpBackend.handle({
      method: 'GET',
      path: `${config.query.http.features_prefix}/collections/advisories/items?bbox=-14,44,-8,48`,
      body: '',
    });
    expect(filtered.status).toBe(501);
    expect((JSON.parse(filtered.body) as { refused: string }).refused).toContain("'bbox'");
    const single = await runtime.httpBackend.handle({
      method: 'GET',
      path: `${config.query.http.features_prefix}/collections/advisories/items/adv-x-0`,
      body: '',
    });
    expect(single.status).toBe(501);

    runtime.stop();
  });

  it('stages a bundle per published run, the run-manifest sibling beside it and never inside it (E11)', async () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    const record = await drive(runtime, config, 3700);
    expect(record.published.length).toBeGreaterThanOrEqual(1);

    const staged = runtime.offload.staged();
    expect(staged.length).toBe(record.published.length);
    for (const [index, bundle] of staged.entries()) {
      // The bundle manifest is master-valid, and its one member is the released
      // forecast field — digest and length agreeing with what the store holds.
      expect(validator.validate('bundle-manifest', bundle.manifest).refusals).toEqual([]);
      const holding = runtime.store.holding(record.published[index].collections.forecast);
      expect(bundle.manifest.members).toHaveLength(1);
      expect(bundle.manifest.members[0].digest).toBe(holding?.descriptor.field.sha256);
      expect(bundle.manifest.members[0].byte_length).toBe(holding?.descriptor.field.byte_length);
      expect(bundle.manifest.window.index).toBe(index);

      // The sibling is a master-valid run manifest CARRYING the geometry…
      expect(validator.validate('run-manifest', bundle.sibling).refusals).toEqual([]);
      const geometry = bundle.sibling.measurement_geometry;
      expect(geometry).toBeDefined();
      // …scored on the radius it was released under (E11: producer parity by test).
      expect(geometry?.identification_radius_m).toBe(config.offload.identification_radius_m);
      expect(geometry?.measurements.length).toBeGreaterThanOrEqual(1);

      // …and the geometry stays OUTSIDE the bundle: the bundle manifest has no
      // geometry field at all, and its master refuses one planted there.
      expect(JSON.stringify(bundle.manifest)).not.toContain('measurement');
      const planted = { ...bundle.manifest, measurement_geometry: geometry };
      expect(validator.validate('bundle-manifest', planted).ok).toBe(false);
    }

    // Two packaging passes over one run produce the same identifiers: the bundle
    // id is derived, never drawn.
    expect(new Set(staged.map((b) => b.manifest.run_reference)).size).toBe(1);
    expect(staged[0].manifest.run_manifest_digest).toMatch(/^sha256:[0-9a-f]{64}$/);

    // The announcement-only ledger is honest: everything staged, nothing beyond.
    const lastReport = record.offloadReports.at(-1);
    expect(lastReport?.bundles.staged).toBe(staged.length);
    expect(lastReport?.bundles.transferred).toBe(0);
    expect(lastReport?.bundles.evicted).toBe(0);
    expect(lastReport?.staging.producing).toBe(true);
    expect(lastReport?.staging.bytes).toBe(staged.reduce((sum, b) => sum + b.fieldByteLength, 0));

    runtime.stop();
  });

  // AT-04: byte-identity
  it('replays identically: one seed, the same advisories and the same staged bundles, twice', async () => {
    const config = lockstepConfig();
    const first = buildBackend(config, options, validator);
    const firstRecord = await drive(first, config, 2000);
    const firstStaged = JSON.stringify(first.offload.staged());
    first.stop();
    const second = buildBackend(config, options, validator);
    const secondRecord = await drive(second, config, 2000);
    const secondStaged = JSON.stringify(second.offload.staged());
    second.stop();
    expect(JSON.stringify(secondRecord.advisories)).toBe(JSON.stringify(firstRecord.advisories));
    expect(secondStaged).toBe(firstStaged);
  });

  /**
   * The updated-region leakage comparison, pointed at this harness's own releases
   * (issue #57, T708). The comparison machinery, and the case where a known leak
   * must be caught, live in
   * `offload/leakage.test.ts`; what is held here is why a verdict about *these* releases
   * still says nothing useful, measured rather than asserted — so that the day the harness
   * changes enough for that to move, this test fails and somebody has to look at it.
   *
   * It did, at feature 123 — twice, in the same branch, in both directions. The second
   * reason (two noise-free releases identical, so no mask at all) became "they differ
   * everywhere, so the mask is the whole domain" when the kernel began propagating a state,
   * and then became identical again when that kernel's lead convention was corrected. The
   * conclusion never moved: a mask that is empty and a mask that covers everything both
   * discriminate nothing. #57 stays open and this stays not a gate.
   */
  it('scores its own successive releases, and names why the comparison is inconclusive (#57)', async () => {
    // The scoring run the open question proposed: the same kernel with its per-cell
    // noise suppressed, which is a configured deviation and needs no second kernel.
    const config = lockstepConfig();
    config.model_runner.noise_std = { temperature: 0, salinity: 0 };
    const runtime = buildBackend(config, options, validator);
    const record = await driveUntilRuns(runtime, config, 2, 12000);
    expect(record.published.length).toBeGreaterThanOrEqual(2);

    const staged = runtime.offload.staged();
    const first = runtime.store.holding(record.published[0].collections.forecast);
    const second = runtime.store.holding(record.published[1].collections.forecast);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) return;
    const geometry = staged[1].sibling.measurement_geometry;
    expect(geometry).toBeDefined();
    if (!geometry) return;

    const before = releasedProduct(first.descriptor.manifest, first.bytes);
    const after = releasedProduct(second.descriptor.manifest, second.bytes);
    const verdict = scoreUpdatedRegion(before, after, geometry);

    // Reason one, and it is not the kernel's: the platform loiters, so every
    // measurement in a release interval sits within one identification radius of
    // every other. The buffer is a single blob, and V1's FR-017 calls that
    // inconclusive — a mask covering a blob says nothing about where in it the
    // sampling happened. The numbers, not the claim, are what is held here.
    const span = measurementSpanMetres(geometry.measurements);
    expect(span).toBeLessThan(geometry.identification_radius_m);
    expect(verdict).toMatchObject({ conclusive: false, reason: 'measurements-within-radius' });

    // Reason two, which only shows once the first is out of the way. **This test fired
    // twice in one branch, for two different reasons, and both are recorded because the
    // second is the more interesting.**
    //
    // It began as: with the per-cell noise suppressed, two successive releases are
    // identical value for value, so there is no mask to score. Introducing a kernel that
    // propagates a state rather than translating a field flipped it — two runs from
    // analyses differing anywhere then diverged everywhere, and the mask became the whole
    // domain, which discriminates nothing for the opposite reason. Then correcting the new
    // kernel's lead convention (step 0 is the state the run initialises from) flipped it
    // back, and the reason is measured rather than assumed: at this configuration the two
    // runs are made from **byte-identical analyses** — `analysis.…run-0` and
    // `analysis.…run-1` carry the same digest, as do their error and provenance fields — so
    // with the model noise off the two forecasts cannot differ.
    //
    // Why the assimilation left the field unchanged across a cycle here is not settled, and
    // this test does not pretend to settle it: it is a property of the zero-noise
    // configuration this test constructs and not of the shipped one, where `analyst.test.ts`
    // holds the analysis to moving the field where a measurement reached. What is held here
    // is what the comparison says and why it says nothing useful, which is what keeps #57
    // open and keeps this from being a gate.
    const spanning = {
      ...geometry,
      measurements: [
        { longitude: -13.5, latitude: 44.5, simulation_seconds: 0 },
        { longitude: -8.5, latitude: 47.5, simulation_seconds: geometry.interval_seconds - 1 },
      ],
    };
    expect(measurementSpanMetres(spanning.measurements)).toBeGreaterThan(
      geometry.identification_radius_m,
    );
    const spanningVerdict = scoreUpdatedRegion(before, after, spanning);
    expect(spanningVerdict).toMatchObject({ conclusive: false, reason: 'empty-mask' });
    // Asserted alongside it, because the reason above is a claim about the two products and
    // this is the evidence for it: the two runs carry the same forecast digest, and the two
    // analyses they were made from carry the same digest too. If a future change makes the
    // analyses differ, this fails here rather than leaving the paragraph above standing as
    // an explanation of something that has stopped being true.
    expect(record.published[1].digests.forecast).toBe(record.published[0].digests.forecast);
    const analysisDigests = runtime.store
      .holdings()
      .filter((holding) => holding.era === 'analysis' && !/-(error|provenance)$/.test(holding.holding_id))
      .map((holding) => holding.field.sha256);
    expect(analysisDigests.length).toBeGreaterThanOrEqual(2);
    expect(new Set(analysisDigests).size).toBe(1);

    // And with the noise left on — the harness as it ships — the mask is the whole
    // domain, which is the reason the open question recorded. It scores at chance
    // and is called clear, which is a pass earned by noise rather than by
    // mitigation: the third reason this is not yet a gate.
    const noisyConfig = lockstepConfig();
    const noisy = buildBackend(noisyConfig, options, validator);
    const noisyRecord = await driveUntilRuns(noisy, noisyConfig, 2, 12000);
    // Asserted rather than assumed: this branch read published[1] without ever checking
    // there was one, so when the loop began breaching less it failed with an undefined
    // read instead of saying what it had wanted.
    expect(noisyRecord.published.length).toBeGreaterThanOrEqual(2);
    const noisyFirst = noisy.store.holding(noisyRecord.published[0].collections.forecast);
    const noisySecond = noisy.store.holding(noisyRecord.published[1].collections.forecast);
    if (noisyFirst && noisySecond) {
      const noisyVerdict = scoreUpdatedRegion(
        releasedProduct(noisyFirst.descriptor.manifest, noisyFirst.bytes),
        releasedProduct(noisySecond.descriptor.manifest, noisySecond.bytes),
        spanning,
      );
      expect(noisyVerdict.conclusive).toBe(true);
      if (noisyVerdict.conclusive) {
        expect(noisyVerdict.leaking).toBe(false);
        expect(noisyVerdict.worst.changedCells).toBe(noisyVerdict.worst.totalCells);
        expect(noisyVerdict.worst.recovery).toBeCloseTo(noisyVerdict.worst.chanceRate, 10);
      }
    }
    noisy.stop();
    runtime.stop();
  });
});
