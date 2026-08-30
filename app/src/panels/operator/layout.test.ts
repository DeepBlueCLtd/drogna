/**
 * The flow chart's geometry (FR-57). Held by a test rather than judged by eye,
 * because "the arrows look about right" is not a check.
 */
import { describe, expect, it } from 'vitest';
import { METRICS, layout, route, routeAll, type Placed } from './layout.js';

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
