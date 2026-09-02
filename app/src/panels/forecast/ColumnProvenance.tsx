/**
 * What a cell's value was made from: a water column, chosen by the reader, read back
 * through the query layer the harness serves to everybody else.
 *
 * **This region was a stub naming feature 124, and most of it did not need to be.** The
 * analyst has published a full-grid provenance field since feature 116 — four shares per
 * cell (archive, departure, measurement, model), at every depth, summing to one — and it is
 * in the store under its own EDR collection, which is exactly the substrate FR-111 names for
 * this region and the depth profile. What is genuinely blocked is narrower than the whole
 * region: FR-122 wants one ray per contributing *source* at a width proportional to that
 * source's contribution, and the analysis kernel computes the per-observation gain row by
 * row and then reports only the row sum, so the columns a ray needs are discarded. The rays
 * wait; the shares did not have to.
 *
 * **Selection is by grid square, and yields a column** (FR-121). The chooser is a grid of
 * ordinary buttons rather than a picture, which is the honest shape while there is no volume
 * to carry it: it is a chooser, not a rendering of data, and it says so. Buttons are also
 * what makes it keyboard-reachable without inventing focus handling for an SVG.
 *
 * **The column is read through OGC API-EDR**, one position query per depth, exactly as an
 * external client would ask for it — the shell holds no private path to the store. That is
 * slower than reaching into the store would be, and it is the point: the query layer is the
 * deliverable, and a surface that bypassed it would be evidence of nothing.
 *
 * **Nothing here polls** (FR-136). A fetch happens when a reader picks a square, and at no
 * other time: not on a tick, not on an announcement, not on a timer.
 *
 * **A share may be negative, and is shown as one.** Where a cell's background error greatly
 * exceeds the observed cell's, the gain extrapolates and a weight passes one, which is
 * optimal interpolation behaving correctly rather than a fault to clamp away — so the bar
 * runs the other way and the sign is printed, instead of the figure being quietly floored.
 */
import { useCallback, useState } from 'react';
import type { AnalysisPublished, CoverageHolding } from '../../generated/types.js';

/**
 * How many squares the chooser offers along each axis. A chooser, not a resolution.
 *
 * Six by four, and the number is set by the thumb rather than by the grid. Eight columns
 * left each square 38px wide inside a 360px phone — the height was 44px, but a tap target is
 * the smaller of the two — so the count came down until the squares clear feature 112's floor
 * at the narrowest width the shell supports. The domain is 96 by 80 cells and no chooser was
 * ever going to offer one square per cell; what it offers is a place to point at.
 */
const CHOOSER = { columns: 6, rows: 4 };

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

interface Level {
  readonly depthM: number;
  readonly temperatureC: number | undefined;
  /** Share name to value, in the order the analyst stores them. */
  readonly shares: readonly { readonly name: string; readonly value: number }[];
}

interface Reading {
  readonly longitude: number;
  readonly latitude: number;
  readonly levels: readonly Level[];
  readonly refusals: readonly string[];
}

/** A share's name as the analyst stores it, trimmed to the part a reader wants to read. */
function shareLabel(name: string): string {
  return name.replace(/^temperature_share_/, '').replace(/_/g, ' ');
}

interface RangeBody {
  ranges?: Record<string, { values?: unknown[] }>;
}

