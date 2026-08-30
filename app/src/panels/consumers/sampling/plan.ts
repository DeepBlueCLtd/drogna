/**
 * The Sampling consumer's own planner (FR-83).
 *
 * This is not drogna's planner and does not pretend to be: drogna's plans against the
 * published ensemble spread, over its own H3 resolution and its own depth bands, and
 * publishes a recommendation. This one plans against the coverage proxy, at whatever
 * resolution the reader chose, under a budget the reader chose, and it is downstream —
 * it advises, which the harness may not (Constitution VIII, and the spec's §3.1).
 *
 * Three behaviours are requirements rather than implementation detail:
 *
 * **Value per unit transit, and cluster-aware.** The score is value divided by the
 * seconds it costs to get there, and the value counts the cell's unvisited neighbours as
 * well as the cell. Without the neighbour term the planner is a nearest-worst-cell
 * chaser: it sets off for the single worst hex in the domain and the budget only ever
 * changes how far along that line it gets. With it, a cluster of merely-bad cells can
 * out-score an isolated terrible one, which is the behaviour the source SRD asks for and
 * the reason the budget control means anything — between three hours and twenty-four the
 * route changes *shape*, not merely length.
 *
 * **The route does not return to its start.** It ends where the budget expires.
 *
 * **Drops lie on the route.** A sensor cannot be dropped where the vessel does not go, so
 * the deep hotspots the vessel cannot reach have to be serviced by bending the route to
 * pass over them. That is why the deep value enters the *route* score at all, bounded by
 * how many drops remain: with no drops available it is worth nothing, and the route the
 * planner would have flown without them is computed too, as the comparison the view draws
 * to show that depth changed the shape.
 */
import { metresBetween } from '../domain.js';

export interface PlannableCell {
  readonly hex: string;
  readonly longitude: number;
  readonly latitude: number;
  /** Uncertainty the vessel could collapse by transiting: the reachable zones. */
  readonly reachableValue: number;
  /** Uncertainty only an expendable could address: the zones below the vessel's reach. */
  readonly deepValue: number;
  /** The deepest-value zone here, named so a drop can be justified. */
  readonly deepestZone: number;
}

export interface PlanRequest {
  readonly start: { readonly longitude: number; readonly latitude: number };
  readonly cells: readonly PlannableCell[];
  readonly budgetSeconds: number;
  readonly speedMetresPerSecond: number;
  readonly dropCount: number;
  /** Seeded, for tie-breaks only. Nothing in the route depends on its magnitude. */
  readonly draw: () => number;
}

export interface PlannedVertex {
  readonly hex: string;
  readonly longitude: number;
  readonly latitude: number;
  readonly arrivalSeconds: number;
  readonly reachableValue: number;
  readonly deepValue: number;
  readonly deepestZone: number;
}

export interface PlannedDrop {
  /** Index into the route's vertices: a drop is always at a place the vessel goes. */
  readonly vertexIndex: number;
  readonly hex: string;
  readonly longitude: number;
  readonly latitude: number;
  readonly zone: number;
  readonly uncertaintyAddressed: number;
}

export interface ConsumerPlan {
  readonly vertices: readonly PlannedVertex[];
  readonly drops: readonly PlannedDrop[];
  readonly consumedSeconds: number;
  readonly distanceMetres: number;
  /** Uncertainty the route collapses in the zones the vessel can reach. */
  readonly reachableValue: number;
  /** Uncertainty the drops address in the zones it cannot. */
  readonly deepValue: number;
  /** Stated when the route is empty, in the planner's own words. */
  readonly emptyReason?: string;
}

/**
 * The neighbourhood a cluster is counted over: a little more than the spacing between
 * adjacent hex centres, derived from the cells themselves rather than typed in, so it
 * follows the resolution control instead of having to be retuned by it.
 */
function neighbourhoodMetres(cells: readonly PlannableCell[]): number {
  if (cells.length < 2) return 0;
  let smallest = Number.POSITIVE_INFINITY;
  const sample = cells.slice(0, 24);
  for (const cell of sample) {
    for (const other of cells) {
      if (other === cell) continue;
      const gap = metresBetween(cell, other);
      if (gap > 0 && gap < smallest) smallest = gap;
    }
  }
  return Number.isFinite(smallest) ? smallest * 1.5 : 0;
}

