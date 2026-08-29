/**
 * The Map tab (FR-40): the arc's closing scene. Deck.gl over the domain — the
 * field from a genuine EDR area query, the projection's doubt decaying and
 * refreshing from each published plan, the committed route as a four-dimensional
 * curve with a time control, and advisories drawn only while valid at the
 * displayed instant yet queryable always. Every pixel traces to a document that
 * crossed the seam; where WebGL is unavailable the canvas says so and the
 * documents remain (Constitution VII: the display can light nothing itself).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import DeckGL from '@deck.gl/react';
import { PathLayer, PolygonLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { PanelParams } from '../../shell/Shell.js';
import type {
  Advisory,
  FeaturesResponseFeature,
  FeaturesResponseFeatureCollection,
  Plan,
  RunPublished,
} from '../../generated/types.js';
import {
  gridCells,
  projectionCells,
  rampColour,
  routePositionAt,
  validAt,
  type AdvisoryFeature,
  type GridCoverage,
} from './map-data.js';
import { ComposerPane } from './ComposerPane.js';
import { displayInstant } from '../../shell/display.js';
import './map.css';

interface FieldState {
  coverage?: GridCoverage;
  refusal?: string;
  /** The collection and instant the coverage actually answers for. */
  servedFrom?: string;
}

function webglAvailable(): boolean {
  if (typeof WebGL2RenderingContext === 'undefined') return false;
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

export function MapPanel({ params }: IDockviewPanelProps<PanelParams>) {
  const { config, client, validator } = params;
  const [simTime, setSimTime] = useState('');
  const [plan, setPlan] = useState<Plan | undefined>();
  const [latestRun, setLatestRun] = useState<RunPublished | undefined>();
  const [advisories, setAdvisories] = useState<readonly AdvisoryFeature[]>([]);
  const [reference, setReference] = useState<readonly FeaturesResponseFeature[]>([]);
  const [field, setField] = useState<FieldState>({});
  const [source, setSource] = useState<'nowcast' | 'forecast'>('nowcast');
  const [parameter, setParameter] = useState('temperature');
  const [depthM, setDepthM] = useState(50);
  /** Seconds behind/ahead of live simulation time; 0 follows the clock. */
  const [timeOffset, setTimeOffset] = useState(0);
  const [composing, setComposing] = useState(false);
  const [selectedAdvisory, setSelectedAdvisory] = useState<string | undefined>();
  const [arrival, setArrival] = useState<string | undefined>();
  const canDraw = useMemo(webglAvailable, []);

  useEffect(() => {
    const stops = [
      client.subscribe(config.topics.clock, (message) => {
        setSimTime((message.payload as { sim_time: string }).sim_time);
      }),
      client.subscribe(config.topics.plan, (message) => setPlan(message.payload as Plan)),
      client.subscribe(config.topics.run_published, (message) =>
        setLatestRun(message.payload as RunPublished),
      ),
    ];
    return () => stops.forEach((stop) => stop());
  }, [client, config.topics.clock, config.topics.plan, config.topics.run_published]);

  const refreshAdvisories = useCallback(async () => {
    const response = await fetch(`${config.endpoints.features}/collections/advisories/items`);
    if (!response.ok) return;
    const body = (await response.json()) as FeaturesResponseFeatureCollection;
    if (validator.validate('features-response#feature_collection', body).ok) {
      setAdvisories(body.features as AdvisoryFeature[]);
    }
  }, [config.endpoints.features, validator]);

  useEffect(() => {
    void refreshAdvisories();
    return client.subscribe(config.topics.advisories, () => void refreshAdvisories());
  }, [client, config.topics.advisories, refreshAdvisories]);

  useEffect(() => {
    void (async () => {
      const response = await fetch(`${config.endpoints.features}/collections/reference/items`);
      if (!response.ok) return;
      const body = (await response.json()) as FeaturesResponseFeatureCollection;
      if (validator.validate('features-response#feature_collection', body).ok) setReference(body.features);
    })();
  }, [config.endpoints.features, validator]);

  const domain = reference.find((feature) => feature.id === 'domain');
  const domainRing = domain?.geometry.coordinates[0] as [number, number][] | undefined;

  // The field: one genuine area query over the domain, refetched when the source
  // holding is replaced. The response's own snapped instant is what is displayed.
  const collectionId = source === 'forecast' ? latestRun?.collections.forecast : 'nowcast';
  useEffect(() => {
    if (!domainRing || !collectionId) return;
    void (async () => {
      const wkt = `POLYGON((${domainRing.map(([lon, lat]) => `${lon} ${lat}`).join(', ')}))`;
      const query = new URLSearchParams({ coords: wkt, z: String(depthM), 'parameter-name': parameter });
      const response = await fetch(
        `${config.endpoints.edr}/collections/${collectionId}/area?${query.toString()}`,
      );
      const body = (await response.json()) as unknown;
      if (!response.ok) {
        setField({ refusal: (body as { refused?: string }).refused ?? `the area query answered ${response.status}` });
        return;
      }
      const verdict = validator.validate('coveragejson', body);
      if (!verdict.ok) {
        setField({ refusal: `the coverage was refused by its master: ${verdict.refusals[0]}` });
        return;
      }
      const coverage = body as GridCoverage;
      setField({ coverage, servedFrom: `${collectionId} at ${displayInstant(coverage.domain.axes.t.values[0])}` });
    })();
    // latestRun keys the refetch: a newly published run replaces the holding.
  }, [collectionId, config.endpoints.edr, depthM, domainRing === undefined, parameter, validator, latestRun]);

  const displayedSimTime = useMemo(() => {
    if (!simTime) return '';
    if (timeOffset === 0) return simTime;
    const millis = Date.parse(simTime.slice(0, 23) + 'Z') + timeOffset * 1000;
    return `${new Date(millis).toISOString().slice(0, 23)}000Z`;
  }, [simTime, timeOffset]);

  const grid = field.coverage ? gridCells(field.coverage, parameter) : undefined;
  const validAdvisories = advisories.filter((feature) => validAt(feature.properties, displayedSimTime));
  const platform = plan ? routePositionAt(plan, displayedSimTime) : undefined;
  const doubtCells = plan ? projectionCells(plan, 0) : [];

  // Conditions at the moment of arrival (FR-40): a genuine position query at the
  // clicked vertex's place and arrival instant, shown in the vertex's own terms.
  const conditionsAtArrival = useCallback(
    async (vertex: Plan['route']['vertices'][number]) => {
      if (!collectionId) return;
      const query = new URLSearchParams({
        coords: `POINT(${vertex.longitude} ${vertex.latitude})`,
        z: String(vertex.depth_m),
        datetime: vertex.arrival_sim_time,
      });
      const response = await fetch(
        `${config.endpoints.edr}/collections/${collectionId}/position?${query.toString()}`,
      );
      const body = (await response.json()) as {
        ranges?: Record<string, { values: number[] }>;
        refused?: string;
      };
      setArrival(
        response.ok && body.ranges
          ? `stop ${vertex.sequence} · arrive ${displayInstant(vertex.arrival_sim_time)} at ${vertex.depth_m} m: ` +
              Object.entries(body.ranges)
                .map(([name, range]) => `${name} ${range.values[0]?.toFixed(3)}`)
                .join(', ')
          : `stop ${vertex.sequence}: ${body.refused ?? `the position query answered ${response.status}`}`,
      );
    },
    [collectionId, config.endpoints.edr],
  );

  const layers = [
    grid &&
      new PolygonLayer({
        id: 'field',
        data: grid.cells,
        getPolygon: (cell) => {
          const [west, south, east, north] = cell.bounds;
          return [
            [west, south],
            [east, south],
            [east, north],
            [west, north],
          ];
        },
        getFillColor: (cell) => rampColour(cell.value, grid.minimum, grid.maximum),
        stroked: false,
        pickable: false,
      }),
    doubtCells.length > 0 &&
      new PolygonLayer({
        id: 'doubt',
        data: doubtCells,
        getPolygon: (cell) => cell.boundary,
        getFillColor: (cell) => [255, 255, 255, Math.round(160 * cell.fraction)],
        getLineColor: [30, 30, 30, 120],
        getLineWidth: 1,
        lineWidthUnits: 'pixels',
        stroked: true,
        pickable: false,
      }),
    reference.length > 0 &&
      new PathLayer({
        id: 'reference',
        data: reference.map((feature) => feature.geometry.coordinates[0] as [number, number][]),
        getPath: (ring) => ring,
        getColor: [40, 40, 40, 200],
        getWidth: 2,
        widthUnits: 'pixels',
      }),
    validAdvisories.length > 0 &&
      new PathLayer({
        id: 'advisories',
        data: validAdvisories,
        getPath: (feature: AdvisoryFeature) => feature.geometry.coordinates[0] as [number, number][],
        getColor: [180, 30, 30, 255],
        getWidth: 4,
        widthUnits: 'pixels',
      }),
    plan &&
      plan.route.vertices.length > 0 && [
        new PathLayer({
          id: 'route',
          data: [
            [
              [plan.platform.longitude, plan.platform.latitude],
              ...plan.route.vertices.map((vertex) => [vertex.longitude, vertex.latitude]),
            ] as [number, number][],
          ],
          getPath: (path) => path,
          getColor: [255, 255, 255, 230],
          getWidth: 3,
          widthUnits: 'pixels',
        }),
        new ScatterplotLayer({
          id: 'route-stops',
          data: plan.route.vertices,
          getPosition: (vertex) => [vertex.longitude, vertex.latitude],
          getRadius: 6,
          radiusUnits: 'pixels',
          getFillColor: [0, 0, 0, 255],
          getLineColor: [255, 255, 255, 255],
          getLineWidth: 2,
          lineWidthUnits: 'pixels',
          stroked: true,
          pickable: true,
          onClick: (info) => {
            if (info.object) void conditionsAtArrival(info.object as Plan['route']['vertices'][number]);
          },
        }),
      ],
    platform &&
      new ScatterplotLayer({
        id: 'platform',
        data: [platform],
        getPosition: (position) => [position.longitude, position.latitude],
        getRadius: 9,
        radiusUnits: 'pixels',
        getFillColor: [255, 220, 0, 255],
        getLineColor: [0, 0, 0, 255],
        getLineWidth: 2,
        lineWidthUnits: 'pixels',
        stroked: true,
      }),
  ]
    .flat()
    .filter(Boolean);

  const horizonSpan = plan?.horizon.span_seconds ?? 21600;

  return (
    <div className="panel map-panel">
      <div className="map-controls">
        <label>
          field{' '}
          <select value={source} onChange={(event) => setSource(event.target.value as 'nowcast' | 'forecast')}>
            <option value="nowcast">now-cast</option>
            <option value="forecast" disabled={!latestRun}>
              latest forecast{latestRun ? ` (${latestRun.collections.forecast})` : ' (none published yet)'}
            </option>
          </select>
        </label>
        <label>
          parameter{' '}
          <select value={parameter} onChange={(event) => setParameter(event.target.value)}>
            <option value="temperature">temperature</option>
            <option value="salinity">salinity</option>
          </select>
        </label>
        <label>
          depth{' '}
          <select value={depthM} onChange={(event) => setDepthM(Number(event.target.value))}>
            {[0, 50, 200, 400, 600, 1000].map((depth) => (
              <option key={depth} value={depth}>
                {depth} m
              </option>
            ))}
          </select>
        </label>
        <label className="map-time">
          displayed time {timeOffset === 0 ? '(live)' : `(${timeOffset > 0 ? '+' : ''}${timeOffset}s)`}{' '}
          <input
            type="range"
            min={0}
            max={horizonSpan}
            step={600}
            value={timeOffset}
            onChange={(event) => setTimeOffset(Number(event.target.value))}
          />
        </label>
        <button onClick={() => setComposing((previous) => !previous)}>
          {composing ? 'close the composer' : 'EDR composer'}
        </button>
      </div>
      <p className="map-status">
        {displayedSimTime ? `displayed instant ${displayInstant(displayedSimTime)}` : 'no clock sample yet'}
        {field.servedFrom ? ` · field: ${field.servedFrom}` : ''}
        {field.refusal ? ` · field declined: ${field.refusal}` : ''}
        {plan ? ` · plan ${plan.plan_id} (${plan.route.vertices.length} stop(s))` : ' · no plan published yet'}
        {` · ${validAdvisories.length} of ${advisories.length} advisory(ies) valid at the displayed instant`}
      </p>
      {arrival && <p className="map-arrival">{arrival}</p>}
      <div className="map-body">
        <div className="map-canvas">
          {canDraw ? (
            <DeckGL
              initialViewState={{ longitude: -11, latitude: 46, zoom: 5.2 }}
              controller
              layers={layers}
            >
              {null}
            </DeckGL>
          ) : (
            <div className="map-no-webgl">
              <p>
                WebGL is unavailable here, so the canvas draws nothing — and says so rather than
                pretending. The documents the map would draw are all below, and every one crossed
                the seam.
              </p>
            </div>
          )}
        </div>
        {composing && (
          <ComposerPane config={config} validator={validator} latestForecast={latestRun?.collections.forecast} />
        )}
      </div>
      <div className="map-advisories">
        <h4>advisories (queryable whether or not drawn)</h4>
        {advisories.length === 0 ? (
          <p>none yet: the collection is present and stating empty.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>id</th>
                <th>kind</th>
                <th>valid</th>
                <th>at the displayed instant</th>
              </tr>
            </thead>
            <tbody>
              {advisories.map((feature) => {
                const advisory = feature.properties;
                return (
                  <tr
                    key={feature.id}
                    className={selectedAdvisory === feature.id ? 'selected' : undefined}
                    onClick={() => setSelectedAdvisory(feature.id)}
                  >
                    <td>{feature.id}</td>
                    <td>{advisory.kind}</td>
                    <td>
                      {displayInstant(advisory.valid_time.start_sim_time)} →{' '}
                      {displayInstant(advisory.valid_time.end_sim_time)}
                    </td>
                    <td>{validAt(advisory, displayedSimTime) ? 'drawn (valid)' : 'undrawn (outside validity)'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {selectedAdvisory && (
          <pre className="map-advisory-detail">
            {JSON.stringify(
              advisories.find((feature) => feature.id === selectedAdvisory)?.properties as Omit<
                Advisory,
                'region'
              >,
              null,
              2,
            )}
          </pre>
        )}
      </div>
    </div>
  );
}
