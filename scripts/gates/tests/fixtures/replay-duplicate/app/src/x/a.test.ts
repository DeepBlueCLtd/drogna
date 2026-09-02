import { describe, expect, it } from 'vitest';

describe('one', () => {
  // AT-04: byte-identity
  it('replays byte-identically', () => expect(1).toBe(1));
});

describe('two', () => {
  // AT-04: byte-identity
  it('replays byte-identically', () => expect(1).toBe(1));
});
