/**
 * Where the boxes and the lines go.
 *
 * Separated from the drawing so the arrangement can be reasoned about — and tested —
 * without a renderer. Nothing here knows what is lit.
 */
import { COMPONENTS } from "./components";
import type { ComponentEdge, ComponentNode } from "./components";

export const NODE_WIDTH = 208;
export const NODE_HEIGHT = 88;
const COLUMN_PITCH = 236;
const ROW_PITCH = 152;
const MARGIN_X = 32;
const MARGIN_Y = 36;

// The extent is read from the layout rather than written down beside it. These were
// `* 4` and `* 3` — the grid as it stood at eighteen components — so the first node
// placed in a fifth row would have been drawn outside the viewBox and simply not
// appeared. That is the same fault as a count typed into a test: correct until the day
// it matters. `diagram.test.tsx` asserts every box is inside the canvas, and with the
// bound derived that assertion can no longer be satisfied by nobody having moved.
const LAST_COLUMN = Math.max(...COMPONENTS.map((component) => component.column));
const LAST_ROW = Math.max(...COMPONENTS.map((component) => component.row));

export const CANVAS_WIDTH = MARGIN_X * 2 + COLUMN_PITCH * LAST_COLUMN + NODE_WIDTH;
export const CANVAS_HEIGHT = MARGIN_Y * 2 + ROW_PITCH * LAST_ROW + NODE_HEIGHT;

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly centreX: number;
  readonly centreY: number;
}

export function boxFor(node: ComponentNode): Box {
  const x = MARGIN_X + node.column * COLUMN_PITCH;
  const y = MARGIN_Y + node.row * ROW_PITCH;
  return { x, y, centreX: x + NODE_WIDTH / 2, centreY: y + NODE_HEIGHT / 2 };
}

/** The point where a line leaving a box centre crosses the box edge. */
function boundary(from: Box, towardsX: number, towardsY: number): { x: number; y: number } {
  const dx = towardsX - from.centreX;
  const dy = towardsY - from.centreY;
  if (dx === 0 && dy === 0) {
    return { x: from.centreX, y: from.centreY };
  }
  const halfWidth = NODE_WIDTH / 2 + 6;
  const halfHeight = NODE_HEIGHT / 2 + 6;
  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return { x: from.centreX + dx * scale, y: from.centreY + dy * scale };
}

export interface EdgeGeometry {
  readonly path: string;
  readonly labelX: number;
  readonly labelY: number;
  /** Where the line leaves the publishing box. */
  readonly startX: number;
  readonly startY: number;
  /** Where it meets the consuming box. */
  readonly endX: number;
  readonly endY: number;
  /** The quadratic control point. Equal to the midpoint where the edge is straight. */
  readonly controlX: number;
  readonly controlY: number;
}

/**
 * A point a given fraction of the way along an edge.
 *
 * Feature 012 draws a transit as a mark travelling this path, and a mark that ignored the
 * bow would leave the line it is supposed to be on. The quadratic is the same one
 * {@link edgeGeometry} draws, evaluated rather than restated: one description of where an
 * edge goes, used by both the line and anything moving along it.
 *
 * The fraction arrives as an argument. Nothing here reads a clock of any kind.
 */
export function pointOnEdge(
  geometry: EdgeGeometry,
  fraction: number,
): { readonly x: number; readonly y: number } {
  const t = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  const inverse = 1 - t;
  return {
    x: inverse * inverse * geometry.startX + 2 * inverse * t * geometry.controlX + t * t * geometry.endX,
    y: inverse * inverse * geometry.startY + 2 * inverse * t * geometry.controlY + t * t * geometry.endY,
  };
}

/**
 * The path for one edge.
 *
 * A `bow` bends the line perpendicular to itself, which is how an edge that would
 * otherwise run through a box gets around it. The bend is in the drawing only; an edge
 * says the same thing whichever way it is routed.
 */
export function edgeGeometry(edge: ComponentEdge, from: Box, to: Box): EdgeGeometry {
  const bow = edge.bow ?? 0;
  const midX = (from.centreX + to.centreX) / 2;
  const midY = (from.centreY + to.centreY) / 2;
  const spanX = to.centreX - from.centreX;
  const spanY = to.centreY - from.centreY;
  const length = Math.hypot(spanX, spanY) || 1;
  const controlX = midX + (-spanY / length) * bow;
  const controlY = midY + (spanX / length) * bow;

  const start = boundary(from, controlX, controlY);
  const end = boundary(to, controlX, controlY);
  const path =
    bow === 0
      ? `M ${start.x} ${start.y} L ${end.x} ${end.y}`
      : `M ${start.x} ${start.y} Q ${controlX} ${controlY} ${end.x} ${end.y}`;
  return {
    path,
    labelX: bow === 0 ? midX : (midX + controlX) / 2,
    labelY: bow === 0 ? midY - 6 : (midY + controlY) / 2 - 6,
    startX: start.x,
    startY: start.y,
    endX: end.x,
    endY: end.y,
    // A straight edge is the quadratic whose control point is its own midpoint, so one
    // evaluation covers both cases and there is no second formula to keep in step.
    controlX: bow === 0 ? (start.x + end.x) / 2 : controlX,
    controlY: bow === 0 ? (start.y + end.y) / 2 : controlY,
  };
}
