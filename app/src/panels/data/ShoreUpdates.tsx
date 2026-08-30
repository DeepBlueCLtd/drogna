/**
 * The shore-updates branch (feature 120, FR-15, FR-16): advice from shore, drawn.
 *
 * Advisories have had a store, a publisher and a Features collection since feature 108
 * and have never been drawn anywhere. What they have instead of a picture is a document
 * with no free text in it — every field an enum, a bounded pattern or a timestamp, so
 * that no field is capable of naming an entity — which makes them exactly the thing a
 * canvas serves better than a list: a region, a kind, and a window of validity.
 *
 * A lapsed advisory stays on the canvas, drawn spent. What shore has said is a record,
 * and dropping an advisory when its validity ran out would answer "has anything been
 * advised here?" with "no" when the truth is "yes, and it has expired".
 *
 * The regions are drawn **on something**. The first cut put them on a bare canvas, and a
 * reader's report of it was exact: no vector data on a map. An advised bbox alone is a
 * rectangle in a void — it says a region was advised and nothing about where, which is
 * half of what an advisory is. Beneath them now go the run's own reference geometry (the
 * domain and the loiter region, from the same Features service one collection along) and
 * a graticule generated locally, which is the Map's answer to the same problem and the
 * page's only spatial reference: no tiles, no third party.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { WebMercatorViewport } from '@deck.gl/core';
import { PathLayer, PolygonLayer, SolidPolygonLayer } from '@deck.gl/layers';
import { graticule } from '../map/map-data.js';
import { displayInstant } from '../../shell/display.js';
import {
  KIND_LABEL,
  advisoryRegions,
  fillFor,
  outlineFor,
  standingLabel,
  type AdvisoryRegion,
} from './advisories.js';
import type { FeaturesResponseFeatureCollection } from '../../generated/types.js';

/** One colour per kind, so a reader following one kind follows one hue as it expires. */
const KIND_COLOUR: Record<string, [number, number, number]> = {
  'sound-speed-outlook': [64, 132, 214],
  'sampling-window': [86, 176, 128],
  'caution-region': [214, 132, 64],
};
const UNSTATED: [number, number, number] = [150, 150, 160];

