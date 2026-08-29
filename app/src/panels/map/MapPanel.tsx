/**
 * The Map tab (FR-40): the arc's closing scene. Deck.gl over the domain — the
 * field from a genuine EDR area query, the projection's doubt decaying and
 * refreshing from each published plan, the committed route as a four-dimensional
 * curve with a time control, and advisories drawn only while valid at the
 * displayed instant yet queryable always. With the composer open the canvas also
 * takes the query's position by click, in any projection, and draws exactly what the
 * composed URL asks for (issue #53). The cube projection (issue #59) rotates the
 * depth volume: one area query per level of the holding's own depth axis, stacked,
 * with the route running through it at the depths the plan states. Every pixel traces to a document that
 * crossed the seam; where WebGL is unavailable the canvas says so and the
 * documents remain (Constitution VII: the display can light nothing itself).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import DeckGL from '@deck.gl/react';
import {
  COORDINATE_SYSTEM,
  MapView,
  OrbitView,
  _GlobeView as GlobeView,
  type PickingInfo,
} from '@deck.gl/core';
import { PathLayer, PolygonLayer, ScatterplotLayer, SolidPolygonLayer } from '@deck.gl/layers';
import type { PanelParams } from '../../shell/Shell.js';
import type {
  Advisory,
  CoverageHolding,
  HoldingsInventory,
  FeaturesResponseFeature,
  FeaturesResponseFeatureCollection,
  Plan,
  RunPublished,
} from '../../generated/types.js';
import {
  graticule,
  gridCells,
  insideRing,
  projectionCells,
  rampColour,
  routePositionAt,
  validAt,
  type AdvisoryFeature,
  type GridCoverage,
} from './map-data.js';
import { whenInDocument } from './attach.js';
import { areaRing, pickedPosition, type ComposerChoices } from './composer.js';
import { axisValues, cubeFrame, volumeEdges, type CubeFrame } from './cube.js';
import { ComposerPane } from './ComposerPane.js';
import { displayInstant } from '../../shell/display.js';
import './map.css';

interface FieldState {
  coverage?: GridCoverage;
  refusal?: string;
  /** The collection and instant the coverage actually answers for. */
  servedFrom?: string;
}

/** One depth level of the cube, and the coverage its area query answered with. */
interface VolumeLevel {
  /** The depth asked for, from the holding's own manifest. */
  requestedDepthM: number;
  /** The depth the server answered with — its nearest stored level. */
  servedDepthM: number;
  coverage: GridCoverage;
}