function firstValue(body: RangeBody, name: string): number | undefined {
  const value = body.ranges?.[name]?.values?.[0];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export interface ColumnProvenanceProps {
  readonly analysis: AnalysisPublished | undefined;
  readonly grid: ColumnGrid | undefined;
  /** The EDR prefix the boundary serves on, from configuration — never assembled here. */
  readonly edrPrefix: string;
}

export function ColumnProvenance({ analysis, grid, edrPrefix }: ColumnProvenanceProps) {
  const [reading, setReading] = useState<Reading | undefined>();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | undefined>();

  const read = useCallback(
    async (longitude: number, latitude: number, key: string) => {
      if (!analysis || !grid) return;
      setBusy(true);
      setSelected(key);
      const levels: Level[] = [];
      const refusals: string[] = [];
      for (const depthM of grid.depthsM) {
        const point = `POINT(${longitude.toFixed(4)} ${latitude.toFixed(4)})`;
        const at = `coords=${encodeURIComponent(point)}&z=${depthM}`;
        let shares: { name: string; value: number }[] = [];
        let temperatureC: number | undefined;
        try {
          const response = await fetch(`${edrPrefix}/collections/${analysis.collections.provenance}/position?${at}`);
          const body = (await response.json()) as RangeBody;
          if (!response.ok) {
            refusals.push(`provenance at ${depthM} m: ${response.status}`);
          } else {
            shares = Object.keys(body.ranges ?? {}).map((name) => ({
              name,
              value: firstValue(body, name) ?? Number.NaN,
            }));
          }
        } catch (error) {
          refusals.push(`provenance at ${depthM} m: ${String(error)}`);
        }
        try {
          const response = await fetch(
            `${edrPrefix}/collections/${analysis.collections.analysis}/position?${at}&parameter-name=temperature`,
          );
          const body = (await response.json()) as RangeBody;
          if (response.ok) temperatureC = firstValue(body, 'temperature');
          else refusals.push(`analysis at ${depthM} m: ${response.status}`);
        } catch (error) {
          refusals.push(`analysis at ${depthM} m: ${String(error)}`);
        }
        levels.push({ depthM, temperatureC, shares });
      }
      setReading({ longitude, latitude, levels, refusals });
      setBusy(false);
    },
    [analysis, grid, edrPrefix],
  );

  // **What is still feature 124's is said on both branches.** It is a fact about the region,
  // not about whether an analysis has landed, and the first version stated it only where
  // there was data — so a reader arriving before the first cycle was told the region was
  // waiting and never told what it would still not do. The FR-17 check caught it.
  const stillToCome = (
    <p className="forecast-column-basis">
      The volume and the <strong>rays to each contributing source</strong> are{' '}
      <strong>feature 124</strong>, and are not built. The rays are blocked on the analyst
      rather than on drawing: FR-122 wants one ray per source at a width proportional to that
      source's contribution, and the analysis kernel computes the per-observation gain and
      then reports its row sum, so the per-source columns are discarded before anything could
      draw them. The shares this region reads are that row sum, broken out by kind — which is
      a different and weaker claim, and is labelled as the one it is.
    </p>
  );

  if (!analysis || !grid) {
    // **Two absences, and they are not the same absence.** The first version said "no
    // analysis has been announced yet" on both, so a region waiting for the store's grid
    // reported a cause that was not its own — and when it was measured in a built instance,
    // the message sent the reading in the wrong direction. A surface that states the wrong
    // reason is worse than one that states none.
    return (
      <div className="forecast-column">
        <p className="not-landed" data-testid="column-absent">
          {!analysis
            ? 'no analysis has been announced yet, so there is no provenance to read. This region answers from the analysis cycle’s own published field rather than from a store the shell reaches into privately, and it waits for one to exist rather than drawing a grid that would resolve to nothing.'
            : 'an analysis has been announced, but the grid its squares would span is not known yet: it is read from a holding’s own manifest, and the store had none when this console asked. The chooser stays undrawn rather than offering squares that resolve to nothing.'}
        </p>
        {stillToCome}
      </div>
    );
  }

  const spanLongitude = grid.maximumLongitude - grid.minimumLongitude;
  const spanLatitude = grid.maximumLatitude - grid.minimumLatitude;

  return (
    <div className="forecast-column" data-testid="column-provenance">
      <p className="forecast-column-caption">
        Pick a square for a water column. Read from <code>{analysis.collections.provenance}</code>{' '}
        through OGC API-EDR, one position query per depth — the same path an external client
        takes, so the surface is evidence that the query layer works.
      </p>
      <div
        className="forecast-column-chooser"
        role="group"
        aria-label="choose a water column by grid square"
        style={{ gridTemplateColumns: `repeat(${CHOOSER.columns}, 1fr)` }}
      >
        {Array.from({ length: CHOOSER.rows }).flatMap((_, row) =>
          Array.from({ length: CHOOSER.columns }).map((__, column) => {
            // The centre of each block, so a square names a place rather than an edge.
            const longitude = grid.minimumLongitude + (spanLongitude * (column + 0.5)) / CHOOSER.columns;
            // Row 0 is the north edge: the chooser reads the way the map does.
            const latitude = grid.maximumLatitude - (spanLatitude * (row + 0.5)) / CHOOSER.rows;
            const key = `${row}:${column}`;
            return (
              <button
                key={key}
                type="button"
                className={`forecast-column-square${key === selected ? ' is-selected' : ''}`}
                aria-pressed={key === selected}
                aria-label={`column at ${latitude.toFixed(2)} degrees north, ${longitude.toFixed(2)} degrees east`}
                onClick={() => void read(longitude, latitude, key)}
              >
                <span aria-hidden="true">{key === selected ? '◉' : '·'}</span>
              </button>
            );
          }),
        )}
      </div>

      {busy && <p className="forecast-column-busy">reading the column…</p>}

      {reading && !busy && (
        <div className="forecast-column-readout">
          <p className="forecast-column-where">
            {reading.latitude.toFixed(2)}°N, {reading.longitude.toFixed(2)}°E — {reading.levels.length}{' '}
            level(s), each share read off the gain rather than approximated, and summing to one.
          </p>
          <ol className="forecast-column-levels">
            {reading.levels.map((level) => (
              <li key={level.depthM}>
                <span className="forecast-column-depth">
                  {level.depthM.toFixed(0)} m
                  {level.temperatureC !== undefined ? ` · ${level.temperatureC.toFixed(2)} °C` : ''}
                </span>
                <span className="forecast-column-shares">
                  {level.shares.length === 0 ? (
                    <span className="not-landed">no share was served at this depth</span>
                  ) : (
                    level.shares.map((share) => (
                      <span className="forecast-column-share" key={share.name}>
                        <span className="forecast-column-share-name">{shareLabel(share.name)}</span>
                        <span
                          className={`forecast-column-bar${share.value < 0 ? ' is-negative' : ''}`}
                          // The width is the magnitude; the sign is carried by the class, by
                          // the printed figure, and by the bar running the other way — never
                          // by colour alone.
                          style={{ width: `${Math.min(Math.abs(share.value) * 100, 100)}%` }}
                        />
                        <span className="forecast-column-share-value">
                          {(share.value * 100).toFixed(1)}%
                        </span>
                      </span>
                    ))
                  )}
                </span>
              </li>
            ))}
          </ol>
          {reading.refusals.length > 0 && (
            <p className="forecast-column-refused">
              {reading.refusals.length} query was refused and is not drawn:{' '}
              {reading.refusals.join('; ')}. Stated where the content would have been, rather
              than left as a gap.
            </p>
          )}
        </div>
      )}

      {stillToCome}
    </div>
  );
}
