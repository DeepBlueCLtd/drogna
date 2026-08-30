/**
 * Where the flow chart's nodes sit, and the shape of every wire between them
 * (SRD-v2 FR-57). Pure: geometry in, geometry out, no DOM and no React — so the
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
 *
 * One node may be **expanded**: a card at 208×116 holds a glance and nothing more, and
 * the account of a component — its instrument at a readable size, and the controls that
 * act on it — needs room. The expanded node takes the space of two columns and three
 * rows, and the rest of the picture moves out of its way rather than being covered by
 * it: nodes to its right in the same band shift right by what it gained, and every band
 * below shifts down. The reader keeps the shape they had learned, which is the whole
 * reason expansion was preferred to a card floating over the chart.
 */
export interface Placed {
  readonly id: string;
  /** The band it was placed in. Two nodes are siblings because they share this, not
      because their centres happen to agree — an expanded node's centre agrees with
      nobody's, and routing that read geometry sent its wires around the outside. */
  readonly band: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly expanded: boolean;
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
  /** The box the one expanded node is given. Never smaller than the resting box. */
  readonly expandedWidth: number;
  readonly expandedHeight: number;
  readonly columnGap: number;
  readonly rowGap: number;
  readonly bandGap: number;
  readonly padding: number;
  readonly captionHeight: number;
}

const NODE_WIDTH = 208;
const NODE_HEIGHT = 116;
const COLUMN_GAP = 34;

export const METRICS: LayoutMetrics = {
  nodeWidth: NODE_WIDTH,
  nodeHeight: NODE_HEIGHT,
  // Two columns and four rows, stated as that rather than as two numbers: the card
  // takes the space its neighbours were in, so a reader can see where it came from.
  // Four rows because three left the monitor's second tunable under the fold, and a
  // control a reader has to scroll to find is the complaint this feature answers.
  expandedWidth: NODE_WIDTH * 2 + COLUMN_GAP,
  expandedHeight: NODE_HEIGHT * 4,
  columnGap: COLUMN_GAP,
  rowGap: 18,
  bandGap: 58,
  padding: 16,
  captionHeight: 22,
};

/**
 * The same picture on a phone. The space a phone has is vertical, so the expanded card
 * takes one column and a half of width and five rows of height rather than the wide box
 * a desktop can hold without scrolling sideways (feature 112's rule, applied to a
 * surface that did not exist when it was written).
 */
export const NARROW_METRICS: LayoutMetrics = {
  ...METRICS,
  expandedWidth: Math.round(NODE_WIDTH * 1.5),
  expandedHeight: NODE_HEIGHT * 5,
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

/**
 * Place every node, with at most one of them expanded.
 *
 * The expanded node keeps its rank — it grows out of where it already was, rightwards
 * and downwards — and the picture accommodates it: its band's row is as tall as the
 * tallest thing in it, and the nodes after it are pushed along by exactly what it
 * gained. Nothing is placed over anything else, which is the property the test holds.
 */
export function layout(
  nodes: readonly LayoutInput[],
  bandOrder: readonly string[],
  metrics: LayoutMetrics = METRICS,
  expanded?: string,
): Layout {
  const placed: Placed[] = [];
  const bands: { band: string; y: number; height: number }[] = [];
  let y = metrics.padding;
  let widest = 0;

  for (const band of bandOrder) {
    const inBand = nodes.filter((node) => node.band === band).sort((a, b) => a.rank - b.rank);
    if (inBand.length === 0) continue;
    const top = y + metrics.captionHeight;
    let x = metrics.padding;
    let tallest = metrics.nodeHeight;
    for (const node of inBand) {
      const isExpanded = node.id === expanded;
      const width = isExpanded ? Math.max(metrics.nodeWidth, metrics.expandedWidth) : metrics.nodeWidth;
      const height = isExpanded ? Math.max(metrics.nodeHeight, metrics.expandedHeight) : metrics.nodeHeight;
      placed.push({ id: node.id, band, x, y: top, width, height, expanded: isExpanded });
      widest = Math.max(widest, x + width);
      tallest = Math.max(tallest, height);
      x += width + metrics.columnGap;
    }
    const height = metrics.captionHeight + tallest;
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
  // Siblings by declaration, not by geometry: an expanded node is taller than its
  // neighbours, so its centre agrees with none of them.
  const sameBand = from.band === to.band;

  if (sameBand && to.x > from.x) {
    const x1 = from.x + from.width;
    const x2 = to.x;
    // Each end leaves its own face. Equal heights put both on the same line, which is
    // every edge in the resting picture; an expanded end simply sits where it sits.
    const y1 = fromCentre + sibling * 7;
    const y2 = toCentre + sibling * 7;
    const bow = Math.min(40, (x2 - x1) / 2);
    return {
      from: from.id,
      to: to.id,
      kind,
      label,
      d: `M ${x1},${y1} C ${x1 + bow},${y1} ${x2 - bow},${y2} ${x2},${y2}`,
      midX: (x1 + x2) / 2,
      midY: (y1 + y2) / 2,
    };
  }

  if (sameBand) {
    // Right to left: under the band. A wire drawn straight back through the nodes
    // between would read as connecting those nodes instead — and this is usually the
    // loop returning, which is the one edge that has to be unmistakable.
    //
    // Under the *taller* of the two ends: an expanded node reaches further down than
    // its neighbours, and a return lane drawn from one end's foot alone would run
    // through it.
    const x1 = from.x + from.width / 2;
    const x2 = to.x + to.width / 2;
    const under = Math.max(from.y + from.height, to.y + to.height) + 20 + sibling * 8;
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
