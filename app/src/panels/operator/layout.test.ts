/**
 * The flow chart's geometry (FR-57). Held by a test rather than judged by eye,
 * because "the arrows look about right" is not a check.
 */
import { describe, expect, it } from 'vitest';
import { METRICS, NARROW_METRICS, layout, route, routeAll, type Placed } from './layout.js';

const NODES = [
  { id: 'a', band: 'loop', rank: 0 },
  { id: 'b', band: 'loop', rank: 1 },
  { id: 'c', band: 'path', rank: 0 },
];
const BANDS = ['loop', 'path', 'downstream', 'plane'];

describe('the flow chart’s layout (feature 113)', () => {
  it('places by declared band and rank, and leaves no two nodes overlapping', () => {
    const { placed, width, height } = layout(NODES, BANDS);
    expect(placed.map((node) => node.id)).toEqual(['a', 'b', 'c']);
    const [a, b, c] = placed;
    expect(b.x).toBeGreaterThan(a.x);
    expect(a.y).toBe(b.y);
    expect(c.y).toBeGreaterThan(a.y + a.height);
    // The canvas is big enough for what it holds.
    expect(width).toBeGreaterThanOrEqual(b.x + b.width);
    expect(height).toBeGreaterThanOrEqual(c.y + c.height);
  });

  it('skips a band nothing declares, rather than leaving a gap where it would be', () => {
    const { bands } = layout(NODES, BANDS);
    expect(bands.map((band) => band.band)).toEqual(['loop', 'path']);
  });

  it('draws left to right out of one face and into the other', () => {
    const [a, b] = layout(NODES, BANDS).placed;
    const drawn = route(a, b, 'topic', 'x');
    expect(drawn.d.startsWith(`M ${a.x + a.width},`)).toBe(true);
    expect(drawn.d.endsWith(`${b.x},${b.y + b.height / 2}`)).toBe(true);
    expect(drawn.midX).toBeGreaterThan(a.x + a.width);
    expect(drawn.midX).toBeLessThan(b.x);
  });

  it('returns right to left UNDER the band, never back through the nodes between', () => {
    const [a, b] = layout(NODES, BANDS).placed;
    const back = route(b, a, 'topic', 'the loop returning');
    // Every control point sits below the band: the return is unmistakable, and it
    // cannot be read as connecting whatever sits between the two ends.
    expect(back.midY).toBeGreaterThan(a.y + a.height);
    const ys = [...back.d.matchAll(/,(-?\d+(?:\.\d+)?)/g)].map((match) => Number(match[1]));
    expect(Math.max(...ys)).toBeGreaterThan(a.y + a.height);
  });

  it('spreads edges that share a pair of endpoints so they do not lie on top of each other', () => {
    const placed = layout(NODES, BANDS).placed;
    const routed = routeAll(
      [
        { from: 'a', to: 'b', kind: 'topic', label: 'one' },
        { from: 'a', to: 'b', kind: 'topic', label: 'two' },
      ],
      placed,
    );
    expect(routed).toHaveLength(2);
    expect(routed[0].d).not.toBe(routed[1].d);
  });

  it('drops an edge whose end is not on the canvas rather than drawing it to nowhere', () => {
    const placed = layout(NODES, BANDS).placed;
    expect(routeAll([{ from: 'a', to: 'ghost', kind: 'topic', label: 'x' }], placed)).toEqual([]);
  });

  it('crosses between bands from the near face to the far one', () => {
    const placed = layout(NODES, BANDS).placed;
    const a = placed.find((node) => node.id === 'a') as Placed;
    const c = placed.find((node) => node.id === 'c') as Placed;
    const down = route(a, c, 'port', 'reads');
    expect(down.d).toContain(`,${a.y + a.height}`);
    expect(down.d.endsWith(`,${c.y}`)).toBe(true);
    // And back up leaves the top face, not the bottom.
    const up = route(c, a, 'port', 'writes');
    expect(up.d).toContain(`,${c.y}`);
    expect(up.d.endsWith(`,${a.y + a.height}`)).toBe(true);
  });

  it('uses the metrics it is given, not numbers of its own', () => {
    const tight = { ...METRICS, nodeWidth: 100, columnGap: 10 };
    const { placed } = layout(NODES, BANDS, tight);
    expect(placed[1].x - placed[0].x).toBe(110);
  });
});

/**
 * Opening a node (feature 116). The complaint the feature answers is that a 208×116
 * card cannot be read or used, and the answer is that the selected one grows — so what
 * has to be held here is not that it is bigger, which is trivially true of a number
 * typed into the metrics, but that **the rest of the picture gets out of its way**. A
 * card that grew over its neighbours would be a modal with extra steps.
 */
