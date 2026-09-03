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
 * the profile's baseline band. `backgroundRaysIn` is that condition, and the region calls it and
 * reports what it returns, so a future source table that admitted one is named on the surface
 * rather than only in a test.
 *
 * **Order is declared, not encountered.** Rays are ordered by source id, so a source keeps its
 * place as the reader moves between levels and between runs; FR-123 wants stable positions, and
 * a set ordered by whatever the holding happened to list first is stable only by luck.
 *
 * **The set is the column's, at every level.** FR-128 is explicit — "same origin, same sources,
 * different widths" — and SC-003 asks for the count to be unchanged, so choosing a level
 * re-weights the whole column's sources rather than selecting among them. A source that
 * contributed nothing at the chosen level keeps its ray and its place, at zero width and marked
 * `reachedHere: false`, because a ray that vanishes says "this source is not part of this
 * column", which is a different and false claim. The first version of this file dropped them,
 * and argued in a comment that dropping was FR-129's absent-versus-zero distinction applied to
 * rays; it is not — FR-129 is about a *level*, and the distinction it asks for is carried here
 * by the flag and by what the profile prints, not by a line disappearing.
 */
import type { AnalysisContributions, AnalysisContributionsSource } from '../../generated/types.js';

/** One drawn ray: a source, where it is, how much it did, and the two numbers behind that. */
export interface Ray {
  readonly sourceId: string;
  /** Where this source sits in the served document's own table: its palette slot. */
  readonly sourceIndex: number;
  readonly datastreamId: string;
  readonly kind: AnalysisContributionsSource['kind'];
  /** Where the instrument was: the end of the drawn line. */
  readonly longitude: number;
  readonly latitude: number;
  /** Σⱼ K_aj for this source over the levels drawn. Signed: the gain may run negative. */
  readonly contribution: number;
  /** |contribution| as a fraction of the widest in the set, in [0, 1]. */
  readonly weight: number;
  /**
   * Whether this source reached the levels drawn at all. False keeps the ray — FR-128 fixes the
   * set — at zero width, and is what the profile and the numbers table say in words.
   */
  readonly reachedHere: boolean;
  /** FR-130's two numbers, at the level nearest the drawn set's own. */
  readonly separationKm: number;
  readonly separationM: number;
  readonly errorStd: number;
  readonly backgroundErrorStd: number;
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
  /** How many of the column's sources reached the levels drawn. */
  readonly reachedCount: number;
}

/**
 * The rays for a column, or for one level of it.
 *
 * `depthM` undefined is the column: FR-122's own reading, a source's contribution *to the
 * column*, summed over its levels. A depth re-weights to that level alone (FR-128) — same
 * sources, same origins, different widths, which is why this returns the whole source table's
 * order either way rather than only the sources that happened to reach the chosen level.
 *
 * **Chosen by depth and not by index, because the two documents do not share an axis.** The
 * shell's depth list came from whichever holding the inventory listed first — the archive, at
 * four levels — while an analysis is filed at six, so an index matched the row labelled 333 m
 * to the level at 200 m: one depth's background against another's contributions, and two of the
 * analysis's levels never shown. The axis is taken from the analysis now, and this matches on
 * the value anyway, so the pairing is checkable rather than assumed.
 */
export function levelAtDepth(
  document: AnalysisContributions,
  depthM: number,
): AnalysisContributions['levels'][number] | undefined {
  let nearest: AnalysisContributions['levels'][number] | undefined;
  for (const level of document.levels) {
    if (!nearest || Math.abs(level.depth_m - depthM) < Math.abs(nearest.depth_m - depthM)) nearest = level;
  }
  // Nearest, but only if it is *this* level: half the spacing of the document's own axis is
  // the widest a match can be and still be a match. A display depth with no level within that
  // is a depth this document does not carry, and saying so is the point.
  if (!nearest) return undefined;
  // Half the spacing of the document's own axis is the widest a match can be and still be one.
  // A document carrying a single level carries exactly that depth and no tolerance can be
  // derived from it, so the spacing is nought and the match is exact — an `Infinity` there
  // would make a one-level document answer for every depth asked of it.
  const spacing =
    document.levels.length > 1 ? Math.abs(document.levels[1].depth_m - document.levels[0].depth_m) : 0;
  return Math.abs(nearest.depth_m - depthM) <= spacing / 2 ? nearest : undefined;
}

export function raysFor(document: AnalysisContributions, depthM?: number): RaySet {
  const chosen = depthM === undefined ? undefined : levelAtDepth(document, depthM);
  const levels = depthM === undefined ? document.levels : chosen ? [chosen] : [];

  /** Per source index over the chosen levels: the summed contribution, and its separation. */
  const summed = new Map<number, { contribution: number; separationKm: number; separationM: number }>();
  let remainder = 0;
  let observationWeight = 0;
  for (const level of levels) {
    remainder += level.remainder;
    observationWeight += level.observation_weight;
    for (const entry of level.contributions) {
      const running = summed.get(entry.source);
      if (running) {
        running.contribution += entry.contribution;
      } else {
        summed.set(entry.source, {
          contribution: entry.contribution,
          // The separation stated is the one at the shallowest level the source reached. The
          // horizontal part is the same at every level of one column — a column is one
          // (longitude, latitude) — so only the vertical part varies, and the shallowest is the
          // level a reader is most likely looking at.
          separationKm: entry.separation.horizontal_km,
          separationM: entry.separation.vertical_m,
        });
      }
    }
  }

  let widest = 0;
  for (const entry of summed.values()) widest = Math.max(widest, Math.abs(entry.contribution));

  // Every source the column carries, whether or not it reached the levels drawn: FR-128 fixes
  // the set, and the flag carries what changed.
  const rays: Ray[] = document.sources.map((source, index) => {
    const entry = summed.get(index);
    return {
      sourceId: source.source_id,
      sourceIndex: index,
      datastreamId: source.datastream_id,
      kind: source.kind,
      longitude: source.observed.longitude,
      latitude: source.observed.latitude,
      contribution: entry?.contribution ?? 0,
      weight: entry && widest > 0 ? Math.abs(entry.contribution) / widest : 0,
      reachedHere: entry !== undefined,
      separationKm: entry?.separationKm ?? Number.NaN,
      separationM: entry?.separationM ?? Number.NaN,
      errorStd: source.error_std,
      backgroundErrorStd: source.background_error_std,
    };
  });
  rays.sort((a, b) => (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0));

  return {
    rays,
    remainder,
    observationWeight,
    widest,
    reachedCount: summed.size,
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
 * baseline as a ray.
 *
 * **It asks the master's own question, and the first version did not.** That version matched the
 * datastream id against five words taken from `config.analyst`'s share vocabulary — which is a
 * different vocabulary, in a different document, munged differently: the harness's datastream
 * ids are sensor streams like `temperature-050m`, and two of the shipped share labels are not
 * even in the list in their configured spelling. A shore broadcast admitted as
 * `shore-temperature-broadcast` would have passed straight through the guard written to catch
 * it. `kind` is `'measured' | 'modelled'` in the master, the analyst fills it, the numbers table
 * already prints it, and it is the question being asked.
 */
export function backgroundRaysIn(set: RaySet): readonly Ray[] {
  return set.rays.filter((ray) => ray.kind === 'modelled');
}
