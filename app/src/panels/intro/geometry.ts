/**
 * Where the Intro drawing's nodes sit and what shape each wire is. Pure: cells in,
 * geometry out, no DOM and no React, so the routing is held by a test rather than
 * judged by eye (`panels/operator/layout.ts`'s rule, and its reason).
 *
 * The grid is the composition: a row for the sources, a row for the write path, a row
 * for the loop, a row for the read path and what reads it, and a strip at the foot for
 * the plane. Two hops need more than a straight line between faces and get it here
 * rather than in the drawing:
 *
 * - a hop **along a row** that skips a cell — the sampler port from the environment
 *   generator to the instruments, with the platform between them, and the observations
 *   reaching the monitor past the scheduler — is bowed through the corridor above the
 *   row, because a straight line would run through the node in between and read as
 *   touching it;
 * - a hop **down a column** that skips a cell is bowed out into the left gutter, which
 *   exists for exactly this. The drawing has none today; the case is here because the
 *   composition is authored and the next arrangement may.
 *
 * Everything else is a cubic between the two faces that point at each other. Wires are
 * drawn behind the nodes, which are opaque, so a wire that passes a node passes behind
 * it rather than through its label.
 */
export interface Cell {
  readonly col: number;
  readonly row: number;
}

export interface Box {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Metrics {
  readonly nodeWidth: number;
  readonly nodeHeight: number;
  readonly colGap: number;
  readonly rowGap: number;
  readonly padding: number;
  /** The lane a column-skipping wire is bowed into, on the left of the drawing. */
  readonly gutter: number;
  /** The extra air above the plane strip, so it reads as underneath rather than beside. */
  readonly planeGap: number;
  /** The row the plane strip occupies. */
  readonly planeRow: number;
  /** The lane on the right where the arrow out of the harness lands. */
  readonly outsideWidth: number;
  /** How far a band is drawn outside the cells it encloses. */
  readonly bandInset: number;
}

export const METRICS: Metrics = {
  nodeWidth: 158,
  nodeHeight: 62,
  colGap: 40,
  rowGap: 58,
  // Wide enough that a row-skipping wire has a corridor to bow through above the top
  // row. At the old value it was clamped against the edge and read as a swoosh.
  padding: 34,
  gutter: 30,
  planeGap: 34,
  planeRow: 4,
  outsideWidth: 158,
  bandInset: 14,
};

export interface Placement {
  readonly boxes: readonly Box[];
  readonly width: number;
  readonly height: number;
  /** The plane strip's own rectangle, for the band the drawing puts behind it. */
  readonly plane: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  /**
   * Where the arrow out of the harness lands, beside whichever node declared that it
   * serves the outside. Undefined when nothing does — the drawing then reserves no
   * lane for it, rather than leaving an empty margin whose meaning nobody can guess.
   */
  readonly outside?: Box;
}

export function place(
  cells: readonly { readonly id: string; readonly cell: Cell; readonly servesOutside?: boolean }[],
  metrics: Metrics = METRICS,
): Placement {
  const columnX = (col: number) => metrics.gutter + col * (metrics.nodeWidth + metrics.colGap);
  const rowY = (row: number) =>
    metrics.padding +
    row * (metrics.nodeHeight + metrics.rowGap) +
    (row >= metrics.planeRow ? metrics.planeGap : 0);

  const boxes = cells.map(({ id, cell }) => ({
    id,
    x: columnX(cell.col),
    y: rowY(cell.row),
    width: metrics.nodeWidth,
    height: metrics.nodeHeight,
  }));

  const server = cells.findIndex((cell) => cell.servesOutside);
  const serving = server === -1 ? undefined : boxes[server];
  const outside = serving
    ? {
        id: 'outside',
        x: serving.x + serving.width + metrics.colGap,
        y: serving.y,
        width: metrics.outsideWidth,
        height: serving.height,
      }
    : undefined;

  const rightmost = [...boxes, ...(outside ? [outside] : [])];
  const right = rightmost.reduce((widest, box) => Math.max(widest, box.x + box.width), 0);
  const bottom = boxes.reduce((lowest, box) => Math.max(lowest, box.y + box.height), 0);
  const width = right + metrics.padding;
  const height = bottom + metrics.padding;
  const planeTop = rowY(metrics.planeRow) - metrics.planeGap / 2;
  return {
    boxes,
    width,
    height,
    plane: {
      x: metrics.padding / 2,
      y: planeTop,
      width: width - metrics.padding,
      height: height - planeTop - metrics.padding / 2,
    },
    outside,
  };
}

/**
 * The rectangle behind a run of cells — the band the loop is drawn inside. Taken from
 * the same grid as the nodes, so the band cannot drift away from what it encloses.
 */
export function region(
  from: Cell,
  to: Cell,
  metrics: Metrics = METRICS,
): { x: number; y: number; width: number; height: number } {
  const columnX = (col: number) => metrics.gutter + col * (metrics.nodeWidth + metrics.colGap);
  const rowY = (row: number) =>
    metrics.padding +
    row * (metrics.nodeHeight + metrics.rowGap) +
    (row >= metrics.planeRow ? metrics.planeGap : 0);
  const left = columnX(Math.min(from.col, to.col)) - metrics.bandInset;
  const top = rowY(Math.min(from.row, to.row)) - metrics.bandInset - 8;
  const right = columnX(Math.max(from.col, to.col)) + metrics.nodeWidth + metrics.bandInset;
  const bottom = rowY(Math.max(from.row, to.row)) + metrics.nodeHeight + metrics.bandInset;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export interface Routed {
  readonly d: string;
  /** Where a wire's own label sits when it is the one being read. */
  readonly midX: number;
  readonly midY: number;
}

/**
 * One wire, from face to face. `stagger` separates wires that would otherwise share a
 * corridor; it is the wire's index among its kind and nothing more.
 */
export function route(from: Box, to: Box, fromCell: Cell, toCell: Cell, stagger = 0): Routed {
  const fromCentre = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const toCentre = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const spread = 8 * (stagger % 3);

  if (fromCell.row === toCell.row && Math.abs(fromCell.col - toCell.col) > 1) {
    // Along the row, over the node in between. Clamped to the canvas: the top row's
    // corridor is thinner than the others and a wire drawn above the viewBox is a wire
    // nobody sees, which is the same fault as not drawing it.
    const lift = 30 + spread;
    const top = Math.max(4, Math.min(from.y, to.y) - lift);
    const start = { x: fromCentre.x, y: from.y };
    const end = { x: toCentre.x, y: to.y };
    return {
      d: `M ${start.x} ${start.y} C ${start.x} ${top}, ${end.x} ${top}, ${end.x} ${end.y}`,
      midX: (start.x + end.x) / 2,
      midY: top + 10,
    };
  }

  if (fromCell.col === toCell.col && Math.abs(fromCell.row - toCell.row) > 1) {
    // Down the column, out into the gutter.
    const out = Math.min(from.x, to.x) - (26 + spread);
    const start = { x: from.x, y: fromCentre.y };
    const end = { x: to.x, y: toCentre.y };
    return {
      d: `M ${start.x} ${start.y} C ${out} ${start.y}, ${out} ${end.y}, ${end.x} ${end.y}`,
      midX: out + 6,
      midY: (start.y + end.y) / 2,
    };
  }

  const dx = toCentre.x - fromCentre.x;
  const dy = toCentre.y - fromCentre.y;

  if (Math.abs(dx) > Math.abs(dy) * 1.2) {
    const start = { x: dx > 0 ? from.x + from.width : from.x, y: fromCentre.y + spread / 2 };
    const end = { x: dx > 0 ? to.x : to.x + to.width, y: toCentre.y + spread / 2 };
    const reach = Math.min(90, Math.abs(end.x - start.x) / 2 + 18);
    const push = dx > 0 ? reach : -reach;
    return {
      d: `M ${start.x} ${start.y} C ${start.x + push} ${start.y}, ${end.x - push} ${end.y}, ${end.x} ${end.y}`,
      midX: (start.x + end.x) / 2,
      midY: (start.y + end.y) / 2,
    };
  }

  const start = { x: fromCentre.x + spread / 2, y: dy > 0 ? from.y + from.height : from.y };
  const end = { x: toCentre.x + spread / 2, y: dy > 0 ? to.y : to.y + to.height };
  const reach = Math.min(74, Math.abs(end.y - start.y) / 2 + 16);
  const push = dy > 0 ? reach : -reach;
  return {
    d: `M ${start.x} ${start.y} C ${start.x} ${start.y + push}, ${end.x} ${end.y - push}, ${end.x} ${end.y}`,
    midX: (start.x + end.x) / 2,
    midY: (start.y + end.y) / 2,
  };
}

export interface Link {
  readonly from: string;
  readonly to: string;
  readonly kind: 'topic' | 'port';
  /** Every label the collapsed wires carried, in order, so none is lost. */
  readonly labels: readonly string[];
}

/**
 * One wire per pair, per kind. The derived wiring carries an edge per topic filter —
 * the instruments reach the ingestion seam on five of them — and five parallel lines
 * between two boxes say nothing five times. The labels are kept, so the wire can still
 * say what it carries.
 */
export function collapse(
  edges: readonly { from: string; to: string; kind: 'topic' | 'port'; label: string }[],
): Link[] {
  const links = new Map<
    string,
    { from: string; to: string; kind: 'topic' | 'port'; labels: string[] }
  >();
  for (const edge of edges) {
    const key = `${edge.from} ${edge.to} ${edge.kind}`;
    const existing = links.get(key);
    if (existing) {
      if (!existing.labels.includes(edge.label)) existing.labels.push(edge.label);
    } else {
      links.set(key, { from: edge.from, to: edge.to, kind: edge.kind, labels: [edge.label] });
    }
  }
  return [...links.values()];
}
