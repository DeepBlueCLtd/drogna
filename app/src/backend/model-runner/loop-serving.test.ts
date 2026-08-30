/**
 * Feature 105, continued: what the loop serves once it has turned, and that it turns
 * the same way twice. Split from loop.test.ts for the reason loop.fixture.ts records.
 */
import { describe, expect, it } from 'vitest';
import { buildBackend, drive, lockstepConfig, options, validator } from './loop.fixture.js';

describe('the forecast loop, served and replayed (feature 105)', { timeout: 120_000 }, () => {
  it('serves each instance through EDR by convention, without configuration edits (FR-29)', async () => {
    const config = lockstepConfig();
    const runtime = buildBackend(config, options, validator);
    const record = drive(runtime, config, 2000);
    expect(record.published.length).toBeGreaterThanOrEqual(1);
    const response = await runtime.httpBackend.handle({ method: 'GET', path: '/api/edr/collections', body: '' });
    const ids = (JSON.parse(response.body) as { collections: { id: string }[] }).collections.map((c) => c.id);
    expect(ids).toContain(record.published[0].collections.forecast);
    expect(ids).toContain(record.published[0].collections.uncertainty);
    runtime.stop();
  });

  it('replays byte-identically: one seed, one loop, twice (AT-04 grows with the loop)', () => {
    const config = lockstepConfig();
    const first = buildBackend(config, options, validator);
    const firstRecord = drive(first, config, 2500);
    const firstDigests = first.store.holdings().map((h) => `${h.holding_id}:${h.field.sha256}`).sort();
    first.stop();
    const second = buildBackend(config, options, validator);
    const secondRecord = drive(second, config, 2500);
    const secondDigests = second.store.holdings().map((h) => `${h.holding_id}:${h.field.sha256}`).sort();
    second.stop();
    expect(secondDigests).toEqual(firstDigests);
    expect(JSON.stringify(secondRecord)).toBe(JSON.stringify(firstRecord));
  });
});
