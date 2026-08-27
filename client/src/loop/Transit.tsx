/**
 * One message, drawn crossing one boundary.
 *
 * A transit is a mark on the edge between the component that published a message and the
 * components that read it. It exists because a message was received; there is no other
 * way to make one, and the only input this component takes is a crossing that the
 * coalescer produced from arrivals (FR-001, FR-003).
 *
 * The mark carries its position along the edge as a fraction supplied by the caller, so a
 * caller that animates hands it a fraction from the render path and a still display hands
 * it a constant. Nothing here reads a clock of any kind; the fraction arrives as a prop,
 * which is what keeps ADR-0007's third rule structural rather than remembered.
 *
 * A coalesced transit says so in words beside the mark rather than only by being larger,
 * because PR-08 expects these pictures to survive greyscale.
 */
import { COMPONENTS_BY_ID, EDGES } from "../layout/components";
import { boxFor, edgeGeometry, pointOnEdge } from "../layout/geometry";
import { BOUNDARIES_BY_ID } from "../legibility/classification";

import { coalescedWords } from "./coalesce";
import type { Transit as Crossing } from "./coalesce";

export interface TransitProps {
  readonly transit: Crossing;
  /**
   * How far along the boundary to draw the mark, from zero to one.
   *
   * Supplied by the caller. This component has no opinion about where the number came
   * from and no access to anything that could produce one.
   */
  readonly progress: number;
}

/** The two endpoints of a boundary, or null where the layout does not place both. */
function geometryFor(boundaryIdentifier: string) {
  const boundary = BOUNDARIES_BY_ID.get(boundaryIdentifier);
  if (boundary === undefined) {
    return null;
  }
  const edge = EDGES.find((candidate) => candidate.from === boundary.from && candidate.to === boundary.to);
  const from = COMPONENTS_BY_ID.get(boundary.from);
  const to = COMPONENTS_BY_ID.get(boundary.to);
  if (edge === undefined || from === undefined || to === undefined) {
    return null;
  }
  return { boundary, geometry: edgeGeometry(edge, boxFor(from), boxFor(to)) };
}

/** The mark, and the words that say what it stands for. */
export function Transit({ transit, progress }: TransitProps): JSX.Element | null {
  const placed = geometryFor(transit.boundary);
  if (placed === null) {
    // A crossing whose boundary the layout does not hold is not drawn somewhere
    // plausible instead. An unplaceable transit is a routing defect the routing test
    // names, not something to improvise over here.
    return null;
  }
  const { x, y } = pointOnEdge(placed.geometry, progress);
  const words = coalescedWords(transit);
  return (
    <g
      className={`transit kind-${placed.boundary.kind}`}
      data-testid={`transit-${transit.boundary}`}
      data-boundary={transit.boundary}
      data-topic={transit.topic}
      data-count={transit.count}
      data-kind={placed.boundary.kind}
    >
      <circle className="transit-mark" cx={x} cy={y} r={transit.count > 1 ? 8 : 5} />
      {words === null ? null : (
        <text className="transit-count" x={x + 12} y={y - 8}>
          {words}
        </text>
      )}
    </g>
  );
}
