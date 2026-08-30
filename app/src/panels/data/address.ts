/**
 * The Data tab's half of the address (FR-03, ADR-0032). The shell hands down an opaque
 * remainder; this module is the only place that knows it means `<branch>/<node>`.
 *
 * The node is everything after the branch, kept whole rather than split further: a
 * datastream is named by its platform and its property together (`ctd-01/temperature`),
 * and a holding id carries dots and hyphens. What a node id means is the branch's
 * business, not this module's.
 *
 * **A miss is reported, not absorbed.** Background resolves an unknown explainer to the
 * first one, and is right to — its remainder is a position in a course that always
 * exists. Here the remainder names something the store either holds or does not, and a
 * link to a holding that has been replaced is a reader asking a question this tab knows
 * the answer to. Falling back silently to the branch would answer a different question
 * and look identical to having answered theirs.
 */
export interface DataSelection {
  /** Always a branch this tab draws; an address naming no known branch yields undefined. */
  readonly branchId: string;
  /** What the address asked for inside the branch, if anything. */
  readonly nodeId?: string;
}

export function selectionFromRest(
  rest: string | undefined,
  isBranch: (id: string) => boolean,
): DataSelection | undefined {
  if (rest === undefined || rest === '') return undefined;
  const [branchId, ...node] = rest.split('/');
  if (!isBranch(branchId)) return undefined;
  const nodeId = node.join('/');
  return nodeId === '' ? { branchId } : { branchId, nodeId };
}

export function restForSelection(selection: DataSelection | undefined): string | undefined {
  if (!selection) return undefined;
  return selection.nodeId === undefined ? selection.branchId : `${selection.branchId}/${selection.nodeId}`;
}
