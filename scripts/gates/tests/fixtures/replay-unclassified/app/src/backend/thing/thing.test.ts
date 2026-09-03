// The fixture the gate exists for: a byte-identity test written without a marker.
// Under the old name selector this one would have been picked up by its name and the
// generator's would not — which is the pair of faults the marker and this gate close.
import { describe, expect, it } from 'vitest';

describe('a component nobody marked', () => {
  it('replays byte-identically: one seed, one run, twice', () => {
    expect(1).toBe(1);
  });

  // AT-04: not byte-identity — one run, not two: this is about naming, not replay.
  it('names its stream deterministically', () => {
    expect(1).toBe(1);
  });

  it('does something else entirely', () => {
    expect(1).toBe(1);
  });
});