export function planRoute(request: PlanRequest): ConsumerPlan {
  const { cells, budgetSeconds, speedMetresPerSecond, draw } = request;
  if (cells.length === 0) {
    return emptyPlan('no hex in the domain carries a value yet — nothing has been heard');
  }
  if (speedMetresPerSecond <= 0) return emptyPlan('no transit speed to plan against');

  const radius = neighbourhoodMetres(cells);
  const remaining = new Map(cells.map((cell) => [cell.hex, cell]));
  const vertices: PlannedVertex[] = [];
  let at = { longitude: request.start.longitude, latitude: request.start.latitude };
  let spent = 0;
  let distance = 0;
  let dropsLeft = request.dropCount;

  for (;;) {
    let best: { cell: PlannableCell; seconds: number; metres: number; score: number } | undefined;
    for (const cell of remaining.values()) {
      const metres = metresBetween(at, cell);
      const seconds = metres / speedMetresPerSecond;
      if (spent + seconds > budgetSeconds) continue;
      // The cluster term: what else is worth having near this cell, still unvisited.
      let neighbourhood = 0;
      if (radius > 0) {
        for (const other of remaining.values()) {
          if (other === cell) continue;
          if (metresBetween(cell, other) <= radius) neighbourhood += other.reachableValue;
        }
      }
      // Deep value only counts while a drop is left to service it, which is what keeps
      // the drops on the route rather than beside it.
      const deep = dropsLeft > 0 ? cell.deepValue : 0;
      const value = cell.reachableValue + 0.5 * neighbourhood + deep;
      // A cell we are already standing on costs nothing; scoring it as infinite value per
      // second would let a zero-length hop win every round. One second is the floor.
      const score = value / Math.max(seconds, 1);
      if (
        !best ||
        score > best.score ||
        // Seeded tie-break, so two replays of one run give one route (Constitution II).
        (score === best.score && draw() < 0.5)
      ) {
        best = { cell, seconds, metres, score };
      }
    }
    if (!best) break;
    spent += best.seconds;
    distance += best.metres;
    vertices.push({
      hex: best.cell.hex,
      longitude: best.cell.longitude,
      latitude: best.cell.latitude,
      arrivalSeconds: spent,
      reachableValue: best.cell.reachableValue,
      deepValue: best.cell.deepValue,
      deepestZone: best.cell.deepestZone,
    });
    if (dropsLeft > 0 && best.cell.deepValue > 0) dropsLeft -= 1;
    remaining.delete(best.cell.hex);
    at = { longitude: best.cell.longitude, latitude: best.cell.latitude };
  }

  if (vertices.length === 0) {
    return emptyPlan('the budget does not reach the nearest hex worth sampling');
  }

  const drops = chooseDrops(vertices, request.dropCount);
  return {
    vertices,
    drops,
    consumedSeconds: spent,
    distanceMetres: distance,
    reachableValue: vertices.reduce((total, vertex) => total + vertex.reachableValue, 0),
    deepValue: drops.reduce((total, drop) => total + drop.uncertaintyAddressed, 0),
  };
}

/**
 * The drops, chosen from the route's own vertices — the constraint that makes this
 * interesting. Highest deep value first, one per vertex: two expendables in one hex
 * address the same water twice.
 */
function chooseDrops(vertices: readonly PlannedVertex[], dropCount: number): PlannedDrop[] {
  return vertices
    .map((vertex, vertexIndex) => ({ vertex, vertexIndex }))
    .filter(({ vertex }) => vertex.deepValue > 0)
    .sort((a, b) => b.vertex.deepValue - a.vertex.deepValue)
    .slice(0, Math.max(0, dropCount))
    .map(({ vertex, vertexIndex }) => ({
      vertexIndex,
      hex: vertex.hex,
      longitude: vertex.longitude,
      latitude: vertex.latitude,
      zone: vertex.deepestZone,
      uncertaintyAddressed: vertex.deepValue,
    }))
    .sort((a, b) => a.vertexIndex - b.vertexIndex);
}

function emptyPlan(reason: string): ConsumerPlan {
  return {
    vertices: [],
    drops: [],
    consumedSeconds: 0,
    distanceMetres: 0,
    reachableValue: 0,
    deepValue: 0,
    emptyReason: reason,
  };
}

/** How many expendables a budget yields at a rate. A rate, never a stock (FR-83). */
export function dropsFor(budgetHours: number, intervalHours: number): number {
  return Math.floor(budgetHours / intervalHours);
}
