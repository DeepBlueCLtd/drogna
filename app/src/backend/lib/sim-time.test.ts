import { describe, expect, it } from 'vitest';
import { formatMicros, parseEpochMicros, simTimeAtTick } from './sim-time.js';

describe('sim time', () => {
  it('round-trips the epoch at microsecond precision', () => {
    const epoch = '2026-01-01T00:00:00.000123Z';
    expect(formatMicros(parseEpochMicros(epoch))).toBe(epoch);
  });

  it('computes tick times from epoch and interval alone', () => {
    const epoch = parseEpochMicros('2026-01-01T00:00:00.000000Z');
    expect(simTimeAtTick(epoch, 1_000_000, 0)).toBe('2026-01-01T00:00:00.000000Z');
    expect(simTimeAtTick(epoch, 1_000_000, 90)).toBe('2026-01-01T00:01:30.000000Z');
    expect(simTimeAtTick(epoch, 250_000, 3)).toBe('2026-01-01T00:00:00.750000Z');
  });

  it('carries no floating-point error across large tick counts', () => {
    const epoch = parseEpochMicros('2026-01-01T00:00:00.000000Z');
    // A third of a millisecond, three million times: exact in BigInt, wrong in float.
    expect(simTimeAtTick(epoch, 333, 3_000_000)).toBe('2026-01-01T00:16:39.000000Z');
  });

  it('refuses an epoch that is not ISO-8601 UTC', () => {
    expect(() => parseEpochMicros('01/01/2026')).toThrow(/not ISO-8601/);
    expect(() => parseEpochMicros('2026-01-01T00:00:00')).toThrow(/not ISO-8601/);
  });
});
