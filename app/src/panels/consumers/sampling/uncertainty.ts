/**
 * Observation-driven uncertainty (FR-75, FR-77): the scalar the Sampling view colours its
 * hexes by, and the one thing in this feature most likely to be mistaken for something
 * else.
 *
 * It is **not** forecast uncertainty and **not** ensemble spread. drogna genuinely
 * publishes an ensemble spread, servable through the same query layer, and this is not
 * it. What this is, and says it is, is a proxy derived from observation coverage: how
 * long since a cell was last observed, how many observations it has received, and a
 * growth law that takes it back toward saturation while nobody looks.
 *
 * The three ingredients are separate on purpose. Recency alone would rate a cell sampled
 * once as well as a cell sampled forty times; density alone would rate a cell sampled
 * forty times yesterday as well as one sampled forty times a minute ago. Both are wrong in
 * ways the operational question — *where should I go to learn the most?* — punishes.
 *
 * A cell nothing has been heard from sits at saturation rather than at zero. An absent
 * observation is the opposite of a confident one, and a display that drew it as zero would
 * send the vessel exactly where it already knows the answer.
 *
 * The interface is deliberately the one a true ensemble spread would fit: a scalar per
 * hex per depth zone. Replacing the proxy with the published spread changes the source of
 * that scalar and nothing else here.
 *
 * Time is simulation time throughout, taken from the clock the harness publishes
 * (Constitution I).
 */
import { cellToParent } from 'h3-js';
import { secondsBetween } from '../domain.js';

export interface CoverageBin {
  /** How many observations have been binned here. */
  readonly count: number;
  /** The simulation instant of the most recent one. */
  readonly lastSimTime: string;
}

export interface UncertaintyModel {
  readonly saturation: number;
  readonly recencyTimescaleSeconds: number;
  readonly densityHalvingCount: number;
}

/** One bin: a hex at a depth zone. */
export function binKey(hex: string, zone: number): string {
  return `${hex}/${zone}`;
}

/**
 * Fold one observation into the coverage. Mutates, because this is called once per
 * message on the broker's own delivery path and a copy per observation would be a copy
 * per message.
 */
export function recordObservation(
  coverage: Map<string, CoverageBin>,
  hex: string,
  zone: number,
  simTime: string,
): void {
  const key = binKey(hex, zone);
  const standing = coverage.get(key);
  if (!standing) {
    coverage.set(key, { count: 1, lastSimTime: simTime });
    return;
  }
  coverage.set(key, {
    count: standing.count + 1,
    // Observations can arrive out of phenomenon-time order; the most recent one is the
    // one that matters and is kept by comparison rather than by arrival.
    lastSimTime: standing.lastSimTime > simTime ? standing.lastSimTime : simTime,
  });
}

/**
 * What a bin's uncertainty stands at, at this simulation instant.
 *
 * Density sets the floor a fresh observation leaves behind — every `densityHalvingCount`
 * observations halve it — and recency carries the bin back up from that floor toward
 * saturation on an exponential with the configured timescale. So: monotonically
 * increasing in time since the last observation, monotonically decreasing in count,
 * never above saturation, and equal to saturation for a bin nothing has been heard from.
 */
export function uncertaintyOf(
  bin: CoverageBin | undefined,
  simTime: string,
  model: UncertaintyModel,
): number {
  if (!bin) return model.saturation;
  const floor = model.saturation * Math.pow(0.5, bin.count / model.densityHalvingCount);
  const ageSeconds = Math.max(0, secondsBetween(bin.lastSimTime, simTime));
  const regrown = 1 - Math.exp(-ageSeconds / model.recencyTimescaleSeconds);
  return floor + (model.saturation - floor) * regrown;
}

export interface ZoneUncertainty {
  readonly hex: string;
  /** One value per depth zone, shallowest first. */
  readonly byZone: readonly number[];
  /** How many observations this hex has heard, across every zone. */
  readonly observations: number;
}

/** The field the view draws and the planner plans against: every hex, every zone. */
export function uncertaintyField(
  hexes: readonly string[],
  zoneCount: number,
  coverage: ReadonlyMap<string, CoverageBin>,
  simTime: string,
  model: UncertaintyModel,
): ZoneUncertainty[] {
  return hexes.map((hex) => {
    const byZone: number[] = [];
    let observations = 0;
    for (let zone = 0; zone < zoneCount; zone++) {
      const bin = coverage.get(binKey(hex, zone));
      observations += bin?.count ?? 0;
      byZone.push(uncertaintyOf(bin, simTime, model));
    }
    return { hex, byZone, observations };
  });
}

/**
 * Coverage binned at one resolution, read at a coarser one.
 *
 * The resolution control is local and recomputes instantly (FR-74), which would otherwise
 * mean re-binning every observation the tab has ever heard each time it moves. It does
 * not, because H3 cells nest exactly: observations are binned once at the finest
 * resolution the configuration offers, and a coarser view is the containment tree summed
 * — counts add, and the most recent instant is the latest of the children's. No
 * observation is counted twice and none is lost, which is a property of the index rather
 * than of this function.
 */
export function coverageAtResolution(
  coverage: ReadonlyMap<string, CoverageBin>,
  toResolution: number,
): Map<string, CoverageBin> {
  const coarse = new Map<string, CoverageBin>();
  for (const [key, bin] of coverage) {
    const slash = key.lastIndexOf('/');
    const hex = key.slice(0, slash);
    const zone = key.slice(slash + 1);
    const parent = cellToParent(hex, toResolution);
    const parentKey = `${parent}/${zone}`;
    const standing = coarse.get(parentKey);
    coarse.set(
      parentKey,
      standing
        ? {
            count: standing.count + bin.count,
            lastSimTime: standing.lastSimTime > bin.lastSimTime ? standing.lastSimTime : bin.lastSimTime,
          }
        : bin,
    );
  }
  return coarse;
}
