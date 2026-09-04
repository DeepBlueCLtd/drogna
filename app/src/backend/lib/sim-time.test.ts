import { describe, expect, it } from 'vitest';
import { formatMicros, isoPlusSeconds, parseEpochMicros, simTimeAtTick } from './sim-time.js';

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
  it('adds seconds at the precision the seam uses, below a whole tick (feature 125)', () => {
    // The whole reason `isoPlusSeconds` exists as one shared function is that the three
    // hand-written copies it replaced disagreed below the second — one truncated to whole
    // seconds, two kept milliseconds — and they agreed only because every simulated instant
    // on disk lands on a whole second at `tick_interval_us: 1000000`. That is the regime the
    // rest of the suite exercises, so the property the consolidation claims to establish was
    // the one property nothing checked.
    const epoch = parseEpochMicros('2026-01-01T00:00:00.000000Z');
    const quarterSecondTicks = simTimeAtTick(epoch, 250_000, 5); // 1.25 s in
    expect(quarterSecondTicks).toBe('2026-01-01T00:00:01.250000Z');
    // Advancing by whole seconds must keep the sub-second part, not round it away.
    expect(isoPlusSeconds(quarterSecondTicks, 3)).toBe('2026-01-01T00:00:04.250000Z');
    // And it agrees with the clock's own arithmetic over the same span.
    expect(isoPlusSeconds(quarterSecondTicks, 2)).toBe(simTimeAtTick(epoch, 250_000, 5 + 8));
    // Microsecond precision survives a round trip through the parser.
    expect(isoPlusSeconds('2026-01-01T00:00:00.000001Z', 1)).toBe('2026-01-01T00:00:01.000001Z');
  });
});
