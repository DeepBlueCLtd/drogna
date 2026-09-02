/**
 * The fault this file guards, in the shape it took:
 *   it('replays byte-identically: one seed, one run, twice', ...)
 * Prose about the rule is not a use of it.
 */
import { describe, expect, it } from 'vitest';

describe('prose is not a test', () => {
  // it('replays byte-identically: quoted in a line comment too', ...)
  it('does something unrelated', () => {
    expect(1).toBe(1);
  });
});
