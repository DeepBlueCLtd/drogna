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
 * **And on the shipped configuration it comes out nearly flat, which is measured and stated
 * rather than hoped past.** Driven against `arriving`: 7,679 of 7,680 columns place it at 100 m
 * and one at 300 m. The cause is the profile, not the pick — the domain-mean gradients run 4.49,
 * 1.64, 0.92, 0.51, 0.29 °C per 100 m, so the shallowest pair wins by nearly three to one
 * everywhere, and the authored thermocline is a layer an order of magnitude thinner than the
 * 200 m level spacing. `model-runner/features.ts` says the same of its own estimate: "a 200 m grid
 * cannot see a 30 m layer". FR-120's doming is not visible at this depth resolution *by anyone*,
 * and this drawing is not the thing that could make it so. The caption states the count it found,
 * because a picture captioned as a doming surface over two distinct depths would be exactly the
 * false illumination this region exists to avoid — and what it does show, where the column's
 * strongest gradient sits, is a sonar question whatever it is called.
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
 * response: six levels, six queries, whichever parameter is on show. Nothing is fetched on a tick
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
import { thermoclineSurface, type LevelField, type Thermocline } from './volume.js';
import type { ColumnGrid } from './ColumnProvenance.js';

// Framed for *this* canvas. The Data tab's volume opens at zoom 1.1 in a panel that gives it the
// height; this region is a column beside a share map and gives it 260 px, where 1.1 put the cube's
// own edges outside the viewport — a rotating drawing whose frame is off-screen has lost the one
// thing that says which way is down. Measured against the region rather than inherited.
const INITIAL_VIEW = { target: [0, 0, -20] as [number, number, number], zoom: 0.42, rotationX: 32, rotationOrbit: 24 };

/** The variables an analysis holding carries. Sound speed is derived and is not among them. */
export const VOLUME_PARAMETERS = ['temperature', 'salinity'] as const;
export type VolumeParameter = (typeof VOLUME_PARAMETERS)[number];

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
      // Both parameters in one query: the thermocline needs temperature whatever is on show.
      const names = parameter === 'temperature' ? 'temperature' : `temperature,${parameter}`;
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
          const shown = valuesOf(body, parameter);
          const longitudes = axisOf(body, 'x');
          const latitudes = axisOf(body, 'y');
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
   * support it.** Driven against the shipped configuration: 7,679 of 7,680 columns place the
   * thermocline at 100 m and exactly one at 300 m. The reason is in the profile, not in the pick
   * — the domain-mean gradients are 4.49, 1.64, 0.92, 0.51 and 0.29 °C per 100 m, so the
   * shallowest pair wins by nearly three to one everywhere, and the authored thermocline is a
   * layer an order of magnitude thinner than the 200 m spacing. `features.ts` says as much about
   * its own estimate: "a 200 m grid cannot see a 30 m layer".
   *
   * So the surface is drawn and the count is stated. A drawing that called two distinct depths a
   * doming surface would be the false illumination this region exists to avoid, and hiding the
   * surface would throw away the one thing it does show — where the water column's strongest
   * gradient sits, which is a sonar question whatever it is called.
   */
  const relief = useMemo(() => {
    const depths = new Set<number>();
    for (const cell of surface) if (cell) depths.add(cell.depthM);
    return { distinct: depths.size, placed: surface.filter((cell) => cell !== undefined).length };
  }, [surface]);

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
              // Thin enough to see through a stack of six and still read the ramp.
              return [red, green, blue, 46] as [number, number, number, number];
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
            onClick={(info: { coordinate?: number[] }) => {
              // A click is placed through the frame's own inverse, which is tested as a round
              // trip against `toCartesian` — the reason the projection is imported rather than
              // written again here.
              const at = info.coordinate;
              if (!at) return;
              const { longitude, latitude } = frame.toGeographic(at[0], at[1]);
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
          {relief.distinct <= 2
            ? ' — so it is nearly flat, and that is a fact about the grid rather than about the ocean: the levels are 200 m apart, the profile falls fastest in its shallowest pair almost everywhere, and the authored thermocline is a layer an order of magnitude thinner than the spacing can resolve. What this surface shows at this resolution is where the strongest gradient sits, not a doming thermocline.'
            : ', so it domes and tilts where the features move it.'}
        </p>
      )}
    </div>
  );
}
