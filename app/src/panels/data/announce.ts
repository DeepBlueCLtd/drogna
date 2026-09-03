/**
 * What the timeline says about a holding (feature 115, FR-69, T022).
 *
 * The Holdings tab is the one place in this feature where a table is *replaced* rather
 * than kept beside a new display or deleted with its tab. Nothing stands behind the
 * timeline to be a keyboard and screen-reader surface, so the timeline has to be one —
 * and the check that says it is (`parity.test.ts`) was written before the timeline was
 * built, on the interview's condition: if the check could not be satisfied the table
 * would stay and the reason would be recorded in `tasks.md`.
 *
 * **The bound is the master, not the table's five columns.** The columns were one
 * author's choice; `coverage-holding.schema.json` is the authority, it is amended and
 * never casually rewritten, and a bound read from disk survives a holding gaining a
 * field (CLAUDE.md, lesson 2). So this module is organised by the master's own property
 * names: one announcement per property the master declares, and an argued exemption for
 * each property that is deliberately not announced. A field added to the master appears
 * in neither list, and the check names it.
 *
 * The digest is announced as the twelve-character fingerprint the table already showed,
 * not as sixty-four characters read aloud. Parity needs no argument because it is the
 * same string.
 */
import type { CoverageHolding } from '../../generated/types.js';
import { displayInstant } from '../../shell/display.js';
import { coverageInterval, describeSpan } from './interval.js';
import { isGriddedCoverage } from './tree.js';

/** One fact the timeline announces, keyed by the master property it comes from. */
export interface Announcement {
  /** The property of `coverage-holding.schema.json` this states. */
  readonly property: string;
  /** How a reader hears it named. */
  readonly label: string;
  /** The value, rendered. Never empty: an empty announcement announces nothing. */
  readonly text: string;
}

/**
 * Properties of the master the timeline deliberately does not announce, each with the
 * reason. An exemption is a decision and is written down at the moment it is made; the
 * check reads this list, so an exemption cannot be added silently and a new property
 * cannot pass by being forgotten.
 */
export const NOT_ANNOUNCED: Readonly<Record<string, string>> = {
  schema_version:
    'the version of the descriptor shape, not a fact about the holding — a reader hearing "schema version 1" learns nothing about what the store holds',
};

/**
 * What a screen reader hears about one holding. The order is the order a reader wants
 * it: what kind of holding, which one, when it covers, how big, and what it is.
 */
export function announceHolding(holding: CoverageHolding): readonly Announcement[] {
  const interval = coverageInterval(holding.manifest.grid.time);
  const grid = holding.manifest.grid;
  const shape = `${grid.longitude.count}×${grid.latitude.count}×${grid.depth.count}×${grid.time.count}`;
  // A coverage's grid is what it holds. Feature 124's contributions holding is not a
  // coverage, and its grid is the coordinate reference its sparse rows are keyed on —
  // announced as that, or a reader is told of a field that is not there.
  const gridText = isGriddedCoverage(holding)
    ? `grid ${shape}`
    : `not a gridded coverage; sparse rows keyed on the ${shape} grid`;
  return [
    { property: 'era', label: 'era', text: holding.era },
    { property: 'holding_id', label: 'holding', text: holding.holding_id },
    { property: 'run_id', label: 'run', text: holding.run_id },
    {
      property: 'published_at',
      label: 'published',
      text: `${displayInstant(holding.published_at.sim_time)} (tick ${holding.published_at.tick})`,
    },
    {
      // The manifest is opened whole on selection (FR-46) and is a page of JSON, so what
      // is announced of it here is the one thing a reader is choosing between holdings
      // by: the shape of the field and the span of simulation time it covers.
      property: 'manifest',
      label: 'covers',
      text: interval
        ? `${displayInstant(interval.startSimTime)} to ${displayInstant(interval.endSimTime)}, ${describeSpan(
            interval.endMillis - interval.startMillis,
          )} · ${gridText}`
        : `${gridText} · its time axis could not be read, so no interval is claimed`,
    },
    {
      property: 'field',
      label: 'field digest',
      // The format is announced beside the size because the two only agree for a
      // coverage: a sparse holding's byte count is not its grid's (feature 124).
      text: `${holding.field.format}, ${holding.field.sha256.slice(7, 19)}… , ${holding.field.byte_length} bytes`,
    },
  ];
}

/** The accessible name for a holding: every announcement, in one sentence. */
export function announcementLabel(holding: CoverageHolding): string {
  return announceHolding(holding)
    .map((entry) => `${entry.label}: ${entry.text}`)
    .join('; ');
}
