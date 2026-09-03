/**
 * Float32's width at a magnitude: the unit in the last place, as a tolerance derivation.
 *
 * Every holding's manifest declares a `tolerance_absolute` per variable, derived from the
 * stored width at the variable's largest magnitude rather than chosen (manifest
 * `tolerance`). The generator, the runner and the analyst each derive it, and until
 * feature 124's review they each typed the same expression: three copies of a one-line
 * derivation every comparison in the tree rests on, free to drift apart while every test
 * passed — because each test reads the tolerance from the holding it checks.
 *
 * Magnitudes below one are treated as one, so the floor is 2⁻²³ rather than a subnormal
 * width that would make a field of near-zeros claim a tolerance nothing could meet.
 */
export function ulpAt(magnitude: number): number {
  return Math.pow(2, Math.max(Math.floor(Math.log2(Math.max(magnitude, 1))) - 23, -149));
}
