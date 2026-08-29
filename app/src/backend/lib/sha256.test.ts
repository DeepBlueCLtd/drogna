import { describe, expect, it } from 'vitest';
import { configDigest, sha256Hex } from './sha256.js';

describe('sha256', () => {
  // FIPS 180-4 vectors: a bespoke digest that drifted would poison every config
  // digest in every manifest, so it is pinned to the standard, not to itself.
  it('matches the FIPS vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('digests span multi-block inputs', () => {
    expect(sha256Hex('a'.repeat(1000))).toBe(
      '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3',
    );
  });

  it('prefixes config digests the way the masters require', () => {
    expect(configDigest({ a: 1 })).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
