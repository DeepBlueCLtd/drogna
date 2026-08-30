/**
 * The Data tab's addressing (feature 121, FR-03, SC-004).
 */
import { describe, expect, it } from 'vitest';
import { restForSelection, selectionFromRest } from './address.js';
import { BRANCHES } from './tree.js';

const isBranch = (id: string) => BRANCHES.some((branch) => branch.id === id);

describe('the Data tab’s address', () => {
  it('names a branch alone', () => {
    expect(selectionFromRest('archive', isBranch)).toEqual({ branchId: 'archive' });
  });

  it('names a holding inside a branch', () => {
    expect(selectionFromRest('forecast/instance.loiter-b.t900', isBranch)).toEqual({
      branchId: 'forecast',
      nodeId: 'instance.loiter-b.t900',
    });
  });

  it('keeps a datastream’s two parts together: the node is whatever follows the branch', () => {
    expect(selectionFromRest('measurements/ctd-01/temperature', isBranch)).toEqual({
      branchId: 'measurements',
      nodeId: 'ctd-01/temperature',
    });
  });

  it('carries a node the store does not hold through, rather than silently dropping it', () => {
    // The panel is what says "this is not here"; the address module's job is to stop
    // the request being quietly rewritten into a different one on the way (FR-03).
    expect(selectionFromRest('archive/a-holding-that-went', isBranch)).toEqual({
      branchId: 'archive',
      nodeId: 'a-holding-that-went',
    });
  });

  it('yields nothing for an unknown branch or an empty remainder', () => {
    expect(selectionFromRest('atlantis', isBranch)).toBeUndefined();
    expect(selectionFromRest('', isBranch)).toBeUndefined();
    expect(selectionFromRest(undefined, isBranch)).toBeUndefined();
  });

  it('round-trips', () => {
    for (const rest of ['archive', 'measurements/ctd-01/temperature', 'analysis/analysis.r1']) {
      expect(restForSelection(selectionFromRest(rest, isBranch))).toBe(rest);
    }
  });
});
