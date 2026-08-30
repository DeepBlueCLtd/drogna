/**
 * The coverage volume with its fourth axis (feature 120, FR-13, FR-14).
 *
 * The Map's cube already rotates longitude, latitude and depth, one genuine EDR area
 * query per level of the holding's own depth axis. It draws one instant. This draws the
 * holding's whole declared time axis, a step at a time — months for the archive, hours
 * for a forecast run, and in both cases read from the manifest rather than assumed.
 *
 * The frame, the cartesian mapping and the cell geometry are the Map's, imported rather
 * than copied: a second implementation of the same projection is a second thing to keep
 * true, and the map's is already tested.
 *
 * **Nothing is drawn that was not fetched** (FR-14). Scrubbing to a step that has not
 * been fetched shows that step arriving; it never shows a neighbour's values standing in
 * for it, which would be a picture of an instant the store was never asked about. The
 * panel names the steps it holds so a half-loaded volume does not read as a whole one.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { COORDINATE_SYSTEM, OrbitView } from '@deck.gl/core';
import { PathLayer, SolidPolygonLayer } from '@deck.gl/layers';
import type { CoverageHolding } from '../../generated/types.js';
import type { SeamValidator } from '../../seam/validate.js';
import { displayInstant } from '../../shell/display.js';
import { axisValues, cubeFrame, volumeEdges } from '../map/cube.js';
import { gridCells, manifestInstants, rampColour, type GridCoverage } from '../map/map-data.js';
import { VolumeCache, loadingSummary, type VolumeLevel } from './volume.js';

const INITIAL_VIEW = { target: [0, 0, -40] as [number, number, number], zoom: 1.1, rotationX: 28, rotationOrbit: 24 };

export function Volume({
  holding,
  edrPrefix,
  validator,
}: {
  readonly holding: CoverageHolding;
  readonly edrPrefix: string;
  readonly validator: SeamValidator;
}) {
  const { manifest } = holding;
  const collectionId = collectionFor(holding);
  const instants = useMemo(() => manifestInstants(manifest.grid.time), [manifest.grid.time]);
  const [stepIndex, setStepIndex] = useState(0);
  const [cache, setCache] = useState(() => new VolumeCache());
  const [parameter, setParameter] = useState(() => manifest.variables[0]?.name ?? 'temperature');

  // A new holding is a new axis: the step a reader was on in the last one means nothing
  // here, and carrying it over would open the volume at an arbitrary instant.
  useEffect(() => {
    setStepIndex(0);
  }, [holding.holding_id]);

  const instant = instants[Math.min(stepIndex, instants.length - 1)];
  const state = instant === undefined ? { status: 'absent' as const } : cache.get(collectionId, instant);

  const fetchStep = useCallback(
    async (at: string) => {
      const { longitude, latitude, depth } = manifest.grid;
      const ring = [
        [longitude.minimum, latitude.minimum],
        [longitude.maximum, latitude.minimum],
        [longitude.maximum, latitude.maximum],
        [longitude.minimum, latitude.maximum],
        [longitude.minimum, latitude.minimum],
      ];
      const wkt = `POLYGON((${ring.map(([lon, lat]) => `${lon} ${lat}`).join(', ')}))`;
      const levels: VolumeLevel[] = [];
      for (const depthM of axisValues(depth)) {
        const query = new URLSearchParams({ coords: wkt, z: String(depthM), datetime: at });
        const response = await fetch(`${edrPrefix}/collections/${collectionId}/area?${query.toString()}`);
        const body = (await response.json()) as unknown;
        if (!response.ok) {
          const named = (body as { refused?: string }).refused;
          return { status: 'refused' as const, refusal: named ?? `the area query answered ${response.status}` };
        }
        const verdict = validator.validate('coveragejson', body);
        if (!verdict.ok) {
          return { status: 'refused' as const, refusal: `the coverage was refused by its master: ${verdict.refusals[0]}` };
        }
        levels.push({ depthM, coverage: body as GridCoverage });
      }
      return { status: 'loaded' as const, step: { instant: at, levels } };
    },
    [collectionId, edrPrefix, manifest.grid, validator],
  );

  /**
   * What is in flight, by key.
   *
   * A ref rather than a dependency, and the difference is not cosmetic: the first cut
   * listed `cache` in the effect's dependencies, so writing `loading` into the cache
   * changed the cache, which re-ran the effect, which ran its own cleanup and set
   * `abandoned` on the fetch still in progress. The result stored nothing and the volume
   * sat on "fetching 4 level(s)" for as long as anybody watched it. Found by driving the
   * built page in a browser, not by a test — which is why there is now a test.
   */
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    if (instant === undefined) return;
    const key = `${collectionId} ${instant}`;
    if (inFlight.current.has(key)) return;
    let abandoned = false;
    let started = false;
    setCache((current) => {
      if (current.get(collectionId, instant).status !== 'absent') return current;
      started = true;
      inFlight.current.add(key);
      const next = current.clone();
      next.set(collectionId, instant, { status: 'loading' });
      return next;
    });
    if (!started) return;
    void (async () => {
      const result = await fetchStep(instant);
      inFlight.current.delete(key);
      if (abandoned) return;
      setCache((current) => {
        const next = current.clone();
        next.set(collectionId, instant, result);
        return next;
      });
    })();
    return () => {
      abandoned = true;
    };
  }, [collectionId, fetchStep, instant]);

  const frame = useMemo(() => {
    const { longitude, latitude, depth } = manifest.grid;
    return cubeFrame({
      west: longitude.minimum,
      east: longitude.maximum,
      south: latitude.minimum,
      north: latitude.maximum,
      deepest: depth.maximum,
    });
  }, [manifest.grid]);

  // The range is the whole fetched step's, not each level's own, so a warm slice and a
  // cold one are comparable by eye — the Map's cube does the same and for the same reason.
  const grids =
    state.status === 'loaded'
      ? state.step.levels.map((level) => ({ level, grid: gridCells(level.coverage, parameter) }))
      : [];
  const values = grids.flatMap(({ grid }) => (grid ? [grid.minimum, grid.maximum] : []));
  const minimum = values.length > 0 ? Math.min(...values) : 0;
  const maximum = values.length > 0 ? Math.max(...values) : 1;

  const layers = [
    ...grids.map(({ level, grid }) =>
      grid
        ? new SolidPolygonLayer({
            id: `volume-level-${level.depthM}`,
            data: grid.cells,
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            getPolygon: (cell: { bounds: [number, number, number, number] }) => {
              const [west, south, east, north] = cell.bounds;
              return [
                frame.toCartesian(west, south, level.depthM),
                frame.toCartesian(east, south, level.depthM),
                frame.toCartesian(east, north, level.depthM),
                frame.toCartesian(west, north, level.depthM),
              ];
            },
            getFillColor: (cell: { value: number }) => {
              const [red, green, blue] = rampColour(cell.value, minimum, maximum);
              return [red, green, blue, 190] as [number, number, number, number];
            },
          })
        : undefined,
    ),
    new PathLayer({
      id: 'volume-frame',
      data: volumeEdges(frame),
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPath: (path: [number, number, number][]) => path,
      getColor: [90, 95, 105, 200],
      getWidth: 1,
      widthUnits: 'pixels',
    }),
  ].filter((layer) => layer !== undefined);

  const held = cache.loaded(collectionId, instants);

  return (
    <section className="data-volume">
      <h4>the volume, through its own time axis</h4>
      <div className="volume-controls">
        <label>
          step
          <input
            type="range"
            min={0}
            max={Math.max(instants.length - 1, 0)}
            step={1}
            value={stepIndex}
            aria-label="time step"
            onChange={(event) => setStepIndex(Number(event.target.value))}
          />
        </label>
        <label>
          parameter
          <select value={parameter} onChange={(event) => setParameter(event.target.value)}>
            {manifest.variables.map((variable) => (
              <option key={variable.name} value={variable.name}>
                {variable.name}
              </option>
            ))}
          </select>
        </label>
        <span className="volume-instant" data-testid="volume-instant">
          {instant === undefined ? 'no time axis' : displayInstant(instant)}
        </span>
      </div>

      <div className="volume-canvas">
        {state.status === 'loaded' ? (
          <DeckGL
            views={new OrbitView({ orbitAxis: 'Z' })}
            initialViewState={INITIAL_VIEW}
            controller
            layers={layers}
          />
        ) : (
          // Not an empty canvas: the reader is told which of the three things is true —
          // fetching, refused, or nothing asked for yet (FR-06, FR-14).
          <p className="panel-footnote" data-testid="volume-state">
            {state.status === 'loading' && `fetching ${axisValues(manifest.grid.depth).length} level(s) for this step…`}
            {state.status === 'refused' && `this step was refused — ${state.refusal}`}
            {state.status === 'absent' && 'this step has not been fetched'}
          </p>
        )}
      </div>

      <p className="panel-footnote" data-testid="volume-loading">
        {loadingSummary(held.length, instants.length)}. Each level drawn is a genuine area
        query against {collectionId}; depth is exaggerated so the levels separate.
      </p>
    </section>
  );
}

/**
 * The EDR collection a holding is served as (FR-19, FR-29).
 *
 * The rule is the query component's own: an era holding one field is asked for by era,
 * and an era holding several — a run, an analysis cycle — is asked for by holding id.
 * Written here rather than fetched because it is the same convention the collections
 * list is built from, and a volume that asked for the wrong id would be refused by name
 * rather than answer wrongly.
 */
function collectionFor(holding: CoverageHolding): string {
  const manyPerEra = holding.era === 'instance' || holding.era === 'analysis';
  return manyPerEra ? holding.holding_id : holding.era;
}
