/**
 * Candidate courses of action, scored in components (FR-84).
 *
 * **Three or four, never one.** A single recommendation invites an operator to disagree
 * with the whole idea; candidates with separated scores invite them to disagree with the
 * weighting, which is the argument actually worth having and the one a slider can settle
 * in front of an audience.
 *
 * **The candidates are drawn to span the trade rather than sampled at random.** Each is
 * the same course under a different amount of detour away from the density: the direct
 * one gets the most of what the objective wants and sits in the most exposure, the wide
 * one the reverse. That is what makes the ranking *able to flip* as the weighting moves,
 * which the source SRD names as the moment worth engineering for — a candidate set whose
 * order never changes has demonstrated nothing.
 *
 * **`exposure` rather than the obvious word.** Constitution V keeps this feature clear of
 * the vocabulary it forbids, and the gate enforces it. What is scored is how much of a
 * course sits where hypotheses are dense and the water carries well.
 */
import { metresBetween } from '../domain.js';
import { hexAt } from '../hexes.js';

export interface CandidateRequest {
  readonly start: { readonly longitude: number; readonly latitude: number };
  readonly resolution: number;
  /** Occupancy per hex from the cloud, and the highest of them, for normalising. */
  readonly density: ReadonlyMap<string, number>;
  readonly highestDensity: number;
  /** Concealment per hex on [0, 1], from the fetched field. */
  readonly concealment: ReadonlyMap<string, number>;
  readonly objective: string;
  readonly count: number;
  /** Where the course could go: the hexes of the domain, with their centres. */
  readonly cells: readonly { readonly index: string; readonly longitude: number; readonly latitude: number }[];
  readonly legs: number;
  readonly draw: () => number;
}

export interface Candidate {
  readonly id: string;
  readonly label: string;
  /** The course as positions, starting at the vessel. */
  readonly points: readonly (readonly [number, number])[];
  /** How much of the course sits where hypotheses are dense: 0 (clear) to 1. */
  readonly exposure: number;
  /** How much of what the objective wants this course gets: 0 to 1. */
  readonly achievement: number;
  /** How far the course detours from the direct line, as drawn. */
  readonly detour: number;
}

export interface ScoredCandidate extends Candidate {
  /** The weighted combination the reader is looking at. */
  readonly headline: number;
  readonly rank: number;
}

/**
 * Where the objective wants the course to go. Each is a different reading of the same
 * cloud and the same field, which is why changing the objective changes the candidates
 * rather than merely re-sorting them.
 */
function targetFor(request: CandidateRequest): { longitude: number; latitude: number } {
  const { cells, density, concealment, highestDensity } = request;
  let best = cells[0];
  let bestScore = -Infinity;
  const centroid = densityCentroid(request);
  for (const cell of cells) {
    const cloud = highestDensity > 0 ? (density.get(cell.index) ?? 0) / highestDensity : 0;
    const hidden = concealment.get(cell.index) ?? 0;
    let score: number;
    switch (request.objective) {
      case 'investigation':
        // Go and look: the densest water is the point.
        score = cloud;
        break;
      case 'evasion':
        // Get away: the farthest thing from where the density is.
        score = centroid ? metresBetween(centroid, cell) : 0;
        break;
      case 'monitoring':
        // Watch the whole picture: the middle of the mass, where the most of it is in
        // reach without being inside any of it.
        score = centroid ? -Math.abs(metresBetween(centroid, cell) - medianReach(request)) : 0;
        break;
      default:
        // Stealthy reconnaissance: close to them, in water that hides you.
        score = cloud * hidden;
        break;
    }
    if (score > bestScore) {
      bestScore = score;
      best = cell;
    }
  }
  return { longitude: best.longitude, latitude: best.latitude };
}

function densityCentroid(request: CandidateRequest): { longitude: number; latitude: number } | undefined {
  let weight = 0;
  let longitude = 0;
  let latitude = 0;
  for (const cell of request.cells) {
    const value = request.density.get(cell.index) ?? 0;
    weight += value;
    longitude += cell.longitude * value;
    latitude += cell.latitude * value;
  }
  if (weight === 0) return undefined;
  return { longitude: longitude / weight, latitude: latitude / weight };
}

/** Half the domain's diagonal, in metres: the scale "a useful standoff" is measured on. */
function medianReach(request: CandidateRequest): number {
  const cells = request.cells;
  if (cells.length < 2) return 0;
  const first = cells[0];
  const last = cells[cells.length - 1];
  return metresBetween(first, last) / 4;
}

