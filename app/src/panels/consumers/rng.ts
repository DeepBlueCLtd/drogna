/**
 * The consumers' seeded streams (Constitution II, FR-81).
 *
 * A downstream consumer synthesises inputs drogna does not model — a tidal window, a
 * ferry timetable, a hypothesis about where a class of vessel might be — and ADR-0039
 * admits that on four conditions, of which this file is one: every draw comes from a
 * stream derived from the run manifest's root seed and a stream name, so a replayed run
 * synthesises the same tide and the same cloud. Nothing here reads entropy, and the
 * seeded-RNG gate holds it to that.
 *
 * The derivation is FNV-1a over the stream name mixed with the root seed, and the
 * generator is mulberry32. Neither is the harness's own generator: the backend's streams
 * live behind the seam and a panel may not import them (Constitution XI). That is a
 * genuine second implementation of "a small deterministic generator", and it is the
 * price of the boundary — what matters constitutionally is that the seed comes from the
 * manifest and the sequence is a pure function of it, both of which hold here.
 */

/** A stream seed: a pure function of the run's root seed and a name. */
export function streamSeed(rootSeed: number, stream: string): number {
  let hash = 0x811c9dc5 ^ (rootSeed >>> 0);
  for (let index = 0; index < stream.length; index++) {
    hash ^= stream.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A generator over [0, 1). The same seed gives the same sequence, always. */
export function createStream(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** The stream a named consumer draws from, given the run it is drawing for. */
export function consumerStream(rootSeed: number, ...parts: readonly string[]): () => number {
  return createStream(streamSeed(rootSeed, parts.join('/')));
}
