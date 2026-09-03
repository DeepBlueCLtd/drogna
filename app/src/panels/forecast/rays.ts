/**
 * What a column's value was made from, arranged as rays (SRD-v2 FR-122 to FR-125, FR-130).
 *
 * Pure arithmetic over the served contributions document: no DOM, no fetch, no React, so the
 * thing the picture is a picture *of* can be tested on its own. The drawing is
 * `ColumnProvenance.tsx`'s; the decisions about what a ray means are here, where a test can
 * reach them.
 *
 * Five of those decisions are load-bearing enough to write down.
 *
 * **A ray's origin is where the instrument was, and its figure is the separation the gain
 * used.** Those are two different distances and the difference is deliberate. H is
 * nearest-neighbour, so an observation is attributed wholly to one cell and the taper is
 * evaluated cell centre to cell centre — that is the number the weight was computed from, and
 * it is what FR-130 requires the surface to be able to state. But a reader asking "where did
 * this come from" means the water, not the bookkeeping, so the line is drawn to
 * `source.observed`. Half a cell of daylight between the line's end and the number beneath it
 * is honest; making the line agree with the number would be drawing the grid's opinion of
 * where the ship was.
 *
 * **Widths are proportional within the drawn set, and normalised by the widest.** FR-122 asks
 * for a width proportional to that source's contribution, which fixes the ratios and not the
 * scale. The scale cannot be absolute: a contribution is a gain coefficient, not a share, and
 * where a cell's background error dwarfs the observed cell's the gain extrapolates and passes
 * one — measured on the shipped configuration, the holdings' declared tolerances imply
 * magnitudes reaching 32 to 64 by the third cycle (specs/124 T002, recorded there before this
 * was written). A width proportional to that against a fixed maximum would draw one ray as a
 * slab and the rest as hairlines. So the widest ray in the set drawn is the widest a ray gets,
 * every other is its true fraction of that, and the figure is printed beside it — the picture
 * carries the ratios, the text carries the magnitude.
 *
 * **The remainder is not a ray.** The correlation's support bounds the covariance and not the
 * gain, so observations beyond a cell's reach still move it through the inverse's coupling with
 * ones within reach. That contribution is real and has no position — there is no single place
 * to draw it from — so it is returned beside the rays as a figure the region states, never as a
 * line to somewhere. Drawing it from the margin would invent a provenance.
 *
 * **The standing forecast is not among the rays**, and this is a named condition rather than an
 * absence (FR-125, SC-005). It is the background: the baseline the corrections sit on, drawn as
 * the profile's baseline band. `assertNoBackgroundRay` says so where a future source table that
 * admitted one would be caught.
 *
 * **Order is declared, not encountered.** Rays are ordered by source id, so a source keeps its
 * place as the reader moves between levels and between runs; FR-123 wants stable positions, and
 * a set ordered by whatever the holding happened to list first is stable only by luck.
 */
import type { AnalysisContributions, AnalysisContributionsSource } from '../../generated/types.js';

/** One drawn ray: a source, where it is, how much it did, and the two numbers behind that. */
export interface Ray {
  readonly sourceId: string;
  readonly datastreamId: string;
  readonly sensorId: string;
  readonly kind: AnalysisContributionsSource['kind'];
  /** Where the instrument was: the end of the drawn line. */
  readonly longitude: number;
  readonly latitude: number;
  /** The cell the gain attributed it to: what the separation below is measured from. */
  readonly cellLongitude: number;
  readonly cellLatitude: number;
  readonly cellDepthM: number;
  /** Σⱼ K_aj for this source over the levels drawn. Signed: the gain may run negative. */
  readonly contribution: number;
  /** |contribution| as a fraction of the widest in the set, in [0, 1]. */
  readonly weight: number;
  /** FR-130's two numbers, at the level nearest the drawn set's own. */
  readonly separationKm: number;
  readonly separationM: number;
  readonly errorStd: number;
  readonly backgroundErrorStd: number;
  readonly observationCount: number;
}

export interface RaySet {
  /** Ordered by source id, and the same order at every level of one column. */
  readonly rays: readonly Ray[];
  /**
   * ω less the in-support sources' contributions, over the levels drawn: what observations
   * beyond this column's reach did to it. Positionless, and never a ray.
   */
  readonly remainder: number;
  /** Σⱼ K_aj over every observation, over the levels drawn. */
  readonly observationWeight: number;
  /** The largest |contribution| the widths were normalised by; 0 when nothing contributed. */
  readonly widest: number;
  /** True where every level drawn reported no source within reach (FR-129's first fact). */
  readonly unreached: boolean;
  /** The levels this set was summed over, by depth index. */
  readonly levels: readonly number[];
}

/**
 * The rays for a column, or for one level of it.
 *
 * `levelIndex` undefined is the column: FR-122's own reading, a source's contribution *to the
 * column*, summed over its levels. A level index re-weights to that level alone (FR-128) — same
 * sources, same origins, different widths, which is why this returns the whole source table's
 * order either way rather than only the sources that happened to reach the chosen level.
 */
