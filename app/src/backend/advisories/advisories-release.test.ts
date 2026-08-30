/**
 * Feature 108, continued: that the advisories replay identically, and what the
 * release-scoring comparison can and cannot conclude (#57). Split from
 * advisories.test.ts for the reason advisories.fixture.ts records.
 */
import { describe, expect, it } from 'vitest';
import { measurementSpanMetres, releasedProduct, scoreUpdatedRegion } from '../offload/leakage.js';
import { buildBackend, drive, driveUntilRuns, lockstepConfig, options, validator } from './advisories.fixture.js';

describe('shore advisories, replayed and scored (feature 108)', { timeout: 120_000 }, () => {
  it('replays identically: one seed, the same advisories and the same staged bundles, twice', () => {
    const config = lockstepConfig();
    const first = buildBackend(config, options, validator);
    const firstRecord = drive(first, config, 2000);
    const firstStaged = JSON.stringify(first.offload.staged());
    first.stop();
    const second = buildBackend(config, options, validator);
    const secondRecord = drive(second, config, 2000);
    const secondStaged = JSON.stringify(second.offload.staged());
    second.stop();
    expect(JSON.stringify(secondRecord.advisories)).toBe(JSON.stringify(firstRecord.advisories));
    expect(secondStaged).toBe(firstStaged);
  });

  /**
   * The updated-region leakage comparison, pointed at this harness's own releases
   * (issue #57, T708). The comparison machinery, and the case where a known leak
   * must be caught, live in
   * `offload/leakage.test.ts`; what is held here is why it cannot yet return a
   * conclusive verdict about *these* releases, measured rather than asserted — so
   * that the day the harness changes enough for a verdict to be possible, this test
   * fails and somebody has to look at it.
   */
  it('scores its own successive releases, and names why the comparison is inconclusive (#57)', () => {
    // The scoring run the open question proposed: the same kernel with its per-cell
    // noise suppressed, which is a configured deviation and needs no second kernel.
    const config = lockstepConfig();
    config.model_runner.noise_std = { temperature: 0, salinity: 0 };
    const runtime = buildBackend(config, options, validator);
    const record = driveUntilRuns(runtime, config, 2, 12000);
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

    // Reason two, which only shows once the first is out of the way: with the noise
    // suppressed, two successive releases initialised from the same now-cast are
    // identical value for value, so there is no mask at all. Scored against a
    // geometry that does span the radius, the same pair reports exactly that.
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
    expect(scoreUpdatedRegion(before, after, spanning)).toMatchObject({
      conclusive: false,
      reason: 'empty-mask',
    });

    // And with the noise left on — the harness as it ships — the mask is the whole
    // domain, which is the reason the open question recorded. It scores at chance
    // and is called clear, which is a pass earned by noise rather than by
    // mitigation: the third reason this is not yet a gate.
    const noisyConfig = lockstepConfig();
    const noisy = buildBackend(noisyConfig, options, validator);
    const noisyRecord = driveUntilRuns(noisy, noisyConfig, 2, 12000);
    // Asserted rather than assumed: this branch read published[1] without ever
    // checking there was one, so when the loop began breaching less it failed with an
    // undefined read instead of saying what it had wanted.
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