export function buildCandidates(request: CandidateRequest): Candidate[] {
  if (request.cells.length === 0) return [];
  const target = targetFor(request);
  const centroid = densityCentroid(request);
  const candidates: Candidate[] = [];
  const labels = ['direct', 'offset', 'wide', 'furthest'];

  for (let index = 0; index < request.count; index++) {
    // The detour parameter is the whole design: candidate 0 goes straight at what the
    // objective wants, the last one arcs as far from the density as the domain allows,
    // and the ones between span it. Random courses would sometimes span the trade and
    // sometimes not, which is not a demonstration.
    const detour = request.count > 1 ? index / (request.count - 1) : 0;
    const points: [number, number][] = [[request.start.longitude, request.start.latitude]];
    // A detour is paid for in the objective as well as in distance: a course that arcs
    // wide of the density also stops short of what it was going to look at. Without this
    // every candidate would arrive at the same place and only the exposure would differ,
    // which is a trade with one side and would never reorder under any weighting.
    const arrival = 1 - 0.4 * detour;
    for (let leg = 1; leg <= request.legs; leg++) {
      const along = (leg / request.legs) * arrival;
      let longitude = request.start.longitude + (target.longitude - request.start.longitude) * along;
      let latitude = request.start.latitude + (target.latitude - request.start.latitude) * along;
      if (centroid && detour > 0) {
        // Push perpendicular to the run, on whichever side is away from the mass, by an
        // amount that swells in the middle of the course and closes at both ends: a
        // course that never arrives is not a candidate.
        const swell = Math.sin(along * Math.PI);
        const awayLongitude = longitude - centroid.longitude;
        const awayLatitude = latitude - centroid.latitude;
        const length = Math.hypot(awayLongitude, awayLatitude) || 1;
        const reach = 0.35 * detour * swell;
        longitude += (awayLongitude / length) * reach * Math.abs(target.longitude - request.start.longitude || 1);
        latitude += (awayLatitude / length) * reach * Math.abs(target.latitude - request.start.latitude || 1);
      }
      // A seeded wobble, so two candidates never lie exactly on top of one another and
      // the picture reads as four courses rather than one thick line (Constitution II).
      longitude += (request.draw() - 0.5) * 0.02;
      latitude += (request.draw() - 0.5) * 0.02;
      points.push([longitude, latitude]);
    }
    candidates.push({
      id: `coa-${index + 1}`,
      label: labels[index] ?? `option ${index + 1}`,
      points,
      detour,
      exposure: exposureOf(points, request),
      achievement: achievementOf(points, request, target),
    });
  }
  return candidates;
}

/**
 * Exposure: the mean, along the course, of how dense the hypotheses are there, lowered
 * where the water conceals. Concealment enters here rather than in achievement because
 * hiding is a property of being somewhere, not of what you went there to do.
 */
function exposureOf(
  points: readonly (readonly [number, number])[],
  request: CandidateRequest,
): number {
  if (request.highestDensity === 0) return 0;
  let total = 0;
  for (const [longitude, latitude] of points) {
    const hex = hexAt(longitude, latitude, request.resolution);
    const cloud = (request.density.get(hex) ?? 0) / request.highestDensity;
    const hidden = request.concealment.get(hex) ?? 0;
    total += cloud * (1 - 0.6 * hidden);
  }
  return Math.min(1, total / points.length);
}

function achievementOf(
  points: readonly (readonly [number, number])[],
  request: CandidateRequest,
  target: { longitude: number; latitude: number },
): number {
  const scale = medianReach(request) * 4 || 1;
  if (request.objective === 'monitoring') {
    // Coverage: how much of the domain the course actually looks at.
    const seen = new Set(points.map(([lon, lat]) => hexAt(lon, lat, request.resolution)));
    return Math.min(1, seen.size / points.length);
  }
  if (request.objective === 'stealthy-reconnaissance') {
    let total = 0;
    for (const [longitude, latitude] of points) {
      const hex = hexAt(longitude, latitude, request.resolution);
      const cloud = request.highestDensity > 0 ? (request.density.get(hex) ?? 0) / request.highestDensity : 0;
      total += cloud * (request.concealment.get(hex) ?? 0);
    }
    return Math.min(1, (total / points.length) * 2);
  }
  // Investigation and evasion are both "did you get there": closest approach to the
  // objective's own point, as a fraction of the domain's own scale.
  let closest = Infinity;
  for (const [longitude, latitude] of points) {
    const gap = metresBetween({ longitude, latitude }, target);
    if (gap < closest) closest = gap;
  }
  return Math.max(0, 1 - closest / scale);
}

/**
 * The candidates under a weighting, ranked. `exposureWeight` is how much the reader
 * cares about staying clear: at 1 the ranking is exposure alone, at 0 it is achievement
 * alone, and somewhere between them the order changes — which is the point.
 */
export function rank(
  candidates: readonly Candidate[],
  exposureWeight: number,
): ScoredCandidate[] {
  const scored = candidates
    .map((candidate) => ({
      ...candidate,
      headline: exposureWeight * (1 - candidate.exposure) + (1 - exposureWeight) * candidate.achievement,
      rank: 0,
    }))
    .sort((a, b) => b.headline - a.headline);
  return scored.map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}
