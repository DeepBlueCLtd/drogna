/**
 * The byte formats a coverage holding may carry (`coverage-holding.schema.json`,
 * `field.format`), and the one question three components ask of them.
 *
 * `drogna-f32-v1` is a coverage: a grid of float32 values the sampler can read, listed by
 * EDR, drawn by the Data tab's volume. `drogna-contributions-v1` (feature 124) is not: a
 * sparse per-source holding the analyst publishes beside its analysis, kept in the same
 * store under the same digest check and served at its own prefix. EDR, the query
 * component's collection count and the contributions query each need to tell the two
 * apart, and until feature 124's review each held its own opinion in a literal.
 */
import type { CoverageHolding } from '../../generated/types.js';

export const F32_FORMAT = 'drogna-f32-v1' as const;
export const CONTRIBUTIONS_FORMAT = 'drogna-contributions-v1' as const;

/** Whether a holding is a gridded coverage: servable through EDR, sampleable as a field. */
export function isCoverage(descriptor: Pick<CoverageHolding, 'field'>): boolean {
  return descriptor.field.format === F32_FORMAT;
}
