/**
 * What a cell's value was made from — as a field you can read at a glance, and pick apart.
 *
 * **This region was a stub naming feature 124, and then a grid of grey buttons over a list of
 * percentages.** Neither showed the thing. The analyst has published a full-grid provenance
 * field since feature 116 — four shares per cell (archive, departure, measurement, model), at
 * every depth, summing to one — and the interesting fact in it is *spatial*: the measurement
 * share is a footprint, bright where a sensor reached and dark where the analysis had nothing
 * but its background to go on, and that footprint shrinks with depth. A list of four numbers
 * for one column cannot show a footprint. A map can.
 *
 * So: a slab of the share field at a chosen depth, drawn as a map; a source selector that
 * switches between one source's share and whichever source dominates; a depth control that
 * walks the column; and a picked cell that opens into the full profile down the water column.
 *
 * **The rays are drawn here now** (feature 124). FR-122 wants one ray per contributing *source*
 * at a width proportional to that source's contribution, and until the analyst kept the gain's
 * columns there was nothing to draw one from. It publishes them, so a picked column draws a ray
 * to every source that reached it and a depth profile that breaks the measurement share into
 * those sources. What is still to come is the volume this plan is a section through.
 *
 * **Every figure is read through the query layer, over two paths.** The four provenance shares
 * come through OGC API-EDR — an area query for the slab, position queries for the column — as an
 * external client would ask for them. The per-source contributions come from the query
 * component's own contributions prefix, because a sparse per-source holding is not a coverage and
 * EDR has no query for one; the caption beneath the profile says so where a reader meets it.
 * Neither is a private path into the store, which is the property that matters: a surface that
 * bypassed the query layer would be evidence of nothing.
 *
 * **Nothing here polls** (FR-136), and that is a narrower claim than "nothing is fetched".
 * A fetch happens when a reader picks a depth or a cell, and **once when a new analysis cycle is
 * announced** — the field is re-read because it is a different field, and the axis because it
 * belongs to that analysis. Never on a tick, never on a timer, and never twice for one cycle.
 *
 * That last clause was false when it was written, and measured so: the analysis lands first and
 * the *grid* one round trip later, and the grid was a fresh object literal each cycle, so the slab
 * effect fired on the analysis and again on the grid's new identity — two byte-identical
 * full-grid area queries per cycle, one thrown away. `gridForAnalysis` memoises on the axis's own
 * values now, so a cycle that spans the same depths hands back the same object and the second
 * fetch does not happen. `FR-136` holds the restatement case; `FR-136: a new cycle re-reads the
 * field once` holds this one.
 *
 * This paragraph read "not on an announcement" while both effects were announcement-driven, which
 * is the sentence a reader would have audited the region against.
 *
 * **Colour is never the only carrier** (FR-138). The four sources sit in a fixed order with a
 * validated palette — checked against this shell's own surface `#10151b`, worst adjacent pair
 * ΔE 8.4 under protanopia, which is over the floor but close enough that secondary encoding is
 * required rather than optional. So each source also carries its own hatch, the legend names
 * every one, the readout under the map states the cell in words and figures, and the column
 * profile prints its percentages. With the colour removed the region still reads.
 *
 * **A share may be negative, and is shown as one.** Where a cell's background error greatly
 * exceeds the observed cell's, the gain extrapolates and a weight passes one — optimal
 * interpolation behaving correctly rather than a fault to clamp away. Negative shares are
 * hatched against the grain and printed with their sign rather than floored to zero.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnalysisContributions, AnalysisPublished, CoverageHolding } from '../../generated/types.js';
import { Profile, type ProfileLevel } from './Profile.js';
import type { SeamValidator } from '../../seam/validate.js';
import { RAY_MIN_DRAWN_PX, RAY_WIDTH_PX, drawnWidthOf, placeOn, raysFor, underScale } from './rays.js';
import { SOURCES, instrumentAt, sourceOf, type SourceKey, shareOf } from './shares.js';

/** The map's drawn resolution. The field is 96×80; this is what a panel can show legibly. */
const MAP = { maxCells: 48, height: 190 };

export interface ColumnGrid {
  readonly minimumLongitude: number;
  readonly maximumLongitude: number;
  readonly minimumLatitude: number;
  readonly maximumLatitude: number;
  readonly depthsM: readonly number[];
}

/** The grid and depths of the analysis being read, taken from the holding's own manifest. */
export function columnGridOf(holding: CoverageHolding | undefined): ColumnGrid | undefined {
  if (!holding) return undefined;
  const grid = holding.manifest.grid;
  return {
    minimumLongitude: grid.longitude.minimum,
    maximumLongitude: grid.longitude.minimum + (grid.longitude.count - 1) * grid.longitude.spacing,
    minimumLatitude: grid.latitude.minimum,
    maximumLatitude: grid.latitude.minimum + (grid.latitude.count - 1) * grid.latitude.spacing,
    depthsM: Array.from({ length: grid.depth.count }, (_, i) => grid.depth.minimum + i * grid.depth.spacing),
  };
}

/** A slab of the share field at one depth: the axes it was served on, and a share per source. */
interface Slab {
  readonly depthM: number;
  readonly longitudes: readonly number[];
  readonly latitudes: readonly number[];
  /** Source key to a row-major [lat][lon] array, as the coverage serves it. */
  readonly shares: Readonly<Record<SourceKey, readonly number[]>>;
}

/**
 * Every share unknown, for a depth whose query was refused.
 *
 * Built from `SOURCES` rather than written out, and spread by the two callers that fill it in
 * rather than each writing the literal again. Three copies of "what unknown looks like" sat in
 * this file, all of which had to agree — and the four keys are the analyst's storage order,
 * which `SOURCES` is already the one statement of.
 */
const EMPTY_SHARES: Readonly<Record<SourceKey, number>> = Object.fromEntries(
  SOURCES.map((source) => [source.key, Number.NaN]),
) as Record<SourceKey, number>;

