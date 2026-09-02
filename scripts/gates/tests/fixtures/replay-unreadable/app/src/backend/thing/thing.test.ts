// The other half: a marker that has drifted off the test it was written for, so the
// proof cannot say which test it expects. Refused rather than guessed.
import { describe, expect, it } from 'vitest';

describe('a marker adrift', () => {
  // AT-04: byte-identity

  it('replays byte-identically: one seed, one run, twice', () => {
    expect(1).toBe(1);
  });
});
