/**
 * The tree's shape, held to the master rather than to this file (feature 121).
 *
 * The check that matters is the first one. A branch list typed by hand is the fault
 * feature 121 found on the timeline's lanes — three literals that feature 116's new era
 * never reached — and the tab would carry a second copy of it if this were not derived.
 */
import { describe, expect, it } from 'vitest';
import { schemaDocuments } from '../../generated/schema-documents.js';
import type { CoverageHolding } from '../../generated/types.js';
import { BRANCHES, analysisCycles, analysisFieldLabel, branchById, holdingsForBranch } from './tree.js';

const declared = (
  schemaDocuments['coverage-holding'] as { properties: { era: { enum: string[] } } }
).properties.era.enum;

function holding(id: string, era: CoverageHolding['era']): CoverageHolding {
  return { holding_id: id, era } as CoverageHolding;
}

describe('the Data tree (feature 121)', () => {
  it('carries a branch for every era the master declares, and one is not lost to a typo', () => {
    const covered = BRANCHES.filter((branch) => branch.kind === 'coverage').map((branch) => branch.era);
    expect(covered).toEqual(declared);
  });

  it('is seven branches: measurements, the eras, shore updates — in the reader’s order', () => {
    expect(BRANCHES.map((branch) => branch.id)).toEqual([
      'measurements',
      'archive',
      'departure',
      'nowcast',
      'analysis',
      'forecast',
      'shore',
    ]);
  });

  it('every branch says what it holds: a label alone leaves a reader to guess', () => {
    for (const branch of BRANCHES) {
      expect(branch.caption.length, `no caption on '${branch.id}'`).toBeGreaterThan(0);
      expect(branch.label.length).toBeGreaterThan(0);
    }
  });

  it("names the store's 'instance' era what a reader calls it", () => {
    expect(branchById('forecast')?.era).toBe('instance');
    expect(branchById('instance')).toBeUndefined();
  });

  it('draws a branch only the holdings of its own era', () => {
    const held = [
      holding('archive.a.t0', 'archive'),
      holding('departure.a.t0', 'departure'),
      holding('instance.a.t900', 'instance'),
    ];
    const drawnBy = (branchId: string) => {
      const branch = branchById(branchId);
      if (!branch) throw new Error(`no '${branchId}' branch`);
      return holdingsForBranch(branch, held).map((entry) => entry.holding_id);
    };
    expect(drawnBy('archive')).toEqual(['archive.a.t0']);
    expect(drawnBy('forecast')).toEqual(['instance.a.t900']);
    expect(drawnBy('measurements')).toEqual([]);
  });

  it('gathers a cycle’s three fields into one node, because they were published together', () => {
    const cycles = analysisCycles([
      holding('analysis.r1', 'analysis'),
      holding('analysis.r1-error', 'analysis'),
      holding('analysis.r1-provenance', 'analysis'),
      holding('analysis.r2', 'analysis'),
    ]);
    expect(cycles.map((cycle) => cycle.id)).toEqual(['analysis.r1', 'analysis.r2']);
    expect(cycles[0].holdings).toHaveLength(3);
    expect(cycles[0].holdings.map((h) => analysisFieldLabel(h.holding_id))).toEqual([
      'the corrected field',
      'the error it left',
      'where each value came from',
    ]);
  });

  it('keeps a holding whose id it does not recognise, rather than dropping it from the tab', () => {
    const cycles = analysisCycles([holding('something-else', 'analysis')]);
    expect(cycles.map((cycle) => cycle.id)).toEqual(['something-else']);
  });
});
