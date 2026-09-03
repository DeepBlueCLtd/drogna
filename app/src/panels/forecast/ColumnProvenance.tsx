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
 * **What is genuinely blocked is narrower than this region.** FR-122 wants one ray per
 * contributing *source* at a width proportional to that source's contribution, and the
 * analysis kernel computes the per-observation gain row by row and then reports only the row
 * sum, so the columns a ray needs are discarded. The rays wait. The field did not have to.
 *
 * **Every figure is read through OGC API-EDR** — an area query for the slab, position queries
 * for the column — exactly as an external client would ask for it. The shell holds no private
 * path to the store, and a surface that bypassed the query layer would be evidence of nothing.
 *
 * **Nothing here polls** (FR-136). A fetch happens when a reader picks a depth or a cell, and
 * at no other time: not on a tick, not on an announcement, not on a timer.
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
import { Profile } from './Profile.js';
import { raysFor } from './rays.js';
import { SOURCES, instrumentAt, type SourceKey } from './shares.js';

export { SOURCES } from './shares.js';

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

interface Level {
  readonly depthM: number;
  readonly shares: Readonly<Record<SourceKey, number>>;
}

interface Column {
  readonly longitude: number;
  readonly latitude: number;
  readonly levels: readonly Level[];
}

interface RangeBody {
  domain?: { axes?: { x?: { values?: number[] }; y?: { values?: number[] } } };
  ranges?: Record<string, { values?: number[] }>;
}

/**
 * Which share a served parameter name belongs to, or nothing where it names something else.
 *
 * **Matched on the segment after `_share_`, by prefix, and the reason is a fault this had.**
 * The analyst names each field from its *configured label* — `config.analyst.shares.departure`
 * ships as "departure forecast" — so the served parameter is `temperature_share_departure_forecast`.
 * Matched by `endsWith('_departure')` that name misses, and the departure share came back `NaN`
 * on every cell of every column: drawn as nothing on the map, and printed as `NaN%` in the
 * readout beneath it, since feature 116. Nothing caught it because both surfaces treated a
 * non-number as a zero, which is exactly the reading FR-041 forbids and is why the profile
 * below now states an absent share rather than drawing one.
 *
 * The prefix match is deliberate rather than a wider `includes`: a label may be extended
 * ("departure forecast", "departure brief") and still be the departure share, but a share whose
 * label stops beginning with its key is a vocabulary change the shell should miss loudly.
 */
export function sourceOf(parameterName: string): SourceKey | undefined {
  const at = parameterName.lastIndexOf('_share_');
  const suffix = at >= 0 ? parameterName.slice(at + '_share_'.length) : parameterName;
  return SOURCES.find((source) => suffix === source.key || suffix.startsWith(`${source.key}_`))?.key;
}

function sharesFrom(body: RangeBody, at: (values: number[]) => number): Record<SourceKey, number> {
  const out = { archive: Number.NaN, departure: Number.NaN, measurement: Number.NaN, model: Number.NaN };
  for (const [name, range] of Object.entries(body.ranges ?? {})) {
    const key = sourceOf(name);
    if (key && range.values) out[key] = at(range.values);
  }
  return out;
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
}

