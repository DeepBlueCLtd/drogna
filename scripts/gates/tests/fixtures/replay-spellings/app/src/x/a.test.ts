import { describe, expect, test, it } from 'vitest';

describe('spellings a per-line it( regex cannot see', () => {
  test('replays byte-identically via test(): one seed, twice', () => {
    expect(1).toBe(1);
  });

  it(
    'replays byte-identically with the name on the next line',
    () => {
      expect(1).toBe(1);
    },
  );
});
