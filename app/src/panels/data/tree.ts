/**
 * The Data tab's tree, as data (feature 121, FR-02).
 *
 * The spine is **by data kind**, not by serving standard: measurements, then the
 * coverage eras in the order the store fills them, then what shore has sent. That is a
 * regrouping — measurements come from SensorThings, five branches from EDR, one from
 * Features — and it is the one decision in this tab that costs something. A reader
 * learns what the system holds and not which standard answers for it; Background
 * explains all three and the Map's composer shows EDR on the wire.
 *
 * The coverage branches are **derived from the `coverage-holding` master**, not listed
 * here. The lane list on the timeline was three literals and had already gone stale by
 * the time this feature found it — feature 116's `analysis` era never reached it — so a
 * second hand-maintained list of the same eras, in the same tab, would be the same fault
 * waiting to happen twice. An era added to the master arrives here as a branch.
 *
 * Nothing in this file fetches, renders or knows what a React component is.
 */
import { schemaDocuments } from '../../generated/schema-documents.js';
import type { CoverageHolding } from '../../generated/types.js';

export type CoverageEra = CoverageHolding['era'];

export type BranchKind = 'measurements' | 'coverage' | 'shore';

export interface Branch {
  readonly id: string;
  readonly label: string;
  /** What this branch holds, in one line, for the reader who has not read the SRD. */
  readonly caption: string;
  readonly kind: BranchKind;
  /** Which era of the coverage store this branch draws, where it draws one. */
  readonly era?: CoverageEra;
}

/** The eras the master declares, in the order it declares them. */
export const ERAS = (
  schemaDocuments['coverage-holding'] as { properties: { era: { enum: CoverageEra[] } } }
).properties.era.enum;

/**
 * How each era is named to a reader. The ids differ from the eras in one place, and
 * deliberately: the store's `instance` is what a reader calls *the forecast*, and this
 * tab is organised by what a reader calls things.
 */
const ERA_BRANCH: Record<CoverageEra, { id: string; label: string; caption: string }> = {
  archive: {
    id: 'archive',
    label: 'Archive',
    caption: 'two decades of monthly history, authored at provisioning',
  },
  departure: {
    id: 'departure',
    label: 'Departure forecast',
    caption: 'the brief the vessel sailed with: issued at the quay-side and never refreshed',
  },
  nowcast: {
    id: 'nowcast',
    label: 'Now-cast',
    caption: 'the present ocean, replaced on its cadence — the reference everything is scored against',
  },
  analysis: {
    id: 'analysis',
    label: 'Analysis',
    caption: 'the forecast corrected by what was measured, with the error it left and where each value came from',
  },
  instance: {
    id: 'forecast',
    label: 'Forecast',
    caption: 'the runs the loop has turned, each with the spread it published',
  },
};

/** The seven branches, in the order the tab draws them. */
export const BRANCHES: readonly Branch[] = [
  {
    id: 'measurements',
    label: 'Measurements',
    caption: 'what the sensors have reported, by platform and by datastream',
    kind: 'measurements',
  },
  ...ERAS.map((era): Branch => ({ ...ERA_BRANCH[era], kind: 'coverage', era })),
  {
    id: 'shore',
    label: 'Shore updates',
    caption: 'advice sent from shore: where it applies, and for how long',
    kind: 'shore',
  },
];

export function branchById(id: string): Branch | undefined {
  return BRANCHES.find((branch) => branch.id === id);
}

/**
 * The holdings a coverage branch draws.
 *
 * The analysis branch is the exception, and FR-11 is why: a cycle publishes the
 * analysis, the error it left and the per-cell provenance together, and they are three
 * views of one publication rather than three holdings a reader picks between. They are
 * grouped by the cycle that published them, which is what `analysis.<run>` names.
 */
export function holdingsForBranch(
  branch: Branch,
  holdings: readonly CoverageHolding[],
): readonly CoverageHolding[] {
  if (branch.era === undefined) return [];
  return holdings.filter((holding) => holding.era === branch.era);
}

/** One assimilation cycle: what it published, keyed by the cycle it belongs to. */
export interface AnalysisCycle {
  readonly id: string;
  readonly holdings: readonly CoverageHolding[];
}

/**
 * Analysis holdings gathered into the cycles that published them.
 *
 * The grouping is read off the ids the analyst mints — `analysis.<run>`, plus
 * `-error` and `-provenance` beside it — because that is where the relationship is
 * actually recorded. A holding whose id does not carry the suffix pattern is its own
 * cycle rather than being dropped: an unrecognised id is a thing the store holds, and
 * hiding it would make this tab less truthful than the inventory it replaced.
 */
export function analysisCycles(holdings: readonly CoverageHolding[]): readonly AnalysisCycle[] {
  const byCycle = new Map<string, CoverageHolding[]>();
  for (const holding of holdings) {
    const cycle = holding.holding_id.replace(/-(?:error|provenance|contributions)$/, '');
    const existing = byCycle.get(cycle);
    if (existing) existing.push(holding);
    else byCycle.set(cycle, [holding]);
  }
  return [...byCycle.entries()].map(([id, group]) => ({ id, holdings: group }));
}

/**
 * Whether a holding is a gridded coverage the volume can draw and EDR serves. The
 * backend answers the same question in `lib/holding-format.ts`; this side of the seam
 * cannot import it, and reads the descriptor's own `field.format` instead — the same
 * arrangement `Volume.tsx` has for the collection id. Feature 124's contributions
 * holding is the one that is not.
 */
export function isGriddedCoverage(holding: Pick<CoverageHolding, 'field'>): boolean {
  return holding.field.format === 'drogna-f32-v1';
}

/** Which of a cycle's four holdings this is, for the reader choosing between them. */
export function analysisFieldLabel(holdingId: string): string {
  if (holdingId.endsWith('-error')) return 'the error it left';
  if (holdingId.endsWith('-provenance')) return 'where each value came from';
  // Feature 124: the fourth holding, and not a field — the sources each value came
  // from, sparse, served at its own prefix rather than through EDR.
  if (holdingId.endsWith('-contributions')) return 'what each value was made from, by source';
  return 'the corrected field';
}