export function ColumnProvenance({ analysis, grid, edrPrefix, contributionsPrefix }: ColumnProvenanceProps) {
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
  /** The served per-source column, and which of its levels the rays are weighted to. */
  const [contributions, setContributions] = useState<AnalysisContributions | undefined>();
  const [selectedLevel, setSelectedLevel] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  const [refusals, setRefusals] = useState<readonly string[]>([]);
  const wanted = useRef(0);

  const depthM = grid?.depthsM[depthIndex];

  /**
   * The slab at the chosen depth, through an EDR **area** query — one request for the whole
   * field rather than one per cell, which is the query the standard has for exactly this.
   */
  useEffect(() => {
    if (!analysis || !grid || depthM === undefined) return;
    const token = ++wanted.current;
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
        if (cancelled || token !== wanted.current) return;
        if (!response.ok) {
          setRefusals([`the share field at ${depthM} m was refused: ${response.status}`]);
          setSlab(undefined);
        } else {
          const longitudes = body.domain?.axes?.x?.values ?? [];
          const latitudes = body.domain?.axes?.y?.values ?? [];
          const shares = {
            archive: [] as number[],
            departure: [] as number[],
            measurement: [] as number[],
            model: [] as number[],
          };
          for (const [name, range] of Object.entries(body.ranges ?? {})) {
            const key = sourceOf(name);
            if (key && range.values) shares[key] = range.values;
          }
          setRefusals([]);
          setSlab({ depthM, longitudes, latitudes, shares });
        }
      } catch (error) {
        if (!cancelled && token === wanted.current) {
          setRefusals([`the share field at ${depthM} m could not be read: ${String(error)}`]);
          setSlab(undefined);
        }
      } finally {
        if (!cancelled && token === wanted.current) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [analysis, grid, depthM, edrPrefix]);

  /** The water column under a picked cell, through one position query per depth. */
  const readColumn = useCallback(
    async (longitude: number, latitude: number) => {
      if (!analysis || !grid) return;
      const levels: Level[] = [];
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
            continue;
          }
          levels.push({ depthM: depth, shares: sharesFrom(body, (values) => values[0] ?? Number.NaN) });
        } catch (error) {
          failed.push(`the column at ${depth} m could not be read: ${String(error)}`);
        }
      }
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
        if (!response.ok) {
          failed.push(
            `the per-source column was refused: ${response.status}${'refused' in body && body.refused ? ` — ${body.refused}` : ''}`,
          );
          setContributions(undefined);
        } else {
          setContributions(body as AnalysisContributions);
        }
      } catch (error) {
        failed.push(`the per-source column could not be read: ${String(error)}`);
        setContributions(undefined);
      }
      setRefusals(failed);
    },
    [analysis, grid, edrPrefix, contributionsPrefix],
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
    return { cols, rows, width: slab.longitudes.length };
  }, [slab]);

  /**
   * Where a longitude and latitude fall in the drawn map's coordinates, which are one unit per
   * drawn cell. The served axes are the authority for what is where: a value is snapped to the
   * nearest axis entry and then to the nearest drawn column, so a ray ends on the cell the
   * analysis actually attributed the observation to rather than on an interpolated point
   * between two of them.
   */
  const placeOn = useCallback(
    (axis: readonly number[], kept: readonly number[], value: number): number | undefined => {
      if (axis.length === 0 || kept.length === 0) return undefined;
      let nearest = 0;
      for (let index = 1; index < axis.length; index++) {
        if (Math.abs(axis[index] - value) < Math.abs(axis[nearest] - value)) nearest = index;
      }
      let at = 0;
      for (let index = 1; index < kept.length; index++) {
        if (Math.abs(kept[index] - nearest) < Math.abs(kept[at] - nearest)) at = index;
      }
      return at + 0.5;
    },
    [],
  );

  /**
   * The rays for the picked column, at the chosen level (FR-122, FR-128).
   *
   * Drawn on the surface plane and nowhere else: every one of these is a line between two
   * points of the map above, and depth is answered by the profile beneath it. FR-122 rules a
   * ray descending into the volume out on the grounds that it buys no explanation and costs a
   * sorting problem against translucent geometry, and the geometry here cannot express one —
   * there is no third coordinate to give it.
   */
  const rays = useMemo(() => {
    if (!contributions || !slab || !drawn || !column) return undefined;
    const set = raysFor(contributions, selectedLevel);
    const x = placeOn(slab.longitudes, drawn.cols, column.longitude);
    const y = placeOn(slab.latitudes, drawn.rows, column.latitude);
    if (x === undefined || y === undefined) return undefined;
    const drawnRays = set.rays.flatMap((ray, index) => {
      const sourceX = placeOn(slab.longitudes, drawn.cols, ray.longitude);
      const sourceY = placeOn(slab.latitudes, drawn.rows, ray.latitude);
      if (sourceX === undefined || sourceY === undefined) return [];
      const position = contributions.sources.findIndex((candidate) => candidate.source_id === ray.sourceId);
      return [{ ray, x: sourceX, y: sourceY, instrument: instrumentAt(position < 0 ? index : position) }];
    });
    return { set, from: { x, y }, drawn: drawnRays };
  }, [contributions, slab, drawn, column, selectedLevel, placeOn]);

  const sharesAt = useCallback(
    (row: number, col: number): Record<SourceKey, number> => {
      const index = row * (slab?.longitudes.length ?? 0) + col;
      const out = { archive: Number.NaN, departure: Number.NaN, measurement: Number.NaN, model: Number.NaN };
      if (!slab) return out;
      for (const source of SOURCES) out[source.key] = slab.shares[source.key][index] ?? Number.NaN;
      return out;
    },
    [slab],
  );

  const dominantAt = useCallback(
    (row: number, col: number): { key: SourceKey; value: number } => {
      const shares = sharesAt(row, col);
      let best: { key: SourceKey; value: number } = { key: SOURCES[0].key, value: -Infinity };
      for (const source of SOURCES) {
        const value = shares[source.key];
        if (Number.isFinite(value) && value > best.value) best = { key: source.key, value };
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
            : 'an analysis has been announced, but the grid it spans is not known yet: it is read from a holding’s own manifest, and the store had none when this console asked.'}
        </p>
        {stillToCome}
      </div>
    );
  }

  const cellShares = cursor ? sharesAt(cursor.row, cursor.col) : undefined;
  const cellLongitude = cursor && slab ? slab.longitudes[cursor.col] : undefined;
  const cellLatitude = cursor && slab ? slab.latitudes[cursor.row] : undefined;

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

      {busy && !slab && <p className="forecast-column-busy">reading the share field…</p>}

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
              {SOURCES.map((source, index) => (
                <pattern
                  key={source.pattern}
                  id={source.pattern}
                  patternUnits="userSpaceOnUse"
                  width="0.5"
                  height="0.5"
                  patternTransform={`rotate(${index * 45})`}
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
                const source = SOURCES.find((candidate) => candidate.key === shown.key) ?? SOURCES[0];
                const magnitude = Number.isFinite(shown.value) ? Math.min(Math.abs(shown.value), 1) : 0;
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
                    fill={showing === 'dominant' ? `url(#${source.pattern})` : source.hue}
                    fillOpacity={showing === 'dominant' ? Math.max(magnitude, 0.15) : magnitude}
                    className={`share-cell${isHere ? ' is-here' : ''}${shown.value < 0 ? ' is-negative' : ''}`}
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
                    className={`forecast-ray${ray.contribution < 0 ? ' is-negative' : ''}`}
                    data-source={ray.sourceId}
                    data-weight={ray.weight.toFixed(4)}
                    x1={rays.from.x}
                    y1={rays.from.y}
                    x2={x}
                    y2={y}
                    stroke={instrument.hue}
                    strokeWidth={1 + ray.weight * 7}
                    strokeDasharray={ray.contribution < 0 ? '3 2' : instrument.dash}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {rays.drawn.map(({ ray, x, y, instrument }) => (
                  <circle
                    key={`${ray.sourceId}-origin`}
                    className="forecast-ray-origin"
                    cx={x}
                    cy={y}
                    r={0.45}
                    fill={instrument.hue}
                  />
                ))}
                <circle className="forecast-ray-column" cx={rays.from.x} cy={rays.from.y} r={0.5} />
              </g>
            )}
          </svg>

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
          selectedLevel={selectedLevel}
          onSelectLevel={setSelectedLevel}
        />
      )}

      {refusals.length > 0 && (
        <p className="forecast-column-refused">
          {refusals.length} query was refused and is not drawn: {refusals.join('; ')}. Stated where
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
