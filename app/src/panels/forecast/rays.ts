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
import { INSTRUMENTS } from './shares.js';
import type { AnalysisContributions, AnalysisContributionsSource } from '../../generated/types.js';

/** One drawn ray: a source, where it is, how much it did, and the two numbers behind that. */
export interface Ray {
  readonly sourceId: string;
  /** Where this source sits in the served document's own table: its palette slot. */
  readonly sourceIndex: number;
  /**
   * Which palette entry draws this ray — the *instrument's* slot, not the source's.
   *
   * It was `sourceIndex`, which is a position in the served document's `sources` array, and that
   * array is built by **first encounter while walking this column's levels** (`contributions.ts`
   * assigns `named.size` as it meets each source). So the order is a function of which column was
   * asked for: the same physical instrument came out `#8b4bc8`, no dash, hatch 0° in one column
   * and `#e0584a`, dash `6 3`, hatch 30° in the next — in a region whose whole premise is that a
   * reader picks one square and then another. Nothing on the surface said the palette had been
   * reassigned. `rays.ts` opens by arguing that order must be declared rather than encountered,
   * and the ray *list* honoured it while the swatch beside each row did not.
   *
   * Sorting the sources would not have fixed it: two columns with different source sets give the
   * same source different ranks. What is stable is the **instrument** — `datastream_id`, which is
   * the vessel's own name for the thing and is what `INSTRUMENTS` is a palette *of*. Two sources
   * of one instrument, either side of a cell boundary, now share its colour and are told apart by
   * the `·1`/`·2` ordinal and by their positions, which is what that ordinal exists for.
   *
   * This is stable across any two columns whose instrument sets agree, and the shell cannot
   * promise more than that without a list of every instrument in the run, which no served
   * document carries. The swatch sits beside the instrument's name in the table, and the name is
   * the identity.
   */
  readonly paletteSlot: number;
  /**
   * Which palette entry's **dash and hatch angle** draw this ray. The instrument's own, stepped
   * once for each further source that instrument has in this column.
   *
   * Hue alone cannot carry both things the reader needs. Keying it on the instrument makes a
   * colour mean the same thing in two columns — the fault above — but a loitering platform puts
   * three sources of one instrument in one column, and they then drew as three adjacent bands of
   * one bar identical in colour *and* texture, which is the defect the greyscale work exists
   * against. So the hue is the instrument's and the texture separates its sources: the step stays
   * inside `INSTRUMENTS`, whose angles are multiples of 30, so it cannot land on a share's
   * direction (odd multiples of 15) or the remainder band's.
   */
  readonly textureSlot: number;
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
  /**
   * True where a depth was asked for and the document carries no level at it.
   *
   * "No such level" and "a level nothing reached" are different facts and were the same zero.
   * With no level matched, `levels` is empty, so every figure sums to nought and the caption
   * printed *"0 of this column's N sources reached that level, contributing 0.0000 between them
   * … ω = 0.0000, the weight this cycle's observations added"* — a positive claim about a level
   * the document says nothing about, directly under the row's own sentence saying the analysis
   * carries no such level. `absenceOf` already tells these apart over the document; the ray set
   * did not, so the caption beneath the map could not.
   */
  readonly noSuchLevel: boolean;
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
  if (!nearest) return undefined;
  // **Nearest, and only if it is the same depth — not merely a near one.**
  //
  // This tolerated half the axis's own spacing, and a review worked out what that costs against
  // the very fault the join exists to catch. The archive era is filed at 0, 333, 667, 1000 and an
  // analysis at 0, 200, … 1000: asked for 333 the nearest level is 400, half the local spacing is
  // 100, and |400 − 333| = 67 passes. The second line of defence silently reproduced the
  // mis-pairing T022l fixed at the root, and only the missing 800 m row would have shown. A
  // tolerance wide enough to absorb a different axis is a tolerance that cannot refuse one.
  //
  // The two axes are built by the same arithmetic from the same manifest — `columnGridOf` and
  // `contributions.ts` both compute `minimum + index * spacing` — so a genuine match is equal to
  // within floating-point representation and nothing wider is wanted. The bound is therefore
  // relative to the depth's own magnitude rather than to the axis's spacing: a display depth that
  // is not this level's is not this level, however close the levels happen to be.
  const scale = Math.max(Math.abs(nearest.depth_m), Math.abs(depthM), 1);
  return Math.abs(nearest.depth_m - depthM) <= scale * 1e-9 ? nearest : undefined;
}

