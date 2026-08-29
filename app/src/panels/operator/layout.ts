/**
 * Where the flow chart's nodes sit, and the shape of every wire between them
 * (SRD-v2 FR-52). Pure: geometry in, geometry out, no DOM and no React — so the
 * routing can be held by a test rather than judged by eye.
 *
 * Bands stack top to bottom in the order the arc runs; rank places a node left to
 * right within its band. Both are declared (Constitution VII: structure from
 * declaration), which is also what makes the picture learnable — a node is where it
 * was last time.
 *
 * Edges are routed by where their ends sit rather than by a solver:
 *
 * - same band, left to right → out of the right face, into the left face;
 * - same band, right to left → *under* the band, because a wire drawn straight back
 *   through the nodes between them reads as connecting those nodes instead. This is
 *   the loop's return, and it is the one edge in the picture that has to be obvious;
 * - different bands → out of the bottom (or top) face into the other's, bowed so two
 *   edges between the same pair of bands do not lie on top of one another.
 */
export interface Placed {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Routed {
  readonly from: string;
  readonly to: string;
  readonly kind: 'topic' | 'port';
  readonly label: string;
  /** SVG path data. */
  readonly d: string;
  /** Where a label or a pulse sits: the path's rough midpoint. */
  readonly midX: number;
  readonly midY: number;
}

export interface LayoutMetrics {
  readonly nodeWidth: number;
  readonly nodeHeight: number;
  readonly columnGap: number;
  readonly rowGap: number;
  readonly bandGap: number;
  readonly padding: number;
  readonly captionHeight: number;
}

export const METRICS: LayoutMetrics = {
  nodeWidth: 208,
  nodeHeight: 116,
  columnGap: 34,
  rowGap: 18,
  bandGap: 58,
  padding: 16,
  captionHeight: 22,
};

export interface LayoutInput {
  readonly id: string;
  readonly band: string;
  readonly rank: number;
}

export interface Layout {
  readonly placed: readonly Placed[];
  readonly bands: readonly { band: string; y: number; height: number }[];
  readonly width: number;
  readonly height: number;
}

export function layout(
  nodes: readonly LayoutInput[],
  bandOrder: readonly string[],
  metrics: LayoutMetrics = METRICS,
): Layout {
  const placed: Placed[] = [];
  const bands: { band: string; y: number; height: number }[] = [];
  let y = metrics.padding;
  let widest = 0;

  for (const band of bandOrder) {
    const inBand = nodes.filter((node) => node.band === band).sort((a, b) => a.rank - b.rank);
    if (inBand.length === 0) continue;
    const top = y + metrics.captionHeight;
    inBand.forEach((node, index) => {
      const x = metrics.padding + index * (metrics.nodeWidth + metrics.columnGap);
      placed.push({ id: node.id, x, y: top, width: metrics.nodeWidth, height: metrics.nodeHeight });
      widest = Math.max(widest, x + metrics.nodeWidth);
    });
    const height = metrics.captionHeight + metrics.nodeHeight;
    bands.push({ band, y, height });
    y += height + metrics.bandGap;
  }

  return {
    placed,
    bands,
    width: widest + metrics.padding,
    height: y - metrics.bandGap + metrics.padding,
  };
}

/**
 * Route one edge between two placed nodes. `sibling` spreads edges that share a pair
 * of endpoints or a lane, so they do not lie on top of one another.
 */
export function route(
  from: Placed,
  to: Placed,
  kind: 'topic' | 'port',
  label: string,
  sibling = 0,
): Routed {
  const fromCentre = from.y + from.height / 2;
  const toCentre = to.y + to.height / 2;
  const sameBand = Math.abs(fromCentre - toCentre) < 1;

  if (sameBand && to.x > from.x) {
    const x1 = from.x + from.width;
    const x2 = to.x;
    const y1 = fromCentre + sibling * 7;
    const bow = Math.min(40, (x2 - x1) / 2);
    return {
      from: from.id,
      to: to.id,
      kind,
      label,
      d: `M ${x1},${y1} C ${x1 + bow},${y1} ${x2 - bow},${y1} ${x2},${y1}`,
      midX: (x1 + x2) / 2,
      midY: y1,
    };
  }

  if (sameBand) {
    // Right to left: under the band. A wire drawn straight back through the nodes
    // between would read as connecting those nodes instead — and this is usually the
    // loop returning, which is the one edge that has to be unmistakable.
    const x1 = from.x + from.width / 2;
    const x2 = to.x + to.width / 2;
    const under = from.y + from.height + 20 + sibling * 8;
    return {
      from: from.id,
      to: to.id,
      kind,
      label,
      d: `M ${x1},${from.y + from.height} C ${x1},${under} ${x2},${under} ${x2},${to.y + to.height}`,
      midX: (x1 + x2) / 2,
      midY: under,
    };
  }

  // Between bands: out of the near face into the far one, bowed by sibling so two
  // edges crossing the same gap stay apart.
  const downward = toCentre > fromCentre;
  const x1 = from.x + from.width / 2 + sibling * 11;
  const x2 = to.x + to.width / 2 - sibling * 11;
  const y1 = downward ? from.y + from.height : from.y;
  const y2 = downward ? to.y : to.y + to.height;
  const lift = (y2 - y1) / 2;
  return {
    from: from.id,
    to: to.id,
    kind,
    label,
    d: `M ${x1},${y1} C ${x1},${y1 + lift} ${x2},${y2 - lift} ${x2},${y2}`,
    midX: (x1 + x2) / 2,
    midY: (y1 + y2) / 2,
  };
}

/** Route a whole edge set, spreading edges that share a pair of endpoints. */
export function routeAll(
  edges: readonly { from: string; to: string; kind: 'topic' | 'port'; label: string }[],
  placed: readonly Placed[],
): Routed[] {
  const byId = new Map(placed.map((node) => [node.id, node]));
  const seen = new Map<string, number>();
  const routed: Routed[] = [];
  for (const edge of edges) {
    const a = byId.get(edge.from);
    const b = byId.get(edge.to);
    if (!a || !b) continue;
    const pair = `${edge.from}->${edge.to}`;
    const sibling = seen.get(pair) ?? 0;
    seen.set(pair, sibling + 1);
    routed.push(route(a, b, edge.kind, edge.label, sibling));
  }
  return routed;
}
