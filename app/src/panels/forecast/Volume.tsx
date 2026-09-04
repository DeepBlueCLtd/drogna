/**
 * The field as a volume, with the thermocline as a surface through it (feature 124, FR-120,
 * FR-121).
 *
 * **The setting the rays happen in.** The share map beside it is a plan at one depth and answers
 * *where a number came from*; this answers *what the water is doing around it*. FR-120 asks for a
 * semi-transparent volume rather than a slice because the thermocline domes, tilts and breaks,
 * and shape is the answer a sonar user is asking for — so the surface is drawn per column, from
 * the served field, by `volume.ts`'s pick, rather than as the plane the published domain mean
 * would give.
 *
 * **The first version of this drawing came out flat, and saying so is what fixed it.** Driven
 * against `arriving` as first shipped, 7,679 of 7,680 columns placed the thermocline at 100 m and
 * one at 300 m. The caption stated that count rather than calling the result a doming surface,
 * and the measurement behind it became issue #113 — which found the cause was neither the pick
 * nor the drawing but the world: analytic form 1's `thermoclineAnomalyT` took no longitude or
 * latitude, so the layer was one depth everywhere and no grid spacing could resolve a shape that
 * was not there. Form 2 displaces the layer where a feature warms or cools the water at it, and
 * the depth axis was raised to 26 levels to carry the result.
 *
 * The caption still states what it measured rather than what it hoped for, and still says the
 * flatness is the grid's when it finds one, because that is the branch that stopped a false
 * claim once already and the configuration can change again.
 *
 * **The geometry is the Map's, imported rather than copied.** `cube.ts` already carries a
 * lon/lat/depth triple into the space an OrbitView rotates and carries a clicked point back out,
 * and it is tested as a round trip. The Data tab's volume imports it for the same reason; a
 * second implementation of one projection is a second thing to keep true. Depth is exaggerated
 * there and the frame says so.
 *
 * **Nothing here is a second selection.** T011 and T012 both say so outright: the share map has
 * chosen a column by square, with arrow keys and enter, since feature 123, and walks a depth
 * chooser over that column. The volume raises the same events through `onPickColumn` and marks
 * the column the region already has. A reader who picks in one and looks at the other must not
 * find two different columns open.
 *
 * **One area query per level, and no more.** EDR takes a comma-separated `parameter-name`, so the
 * temperature the thermocline needs and the parameter a reader chose come back in the same
 * response: one query a level, whichever parameter is on show, and twenty-six of them on the
 * shipped axis. Nothing is fetched on a tick
 * or a timer — the levels are read when the analysis changes and when a reader changes parameter,
 * which is the same rule the share map states at the head of `ColumnProvenance`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { COORDINATE_SYSTEM, OrbitView } from '@deck.gl/core';
import { PathLayer, SolidPolygonLayer } from '@deck.gl/layers';
import type { SeamValidator } from '../../seam/validate.js';
import { cubeFrame, volumeEdges } from '../map/cube.js';
import { rampColour } from '../map/map-data.js';
import { soundSpeedMs } from '../../seam/ocean-relations.js';
import { servedFor, type VolumeParameter } from './volume.js';
import { thermoclineSurface, type LevelField, type Thermocline } from './volume.js';
import type { ColumnGrid } from './ColumnProvenance.js';

// Framed for *this* canvas. The Data tab's volume opens at zoom 1.1 in a panel that gives it the
// height; this region is a column beside a share map and gives it 260 px, where 1.1 put the cube's
// own edges outside the viewport — a rotating drawing whose frame is off-screen has lost the one
// thing that says which way is down. Measured against the region rather than inherited.
const INITIAL_VIEW = { target: [0, 0, -20] as [number, number, number], zoom: 0.42, rotationX: 32, rotationOrbit: 24 };


/** One level as the area query answered it, with the axes it was answered over. */
interface ServedLevel {
  readonly depthM: number;
  readonly longitudes: readonly number[];
  readonly latitudes: readonly number[];
  readonly temperatureC: readonly number[];
  readonly shown: readonly number[];
}