interface Column {
  readonly longitude: number;
  readonly latitude: number;
  readonly levels: readonly ProfileLevel[];
}

interface RangeBody {
  domain?: { axes?: { x?: { values?: number[] }; y?: { values?: number[] } } };
  ranges?: Record<string, { values?: number[] }>;
}


/**
 * The four shares a position response carries, and `undefined` where two of its parameter names
 * read as one share.
 *
 * **The same ambiguity the area path refuses, refused here too.** `sourceOf` reads the segment
 * after the last `_share_` and so discards the variable: with two variables' provenance served,
 * `temperature_share_measurement` and `salinity_share_measurement` both answer `measurement` and
 * the last writer won. The slab was given a check for that and this — the path that builds the
 * profile's background bands — was not, so one region had two behaviours on one input.
 */
function sharesFrom<T>(
  body: RangeBody,
  at: (values: number[]) => T,
  // The reading for a share the body did not carry, passed rather than cast: the position path's
  // is `NaN` ("not served", which the profile prints as such) and the slab's is an empty array
  // ("no values at any cell"). A `Record<SourceKey, number>` cast into a `Record<SourceKey, T>`
  // gave the slab four `NaN`s for its arrays, which degrades to the same reading by accident
  // rather than by statement.
  absent: T,
): { shares: Record<SourceKey, T>; collided: string[] } {
  const out = Object.fromEntries(SOURCES.map((source) => [source.key, absent])) as Record<SourceKey, T>;
  const claimed = new Map<SourceKey, string>();
  const collided: string[] = [];
  for (const [name, range] of Object.entries(body.ranges ?? {})) {
    const key = sourceOf(name);
    if (!key || !range.values) continue;
    const already = claimed.get(key);
    if (already !== undefined) {
      collided.push(`${already} and ${name} both read as the ${key} share`);
      continue;
    }
    claimed.set(key, name);
    out[key] = at(range.values);
  }
  return { shares: out, collided };
}

export interface ColumnProvenanceProps {
  readonly analysis: AnalysisPublished | undefined;
  readonly grid: ColumnGrid | undefined;
  /** The EDR prefix the boundary serves on, from configuration — never assembled here. */
  readonly edrPrefix: string;
  /**
   * Where the contributions holding is served (feature 124). Its own prefix and not EDR's,
   * because a sparse per-source holding is not a coverage and the standard has no query for it.
   */
  readonly contributionsPrefix: string;
  /**
   * The seam's validator, for the one crossing this component makes on its own.
   *
   * The panel above validates the holdings inventory against its master before touching it, and
   * every broker payload goes through `drawable`; this component cast a 200 from the
   * contributions endpoint straight to `AnalysisContributions` and iterated `document.levels`
   * inside a `useMemo` during render. A body without `levels` is a `TypeError` thrown in render,
   * which unwinds the whole panel rather than stating a refusal — and Principle XI is that no
   * code path may know whether the seam is answered locally or remotely, so "the backend cannot
   * send that" is not a property this side may rely on. The master is committed and was unused.
   */
  readonly validator: SeamValidator;
  /**
   * True once the panel has asked for the depth axis its allowance of times and not got it.
   *
   * "Not known yet" and "asked several times and stopped" are different facts, and were the same
   * sentence: with the allowance spent the region went on saying the store "had none when this
   * console asked", which describes a state it is no longer in and a wait that is no longer
   * happening.
   */
  readonly gridGaveUp: boolean;
}