interface VolumeState {
  levels: VolumeLevel[];
  /** The domain and depth extent the drawn volume stands for. */
  frame?: CubeFrame;
  refusal?: string;
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
  /** The composed EDR query, held here so a click on the canvas can place it. */
  const [choices, setChoices] = useState<ComposerChoices>({ parameters: [] });
  const [selectedAdvisory, setSelectedAdvisory] = useState<string | undefined>();
  const [arrival, setArrival] = useState<string | undefined>();
  /**
   * Globe by default: drag rotates the sphere; flat keeps the plan view; cube
   * rotates the depth volume, one genuine area query per level (issue #59).
   */
  const [projection, setProjection] = useState<'globe' | 'flat' | 'cube'>('globe');
  const [volume, setVolume] = useState<VolumeState>({ levels: [] });
  /** The frame the click handler reads: state for drawing, a ref for the callback. */
  const volumeRef = useRef<CubeFrame | undefined>(undefined);
  volumeRef.current = volume.frame;
  const canDraw = useMemo(webglAvailable, []);
  /**
   * dockview mounts an inactive tab's content detached, and deck.gl built against a
   * detached canvas takes no pointer events for the rest of its life (see attach.ts).
   * So the canvas is held back until this host is in the document.
   */
  const canvasHost = useRef<HTMLDivElement>(null);
  const [hostInDocument, setHostInDocument] = useState(false);
  useEffect(() => {
    const host = canvasHost.current;
    if (!canDraw || !host || hostInDocument) return;
    return whenInDocument(host, () => setHostInDocument(true));
  }, [canDraw, hostInDocument]);

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
    // The cube asks for every level itself; one more query for a slice nobody is
    // looking at would be a round trip spent on nothing.
    if (!domainRing || !collectionId || projection === 'cube') return;
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
      // The depth the coverage answers for, not the depth asked for: the sampler is
      // nearest-neighbour, so a level the selector offers may not be one the holding
      // stores, and the difference belongs on screen rather than in a comment.
      setField({
        coverage,
        servedFrom: `${collectionId} at ${displayInstant(coverage.domain.axes.t.values[0])}, ${coverage.domain.axes.z.values[0]} m`,
      });
    })();
    // latestRun keys the refetch: a newly published run replaces the holding.
  }, [
    collectionId,
    config.endpoints.edr,
    depthM,
    domainRing === undefined,
    parameter,
    projection,
    validator,
    latestRun,
  ]);

  // The cube (issue #59): the levels are the holding's own depth axis, read from the
  // ground-truth manifest the coverage store publishes, and each level is a genuine
  // EDR area query — the same query the plan view issues, asked once per level. EDR's
  // own `cube` query type stays refused by this subset (the composer will say so);
  // this is the client stacking what the served subset does answer.
  useEffect(() => {
    if (projection !== 'cube' || !domainRing || !collectionId) return;
    let abandoned = false;
    void (async () => {
      const inventoryResponse = await fetch(config.endpoints.holdings);
      const inventoryBody = (await inventoryResponse.json()) as unknown;
      if (!inventoryResponse.ok || !validator.validate('holdings-inventory', inventoryBody).ok) {
        if (!abandoned) {
          setVolume({
            levels: [],
            refusal:
              'the holdings inventory did not answer with a master-valid document, so the depth axis is unknown',
          });
        }
        return;
      }
      const holding = (inventoryBody as HoldingsInventory).holdings.find(
        (candidate: CoverageHolding) =>
          candidate.era === collectionId || candidate.holding_id === collectionId,
      );
      if (!holding) {
        if (!abandoned) {
          setVolume({ levels: [], refusal: `the inventory names no holding for collection '${collectionId}'` });
        }
        return;
      }
      const grid = holding.manifest.grid;
      const wkt = `POLYGON((${domainRing.map(([lon, lat]) => `${lon} ${lat}`).join(', ')}))`;
      const levels: VolumeLevel[] = [];
      const refusals: string[] = [];
      for (const requestedDepthM of axisValues(grid.depth)) {
        const query = new URLSearchParams({
          coords: wkt,
          z: String(requestedDepthM),
          'parameter-name': parameter,
        });
        const response = await fetch(
          `${config.endpoints.edr}/collections/${collectionId}/area?${query.toString()}`,
        );
        const body = (await response.json()) as unknown;
        if (!response.ok) {
          refusals.push(
            `${requestedDepthM} m: ${(body as { refused?: string }).refused ?? `answered ${response.status}`}`,
          );
          continue;
        }
        const verdict = validator.validate('coveragejson', body);
        if (!verdict.ok) {
          refusals.push(`${requestedDepthM} m: refused by its master — ${verdict.refusals[0]}`);
          continue;
        }
        const coverage = body as GridCoverage;
        levels.push({ requestedDepthM, servedDepthM: coverage.domain.axes.z.values[0], coverage });
      }
      if (abandoned) return;
      const first = levels[0]?.coverage;
      setVolume({
        levels,
        frame: cubeFrame({
          west: grid.longitude.minimum,
          east: grid.longitude.maximum,
          south: grid.latitude.minimum,
          north: grid.latitude.maximum,
          deepest: Math.max(...levels.map((level) => level.servedDepthM), grid.depth.maximum),
        }),
        refusal: refusals.length > 0 ? refusals.join('; ') : undefined,
        servedFrom: first
          ? `${collectionId} at ${displayInstant(first.domain.axes.t.values[0])} · ${levels.length} level(s), one area query each`
          : undefined,
      });
    })();
    return () => {
      abandoned = true;
    };
    // As with the plan view's field, a newly published run replaces the holding.
  }, [
    collectionId,
    config.endpoints.edr,
    config.endpoints.holdings,
    domainRing === undefined,
    latestRun,
    parameter,
    projection,
    validator,
  ]);

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

  // Picking (issue #53): with the composer open, a click on the canvas places the
  // query's position. deck.gl unprojects the clicked pixel, so the globe and the
  // plan view pick alike; a click that misses the sphere unprojects to nothing and
  // is left alone, as is a click on a route stop, which asks a different question.
  const placeFromCanvas = useCallback(
    (info: PickingInfo) => {
      if (!composing || info.layer?.id === 'route-stops') return;
      if (projection === 'cube') {
        // The cube's canvas is the frame's own cartesian space, so the click comes
        // back in units rather than degrees; the frame's inverse carries it out
        // again, and the level clicked places the depth as well (issue #59).
        const frame = volumeRef.current;
        const coordinate = info.coordinate;
        if (!frame || !coordinate || coordinate.length < 2) return;
        const { longitude, latitude } = frame.toGeographic(coordinate[0], coordinate[1]);
        if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(latitude) > 90) return;
        setChoices((previous) => ({
          ...previous,
          longitude,
          latitude,
          depthM: coordinate.length > 2 ? Math.round(frame.depthAt(coordinate[2])) : previous.depthM,
        }));
        return;
      }
      const picked = pickedPosition(info.coordinate);
      if (picked) setChoices((previous) => ({ ...previous, ...picked }));
    },
    [composing, projection],
  );

  const positionNote =
    choices.longitude === undefined || choices.latitude === undefined
      ? undefined
      : `position ${choices.longitude}, ${choices.latitude}` +
        (domainRing === undefined
          ? ''
          : insideRing(domainRing, choices.longitude, choices.latitude)
            ? ' — inside the domain'
            : ' — outside the domain: the server will decline, and will say why');

  // The cube's layers live in the frame's own cartesian space and cannot be mixed
  // with the geographic ones, so the view draws one set or the other.
  const cubeCells = volume.levels.map((level) => ({ level, grid: gridCells(level.coverage, parameter) }));
  const cubeValues = cubeCells.flatMap(({ grid }) => (grid ? [grid.minimum, grid.maximum] : []));
  const cubeMinimum = Math.min(...cubeValues);
  const cubeMaximum = Math.max(...cubeValues);
  const frame = volume.frame;

  const cubeLayers = frame
    ? [
        // One layer per level, coloured against the whole volume's range rather than
        // each level's own, so a warm slice and a cold one are comparable by eye.
        ...cubeCells.map(({ level, grid }) =>
          grid
            ? new SolidPolygonLayer({
                id: `cube-level-${level.requestedDepthM}`,
                data: grid.cells,
                coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
                getPolygon: (cell) => {
                  const [west, south, east, north] = cell.bounds;
                  return [
                    frame.toCartesian(west, south, level.servedDepthM),
                    frame.toCartesian(east, south, level.servedDepthM),
                    frame.toCartesian(east, north, level.servedDepthM),
                    frame.toCartesian(west, north, level.servedDepthM),
                  ];
                },
                getFillColor: (cell) => {
                  const [red, green, blue] = rampColour(cell.value, cubeMinimum, cubeMaximum);
                  return [red, green, blue, 190] as [number, number, number, number];
                },
                pickable: true,
              })
            : undefined,
        ),
        new PathLayer({
          id: 'cube-frame',
          data: volumeEdges(frame),
          coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
          getPath: (path) => path,
          getColor: [90, 95, 105, 200],
          getWidth: 1,
          widthUnits: 'pixels',
        }),
        // The route is four-dimensional in the documents; in the cube the fourth
        // dimension is drawn rather than selected — each vertex at its stated depth.
        plan && plan.route.vertices.length > 0
          ? new PathLayer({
              id: 'cube-route',
              data: [
                [
                  frame.toCartesian(plan.platform.longitude, plan.platform.latitude, plan.platform.depth_m),
                  ...plan.route.vertices.map((vertex) =>
                    frame.toCartesian(vertex.longitude, vertex.latitude, vertex.depth_m),
                  ),
                ],
              ],
              coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
              getPath: (path) => path,
              getColor: [255, 255, 255, 230],
              getWidth: 3,
              widthUnits: 'pixels',
            })
          : undefined,
        platform
          ? new ScatterplotLayer({
              id: 'cube-platform',
              data: [frame.toCartesian(platform.longitude, platform.latitude, platform.depthM)],
              coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
              getPosition: (position) => position,
              getRadius: 9,
              radiusUnits: 'pixels',
              billboard: true,
              getFillColor: [255, 220, 0, 255],
              getLineColor: [0, 0, 0, 255],
              getLineWidth: 2,
              lineWidthUnits: 'pixels',
              stroked: true,
            })
          : undefined,
        composing && choices.longitude !== undefined && choices.latitude !== undefined
          ? new ScatterplotLayer({
              id: 'cube-pick-position',
              data: [frame.toCartesian(choices.longitude, choices.latitude, choices.depthM ?? 0)],
              coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
              getPosition: (position) => position,
              getRadius: 9,
              radiusUnits: 'pixels',
              billboard: true,
              filled: false,
              stroked: true,
              getLineColor: [20, 60, 140, 255],
              getLineWidth: 2,
              lineWidthUnits: 'pixels',
            })
          : undefined,
      ].filter((layer) => layer !== undefined)
    : [];

  const geographicLayers = [
    // The sphere itself, globe mode only: a world-covering rectangle (it wraps)
    // and a generated graticule — the page's one sphere reference, no tiles.
    projection === 'globe' &&
      new SolidPolygonLayer({
        id: 'sphere',
        data: [
          [
            [-180, -90],
            [180, -90],
            [180, 90],
            [-180, 90],
          ] as [number, number][],
        ],
        getPolygon: (ring) => ring,
        getFillColor: [206, 210, 216, 255],
      }),
    projection === 'globe' &&
      new PathLayer({
        id: 'graticule',
        data: graticule(15),
        getPath: (path) => path,
        getColor: [150, 155, 165, 160],
        getWidth: 1,
        widthUnits: 'pixels',
      }),
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
    // What the composed URL asks for, drawn: the position as a hollow ring — no
    // filled dot, so it cannot be read as the platform or a route stop — and, for an
    // area query, the very ring `composeUrl` writes into the WKT.
    composing &&
      choices.longitude !== undefined &&
      choices.latitude !== undefined && [
        ...(choices.queryType === 'area'
          ? [
              new PathLayer({
                id: 'pick-area',
                data: [areaRing(choices.longitude, choices.latitude)],
                getPath: (ring) => ring,
                getColor: [20, 60, 140, 230],
                getWidth: 2,
                widthUnits: 'pixels',
              }),
            ]
          : []),
        new ScatterplotLayer({
          id: 'pick-position',
          data: [[choices.longitude, choices.latitude] as [number, number]],
          getPosition: (position) => position,
          getRadius: 9,
          radiusUnits: 'pixels',
          filled: false,
          stroked: true,
          getLineColor: [20, 60, 140, 255],
          getLineWidth: 2,
          lineWidthUnits: 'pixels',
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

  const layers = projection === 'cube' ? cubeLayers : geographicLayers;

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
          <select
            value={depthM}
            disabled={projection === 'cube'}
            title={projection === 'cube' ? 'the cube draws every level of the holding’s depth axis' : undefined}
            onChange={(event) => setDepthM(Number(event.target.value))}
          >
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
        <label>
          view{' '}
          <select
            value={projection}
            onChange={(event) => setProjection(event.target.value as 'globe' | 'flat' | 'cube')}
          >
            <option value="globe">globe (drag to rotate)</option>
            <option value="flat">flat</option>
            <option value="cube">depth cube (drag to rotate)</option>
          </select>
        </label>
        <button onClick={() => setComposing((previous) => !previous)}>
          {composing ? 'close the composer' : 'EDR composer'}
        </button>
      </div>
      <p className="map-status">
        {displayedSimTime ? `displayed instant ${displayInstant(displayedSimTime)}` : 'no clock sample yet'}
        {projection === 'cube'
          ? volume.servedFrom
            ? ` · volume: ${volume.servedFrom}; the depth axis is exaggerated`
            : ' · volume: querying each level…'
          : field.servedFrom
            ? ` · field: ${field.servedFrom}`
            : ''}
        {projection === 'cube'
          ? volume.refusal
            ? ` · level(s) declined: ${volume.refusal}`
            : ''
          : field.refusal
            ? ` · field declined: ${field.refusal}`
            : ''}
        {plan ? ` · plan ${plan.plan_id} (${plan.route.vertices.length} stop(s))` : ' · no plan published yet'}
        {` · ${validAdvisories.length} of ${advisories.length} advisory(ies) valid at the displayed instant`}
        {composing ? ' · click the canvas to place the composed query' : ''}
      </p>
      {arrival && <p className="map-arrival">{arrival}</p>}
      <div className="map-body">
        <div className="map-canvas" ref={canvasHost}>
          {canDraw && hostInDocument ? (
            <DeckGL
              key={projection}
              views={
                projection === 'globe'
                  ? new GlobeView()
                  : projection === 'cube'
                    ? new OrbitView({ orbitAxis: 'Z' })
                    : new MapView()
              }
              initialViewState={
                projection === 'globe'
                  ? { longitude: -11, latitude: 46, zoom: 3.2 }
                  : projection === 'cube'
                    ? { target: [0, 0, -25], zoom: 1.1, rotationX: 35, rotationOrbit: 25 }
                    : { longitude: -11, latitude: 46, zoom: 5.2 }
              }
              controller
              layers={layers}
              onClick={placeFromCanvas}
              getCursor={({ isDragging }) =>
                isDragging ? 'grabbing' : composing ? 'crosshair' : 'grab'
              }
            >
              {null}
            </DeckGL>
          ) : canDraw ? null : (
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
          <ComposerPane
            config={config}
            validator={validator}
            latestForecast={latestRun?.collections.forecast}
            choices={choices}
            onChoices={(patch) => setChoices((previous) => ({ ...previous, ...patch }))}
            positionNote={positionNote}
          />
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