export function raysFor(document: AnalysisContributions, depthM?: number): RaySet {
  const chosen = depthM === undefined ? undefined : levelAtDepth(document, depthM);
  const levels = depthM === undefined ? document.levels : chosen ? [chosen] : [];
  const noSuchLevel = depthM !== undefined && chosen === undefined;

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
  const slots = paletteSlots(document.sources);
  const rays: Ray[] = document.sources.map((source, index) => {
    const entry = summed.get(index);
    return {
      sourceId: source.source_id,
      sourceIndex: index,
      paletteSlot: slots.hue[index] ?? 0,
      textureSlot: slots.texture[index] ?? 0,
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
    noSuchLevel,
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
/**
 * The palette entries each source is drawn in, by position in the served `sources` array: `hue`
 * is the rank of its instrument among the column's own instruments, sorted by name, and `texture`
 * steps from there once per further source of that same instrument.
 *
 * Sorted rather than encountered, for the reason `Ray.paletteSlot` gives at length — an
 * encounter order is a fact about which column was asked for, and the region asks about several.
 */
export function paletteSlots(sources: readonly AnalysisContributionsSource[]): {
  readonly hue: readonly number[];
  readonly texture: readonly number[];
} {
  const instruments = [...new Set(sources.map((source) => source.datastream_id))].sort();
  const ordinal = new Map<string, number>();
  const hue: number[] = [];
  const texture: number[] = [];
  for (const source of sources) {
    const slot = instruments.indexOf(source.datastream_id);
    const nth = ordinal.get(source.datastream_id) ?? 0;
    ordinal.set(source.datastream_id, nth + 1);
    hue.push(slot);
    // Stepped within `INSTRUMENTS`, so the angle stays a multiple of 30 and cannot collide with a
    // share's hatch or the remainder band's however many sources one instrument has.
    texture.push((slot + nth) % INSTRUMENTS.length);
  }
  return { hue, texture };
}

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

/**
 * The width the widest contribution in a column is drawn at, in screen pixels.
 *
 * Here rather than in the component because the note under the map, the numbers table and the
 * tests all have to agree with the drawing about which rays the width scale can carry, and three
 * copies of a threshold is how they come to disagree.
 */
export const RAY_WIDTH_PX = 8;

/**
 * The thinnest line the map can put on a screen. Below this a stroke is under a device pixel and
 * renders as nothing whatever the arithmetic says — which is the argument for the number being
 * **one** and not the 0.75 it was first written as. At `devicePixelRatio` 1 a 0.75 px stroke is
 * itself sub-pixel, antialiased to about three-quarters alpha and then dimmed again by
 * `.is-under-scale`; a floor defined as "what a screen can show" that a screen cannot quite show
 * is the same claim the floor was added to stop the drawing making.
 *
 * **This is not the constant term T022k removed.** That one was added to every ray, absent ones
 * included, and inverted the encoding: a source contributing under about 9% of the widest drew
 * *thinner* than a source that contributed nothing at all. This one applies to reached sources
 * only, so the ordering "contributed something" > "contributed nothing" is never crossed, and a
 * ray that meets it is marked under-scale rather than passed off as a quantity.
 */
export const RAY_MIN_DRAWN_PX = 1;

/** The stroke width a ray is drawn at: proportional, floored at what a screen can show. */
export function drawnWidthOf(ray: Ray): number {
  if (!ray.reachedHere) return 0;
  return Math.max(ray.weight * RAY_WIDTH_PX, RAY_MIN_DRAWN_PX);
}

/**
 * True where a ray's true width is below what the map can draw, so its drawn width is the floor
 * and not its contribution.
 *
 * Measured on the **loitering** condition this is five rays of six at 0 m: the widths the
 * proportional scale asks for run 8, 0.47, 0.073, 0.0082, 0.0033 and 0.0012 px. Drawing them
 * proportionally means drawing one ray and calling it six.
 */
export function underScale(ray: Ray): boolean {
  return ray.reachedHere && ray.weight * RAY_WIDTH_PX < RAY_MIN_DRAWN_PX;
}

/**
   * Where a longitude and latitude fall in the drawn map's coordinates, which are one unit per
   * drawn cell.
   *
   * **Interpolated, and the previous version's snapping is why.** This used to snap a value to
   * the nearest served axis entry and then that entry to the nearest *drawn* column, on the
   * argument that "two served cells can share one drawn column and the line lands within that".
   * Measured on the **loitering** condition, that argument's conclusion was wrong: the
   * platform's sources sit within a cell or two of the column they reach, the map is thinned by
   * two, and **four of six rays came out with `x1 === x2` and `y1 === y2`** — including the one
   * carrying the whole width encoding. A line of zero length is not a thin line, it is no line,
   * and nothing in the tree measured one: the SC-003 assertion compared `"23.5,20.5"` to itself
   * and the containment check could not fail because the snapping structurally returned a cell
   * centre.
   *
   * So the position is carried through continuously: a fractional index on the served axis, by
   * linear interpolation between the two entries that bracket the value, divided by the thinning
   * step. Thinning still costs resolution — a served cell is half a drawn unit at step 2 — but it
   * no longer costs the line its existence. The figures beneath still carry what the picture
   * cannot: the separation stated is the analysis's own, cell centre to cell centre.
   *
   * A value outside the axis is clamped to the drawn extent. The axes carry cell *centres* and
   * an observation sits inside a cell, so this is at most half a cell and only ever at the grid's
   * rim; it is a clamp rather than an invention because the alternative — a marker outside the
   * map — reads as a place the source is not.
   */
export function placeOn(axis: readonly number[], kept: readonly number[], value: number): number | undefined {
  if (axis.length === 0 || kept.length === 0) return undefined;
  let served = 0;
  if (axis.length > 1) {
      const ascending = axis[axis.length - 1] >= axis[0];
      served = ascending === (value < axis[0]) ? 0 : axis.length - 1;
      for (let index = 0; index < axis.length - 1; index++) {
        const from = axis[index];
        const to = axis[index + 1];
        if (value >= Math.min(from, to) && value <= Math.max(from, to)) {
          served = to === from ? index : index + (value - from) / (to - from);
          break;
        }
      }
  }
  // `kept` is `0, step, 2*step, …` by construction, so a served index divided by the step is
  // the drawn column it falls in, fraction and all.
  const step = kept.length > 1 ? kept[1] - kept[0] : 1;
  return Math.min(Math.max(served / step + 0.5, 0), kept.length);
}

/**
 * The rays that may be **drawn on the map**: the set, less any modelled origin.
 *
 * FR-125 and SC-005 say the standing forecast is not among the rays, and `backgroundRaysIn`
 * above reports one that appears — but reporting it and drawing it anyway put the guard on the
 * sentence rather than on the surface, which matters because the SRD's FR-123 amendment leans on
 * exactly this guard for the day an analyst admits a non-spatial source.
 *
 * It is only the *map* that loses it. The numbers table, the caption and the ω identity keep it,
 * because it is part of what the gain weighed: dropping it there would silently break the SC-001
 * sum, which is how a reader would learn that something had gone wrong.
 */
export function drawableRays(set: RaySet): readonly Ray[] {
  return set.rays.filter((ray) => ray.kind !== 'modelled');
}
