import { describe, expect, it } from 'vitest';
import { Rng, SEED_DERIVATION, streamSeed } from './rng.js';

describe('seeded rng', () => {
  // AT-04: byte-identity
  it('replays exactly: same root seed and stream name, same sequence', () => {
    const first = new Rng(42, 'env-generator');
    const second = new Rng(42, 'env-generator');
    for (let i = 0; i < 100; i++) expect(second.next()).toBe(first.next());
  });

  it('separates streams: one root seed, different names, different sequences', () => {
    const a = new Rng(42, 'env-generator');
    const b = new Rng(42, 'sensors');
    const draws = Array.from({ length: 8 }, () => a.next() === b.next());
    expect(draws.every(Boolean)).toBe(false);
  });

  it('separates seeds: same stream name, different root, different sequences', () => {
    const a = new Rng(1, 'env-generator');
    const b = new Rng(2, 'env-generator');
    expect(a.next()).not.toBe(b.next());
  });

  // The derivation rule is recorded in every manifest as harness-rng-ts v1. These
  // pins are what make that recording mean something: a change to any constant in
  // rng.ts fails here, which is the prompt to bump the version rather than silently
  // invalidate every exported manifest.
  it('pins the v1 derivation: a rule change cannot pass silently', () => {
    expect(SEED_DERIVATION).toEqual({ rule: 'harness-rng-ts', version: 1 });
    expect(streamSeed(42, 'env-generator')).toBe(90613262);
    const rng = new Rng(42, 'env-generator');
    expect([rng.nextUint32(), rng.nextUint32(), rng.nextUint32()]).toEqual([
      3142852395, 1383732883, 3554269939,
    ]);
  });

  it('draws stay in their documented ranges', () => {
    const rng = new Rng(7, 'range-check');
    for (let i = 0; i < 1000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    for (let i = 0; i < 100; i++) {
      const value = rng.int(10);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(10);
    }
  });
});
