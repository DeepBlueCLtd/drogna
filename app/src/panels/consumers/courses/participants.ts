/**
 * Hypotheses about who else might be out there, and how each class would move (FR-79).
 *
 * **What this is not.** It is not a track, not a position anyone inferred, and not an
 * entity drogna did not place. Constitution V forbids the third party *whose position the
 * harness infers rather than knows*; what this file holds is a Monte Carlo over the whole
 * domain, seeded from a likelihood a reader sets on a slider, which infers no position at
 * all. The vocabulary the principle forbids is absent from this feature's code on purpose
 * — the score below is *exposure* — and the vocabulary gate holds it to that.
 *
 * **Behaviour drives motion, not scoring.** This is the requirement the source SRD states
 * most plainly, and it is the reason this file exists rather than a table of multipliers:
 * if the class only weighted a score, the three clouds would be identical and the roster
 * would be cosmetic. So each class marches differently —
 *
 * - **corridor** — a ferry on a timetable: a fixed line across the domain, walked at a
 *   scheduled speed. Predictable in space and in time, and the cloud is a band.
 * - **loiter** — a fishing vessel over shallow banks: assigned to a bank, wandering near
 *   it, indifferent to anybody else. Clustered in space, unpredictable in time.
 * - **evasive** — a submarine seeking poor detectability: at each step it moves toward the
 *   most concealing water it can reach, read from the forecast field drogna publishes and
 *   this tab has already fetched. Responsive, and the only class whose cloud changes when
 *   the ocean does.
 *
 * Every draw comes from the seeded stream (Constitution II), so a replayed run produces
 * the same cloud. The banks are synthesised — drogna models no bathymetry — and the view
 * says so on the roster (ADR-0036).
 */
import { hexAt } from '../hexes.js';
import type { Domain } from '../domain.js';

export type Motion = 'corridor' | 'loiter' | 'evasive';

export interface ClassHypothesis {
  readonly id: string;
  readonly label: string;
  readonly motion: Motion;
  readonly likelihood: number;
  readonly included: boolean;
  readonly speedMetresPerSecond: number;
}

export interface CloudRequest {
  readonly domain: Domain;
  readonly resolution: number;
  readonly classes: readonly ClassHypothesis[];
  readonly steps: number;
  readonly stepSeconds: number;
  readonly samplesPerLikelihood: number;
  readonly bankCount: number;
  /** Concealment per hex on [0, 1], from the fetched field. Absent hexes read as 0. */
  readonly concealment: ReadonlyMap<string, number>;
  readonly draw: () => number;
}

export interface Cloud {
  /** Occupancy per hex, summed over every class and every step. */
  readonly density: ReadonlyMap<string, number>;
  /** The same, per class, so the roster's contrast is visible rather than asserted. */
  readonly byClass: ReadonlyMap<string, ReadonlyMap<string, number>>;
  readonly highest: number;
  readonly hypotheses: number;
}

interface Walker {
  longitude: number;
  latitude: number;
}

const METRES_PER_DEGREE = 111_320;

function degreesEast(metres: number, latitude: number): number {
  return metres / (METRES_PER_DEGREE * Math.cos((latitude * Math.PI) / 180));
}

function degreesNorth(metres: number): number {
  return metres / METRES_PER_DEGREE;
}

function clampToDomain(walker: Walker, domain: Domain): void {
  walker.longitude = Math.min(Math.max(walker.longitude, domain.west), domain.east);
  walker.latitude = Math.min(Math.max(walker.latitude, domain.south), domain.north);
}

/**
 * The cloud: every included class, marched, binned onto hexes.
 *
 * Bounded by configuration on both axes — hypotheses per point of likelihood, and steps
 * per hypothesis — because this runs synchronously on the interaction path (FR-74).
 */
export function seedCloud(request: CloudRequest): Cloud {
  const { domain, resolution, draw } = request;
  const density = new Map<string, number>();
  const byClass = new Map<string, Map<string, number>>();
  let hypotheses = 0;

  // The ferry's corridor and the fishing banks are drawn once per cloud, so every
  // hypothesis of a class shares the geography its class implies. That is what makes a
  // corridor a corridor rather than a hundred unrelated straight lines.
  const corridor = {
    fromLongitude: domain.west,
    fromLatitude: domain.south + (domain.north - domain.south) * (0.2 + 0.6 * draw()),
    toLongitude: domain.east,
    toLatitude: domain.south + (domain.north - domain.south) * (0.2 + 0.6 * draw()),
  };
  const banks: Walker[] = [];
  for (let index = 0; index < request.bankCount; index++) {
    banks.push({
      longitude: domain.west + (domain.east - domain.west) * draw(),
      latitude: domain.south + (domain.north - domain.south) * draw(),
    });
  }

  for (const hypothesis of request.classes) {
    if (!hypothesis.included) continue;
    const mine = new Map<string, number>();
    const count = Math.max(1, Math.round(hypothesis.likelihood * request.samplesPerLikelihood));
    for (let member = 0; member < count; member++) {
      hypotheses += 1;
      const walker = startFor(hypothesis.motion, member, count, domain, corridor, banks, draw);
      const bank = banks.length > 0 ? banks[member % banks.length] : undefined;
      for (let step = 0; step < request.steps; step++) {
        const index = hexAt(walker.longitude, walker.latitude, resolution);
        mine.set(index, (mine.get(index) ?? 0) + 1);
        density.set(index, (density.get(index) ?? 0) + 1);
        march(hypothesis, walker, request, corridor, bank, draw);
        clampToDomain(walker, domain);
      }
    }
    byClass.set(hypothesis.id, mine);
  }

  let highest = 0;
  for (const value of density.values()) if (value > highest) highest = value;
  return { density, byClass, highest, hypotheses };
}

