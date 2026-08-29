/**
 * The display trims sub-second precision from instants; the wire keeps it. A
 * string that is not a microsecond instant passes through untouched, so the
 * helper can sit in front of anything without inventing a format.
 */
import { describe, expect, it } from 'vitest';
import { displayInstant } from './display.js';

describe('displayInstant', () => {
  it('trims sub-second precision and leaves everything else alone', () => {
    expect(displayInstant('2026-01-01T00:00:01.000000Z')).toBe('2026-01-01T00:00:01Z');
    expect(displayInstant('2026-01-01T00:00:01.123Z')).toBe('2026-01-01T00:00:01Z');
    expect(displayInstant('2026-01-01T00:00:01Z')).toBe('2026-01-01T00:00:01Z');
    expect(displayInstant('no clock heard yet')).toBe('no clock heard yet');
  });
});
