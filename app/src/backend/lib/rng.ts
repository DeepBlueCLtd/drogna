/**
 * Seeded randomness (Constitution II): every stochastic draw in the harness comes
 * through a named stream constructed here from the run's root seed.
 *
 * The derivation rule is recorded in the run manifest as { rule: "harness-rng-ts",
 * version: 1 } and is a pure function of root seed and stream name, so a replay
 * recomputes every sequence exactly. Changing anything in this file that alters a
 * sequence means bumping the rule version — the manifest says so.
 *
 * sfc32 for the streams, splitmix32 to expand seed material: both are small, fast,
 * dependency-free and bit-exact across JS engines (integer ops only).
 */

/** FNV-1a, 32-bit: turns a stream name into seed material. */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function splitmix32(state: number): () => number {
  let s = state >>> 0;
  return () => {
    s = (s + 0x9e3779b9) | 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  };
}

export const SEED_DERIVATION = { rule: 'harness-rng-ts', version: 1 } as const;

/** The per-stream seed: pure in (rootSeed, streamName), recorded by rule not table. */
export function streamSeed(rootSeed: number, streamName: string): number {
  return splitmix32((rootSeed ^ fnv1a32(streamName)) >>> 0)();
}

/** A named, seeded stream. Draws are deterministic in construction order alone. */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(rootSeed: number, streamName: string) {
    const expand = splitmix32((rootSeed ^ fnv1a32(streamName)) >>> 0);
    this.a = expand();
    this.b = expand();
    this.c = expand();
    this.d = expand();
    for (let i = 0; i < 12; i++) this.nextUint32();
  }

  nextUint32(): number {
    const t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) | 0;
    this.d = (this.d + 1) | 0;
    const result = (t + this.d) | 0;
    this.c = (this.c + result) | 0;
    return result >>> 0;
  }

  /** Uniform in [0, 1), 32 bits of precision. */
  next(): number {
    return this.nextUint32() / 0x100000000;
  }

  /** Uniform in [low, high). */
  uniform(low: number, high: number): number {
    return low + (high - low) * this.next();
  }

  /** Standard normal via Box–Muller; two draws per value, no caching (replayable). */
  normal(mean = 0, stdDev = 1): number {
    const u1 = 1 - this.next();
    const u2 = this.next();
    return mean + stdDev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /** Uniform integer in [0, bound). */
  int(bound: number): number {
    return Math.floor(this.next() * bound);
  }
}