describe('opening one node (feature 116)', () => {
  /** Every pair, checked for overlap. The property the reflow exists to keep. */
  function overlapping(placed: readonly Placed[]): string[] {
    const clashes: string[] = [];
    for (const a of placed) {
      for (const b of placed) {
        if (a.id >= b.id) continue;
        const apart =
          a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
        if (!apart) clashes.push(`${a.id}/${b.id}`);
      }
    }
    return clashes;
  }

  it('gives the open node the expanded box and leaves every other node the resting one', () => {
    const { placed } = layout(NODES, BANDS, METRICS, 'a');
    const open = placed.find((node) => node.id === 'a') as Placed;
    expect(open.expanded).toBe(true);
    expect(open.width).toBe(METRICS.expandedWidth);
    expect(open.height).toBe(METRICS.expandedHeight);
    for (const other of placed.filter((node) => node.id !== 'a')) {
      expect(other.expanded, other.id).toBe(false);
      expect(other.width, other.id).toBe(METRICS.nodeWidth);
      expect(other.height, other.id).toBe(METRICS.nodeHeight);
    }
  });

  it('pushes its neighbours along and the bands below down, by exactly what it gained', () => {
    const resting = layout(NODES, BANDS);
    const open = layout(NODES, BANDS, METRICS, 'a');
    const at = (from: ReturnType<typeof layout>, id: string) =>
      from.placed.find((node) => node.id === id) as Placed;
    const gainedWidth = METRICS.expandedWidth - METRICS.nodeWidth;
    const gainedHeight = METRICS.expandedHeight - METRICS.nodeHeight;

    // Same band, to its right: along by the width it took.
    expect(at(open, 'b').x - at(resting, 'b').x).toBe(gainedWidth);
    expect(at(open, 'b').y).toBe(at(resting, 'b').y);
    // The band below: down by the height it took. Nothing else moved.
    expect(at(open, 'c').y - at(resting, 'c').y).toBe(gainedHeight);
    expect(at(open, 'c').x).toBe(at(resting, 'c').x);
    // And the canvas grew to hold it, rather than clipping it.
    expect(open.width - resting.width).toBe(gainedWidth);
    expect(open.height - resting.height).toBe(gainedHeight);
  });

  it('never places the open node over anything, whichever node is opened', () => {
    expect(overlapping(layout(NODES, BANDS).placed)).toEqual([]);
    for (const node of NODES) {
      expect(overlapping(layout(NODES, BANDS, METRICS, node.id).placed), node.id).toEqual([]);
    }
  });

  it('keeps the open node’s wires on its own faces, because siblings are declared not measured', () => {
    // An open node is taller than its neighbours, so its centre agrees with none of
    // them. Routing that read the centres called this a crossing between bands and sent
    // the loop's own wires out of the wrong face.
    const placed = layout(NODES, BANDS, METRICS, 'a').placed;
    const [a, b] = placed;
    expect(a.band).toBe(b.band);
    expect(a.y + a.height / 2).not.toBe(b.y + b.height / 2);
    const out = route(a, b, 'topic', 'x');
    expect(out.d.startsWith(`M ${a.x + a.width},`)).toBe(true);
    expect(out.d.endsWith(`${b.x},${b.y + b.height / 2}`)).toBe(true);
    // And the return runs under the taller of the two, never through it.
    const back = route(b, a, 'topic', 'the loop returning');
    expect(back.midY).toBeGreaterThan(a.y + a.height);
  });

  it('gives a phone a taller, narrower box than a desktop, from the same placement', () => {
    // The space a phone has is vertical. Same code, different declared geometry — the
    // panel chooses which, and nothing here knows about a viewport.
    expect(NARROW_METRICS.expandedWidth).toBeLessThan(METRICS.expandedWidth);
    expect(NARROW_METRICS.expandedHeight).toBeGreaterThan(METRICS.expandedHeight);
    const narrow = layout(NODES, BANDS, NARROW_METRICS, 'a').placed[0];
    expect(narrow.width).toBe(NARROW_METRICS.expandedWidth);
    expect(narrow.height).toBe(NARROW_METRICS.expandedHeight);
  });

  it('places as it always did when nothing is open', () => {
    const { placed, width, height } = layout(NODES, BANDS, METRICS, undefined);
    expect(placed).toEqual(layout(NODES, BANDS).placed);
    expect([width, height]).toEqual([layout(NODES, BANDS).width, layout(NODES, BANDS).height]);
  });
});