export function ColumnProvenance({
  analysis,
  grid,
  edrPrefix,
  contributionsPrefix,
  validator,
  gridGaveUp,
}: ColumnProvenanceProps) {
  const [depthIndex, setDepthIndex] = useState(0);
  /**
   * Opens on the strongest source, and that is a choice about what a reader meets first.
   * Every cell has a strongest source, so the field arrives full rather than nearly empty —
   * where opening on `measurement` showed one bright patch in a dark rectangle, which is a
   * true picture and a poor invitation. The footprint is one click away, and it is much more
   * striking once a reader has seen what it is a footprint *against*.
   */
  const [showing, setShowing] = useState<SourceKey | 'dominant'>('dominant');
  const [slab, setSlab] = useState<Slab | undefined>();
  const [column, setColumn] = useState<Column | undefined>();
  const [cursor, setCursor] = useState<{ row: number; col: number } | undefined>();
  /**
   * The served column, or which of the two ways it is not here. FR-129 names three facts and a
   * refusal is the third: collapsing it into `undefined` made the profile say the document had
   * not arrived while the refusal list beneath it said it had been refused.
   */
  const [contributions, setContributions] = useState<AnalysisContributions | 'refused' | undefined>();
  const [selectedLevel, setSelectedLevel] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  /**
   * One list per stream, for the reason the tokens are one per stream. They shared a list, and
   * the slab effect clears its own on every success — so a successful depth change deleted the
   * refusal that the profile's rows were pointing at with "the refusal is named beneath", and
   * left the sentence pointing at nothing.
   */
  const [slabRefusals, setSlabRefusals] = useState<readonly string[]>([]);
  const [columnRefusals, setColumnRefusals] = useState<readonly string[]>([]);
  const refusals = useMemo(() => [...slabRefusals, ...columnRefusals], [slabRefusals, columnRefusals]);
  /**
   * One token per request stream, and the reason is a regression the first attempt at this
   * caused. A single shared token looked economical and was not: `readColumn` bumping it
   * cancelled an *in-flight slab fetch*, so clicking a cell while a depth change was still in
   * the air left the map drawn from the old depth for good — the depth control showing 200 m
   * over the 0 m field — and `busy` stuck true because the `finally` was skipped with it. The
   * two streams are independent and their tokens are as well.
   */
  const wantedSlab = useRef(0);
  const wantedColumn = useRef(0);

  /**
   * The chosen depth, and it is `undefined` where the chooser's position no longer names a level
   * on the grid in hand.
   *
   * `depthIndex` is a position in `grid.depthsM`, and nothing reset it when the grid changed: an
   * analysis with fewer levels than the last left the index past the end, `depthM` undefined,
   * the slab effect returning early, and the previous era's field still drawn under a depth row
   * where no chip reads as chosen. The reset below is what closes that. It is unreachable on the
   * shipped configuration, where every analysis shares one axis — which is exactly the
   * assumption `gridForAnalysis` exists because it could not rely on.
   */
  useEffect(() => {
    setDepthIndex((at) => (grid && at < grid.depthsM.length ? at : 0));
  }, [grid]);

  const depthM = grid?.depthsM[depthIndex];

  /**
   * A picked column belongs to the analysis it was read from, and is dropped when another
   * lands. The map refetches on a new cycle already; the column and its contributions did not,
   * so a reader who left one open kept cycle N's bands, numbers and rays under a caption that
   * named cycle N+1's holding — a surface stating a provenance it did not have. Cleared rather
   * than silently refetched, because a column re-read under the reader's feet would move the
   * figures they were looking at without being asked.
   */
  useEffect(() => {
    // The token is bumped as well as the state cleared, because clearing alone leaves a read
    // already in the air free to land afterwards and re-populate the region with the previous
    // cycle's documents — under a caption naming the new one, which is the very fault this
    // effect was added to close.
    wantedColumn.current += 1;
    setColumn(undefined);
    setContributions(undefined);
    setSelectedLevel(undefined);
    setColumnRefusals([]);
  }, [analysis?.collections.contributions]);

  /**
   * The slab at the chosen depth, through an EDR **area** query — one request for the whole
   * field rather than one per cell, which is the query the standard has for exactly this.
   */
  const provenanceOf = analysis?.collections.provenance;
  useEffect(() => {
    if (!analysis || !provenanceOf || !grid || depthM === undefined) return;
    const token = ++wantedSlab.current;
    let cancelled = false;
    setBusy(true);
    void (async () => {
      const polygon =
        `POLYGON((${grid.minimumLongitude} ${grid.minimumLatitude}, ${grid.maximumLongitude} ${grid.minimumLatitude}, ` +
        `${grid.maximumLongitude} ${grid.maximumLatitude}, ${grid.minimumLongitude} ${grid.maximumLatitude}, ` +
        `${grid.minimumLongitude} ${grid.minimumLatitude}))`;
      try {
        const response = await fetch(
          `${edrPrefix}/collections/${analysis.collections.provenance}/area?coords=${encodeURIComponent(polygon)}&z=${depthM}`,
        );
        const body = (await response.json()) as RangeBody;
        if (cancelled || token !== wantedSlab.current) return;
        if (!response.ok) {
          setSlabRefusals([`the share field at ${depthM} m was refused: ${response.status}`]);
          setSlab(undefined);
        } else {
          const longitudes = body.domain?.axes?.x?.values ?? [];
          const latitudes = body.domain?.axes?.y?.values ?? [];
          // Through `sharesFrom`, which is where the one-range-per-share rule lives. It was
          // written out again here, eleven lines identical down to the message string, which is
          // two copies of a refusal rule that have to agree — the fault class this file's own
          // comments name repeatedly.
          const read = sharesFrom<number[]>(body, (values) => values, []);
          // **A field in which nothing resolved is a refusal, not a field of zeros.** `sharesFrom`
          // returns the absent reading for a share whose served name it did not recognise, and
          // with *no* name recognised the map drew every cell at `fillOpacity 0` — a uniformly
          // empty field indistinguishable from "this share is nought everywhere" — while in the
          // default `dominant` mode `dominantAt` returned `archive` at `-Infinity`, so each cell
          // drew as the archive, hatched, with the negative class: the shell asserting a
          // provenance for a cell nothing was served for. `shares.ts` already states this rule for
          // the profile ("a non-number treated as a zero is exactly the reading FR-041 forbids");
          // the map above it did not follow it.
          const resolved = SOURCES.filter((source) => read.shares[source.key].length > 0);
          if (resolved.length === 0) {
            setSlabRefusals([
              `the share field at ${depthM} m carried no share this shell recognises: ${Object.keys(body.ranges ?? {}).join(', ') || 'no ranges at all'}`,
            ]);
            setSlab(undefined);
          } else if (read.collided.length > 0) {
            setSlabRefusals([`the share field at ${depthM} m is ambiguous: ${read.collided.join('; ')}`]);
            setSlab(undefined);
          } else {
            setSlabRefusals([]);
            setSlab({ depthM, longitudes, latitudes, shares: read.shares });
          }
        }
      } catch (error) {
        if (!cancelled && token === wantedSlab.current) {
          setSlabRefusals([`the share field at ${depthM} m could not be read: ${String(error)}`]);
          setSlab(undefined);
        }
      } finally {
        if (!cancelled && token === wantedSlab.current) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // **The collection's name, not the analysis object, and this is FR-136 being kept rather
    // than merely claimed.** `analysis` is the payload of `analysis_standing`, which the analyst
    // republishes every `restate_every_ticks` with a fresh `sim_time` — a new object each time,
    // and therefore a new dependency each time. Measured: one full-grid EDR area query, same
    // collection, same `z`, every 60 ticks for as long as the tab is open, under a header
    // saying "not on a tick, not on an announcement, not on a timer". `SC-010: nothing polls`
    // could not see it, because it measures a window in which no analysis exists at all.
    //
    // A restatement carries the same collection names, so keyed on the name it changes nothing
    // and a genuinely new cycle asks once — which is what the sentence above always meant.
  }, [provenanceOf, grid, depthM, edrPrefix]);

  /** The water column under a picked cell, through one position query per depth. */
  const readColumn = useCallback(
    async (longitude: number, latitude: number) => {
      if (!analysis || !grid) return;
      // The same token the slab effect carries, and for the same reason. This reads seven
      // documents in sequence; two picks in flight, answered out of order, would leave one
      // column's four shares in the same bar as another's per-source contributions, under a
      // heading naming a third place. Today's transport answers in call order, which is
      // exactly the thing Principle XI says no code path may rely on knowing.
      const token = ++wantedColumn.current;
      // Cleared before the read, not merely replaced after it. `column` is set a round trip
      // before `contributions` arrives, so leaving the previous document standing drew the new
      // column's caption and coordinates over the *old* column's rays, bands and numbers for
      // the width of that trip — the mismatch the token exists to prevent, arriving by the one
      // door the token does not watch.
      setContributions(undefined);
      // **And the refusals with it**, for the reason the comment above gives about the document.
      // They were written only after the whole read, so between a click and the seven position
      // queries answering, the *previous* column's "the column at 400 m was refused: 503" stood
      // under the new column's heading and coordinates — a claim about content that is present
      // and correct, attributed to a place it is not about.
      setColumnRefusals([]);
      const levels: ProfileLevel[] = [];
      const failed: string[] = [];
      for (const depth of grid.depthsM) {
        const point = `POINT(${longitude.toFixed(4)} ${latitude.toFixed(4)})`;
        try {
          const response = await fetch(
            `${edrPrefix}/collections/${analysis.collections.provenance}/position?coords=${encodeURIComponent(point)}&z=${depth}`,
          );
          const body = (await response.json()) as RangeBody;
          if (!response.ok) {
            failed.push(`the column at ${depth} m was refused: ${response.status}`);
            // **A placeholder, not a skip.** The profile pairs a level with the contributions
            // the holding filed under the same depth index, so a level dropped on a refusal
            // shifted every level below it onto another depth's contributions — a bar summed
            // across two depths, an absence sentence about the wrong one, and a re-weighting to
            // a level the reader did not choose. Every depth gets a row, and a row that was
            // refused says so.
            levels.push({ depthM: depth, shares: EMPTY_SHARES, refused: true });
            continue;
          }
          const read = sharesFrom<number>(body, (values) => values[0] ?? Number.NaN, Number.NaN);
          if (read.collided.length > 0) {
            failed.push(`the column at ${depth} m is ambiguous: ${read.collided.join('; ')}`);
            levels.push({ depthM: depth, shares: EMPTY_SHARES, refused: true });
            continue;
          }
          levels.push({ depthM: depth, shares: read.shares });
        } catch (error) {
          failed.push(`the column at ${depth} m could not be read: ${String(error)}`);
          levels.push({ depthM: depth, shares: EMPTY_SHARES, refused: true });
        }
      }
      if (token !== wantedColumn.current) return;
      setColumn({ longitude, latitude, levels });
      setSelectedLevel(undefined);

      // The per-source column, in one request rather than one per level: the contributions
      // query serves a whole water column, which is the unit FR-121 says selection is in.
      const point = `POINT(${longitude.toFixed(4)} ${latitude.toFixed(4)})`;
      try {
        const response = await fetch(
          `${contributionsPrefix}/${analysis.collections.contributions}/column?coords=${encodeURIComponent(point)}`,
        );
        const body = (await response.json()) as AnalysisContributions | { refused?: string };
        // Checked before the write and not after it: a guard that runs once the state has
        // already been set cannot prevent the pairing it exists to prevent.
        if (token !== wantedColumn.current) return;
        if (!response.ok) {
          failed.push(
            `the per-source column was refused: ${response.status}${'refused' in body && body.refused ? ` — ${body.refused}` : ''}`,
          );
          setContributions('refused');
        } else if (!validator.validate('analysis-contributions', body).ok) {
          // A 200 whose shape is not the master's is a refusal, not a document: cast and
          // iterated it would throw inside a render-time `useMemo` and take the panel with it.
          failed.push('the per-source column did not match its master and was not drawn');
          setContributions('refused');
        } else {
          setContributions(body as AnalysisContributions);
        }
      } catch (error) {
        if (token !== wantedColumn.current) return;
        failed.push(`the per-source column could not be read: ${String(error)}`);
        setContributions('refused');
      }
      setColumnRefusals(failed);
    },
    [analysis, grid, edrPrefix, contributionsPrefix, validator],
  );

  /**
   * The drawn grid: the served field, thinned to what a panel can show.
   *
   * Thinned by taking every nth cell rather than by averaging, and that is deliberate — an
   * average of four shares is a share of nothing anybody computed, and this region's whole
   * subject is where a number came from. Every square drawn is a cell the analyst published.
   */
  const drawn = useMemo(() => {
    if (!slab || slab.longitudes.length === 0 || slab.latitudes.length === 0) return undefined;
    const stepX = Math.max(1, Math.ceil(slab.longitudes.length / MAP.maxCells));
    const stepY = Math.max(1, Math.ceil(slab.latitudes.length / MAP.maxCells));
    const cols: number[] = [];
    for (let x = 0; x < slab.longitudes.length; x += stepX) cols.push(x);
    const rows: number[] = [];
    for (let y = 0; y < slab.latitudes.length; y += stepY) rows.push(y);
    return { cols, rows };
  }, [slab]);

  /** The served column, where one arrived and was not refused. */
  const served = typeof contributions === 'object' ? contributions : undefined;

  /**
   * The ray *set* — what each source contributed — which needs the served column and nothing
   * else.
   *
   * Split from the geometry below, and the split is a fault being fixed. The two used to be one
   * memo that returned `undefined` unless a **slab** was also in hand, and the profile's numbers
   * table, its SC-001 caption and FR-125's named condition were all gated on it. None of the
   * three reads the field: they are the served document's own arithmetic. So a reader who moved
   * to a depth whose area query was refused lost the map — correctly, it could not be drawn —
   * and lost the two numbers FR-130 requires along with it, with the only message on the page
   * naming the refused field and nothing naming what had gone with it.
   */
  const raySet = useMemo(() => (served ? raysFor(served, selectedLevel) : undefined), [served, selectedLevel]);

  /**
   * The rays for the picked column, at the chosen level, placed on the map (FR-122, FR-128).
   *
   * Drawn on the surface plane and nowhere else: every one of these is a line between two points
   * of the map above, and depth is answered by the profile beneath it. FR-122 rules a ray
   * descending into the volume out on the grounds that it buys no explanation and costs a sorting
   * problem against translucent geometry, and the geometry here cannot express one — there is no
   * third coordinate to give it.
   */
  const rays = useMemo(() => {
    // `raySet` is defined exactly when `served` is, so `served` was a condition that could not be
    // independently true and a dependency the body never read; `const set = raySet` was a third
    // name for the same value one line down from the second.
    if (!raySet || !slab || !drawn || !column) return undefined;
    const x = placeOn(slab.longitudes, drawn.cols, column.longitude);
    const y = placeOn(slab.latitudes, drawn.rows, column.latitude);
    if (x === undefined || y === undefined) return undefined;
    // **Every source in the set, and FR-125 needs no filter here.** There was a `drawableRays`
    // between these two, dropping `kind: 'modelled'` sources on a misreading of the master:
    // modelled means "another party's model output *admitted as an observation*", so such a source
    // contributes and FR-124 says it is drawn as such. What FR-125 keeps out of the rays is the
    // standing forecast, which never enters as an observation and is therefore not in the source
    // table to be filtered. Once that was understood the function was the identity, and it was
    // kept for a round with three comments still describing it as a filter and two assertions
    // that could not fail — machinery earning nothing, which is what Principle VI calls it.
    const drawnRays = raySet.rays.flatMap((ray) => {
      const sourceX = placeOn(slab.longitudes, drawn.cols, ray.longitude);
      const sourceY = placeOn(slab.latitudes, drawn.rows, ray.latitude);
      if (sourceX === undefined || sourceY === undefined) return [];
      // `ray.sourceIndex` is the position `raysFor` built the ray from, so there is nothing to
      // search for and nothing to guard: the two spellings of a `findIndex` fallback this
      // replaced were both unreachable, and one of them passed −1 to `instrumentAt` on a path
      // that would have thrown.
      return [
        {
          ray,
          x: sourceX,
          y: sourceY,
          // Hue from the instrument, dash from the source: see `Ray.paletteSlot` and `textureSlot`.
          instrument: { ...instrumentAt(ray.textureSlot), hue: instrumentAt(ray.paletteSlot).hue },
        },
      ];
    });
    return { from: { x, y }, drawn: drawnRays };
  }, [raySet, slab, drawn, column]);

  /**
   * How many rays are at the width floor rather than at their own width (FR-122).
   *
   * Counted over `rays.drawn`, which is what the map puts on the screen. The two sets are the
   * same length by construction — the only thing that can drop a ray is a placement that returns
   * nothing, and that needs an empty axis, which `drawn` already guards — so this is the drawn
   * count *because that is what the sentence is about*, not because the two can differ.
   */
  const underScaleCount = rays ? rays.drawn.filter(({ ray }) => underScale(ray)).length : 0;

  const sharesAt = useCallback(
    (row: number, col: number): Record<SourceKey, number> => {
      const index = row * (slab?.longitudes.length ?? 0) + col;
      const out = { ...EMPTY_SHARES };
      if (!slab) return out;
      for (const source of SOURCES) out[source.key] = slab.shares[source.key][index] ?? Number.NaN;
      return out;
    },
    [slab],
  );

  /**
   * The strongest share at a cell, or **nothing** where none of the four is a number.
   *
   * It used to seed with `SOURCES[0]` at `-Infinity` and return that when nothing was finite, so a
   * cell with no readable share drew as the *archive*, hatched, at 0.15 opacity — and with the
   * negative class, because `-Infinity < 0`. The shell asserting a provenance for a cell nothing
   * was served for, while the readout beneath printed `archive NaN%`: two surfaces disagreeing on
   * one input. The whole-slab guard added for the same fault catches a field in which no *name*
   * resolved; this is the per-cell case, which a CoverageJSON producer using `null` for unsampled
   * cells — the standard's own idiom — reaches with every name resolving.
   */
  const dominantAt = useCallback(
    (row: number, col: number): { key: SourceKey; value: number } | undefined => {
      const shares = sharesAt(row, col);
      let best: { key: SourceKey; value: number } | undefined;
      for (const source of SOURCES) {
        const value = shares[source.key];
        if (Number.isFinite(value) && (!best || value > best.value)) best = { key: source.key, value };
      }
      return best;
    },
    [sharesAt],
  );

  // What is still feature 124's is a fact about the region, not about whether an analysis has
  // landed, so it is said on both branches.
  const stillToCome = (
    <p className="forecast-column-basis">
      The field here is a <strong>plan at one depth</strong>. The{' '}
      <strong>semi-transparent volume</strong>, with the thermocline as a surface through it and
      the forecast’s features carried down it, is <strong>feature 124’s remaining half</strong>{' '}
      and is not built: what it adds is a dimension to a drawing that works, and the reason to
      say so here rather than draw an empty frame is that the column selection, the rays and the
      profile are the explanation — the volume is the setting they happen in.
    </p>
  );

  if (!analysis || !grid) {
    return (
      <div className="forecast-column">
        <p className="not-landed" data-testid="column-absent">
          {!analysis
            ? 'no analysis has been announced yet, so there is no provenance to read. This region answers from the analysis cycle’s own published field rather than from a store the shell reaches into privately, and it waits for one to exist rather than drawing a field that would resolve to nothing.'
            : gridGaveUp
              ? 'an analysis has been announced, but the grid it spans could not be read: it comes from a holding’s own manifest, the store was asked for it several times over, and this console has stopped asking. Reloading the page starts a new run and asks again; switching views does not, because every view stays mounted.'
              : 'an analysis has been announced, but the grid it spans is not known yet: it is read from a holding’s own manifest, and the store had none when this console asked.'}
        </p>
        {stillToCome}
      </div>
    );
  }

  /**
   * **The readout's own indices, corrected.** `cursor` holds *drawn* positions — the map is
   * thinned to what a panel can show — while `sharesAt` and the served axes are indexed by
   * position in the *served* field. The keyboard handler translated (`drawn.cols[cursor.col]`);
   * this readout did not, so at the shipped grid, where the thinning step is two, hovering a
   * cell reported the shares and the position of a cell two rows and two columns away. It has
   * done so since the region was written. The `data-lon` and `data-lat` this feature added to
   * every cell are what made it visible — they carry the right coordinates, and printed the
   * wrong ones underneath.
   */
  const cursorRow = cursor && drawn ? drawn.rows[cursor.row] : undefined;
  const cursorCol = cursor && drawn ? drawn.cols[cursor.col] : undefined;
  const cellShares = cursorRow !== undefined && cursorCol !== undefined ? sharesAt(cursorRow, cursorCol) : undefined;
  const cellLongitude = cursorCol !== undefined && slab ? slab.longitudes[cursorCol] : undefined;
  const cellLatitude = cursorRow !== undefined && slab ? slab.latitudes[cursorRow] : undefined;

  return (
    <div className="forecast-column" data-testid="column-provenance">
      {/* Filters in one row above the chart: what to show, and how deep. */}
      <div className="forecast-column-controls">
        <div className="forecast-column-filter" role="group" aria-label="which contribution to show">
          <button
            type="button"
            className={`forecast-chip${showing === 'dominant' ? ' is-on' : ''}`}
            aria-pressed={showing === 'dominant'}
            onClick={() => setShowing('dominant')}
          >
            strongest
          </button>
          {SOURCES.map((source) => (
            <button
              key={source.key}
              type="button"
              className={`forecast-chip forecast-chip-${source.key}${showing === source.key ? ' is-on' : ''}`}
              aria-pressed={showing === source.key}
              onClick={() => setShowing(source.key)}
            >
              <span className="forecast-chip-swatch" style={{ background: source.hue }} aria-hidden="true" />
              {source.label}
            </button>
          ))}
        </div>
        <div className="forecast-column-filter" role="group" aria-label="depth">
          {grid.depthsM.map((depth, index) => (
            <button
              key={depth}
              type="button"
              className={`forecast-chip${index === depthIndex ? ' is-on' : ''}`}
              aria-pressed={index === depthIndex}
              onClick={() => setDepthIndex(index)}
            >
              {depth.toFixed(0)} m
            </button>
          ))}
        </div>
      </div>

      {/* **`busy` alone, not `busy && !slab`.** With a field already drawn, the chip for the new
          depth reads pressed the instant it is clicked while the map keeps rendering the previous
          depth's field for the whole round trip — and this line, which is the only thing that
          would have said so, was suppressed in exactly that case. The surface then contradicted
          itself silently: a pressed 400 m chip over a 0 m field, with the readout beneath naming
          the depth the field actually is. The same pair whose disagreement the token comment
          above records as a shipped fault. */}
      {busy && (
        <p className="forecast-column-busy">
          reading the share field
          {/* `depthM`, not `grid.depthsM[depthIndex]`. The index can be past the end of a grid
              that has just shrunk — the reset effect runs *after* the render that already read it
              — and this line, added in the round that also added the reset, was the one place
              that read it without a guard: `undefined.toFixed` throws out of render and unwinds
              the panel. Every other consumer goes through `depthM` and checks it. */}
          {slab && depthM !== undefined ? ` at ${depthM.toFixed(0)} m; the map below is still ${slab.depthM.toFixed(0)} m` : ''}…
        </p>
      )}

      {drawn && slab && (
        <>
          <svg
            className="forecast-share-map"
            viewBox={`0 0 ${drawn.cols.length} ${drawn.rows.length}`}
            preserveAspectRatio="none"
            style={{ height: `${MAP.height}px` }}
            role="grid"
            aria-label={`where each cell's value came from at ${slab.depthM.toFixed(0)} metres; arrow keys move, enter opens the column`}
            tabIndex={0}
            onKeyDown={(event) => {
              const step: Record<string, [number, number]> = {
                ArrowUp: [-1, 0],
                ArrowDown: [1, 0],
                ArrowLeft: [0, -1],
                ArrowRight: [0, 1],
              };
              const move = step[event.key];
              if (move) {
                event.preventDefault();
                const here = cursor ?? { row: Math.floor(drawn.rows.length / 2), col: Math.floor(drawn.cols.length / 2) };
                const row = Math.min(Math.max(here.row + move[0], 0), drawn.rows.length - 1);
                const col = Math.min(Math.max(here.col + move[1], 0), drawn.cols.length - 1);
                setCursor({ row, col });
                return;
              }
              if ((event.key === 'Enter' || event.key === ' ') && cursor) {
                event.preventDefault();
                const longitude = slab.longitudes[drawn.cols[cursor.col]];
                const latitude = slab.latitudes[drawn.rows[cursor.row]];
                if (longitude !== undefined && latitude !== undefined) void readColumn(longitude, latitude);
              }
            }}
          >
            <defs>
              {/* One hatch per source, so identity survives greyscale, a monochrome print and
                  the CVD pair the validator flagged at ΔE 8.4. */}
              {/* **Finer than one cell, or it is not texture but streaks.** The first version
                  tiled at four user units in a coordinate system where one unit is one cell, so
                  each tile spanned four cells and the map came out scratched with long diagonals
                  that crossed cell boundaries — vivid, and a picture of the pattern rather than
                  of the data. At 0.5 units every cell carries two strokes of its own.

                  Each tile is a wash of the hue plus a line at full strength, so a cell reads as
                  a solid block of colour at a glance and as a direction on inspection: the
                  colour carries identity for most readers and the angle carries it for the rest,
                  which is what the ΔE 8.4 adjacent pair obliges. */}
              {SOURCES.map((source) => (
                <pattern
                  key={source.pattern}
                  id={source.pattern}
                  patternUnits="userSpaceOnUse"
                  width="0.5"
                  height="0.5"
                  // The share's own declared angle, not `index * 45`. Computed from the position
                  // it produced 0°, 45°, 90°, 135°, two of which are exactly an instrument's
                  // hatch — and the angle was invisible to the test that claimed to hold the two
                  // vocabularies apart, because it was never on `SOURCES` at all.
                  patternTransform={`rotate(${source.angle})`}
                >
                  <rect x="0" y="0" width="0.5" height="0.5" fill={source.hue} fillOpacity="0.45" />
                  <line x1="0" y1="0" x2="0" y2="0.5" stroke={source.hue} strokeWidth="0.18" />
                </pattern>
              ))}
            </defs>
            {drawn.rows.map((sourceRow, row) =>
              drawn.cols.map((sourceCol, col) => {
                const shares = sharesAt(sourceRow, sourceCol);
                const shown = showing === 'dominant' ? dominantAt(sourceRow, sourceCol) : { key: showing, value: shares[showing] };
                // A cell with nothing readable in it is drawn as the ground it sits on and marked
                // unserved — not as the first share at nought, which is what a `-Infinity` seed
                // made it, complete with the negative class.
                const source = shown ? shareOf(shown.key) : undefined;
                const magnitude = shown && Number.isFinite(shown.value) ? Math.min(Math.abs(shown.value), 1) : 0;
                const isHere = cursor?.row === row && cursor?.col === col;
                return (
                  <rect
                    key={`${row}:${col}`}
                    x={col}
                    y={row}
                    width={1}
                    height={1}
                    // The share is carried by opacity against the console's own ground, which
                    // is monotonic in lightness by construction — a sequential ramp that needs
                    // no second hue and cannot invert.
                    fill={source ? (showing === 'dominant' ? `url(#${source.pattern})` : source.hue) : 'none'}
                    fillOpacity={source ? (showing === 'dominant' ? Math.max(magnitude, 0.15) : magnitude) : 0}
                    className={`share-cell${isHere ? ' is-here' : ''}${shown && shown.value < 0 ? ' is-negative' : ''}${source ? '' : ' is-unserved'}`}
                    // Where this cell is, from the served axes: the readout beneath states it
                    // for the one under the cursor, and this states it for every one, so the
                    // drawing can be checked against the holding cell by cell.
                    data-lon={slab.longitudes[sourceCol]?.toFixed(4)}
                    data-lat={slab.latitudes[sourceRow]?.toFixed(4)}
                    onMouseEnter={() => setCursor({ row, col })}
                    onClick={() => {
                      const longitude = slab.longitudes[sourceCol];
                      const latitude = slab.latitudes[sourceRow];
                      if (longitude !== undefined && latitude !== undefined) void readColumn(longitude, latitude);
                    }}
                  />
                );
              }),
            )}
            {cursor && (
              <rect
                className="share-cursor"
                x={cursor.col}
                y={cursor.row}
                width={1}
                height={1}
                pointerEvents="none"
              />
            )}

            {/* The rays, last so they sit over the field, and inert so they never take a click
                away from the cell beneath them.

                Stroke width is `non-scaling-stroke`: the map is drawn with
                `preserveAspectRatio="none"`, so a width in user units would be stretched by a
                different factor along each axis and a ray's thickness would depend on which way
                it happened to point. In screen units the ratios a reader compares are the
                arithmetic's own. */}
            {rays && (
              <g className="forecast-rays" data-testid="forecast-rays" pointerEvents="none">
                {rays.drawn.map(({ ray, x, y, instrument }) => (
                  <line
                    key={ray.sourceId}
                    className={`forecast-ray${ray.contribution < 0 ? ' is-negative' : ''}${ray.reachedHere ? '' : ' is-absent'}${underScale(ray) ? ' is-under-scale' : ''}`}
                    data-source={ray.sourceId}
                    data-weight={ray.weight.toFixed(4)}
                    data-reached={ray.reachedHere ? 'yes' : 'no'}
                    // The master's own word for what an origin is, on the drawn element, so
                    // SC-005 can be asked of the picture rather than of a source id's spelling.
                    data-kind={ray.kind}
                    x1={rays.from.x}
                    y1={rays.from.y}
                    x2={x}
                    y2={y}
                    stroke={instrument.hue}
                    // **Proportional, with no constant term.** FR-122 asks for a width
                    // proportional to the contribution, and `1 + weight * 7` is affine: at the
                    // measured fixture values it drew a 6.5:1 contribution ratio as 3.85:1, a
                    // 41% compression, while the comment below claimed the ratios were the
                    // arithmetic's own. A source that contributed almost nothing now draws
                    // almost nothing, which is the true statement; its origin dot still marks
                    // where it is and the numbers table still lists it.
                    //
                    // A source that reached nothing contributed nothing, so its line has no
                    // width — the truthful end of the same scale. The first attempt gave *it* a
                    // constant 0.75 to keep it visible, which **inverted the encoding**: any
                    // reached source under about 9% of the widest drew thinner than a source
                    // that reached nothing at all. What keeps its place is its origin marker,
                    // drawn hollow below, which is a position and not a quantity.
                    //
                    // The floor that remains is the other half of that correction, and it is
                    // for reached sources only. Measured on the shipped condition the six
                    // widths at 0 m ran 8, 0.47, 0.073, 0.0082, 0.0033, 0.0012 px — a 6667:1
                    // spread, five of the six below a device pixel and therefore drawn as
                    // nothing at all, under a sentence promising "the same sources at the same
                    // places, at that level's widths". Proportional and invisible is not more
                    // honest than proportional and marked: a ray under the floor is drawn at
                    // the floor and **says so** — in its class and in the note below the map,
                    // with its own figure in the numbers table beneath — so the reader is told
                    // the width is not the quantity rather than told the source is not there.
                    strokeWidth={drawnWidthOf(ray)}
                    // The instrument's own dash always: it is half of this source's identity
                    // without colour, and overriding it for a negative contribution — which the
                    // first version did — buys a sign at the cost of telling two sources apart.
                    // The sign is carried by the class and printed in the table.
                    strokeDasharray={instrument.dash}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {/* Every source's place, whether or not it reached the chosen level: this is
                    what FR-128 fixes across levels, and a position is not a quantity, so it is
                    the marker rather than the line that carries it. Hollow where the source
                    reached nothing here. */}
                {rays.drawn.map(({ ray, x, y, instrument }) => (
                  <circle
                    key={`${ray.sourceId}-origin`}
                    className={`forecast-ray-origin${ray.reachedHere ? '' : ' is-absent'}`}
                    data-source={ray.sourceId}
                    cx={x}
                    cy={y}
                    r={0.45}
                    fill={ray.reachedHere ? instrument.hue : 'none'}
                    // **Inline, because a presentation attribute loses.** This carried
                    // `stroke={instrument.hue}` as a JSX attribute while `forecast.css` set
                    // `.forecast-ray-origin { stroke: var(--shell-bg) }`. An SVG presentation
                    // attribute sits at specificity 0, below any class selector, so the class
                    // won every time. For a reached source that was invisible — the fill
                    // carries the hue — but an absent source is `fill: none`, so its only paint
                    // was the background colour and the marker the comment above calls "what
                    // keeps its place" was a background-coloured ring on a background. At the
                    // three deepest levels of the shipped column every ray is absent, so the
                    // whole ray layer went blank under a caption saying it had been re-weighted.
                    // An inline style beats a class, so the invariant is now one jsdom can read.
                    style={ray.reachedHere ? undefined : { stroke: instrument.hue }}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {/* `non-scaling-stroke` like the markers three lines up, and for the reason the
                    CSS beside them gives: the map is drawn with `preserveAspectRatio="none"`, so a
                    width in user units is stretched by a different factor along each axis. At the
                    shipped field's proportions this ring's left and right edges came out about
                    2 px and its top and bottom about 0.57 — sub-pixel — so the mark the blog's alt
                    text calls "a pale ring" rendered as two arcs. The width is in screen units to
                    match. */}
                <circle
                  className="forecast-ray-column"
                  cx={rays.from.x}
                  cy={rays.from.y}
                  r={0.5}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )}
          </svg>

          {/* **What the width scale could not carry, said where the widths are.** A ray whose
              true width is below `RAY_MIN_DRAWN_PX` is drawn at that floor, so its thickness is
              the map's limit and not its contribution; without this sentence the floor would be
              the quiet lie the proportional scale was there to avoid. The count is the drawing's
              own — the same predicate the stroke width is computed from — and the figures are in
              the table beneath. */}
          {underScaleCount > 0 && (
            <p className="forecast-ray-note" data-testid="forecast-under-scale">
              {underScaleCount === 1 ? 'One ray is' : `${underScaleCount} rays are`} drawn at the thinnest width this
              map can show: {underScaleCount === 1 ? 'its' : 'their'} share of the widest contribution is under{' '}
              {/* Formatted here rather than through `toLocaleString(undefined, …)`, which asks
                  the *host* for its locale: the same deterministic run rendered "9.4%" on one
                  machine and "9,4 %" on another. Not a wall clock and not entropy, but it is a
                  host read in the render path of a harness whose whole premise is that a run
                  reproduces. */}
              {((RAY_MIN_DRAWN_PX / RAY_WIDTH_PX) * 100).toFixed(1)}%,
              so the width is the floor rather than the figure. The figures are printed below.
            </p>
          )}

          {/* The readout under the map rather than a floating tooltip: it cannot be clipped at
              a phone's width, it is the same for a pointer and for the keyboard cursor, and a
              screen reader meets it in document order rather than chasing a popup. */}
          <p className="forecast-share-readout" aria-live="polite">
            {cellShares && cellLongitude !== undefined && cellLatitude !== undefined ? (
              <>
                <span className="forecast-share-where">
                  {cellLatitude.toFixed(2)}°N, {cellLongitude.toFixed(2)}°E at {slab.depthM.toFixed(0)} m
                </span>
                {SOURCES.map((source) => (
                  <span className="forecast-share-figure" key={source.key}>
                    <span className="forecast-share-swatch" style={{ background: source.hue }} aria-hidden="true" />
                    {source.label} {(cellShares[source.key] * 100).toFixed(0)}%
                  </span>
                ))}
              </>
            ) : (
              <span className="forecast-share-where">
                point at the field, or press an arrow key, for a cell’s four shares; enter or a
                click opens its water column
              </span>
            )}
          </p>
        </>
      )}

      {/* The legend is always present, because identity is never colour alone. */}
      <ul className="forecast-share-legend">
        {SOURCES.map((source) => (
          <li key={source.key}>
            <span className="forecast-share-swatch" style={{ background: source.hue }} aria-hidden="true" />
            {source.label}
          </li>
        ))}
      </ul>

      {column && (
        <Profile
          longitude={column.longitude}
          latitude={column.latitude}
          levels={column.levels}
          contributions={contributions}
          // The set, not the geometry: the profile's table and caption are the served
          // document's arithmetic and must not vanish with the map.
          rays={raySet}
          mapped={rays !== undefined}
          selectedLevel={selectedLevel}
          onSelectLevel={setSelectedLevel}
        />
      )}

      {refusals.length > 0 && (
        <p className="forecast-column-refused">
          {refusals.length} {refusals.length === 1 ? 'query was' : 'queries were'} refused and{' '}
          {refusals.length === 1 ? 'is' : 'are'} not drawn: {refusals.join('; ')}. Stated where
          the content would have been, rather than left as a gap.
        </p>
      )}

      <p className="forecast-column-caption">
        The field is read from <code>{analysis.collections.provenance}</code> through OGC
        API-EDR — one area query for the field, one position query per depth for a column — and
        the rays from <code>{analysis.collections.contributions}</code>, a sparse per-source
        holding served at its own prefix because it is not a coverage and the standard has no
        query for one. Both are the paths an external client takes, so the surface is evidence
        that the query layer works rather than a picture drawn from a private reach into the
        store.
      </p>

      {stillToCome}
    </div>
  );
}