export function ShoreUpdates({
  advisories,
  reference,
  refusal,
  nowSimTime,
  selected,
  onSelect,
  missing,
}: {
  readonly advisories?: FeaturesResponseFeatureCollection;
  /** The domain and the loiter region: what an advised region is placed against. */
  readonly reference?: FeaturesResponseFeatureCollection;
  readonly refusal?: string;
  readonly nowSimTime?: string;
  readonly selected?: string;
  readonly onSelect: (advisoryId: string | undefined) => void;
  readonly missing?: string;
}) {
  const { regions, unreadable } = advisories
    ? advisoryRegions(advisories, nowSimTime)
    : { regions: [], unreadable: 0 };
  const chosen = regions.find((region) => region.id === selected);

  /**
   * The reference rings, as paths.
   *
   * A feature whose geometry cannot be read is skipped rather than drawn at a guess: the
   * reference is context, and context drawn wrongly is worse than context absent.
   */
  const named = (reference?.features ?? [])
    .map((feature) => ({
      id: String(feature.id ?? ''),
      ring: (feature.geometry as { coordinates?: number[][][] } | undefined)?.coordinates?.[0],
    }))
    .filter((entry): entry is { id: string; ring: number[][] } => Array.isArray(entry.ring) && entry.ring.length > 2)
    .map((entry) => ({
      id: entry.id,
      ring: entry.ring.map(([longitude, latitude]) => [longitude, latitude] as [number, number]),
    }));
  const referenceRings = named.map((entry) => entry.ring);
  // The domain is the sea the run happens in, so it is drawn as a surface rather than as
  // one more outline. Without it the canvas is graticule and advisory, and a reader has
  // to be told which lines are the world and which are the grid — which is the reading
  // the first cut got, exactly.
  const domain = named.find((entry) => entry.id === 'domain');
  const inner = named.filter((entry) => entry.id !== 'domain');

  const bounds = regions.reduce(
    (box, region) => ({
      west: Math.min(box.west, region.bbox[0]),
      south: Math.min(box.south, region.bbox[1]),
      east: Math.max(box.east, region.bbox[2]),
      north: Math.max(box.north, region.bbox[3]),
    }),
    { west: 180, south: 90, east: -180, north: -90 },
  );

  /**
   * The view, fitted to the domain where the reference gives one and to the advised
   * regions otherwise.
   *
   * Fitting to the advisories alone fills the canvas with one rectangle and answers
   * "where is this?" with the rectangle again. The domain is the frame the whole run
   * happens in, so an advised region drawn inside it is placed by the picture rather
   * than by its coordinates.
   *
   * The fit is computed by `WebMercatorViewport`, against the canvas as measured, and
   * the arithmetic it replaced is worth recording: deriving a zoom from degrees-across
   * alone got the horizontal roughly right and clipped the domain top and bottom, because
   * four degrees of latitude at 46°N occupy about half as much again on a Mercator as
   * four degrees of longitude do. A projection's own viewport knows that; a log2 does not.
   */
  const framed = referenceRings.length > 0 ? ringBounds(referenceRings) : bounds;
  const [box, setBox] = useState<{ width: number; height: number } | undefined>();
  const observed = useRef<ResizeObserver | undefined>(undefined);
  /**
   * A **callback** ref, not an effect over `ref.current`.
   *
   * The canvas is only in the document once an advisory exists — before that the branch
   * is a sentence saying the collection is empty — so a mount-time effect looked at a
   * ref that was null, returned, and never ran again. The measurement never arrived, the
   * fit never applied, and the picture sat at its pre-measurement fallback: the domain at
   * two fifths of the height it should have filled, which is what the second look at this
   * canvas found after the first fix had apparently made it right.
   */
  const canvasRef = useCallback((node: HTMLDivElement | null) => {
    observed.current?.disconnect();
    observed.current = undefined;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setBox({ width, height });
    });
    observer.observe(node);
    observed.current = observer;
  }, []);

  const centre = {
    longitude: (framed.west + framed.east) / 2,
    latitude: (framed.south + framed.north) / 2,
  };
  const fitted =
    box && framed.east > framed.west && framed.north > framed.south
      ? new WebMercatorViewport({ width: box.width, height: box.height }).fitBounds(
          [
            [framed.west, framed.south],
            [framed.east, framed.north],
          ],
          { padding: 16 },
        )
      : // Before the first measurement: centred, and zoomed out rather than in. A first
        // frame too wide is a picture that settles; too narrow is one that starts inside
        // the advisory and jumps out.
        { ...centre, zoom: 4 };

  /**
   * The view is **controlled**, and it has to be.
   *
   * `initialViewState` is read once, on the first render — which is before the canvas has
   * been measured, so the fit computed from that measurement never reached the picture
   * and the domain sat at two fifths of the height it should have filled. Holding the
   * view here means the fit applies when the measurement arrives, and a reader's own pan
   * and zoom are kept from then on rather than being snapped back by the next render.
   */
  const [view, setView] = useState<Record<string, unknown> | undefined>();
  const framedKey = `${framed.west},${framed.south},${framed.east},${framed.north},${box?.width ?? 0}x${box?.height ?? 0}`;
  const fittedFor = useRef<string | undefined>(undefined);
  useEffect(() => {
    // Refitted when the frame or the canvas changes, and at no other time: refitting on
    // every render would drag the picture back from wherever the reader had moved it.
    if (fittedFor.current === framedKey) return;
    fittedFor.current = framedKey;
    setView(fitted as unknown as Record<string, unknown>);
    // Keyed on `framedKey` alone, which names exactly the values `fitted` is derived
    // from: the frame's four edges and the canvas it is being fitted into.
  }, [framedKey, fitted]);

  return (
    <div className="data-branch" data-region="advisories">
      <div className="data-branch-head">
        <h3>Shore updates</h3>
        <p className="panel-footnote">advice sent from shore: where it applies, and for how long</p>
        {missing !== undefined && (
          <p className="shell-refusal" data-testid="node-missing">
            the address asked for “{missing}”, which the advisory store does not hold
          </p>
        )}
      </div>

      {refusal !== undefined ? (
        <p className="shell-refusal" data-testid="branch-refusal">
          {refusal}
        </p>
      ) : regions.length === 0 ? (
        // The collection is present-and-stating-empty before any advisory exists, and the
        // branch says that in those terms rather than drawing an empty sea (FR-16).
        <p className="panel-footnote" data-testid="branch-empty">
          the advisory collection is present and states that it holds nothing yet — shore has
          sent no advice in this run so far
        </p>
      ) : (
        <>
          <div className="advisory-canvas" ref={canvasRef}>
            <DeckGL
              viewState={view ?? fitted}
              onViewStateChange={({ viewState }) => setView(viewState as Record<string, unknown>)}
              controller
              layers={[
                // The graticule first, so everything else sits on top of it. One degree,
                // because the domain is a few degrees across and ten would draw no line
                // inside it at all.
                new PathLayer({
                  id: 'shore-graticule',
                  data: graticule(1),
                  getPath: (path: [number, number][]) => path,
                  getColor: [52, 60, 72, 140],
                  getWidth: 1,
                  widthUnits: 'pixels',
                }),
                ...(domain
                  ? [
                      new SolidPolygonLayer({
                        id: 'shore-domain',
                        data: [domain.ring],
                        getPolygon: (ring: [number, number][]) => ring,
                        getFillColor: [22, 34, 48, 255],
                      }),
                      new PathLayer({
                        id: 'shore-domain-edge',
                        data: [domain.ring],
                        getPath: (ring: [number, number][]) => ring,
                        getColor: [120, 138, 160, 230],
                        getWidth: 2,
                        widthUnits: 'pixels',
                      }),
                    ]
                  : []),
                new PolygonLayer<AdvisoryRegion>({
                  id: 'advisory-regions',
                  data: regions as AdvisoryRegion[],
                  getPolygon: (region) => region.ring as [number, number][],
                  getFillColor: (region) => fillFor(KIND_COLOUR[region.kind] ?? UNSTATED, region.standing),
                  getLineColor: (region) => outlineFor(KIND_COLOUR[region.kind] ?? UNSTATED, region.standing),
                  getLineWidth: 1.5,
                  lineWidthUnits: 'pixels',
                  stroked: true,
                  filled: true,
                  pickable: true,
                  onClick: (info) => onSelect(info.object ? (info.object as AdvisoryRegion).id : undefined),
                }),
                // Above the advisories, and deliberately: a two-pixel outline under a
                // translucent fill is not context, it is a rumour of one. The loiter
                // region sits inside the advised areas more often than not, which is the
                // whole reason it is worth drawing.
                new PathLayer({
                  id: 'shore-reference',
                  data: inner.map((entry) => entry.ring),
                  getPath: (ring: [number, number][]) => ring,
                  getColor: [122, 190, 168, 240],
                  getWidth: 2,
                  widthUnits: 'pixels',
                }),
              ]}
            />
          </div>

          <p className="panel-footnote" data-testid="advisory-legend">
            {domain ? 'The lighter plane is the scenario domain' : 'No domain geometry was served'}
            {inner.length > 0 && `, the green outline the ${inner.length === 1 ? 'loiter region' : 'reference regions'}`}
            . Advised regions are drawn over them, coloured by kind and faded once their
            validity has lapsed. The grid is one degree, generated here — no tiles, no
            third party.
          </p>

          <ul className="advisory-list" data-testid="advisory-list">
            {regions.map((region) => (
              <li key={region.id}>
                <button
                  type="button"
                  data-advisory={region.id}
                  data-standing={region.standing}
                  aria-pressed={region.id === selected}
                  onClick={() => onSelect(region.id === selected ? undefined : region.id)}
                >
                  <span className="advisory-kind" data-kind={region.kind}>
                    {KIND_LABEL[region.kind] ?? region.kind}
                  </span>
                  <span className="advisory-standing">{standingLabel(region.standing)}</span>
                  <span className="advisory-window">
                    {displayInstant(region.validFrom)} → {displayInstant(region.validTo)}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {unreadable > 0 && (
            <p className="shell-refusal" data-testid="advisory-unreadable">
              {unreadable} advisory document(s) could not be read as a region and are not drawn
            </p>
          )}
        </>
      )}

      {chosen && (
        <section className="advisory-detail" data-testid="advisory-detail">
          <h4>{chosen.id}</h4>
          <p className="panel-footnote">
            {KIND_LABEL[chosen.kind] ?? chosen.kind}, {standingLabel(chosen.standing)} —{' '}
            {displayInstant(chosen.validFrom)} to {displayInstant(chosen.validTo)}
          </p>
          {/* The guidance document whole. Every field is an enum, a number or a
              timestamp by construction, so there is nothing here to summarise away. */}
          <pre data-testid="advisory-json">{JSON.stringify(chosen.properties, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}

/** The extent of a set of rings, in degrees. */
function ringBounds(rings: readonly (readonly [number, number][])[]): {
  west: number;
  south: number;
  east: number;
  north: number;
} {
  const longitudes = rings.flat().map(([longitude]) => longitude);
  const latitudes = rings.flat().map(([, latitude]) => latitude);
  return {
    west: Math.min(...longitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    north: Math.max(...latitudes),
  };
}