export function raysFor(document: AnalysisContributions, levelIndex?: number): RaySet {
  const levels =
    levelIndex === undefined
      ? document.levels
      : document.levels.filter((level) => level.depth_index === levelIndex);

  /** Per source index: the summed contribution, and the separation at the deepest level it reached. */
  const summed = new Map<number, { contribution: number; separationKm: number; separationM: number }>();
  let remainder = 0;
  let observationWeight = 0;
  let reached = false;
  for (const level of levels) {
    if (level.reached) reached = true;
    remainder += level.remainder;
    observationWeight += level.observation_weight;
    for (const entry of level.contributions) {
      const running = summed.get(entry.source);
      if (running) {
        running.contribution += entry.contribution;
        // The separation stated is the one at the level nearest the surface, which is the
        // level a reader is most likely looking at; the horizontal part is the same at every
        // level of one column anyway, since a column is one (longitude, latitude).
      } else {
        summed.set(entry.source, {
          contribution: entry.contribution,
          separationKm: entry.separation.horizontal_km,
          separationM: entry.separation.vertical_m,
        });
      }
    }
  }

  let widest = 0;
  for (const entry of summed.values()) widest = Math.max(widest, Math.abs(entry.contribution));

  const rays: Ray[] = [];
  for (const [index, entry] of summed) {
    const source = document.sources[index];
    // A contribution naming a source the document does not carry is a served document that
    // disagrees with itself; it is dropped rather than drawn at a guessed position, and the
    // count the region prints will not match, which is the visible form of the fault.
    if (!source) continue;
    rays.push({
      sourceId: source.source_id,
      datastreamId: source.datastream_id,
      sensorId: source.sensor_id,
      kind: source.kind,
      longitude: source.observed.longitude,
      latitude: source.observed.latitude,
      cellLongitude: source.cell.longitude,
      cellLatitude: source.cell.latitude,
      cellDepthM: source.cell.depth_m,
      contribution: entry.contribution,
      weight: widest > 0 ? Math.abs(entry.contribution) / widest : 0,
      separationKm: entry.separationKm,
      separationM: entry.separationM,
      errorStd: source.error_std,
      backgroundErrorStd: source.background_error_std,
      observationCount: source.observation_count,
    });
  }
  rays.sort((a, b) => (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0));

  return {
    rays,
    remainder,
    observationWeight,
    widest,
    unreached: !reached,
    levels: levels.map((level) => level.depth_index),
  };
}

/**
 * A label per source that a reader can tell apart, which the datastream alone is not.
 *
 * **Found by reading a capture rather than by reading the code.** One instrument sampling on
 * either side of a cell boundary becomes two sources — same datastream, different attributed
 * cell — and the profile printed both as `temperature-200m`, at 106.0% and 21.7% of one level.
 * Two bands, one name, and no way to tell which was which. Where a datastream carries the
 * column alone it keeps its plain name; where it carries more than one source, each gets its
 * ordinal, and the numbers table's separation column says which is physically which.
 */
export function sourceLabels(sources: readonly AnalysisContributionsSource[]): readonly string[] {
  const seen = new Map<string, number>();
  for (const source of sources) seen.set(source.datastream_id, (seen.get(source.datastream_id) ?? 0) + 1);
  const used = new Map<string, number>();
  return sources.map((source) => {
    if ((seen.get(source.datastream_id) ?? 0) < 2) return source.datastream_id;
    const ordinal = (used.get(source.datastream_id) ?? 0) + 1;
    used.set(source.datastream_id, ordinal);
    return `${source.datastream_id} ·${ordinal}`;
  });
}

/**
 * The identity the picture may be checked against (SC-001, AT-07): the drawn contributions and
 * the remainder sum to the weight the holding published for the same levels.
 *
 * Returned as the two numbers and their difference rather than as a verdict, because the
 * tolerance belongs to the holding — its manifest declares one, derived from float32's width at
 * the magnitude it actually stores — and a threshold chosen here would be a second opinion about
 * how close is close enough.
 */
export function contributionResidual(set: RaySet): { drawn: number; published: number; difference: number } {
  let drawn = set.remainder;
  for (const ray of set.rays) drawn += ray.contribution;
  return { drawn, published: set.observationWeight, difference: drawn - set.observationWeight };
}

/**
 * The background is not a source (FR-125, SC-005).
 *
 * Every source in the contributions holding is an instrument by construction — the analyst
 * assimilates the vessel's own datastreams and nothing else, and the shore broadcast enters as
 * background rather than as an observation — so this never fires today. It exists because
 * "never" is a claim about a document that a later feature could change: admit a modelled origin
 * to the source table and this names it rather than letting the surface quietly draw the
 * baseline as a ray. The names are the harness's own, from `config.analyst`'s share vocabulary.
 */
export const BACKGROUND_SOURCE_NAMES: readonly string[] = ['archive', 'departure', 'model', 'forecast', 'background'];

export function backgroundRaysIn(set: RaySet): readonly Ray[] {
  return set.rays.filter((ray) => BACKGROUND_SOURCE_NAMES.some((name) => ray.datastreamId === name));
}