type Fetched =
  | { readonly status: 'loading' }
  | { readonly status: 'refused'; readonly why: string }
  | { readonly status: 'drawn'; readonly levels: readonly ServedLevel[] };

function valuesOf(body: unknown, name: string): number[] | undefined {
  const ranges = (body as { ranges?: Record<string, { values?: unknown }> } | undefined)?.ranges;
  const values = ranges?.[name]?.values;
  return Array.isArray(values) ? values.map((value) => (typeof value === 'number' ? value : Number.NaN)) : undefined;
}

function axisOf(body: unknown, axis: 'x' | 'y'): number[] | undefined {
  const values = (
    body as { domain?: { axes?: Record<string, { values?: unknown }> } } | undefined
  )?.domain?.axes?.[axis]?.values;
  return Array.isArray(values) ? (values as number[]) : undefined;
}

export function Volume({
  collectionId,
  grid,
  edrPrefix,
  validator,
  parameter,
  column,
  onPickColumn,
}: {
  readonly collectionId: string;
  readonly grid: ColumnGrid;
  readonly edrPrefix: string;
  readonly validator: SeamValidator;
  readonly parameter: VolumeParameter;
  readonly column: { readonly longitude: number; readonly latitude: number } | undefined;
  readonly onPickColumn: (longitude: number, latitude: number) => void;
}) {
  const [fetched, setFetched] = useState<Fetched>({ status: 'loading' });
  // The read this state belongs to. A reader changing parameter while the levels are in flight
  // must not have the old answer land on top of the new one — the same token the share map's
  // slab and column reads carry, and for the same reason.
  const wanted = useRef(0);

  useEffect(() => {
    const token = ++wanted.current;
    let cancelled = false;
    setFetched({ status: 'loading' });
    void (async () => {
      const polygon = `POLYGON((${grid.minimumLongitude} ${grid.minimumLatitude},${grid.maximumLongitude} ${grid.minimumLatitude},${grid.maximumLongitude} ${grid.maximumLatitude},${grid.minimumLongitude} ${grid.maximumLatitude},${grid.minimumLongitude} ${grid.minimumLatitude}))`;
      // One query per level whatever is on show: the thermocline always needs temperature, and
      // sound speed needs temperature and salinity, so the union is at most those two.
      const names = [...new Set(['temperature', ...servedFor(parameter)])].join(',');
      const levels: ServedLevel[] = [];
      for (const depthM of grid.depthsM) {
        try {
          const query = new URLSearchParams({ coords: polygon, z: String(depthM), 'parameter-name': names });
          const response = await fetch(`${edrPrefix}/collections/${collectionId}/area?${query.toString()}`);
          if (cancelled || token !== wanted.current) return;
          if (!response.ok) {
            setFetched({ status: 'refused', why: `the field at ${depthM} m was refused (${response.status})` });
            return;
          }
          const body: unknown = await response.json();
          if (cancelled || token !== wanted.current) return;
          // Validated before it is read, as every crossing of this seam is: a 200 that is not the
          // master's shape is a refusal, not a document (Principle XI).
          if (!validator.validate('coveragejson', body).ok) {
            setFetched({ status: 'refused', why: `the field at ${depthM} m did not match its master` });
            return;
          }
          const temperatureC = valuesOf(body, 'temperature');
          const longitudes = axisOf(body, 'x');
          const latitudes = axisOf(body, 'y');
          // Derived here for sound speed, through the seam's own declared relation — the same
          // function the monitor scores residuals with and the manifest names as the
          // implementation. Read straight off the response for the two that are served.
          const salinityPsu = parameter === 'sound_speed' ? valuesOf(body, 'salinity') : undefined;
          const shown =
            parameter === 'sound_speed'
              ? temperatureC && salinityPsu
                ? temperatureC.map((value, index) => soundSpeedMs(value, salinityPsu[index], depthM))
                : undefined
              : valuesOf(body, parameter);
          if (!temperatureC || !shown || !longitudes || !latitudes) {
            setFetched({ status: 'refused', why: `the field at ${depthM} m carried no ${parameter} to draw` });
            return;
          }
          levels.push({ depthM, longitudes, latitudes, temperatureC, shown });
        } catch (error) {
          if (cancelled || token !== wanted.current) return;
          setFetched({ status: 'refused', why: `the field at ${depthM} m could not be read: ${String(error)}` });
          return;
        }
      }
      if (cancelled || token !== wanted.current) return;
      setFetched({ status: 'drawn', levels });
    })();
    return () => {
      cancelled = true;
    };
  }, [collectionId, edrPrefix, validator, parameter, grid]);

  const frame = useMemo(
    () =>
      cubeFrame({
        west: grid.minimumLongitude,
        east: grid.maximumLongitude,
        south: grid.minimumLatitude,
        north: grid.maximumLatitude,
        deepest: grid.depthsM[grid.depthsM.length - 1] ?? 1,
      }),
    [grid],
  );

  const levels = fetched.status === 'drawn' ? fetched.levels : [];
  const surface = useMemo(
    () =>
      thermoclineSurface(
        levels.map((level): LevelField => ({ depthM: level.depthM, temperatureC: level.temperatureC })),
      ),
    [levels],
  );

  // The range the ramp is stretched over, from what was actually served rather than from a
  // typed-in pair: a scale invented here would colour one run's field by another's extremes.
  const span = useMemo(() => {
    let minimum = Infinity;
    let maximum = -Infinity;
    for (const level of levels) {
      for (const value of level.shown) {
        if (!Number.isFinite(value)) continue;
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
      }
    }
    return Number.isFinite(minimum) && maximum > minimum ? { minimum, maximum } : undefined;
  }, [levels]);

  /**
   * How much shape the surface actually has, measured rather than assumed.
   *
   * **The caption said "the shape a single published depth cannot show" and the tree did not
   * support it.** Measured against the configuration as first shipped: 7,679 of 7,680 columns
   * placed the thermocline at 100 m and exactly one at 300 m. That measurement became issue #113
   * and then analytic form 2, and the span below is the one the drawing now reports.
   *
   * The branch stays. A drawing that called two distinct depths a doming surface would be the
   * false illumination this region exists to avoid, and the surface is worth drawing either way
   * — where the water column's strongest gradient sits is a sonar question whatever its shape.
   * The spacing quoted in the flat case is read off the levels, not typed: it said "200 m" while
   * the axis was being changed to 40, which is how a caption becomes a lie without anyone
   * editing it.
   *
   * **And the span reported is the one most of the columns are in, not the outermost two.** The
   * first version of this caption printed max minus min and said the surface "domes and tilts"
   * across it. Against a served analysis late in a run that read "16 distinct depths spanning
   * 840 m" — true of two columns and false of the layer, which is the shape of a claim this
   * region is supposed to refuse. The same field's commonest three depths hold ninety per cent
   * of the columns inside 80 m, and the picture agrees with that number rather than the other
   * one. The tail is not hidden: the distinct count still names every depth taken, and the
   * sentence says how much of the field the span covers.
   *
   * **And the branch itself is on the core span, not on the count.** `distinct <= 2` was the
   * first test and it is the same mistake as the span it replaced, one level up: a count is
   * inflated by outliers exactly as a range is. Twenty-one distinct depths of which one holds
   * ninety-nine per cent of the columns is a plane, and the count branch called it doming — while
   * the honest figure was being computed three lines above and printed but not consulted. The
   * branch now asks whether the depths most of the field is in span more than a single level:
   * inside one level the surface is a plane at this resolution, whatever the tail does.
   *
   * **The modal share is there because the doming is local and the caption should say so.** The
   * features that displace the layer are an eddy and a drifting feature, tens of kilometres
   * across in a domain hundreds wide (the front is deliberately not one of them —
   * `analytic.ts#thermoclineDepthAt` has the measurement), so most of the field is level and a
   * few hundred columns are not. "It domes and tilts", written across that, is a claim about a
   * field that is 95% one depth. The share is printed and the sentence describes the mechanism
   * instead of characterising the picture, which is the reader's to do.
   */
  const CORE_SHARE = 0.9;
  const relief = useMemo(() => {
    const counts = new Map<number, number>();
    for (const cell of surface) if (cell) counts.set(cell.depthM, (counts.get(cell.depthM) ?? 0) + 1);
    const placed = [...counts.values()].reduce((sum, count) => sum + count, 0);
    // The depths that between them hold most of the columns, taken commonest first, and the
    // span of *those*. See the note above: a min-to-max span is a statement about the two most
    // extreme columns in the field and reads as a statement about the layer.
    const core = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const kept: number[] = [];
    let held = 0;
    for (const [depthM, count] of core) {
      if (held >= CORE_SHARE * placed) break;
      kept.push(depthM);
      held += count;
    }
    const spacings = levels.slice(1).map((level, at) => level.depthM - levels[at].depthM);
    return {
      distinct: counts.size,
      placed,
      coreCount: kept.length,
      coreSpanM: kept.length > 0 ? Math.max(...kept) - Math.min(...kept) : 0,
      coreShare: placed > 0 ? held / placed : 0,
      modalDepthM: core.length > 0 ? core[0][0] : 0,
      modalShare: placed > 0 ? (core[0]?.[1] ?? 0) / placed : 0,
      spacingM: spacings.length > 0 ? Math.min(...spacings) : 0,
    };
  }, [surface, levels]);

  const first = levels[0];
  const strongest = useMemo(
    () => surface.reduce((most, cell) => Math.max(most, cell?.dropC ?? 0), 0),
    [surface],
  );

  const cellBounds = (level: ServedLevel, index: number) => {
    const columns = level.longitudes.length;
    const longitude = level.longitudes[index % columns];
    const latitude = level.latitudes[Math.floor(index / columns)];
    const halfLon = Math.abs((level.longitudes[1] ?? longitude + 0.05) - level.longitudes[0]) / 2 || 0.02;
    const halfLat = Math.abs((level.latitudes[1] ?? latitude + 0.05) - level.latitudes[0]) / 2 || 0.02;
    return { longitude, latitude, halfLon, halfLat };
  };

  /*
   * **The per-level alpha is derived from how many levels there are, not typed.**
   *
   * It was `46`, with the comment "thin enough to see through a stack of six". Transmittance
   * through a stack compounds — `(1 − a/255)^n` — so six levels at 46 let 30% of the far side
   * through, which is what "semi-transparent" means, and the twenty-six levels this axis now
   * carries (#113) let **0.6%** through. The box went opaque and the surface FR-120 asks the
   * transparency to reveal was inside it. It is visible in this branch's own committed capture:
   * a flat grey solid with the thermocline showing only where it pokes past the near edge.
   *
   * So the *stack's* transmittance is the constant, and the level's share follows from the count.
   * Change the depth axis again and the drawing stays as see-through as it was.
   */
  const STACK_TRANSMITTANCE = 0.3;
  const levelAlpha =
    levels.length > 0 ? Math.max(1, Math.round(255 * (1 - STACK_TRANSMITTANCE ** (1 / levels.length)))) : 46;

  const layers = [
    // The field, level by level, semi-transparent so the surface through it can be seen. Every
    // level drawn is a level the store answered for.
    ...levels.map((level) =>
      span
        ? new SolidPolygonLayer({
            id: `forecast-volume-level-${level.depthM}`,
            data: level.shown.map((value, index) => ({ value, index })),
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            getPolygon: ({ index }: { index: number }) => {
              const { longitude, latitude, halfLon, halfLat } = cellBounds(level, index);
              return [
                frame.toCartesian(longitude - halfLon, latitude - halfLat, level.depthM),
                frame.toCartesian(longitude + halfLon, latitude - halfLat, level.depthM),
                frame.toCartesian(longitude + halfLon, latitude + halfLat, level.depthM),
                frame.toCartesian(longitude - halfLon, latitude + halfLat, level.depthM),
              ];
            },
            getFillColor: ({ value }: { value: number }) => {
              if (!Number.isFinite(value)) return [0, 0, 0, 0] as [number, number, number, number];
              const [red, green, blue] = rampColour(value, span.minimum, span.maximum);
              return [red, green, blue, levelAlpha] as [number, number, number, number];
            },
          })
        : undefined,
    ),
    // The thermocline, as a surface rather than a plane: each column at its own depth, and its
    // *strength* — the drop across the interval — carried by the surface's own appearance, which
    // is what FR-120 asks the appearance to do rather than leaving it decorative.
    first && strongest > 0
      ? new SolidPolygonLayer({
          id: 'forecast-volume-thermocline',
          data: surface.flatMap((cell, index) => (cell ? [{ cell, index }] : [])),
          coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
          getPolygon: ({ cell, index }: { cell: Thermocline; index: number }) => {
            const { longitude, latitude, halfLon, halfLat } = cellBounds(first, index);
            return [
              frame.toCartesian(longitude - halfLon, latitude - halfLat, cell.depthM),
              frame.toCartesian(longitude + halfLon, latitude - halfLat, cell.depthM),
              frame.toCartesian(longitude + halfLon, latitude + halfLat, cell.depthM),
              frame.toCartesian(longitude - halfLon, latitude + halfLat, cell.depthM),
            ];
          },
          getFillColor: ({ cell }: { cell: Thermocline }) =>
            // Opaque where the layer is sharp, faint where it barely falls. A surface drawn at
            // one opacity would say every part of it is equally a thermocline.
            [232, 236, 244, Math.round(70 + 160 * Math.min(cell.dropC / strongest, 1))] as [
              number,
              number,
              number,
              number,
            ],
        })
      : undefined,
    // The frame, so a rotating reader can tell which way is down and where the domain ends.
    new PathLayer({
      id: 'forecast-volume-frame',
      data: volumeEdges(frame),
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPath: (path: [number, number, number][]) => path,
      getColor: [90, 95, 105, 200],
      getWidth: 1,
      widthUnits: 'pixels',
    }),
    // Where the reader's column is, marked on the surface plane so the two regions agree about
    // which column is open.
    column
      ? new PathLayer({
          id: 'forecast-volume-column',
          data: [
            [
              frame.toCartesian(column.longitude, column.latitude, 0),
              frame.toCartesian(column.longitude, column.latitude, grid.depthsM[grid.depthsM.length - 1] ?? 0),
            ],
          ],
          coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
          getPath: (path: [number, number, number][]) => path,
          getColor: [244, 246, 250, 235],
          getWidth: 2,
          widthUnits: 'pixels',
        })
      : undefined,
    /*
     * **The clickable grid, and it is on the surface plane — nothing inside the volume is
     * pickable.** FR-121 and this feature's own FR-06 say so in as many words, and the reason
     * they give is precisely what the first version did wrong. That version put `onClick` on the
     * canvas and read `info.coordinate`, which is the *ground-plane* unprojection under the
     * cursor: deck.gl hands back where the ray through the pixel crosses z = 0, and the cell the
     * reader was pointing at is drawn tens of cube-units above that plane. At `rotationX: 32°`
     * over a 1,000 m domain, clicking a thermocline cell on the far side opened a column roughly
     * 180 km from it, silently, and a click on empty canvas beside the box opened a column
     * outside the domain — clearing the reader's rays and numbers for a position the analysis
     * never covered.
     *
     * A pickable grid of squares at depth nought fixes both by construction: deck.gl resolves it
     * against the geometry it actually drew, so `info.object` is a cell or it is nothing, and a
     * click that hits no square is a click that selects nothing. Invisible, because it is the
     * surface plane rather than a fifth drawn thing; `autoHighlight` gives it the hover a
     * clickable square owes the reader.
     */
    first
      ? new SolidPolygonLayer({
          id: 'forecast-volume-picker',
          data: first.shown.map((_, index) => ({ index })),
          coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
          pickable: true,
          autoHighlight: true,
          highlightColor: [244, 246, 250, 60],
          getPolygon: ({ index }: { index: number }) => {
            const { longitude, latitude, halfLon, halfLat } = cellBounds(first, index);
            return [
              frame.toCartesian(longitude - halfLon, latitude - halfLat, 0),
              frame.toCartesian(longitude + halfLon, latitude - halfLat, 0),
              frame.toCartesian(longitude + halfLon, latitude + halfLat, 0),
              frame.toCartesian(longitude - halfLon, latitude + halfLat, 0),
            ];
          },
          getFillColor: [0, 0, 0, 0] as [number, number, number, number],
        })
      : undefined,
  ].filter((layer) => layer !== undefined);

  return (
    <div className="forecast-volume" data-testid="forecast-volume">
      <div className="forecast-volume-canvas">
        {fetched.status === 'drawn' && span ? (
          <DeckGL
            views={new OrbitView({ orbitAxis: 'Z' })}
            initialViewState={INITIAL_VIEW}
            controller
            layers={layers}
            getCursor={() => 'crosshair'}
            onClick={(info: { object?: unknown; layer?: { id: string } | null }) => {
              // The picked *square*, never the canvas coordinate: see the picker layer above for
              // what reading `info.coordinate` cost. A click that hit no square selects nothing,
              // which is what leaves the reader's open column alone.
              if (info.layer?.id !== 'forecast-volume-picker' || !info.object || !first) return;
              const { index } = info.object as { index: number };
              const { longitude, latitude } = cellBounds(first, index);
              onPickColumn(longitude, latitude);
            }}
          />
        ) : (
          // Never a blank canvas: which of the three it is, said where the drawing would be.
          <p className="not-landed" data-testid="forecast-volume-state">
            {fetched.status === 'loading' && `reading ${grid.depthsM.length} level(s) of this analysis…`}
            {fetched.status === 'refused' && fetched.why}
            {fetched.status === 'drawn' &&
              !span &&
              'the levels answered but carried no values to scale a ramp over, so nothing is drawn rather than a field of one colour'}
          </p>
        )}
      </div>
      {fetched.status === 'drawn' && span && (
        <p className="forecast-column-caption" data-testid="forecast-volume-caption">
          {levels.length} level(s) of <code>{parameter}</code>, each a genuine area query against{' '}
          <code>{collectionId}</code>, drawn semi-transparent with depth exaggerated. The pale
          surface through them is the <strong>thermocline</strong>, placed per column at the
          midpoint of the level pair whose temperature falls fastest — the run&rsquo;s own
          definition, applied to each column rather than to the domain mean. Its brightness is the
          drop across that interval.{' '}
          <strong>
            {relief.placed} of {surface.length} columns have one, over {relief.distinct} distinct
            depth{relief.distinct === 1 ? '' : 's'}
          </strong>
          {relief.coreSpanM <= relief.spacingM
            ? ` — so it is level to within one ${relief.spacingM} m level across the field, and domes only where a feature displaces it: the eddy and the drifting feature are tens of kilometres across in a domain hundreds wide, so most columns fall fastest in the same pair. What this shows at this resolution is where the strongest gradient sits, which is a sonar question whatever its shape.`
            : `, ${Math.round(relief.modalShare * 100)}% of them at ${relief.modalDepthM} m and ${relief.coreCount} depth${relief.coreCount === 1 ? '' : 's'} holding ${Math.round(relief.coreShare * 100)}% within ${relief.coreSpanM} m. The layer is level across most of the field and displaced where a feature acts on it: a warm one presses it down beneath itself, a cool one lets it rise. Columns outside that span are ones whose profile falls fastest somewhere deeper, and they are drawn where they were found.`}
        </p>
      )}
    </div>
  );
}
