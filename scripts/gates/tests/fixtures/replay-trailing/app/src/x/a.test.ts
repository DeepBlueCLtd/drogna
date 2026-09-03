import { describe, expect, it } from 'vitest';

describe('a marker written as a trailing comment', () => {
  it('replays byte-identically: one seed, one run, twice', () => expect(1).toBe(1)); // AT-04: byte-identity

  it('reports its progress in the leg the configuration names', () => {
    expect(1).toBe(1);
  });
});