interface Corridor {
  fromLongitude: number;
  fromLatitude: number;
  toLongitude: number;
  toLatitude: number;
}

function startFor(
  motion: Motion,
  member: number,
  count: number,
  domain: Domain,
  corridor: Corridor,
  banks: readonly Walker[],
  draw: () => number,
): Walker {
  if (motion === 'corridor') {
    // Spaced along the corridor rather than scattered on it: a timetable is what makes
    // this class predictable in *time* as well as in space.
    const along = count > 1 ? member / count : 0;
    return {
      longitude: corridor.fromLongitude + (corridor.toLongitude - corridor.fromLongitude) * along,
      latitude: corridor.fromLatitude + (corridor.toLatitude - corridor.fromLatitude) * along,
    };
  }
  if (motion === 'loiter' && banks.length > 0) {
    const bank = banks[member % banks.length];
    return {
      longitude: bank.longitude + (draw() - 0.5) * (domain.east - domain.west) * 0.06,
      latitude: bank.latitude + (draw() - 0.5) * (domain.north - domain.south) * 0.06,
    };
  }
  return {
    longitude: domain.west + (domain.east - domain.west) * draw(),
    latitude: domain.south + (domain.north - domain.south) * draw(),
  };
}

function march(
  hypothesis: ClassHypothesis,
  walker: Walker,
  request: CloudRequest,
  corridor: Corridor,
  bank: Walker | undefined,
  draw: () => number,
): void {
  const metres = hypothesis.speedMetresPerSecond * request.stepSeconds;
  if (hypothesis.motion === 'corridor') {
    const dx = corridor.toLongitude - corridor.fromLongitude;
    const dy = corridor.toLatitude - corridor.fromLatitude;
    const length = Math.hypot(dx, dy) || 1;
    walker.longitude += (dx / length) * degreesEast(metres, walker.latitude);
    walker.latitude += (dy / length) * degreesNorth(metres);
    // A timetable turns round at the end of the line; it does not stop existing.
    if (walker.longitude > request.domain.east || walker.longitude < request.domain.west) {
      const swapLongitude = corridor.fromLongitude;
      corridor.fromLongitude = corridor.toLongitude;
      corridor.toLongitude = swapLongitude;
      const swapLatitude = corridor.fromLatitude;
      corridor.fromLatitude = corridor.toLatitude;
      corridor.toLatitude = swapLatitude;
    }
    return;
  }
  if (hypothesis.motion === 'loiter') {
    // A walk with a pull back toward the bank: indifferent to anyone else, and not
    // going anywhere in particular, which is what loitering looks like from outside.
    const heading = draw() * Math.PI * 2;
    walker.longitude += Math.cos(heading) * degreesEast(metres, walker.latitude);
    walker.latitude += Math.sin(heading) * degreesNorth(metres);
    if (bank) {
      walker.longitude += (bank.longitude - walker.longitude) * 0.12;
      walker.latitude += (bank.latitude - walker.latitude) * 0.12;
    }
    return;
  }
  // Evasive: eight ways to go, and it takes the most concealing one it can reach —
  // concealment being read from the field this tab fetched, so this class's cloud is the
  // one that changes when the ocean does. A little seeded wander keeps a hundred
  // hypotheses from collapsing onto one path.
  let bestLongitude = walker.longitude;
  let bestLatitude = walker.latitude;
  let bestConcealment = -1;
  for (let step = 0; step < 8; step++) {
    const heading = (step / 8) * Math.PI * 2 + draw() * 0.2;
    const longitude = walker.longitude + Math.cos(heading) * degreesEast(metres, walker.latitude);
    const latitude = walker.latitude + Math.sin(heading) * degreesNorth(metres);
    const concealment = request.concealment.get(hexAt(longitude, latitude, request.resolution)) ?? 0;
    if (concealment > bestConcealment) {
      bestConcealment = concealment;
      bestLongitude = longitude;
      bestLatitude = latitude;
    }
  }
  walker.longitude = bestLongitude;
  walker.latitude = bestLatitude;
}

/**
 * Concealment per hex, on [0, 1], from a scalar field: the sharper the local gradient,
 * the better the water hides something.
 *
 * It is a proxy and the view says so. The physical argument behind it is ordinary — a
 * strong gradient bends sound and makes shadow zones — but this is a plausible reading of
 * a synthetic ocean, not an acoustic model, and calling it one would be exactly the
 * dishonesty FR-75 exists to prevent.
 */
export function concealmentFromField(
  values: ReadonlyMap<string, number>,
  neighboursOf: (hex: string) => readonly string[],
): Map<string, number> {
  const gradients = new Map<string, number>();
  let highest = 0;
  for (const [hex, value] of values) {
    let total = 0;
    let count = 0;
    for (const neighbour of neighboursOf(hex)) {
      const other = values.get(neighbour);
      if (other === undefined) continue;
      total += other;
      count += 1;
    }
    const gradient = count > 0 ? Math.abs(value - total / count) : 0;
    if (gradient > highest) highest = gradient;
    gradients.set(hex, gradient);
  }
  const concealment = new Map<string, number>();
  for (const [hex, gradient] of gradients) {
    concealment.set(hex, highest > 0 ? gradient / highest : 0);
  }
  return concealment;
}
