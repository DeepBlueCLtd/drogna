/**
 * Confidence ageing between runs, read off the planner's projection rather than modelled.
 *
 * FR-022 draws a line this module is written to stay on the right side of. The planner
 * publishes, for every region in the domain, the uncertainty there now, what it grows
 * back to if nothing measures it again, the decorrelation timescale that governs the
 * growth, and — the part that matters here — the simulation instant at which confidence
 * falls below usable, resolved to the projection's own step (SRD FR-34).
 *
 * So the client answers "is this region still usable at instant t?" by comparing t with a
 * published crossing instant. That is a lookup. What it does **not** do is take
 * `uncertainty_now`, `saturated_uncertainty` and `timescale_seconds` and evaluate a growth
 * curve between them, which is the obvious thing to write and is precisely what FR-022
 * forbids: it would put bespoke mathematics in the browser and produce a second, divergent
 * model of a quantity the planner already computed. Two models of the same number
 * disagree, and the one on the screen would be the one nobody validated.
 *
 * Where no projection is available the field still renders and is marked as not decaying.
 * A field shown without its projection is honest; a field decayed by a browser-side curve
 * is not.
 */
import { microsFromIso } from "../controls/simInstant";
import type { Projection, ProjectionEntry } from "../generated/messages/plan";

/** What the display says about one region at one simulation instant. */
export type Confidence = "usable" | "lapsed" | "lapses-later" | "unknown";

export interface RegionConfidence {
  /** The region's index, exactly as the planner spelt it. */
  readonly region: string;
  readonly confidence: Confidence;
  /** The band whose confidence lapses first, as the planner named it. */
  readonly depthBand: number;
  /** The uncertainty the planner published at the instant it published it. */
  readonly uncertaintyAtProjection: number;
  /** What it grows back to, unmeasured, as the planner published it. */
  readonly saturatedUncertainty: number;
  /** The published crossing instant, or null where the planner gave none. */
  readonly crossingSimTime: string | null;
  /** One line, so the reading can be argued with rather than only looked at. */
  readonly because: string;
}

export interface DecayView {
  /** True when a projection governs the display. False means the field is not decaying. */
  readonly decaying: boolean;
  /** Why not, where it is not. Null where a projection is in force. */
  readonly notDecayingBecause: string | null;
  readonly regions: readonly RegionConfidence[];
  /** The uncertainty above which the planner says confidence is no longer usable. */
  readonly usableThreshold: number | null;
  /** How far forward the planner marched, in seconds of simulation time. */
  readonly horizonSeconds: number | null;
  /** Regions the projection covered, which the planner states so truncation is visible. */
  readonly regionCount: number | null;
}

export const NO_PROJECTION_REASON =
  "no planner projection has been received, so the field is shown as published and is not decayed here: the decay the display would otherwise draw would be a second model of a quantity the planner already computes (FR-022).";

export const NOT_DECAYING: DecayView = {
  decaying: false,
  notDecayingBecause: NO_PROJECTION_REASON,
  regions: [],
  usableThreshold: null,
  horizonSeconds: null,
  regionCount: null,
};

function confidenceFor(entry: ProjectionEntry, atMicros: number | null): { confidence: Confidence; because: string } {
  if (entry.state === "already-lapsed") {
    return {
      confidence: "lapsed",
      because: "the planner reported this region already below usable when it projected.",
    };
  }
  if (entry.state === "no-crossing-within-horizon") {
    return {
      confidence: "usable",
      because:
        "the planner reported that confidence here does not lapse before the end of its horizon.",
    };
  }
  const crossing = entry.crossing_sim_time === null ? null : microsFromIso(entry.crossing_sim_time);
  if (crossing === null || atMicros === null) {
    return {
      confidence: "unknown",
      because:
        "the planner reported a crossing, but the instant it named or the instant asked about could not be read.",
    };
  }
  if (atMicros >= crossing) {
    return {
      confidence: "lapsed",
      because: `the planner projected confidence here falling below usable at ${entry.crossing_sim_time}.`,
    };
  }
  return {
    confidence: "lapses-later",
    because: `the planner projected confidence here holding until ${entry.crossing_sim_time}.`,
  };
}

/**
 * How the field is shown at one simulation instant, given the projection in force.
 *
 * The instant is simulation time, taken from a clock sample. Nothing host-derived reaches
 * this function, and nothing here reads a clock: the instant is an argument, which is what
 * lets decay be tested without any time passing.
 */
export function decayAt(projection: Projection | null, simTime: string | null): DecayView {
  if (projection === null) {
    return NOT_DECAYING;
  }
  const atMicros = simTime === null ? null : microsFromIso(simTime);
  const regions = projection.regions.map((entry) => {
    const { confidence, because } = confidenceFor(entry, atMicros);
    return {
      region: entry.h3_index,
      confidence,
      depthBand: entry.depth_band,
      uncertaintyAtProjection: entry.uncertainty_now,
      saturatedUncertainty: entry.saturated_uncertainty,
      crossingSimTime: entry.crossing_sim_time,
      because,
    };
  });
  return {
    decaying: true,
    notDecayingBecause: null,
    regions,
    usableThreshold: projection.usable_threshold,
    horizonSeconds: projection.horizon_seconds,
    regionCount: projection.region_count,
  };
}

/** How many regions are in each state, for a display that says so in one line. */
export function confidenceCounts(view: DecayView): Readonly<Record<Confidence, number>> {
  const counts: Record<Confidence, number> = { usable: 0, lapsed: 0, "lapses-later": 0, unknown: 0 };
  for (const region of view.regions) {
    counts[region.confidence] += 1;
  }
  return counts;
}

/** The sentence the display puts under the overlay. */
export function decayWords(view: DecayView): string {
  if (!view.decaying) {
    return `Not decaying: ${view.notDecayingBecause}`;
  }
  const counts = confidenceCounts(view);
  const truncated = view.regionCount !== null && view.regionCount !== view.regions.length;
  const missing = truncated
    ? ` The planner stated ${view.regionCount} regions and ${view.regions.length} arrived, so this projection is incomplete.`
    : "";
  return (
    `Decaying by the planner's published projection: ${counts.lapsed} of ${view.regions.length} regions ` +
    `have already lapsed, ${counts["lapses-later"]} lapse later within the horizon, and ${counts.usable} ` +
    `do not lapse before it ends.${missing}`
  );
}
