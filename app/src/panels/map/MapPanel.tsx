/**
 * The Map tab (FR-40): the arc's closing scene. Deck.gl over the domain — the
 * field from a genuine EDR area query, the projection's doubt decaying and
 * refreshing from each published plan, the committed route as a four-dimensional
 * curve with a time control, and advisories drawn only while valid at the
 * displayed instant yet queryable always. With the composer open the canvas also
 * takes the query's position by click, in any projection, and draws exactly what the
 * composed URL asks for (issue #53) — and says so where the gesture is, over the
 * canvas, because the click was built and went unfound: a crosshair cursor is
 * discovered by hovering something the viewer had no reason to hover. The cube projection (issue #59) rotates the
 * depth volume: one area query per level of the holding's own depth axis, stacked,
 * with the route running through it at the depths the plan states. Every pixel traces to a document that
 * crossed the seam; where WebGL is unavailable the canvas says so and the
 * documents remain (Constitution VII: the display can light nothing itself).
 *
 * Narrow (feature 112, FR-010 to FR-012, FR-017): the canvas is the primary surface —
 * the tab is the arc's closing scene, and a map is what it is for — so the control row
 * and the advisories table each disclose under a label that names them, and the composer
 * keeps its own toggle — outside those disclosures, against the canvas it arms — but
 * takes the full width beneath the canvas instead of 22rem beside it. The status line stays visible at both widths: it is what makes every
 * pixel traceable to a document, and a map whose provenance is folded away is a picture.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import DeckGL from '@deck.gl/react';
import {
  COORDINATE_SYSTEM,
  MapView,
  OrbitView,
  _GlobeView as GlobeView,
  type PickingInfo,
} from '@deck.gl/core';
import { PathLayer, PolygonLayer, ScatterplotLayer, SolidPolygonLayer } from '@deck.gl/layers';
import type { PanelProps } from '../../shell/registry.js';
import type {
  Advisory,
  AnalysisPublished,
  CoverageHolding,
  HoldingsInventory,
  FeaturesResponseFeature,
  FeaturesResponseFeatureCollection,
  Plan,
  PlatformState,
  RunPublished,
} from '../../generated/types.js';
import {
  demandRay,
  graticule,
  gridCells,
  ownshipTrack,
  insideRing,
  manifestInstants,
  nearestInstant,
  projectionCells,
  PROVENANCE_INK,
  provenanceCells,
  rampColour,
  routePositionAt,
  validAt,
  type AdvisoryFeature,
  type GridCoverage,
  type ServedObservation,
  type TrackPoint,
} from './map-data.js';
import { whenInDocument } from './attach.js';
import { areaRing, pickPrompt, pickedPosition, type ComposerChoices } from './composer.js';
import { axisValues, cubeFrame, ownshipInCube, volumeEdges, type CubeFrame } from './cube.js';
import { HelpButton } from '../../shell/walkthrough/HelpButton.js';
import { mapTour } from '../../shell/walkthrough/tour.js';
import { ComposerPane } from './ComposerPane.js';
import { displayInstant } from '../../shell/display.js';
import { Disclosure } from '../../shell/Disclosure.js';
import { useIsNarrow } from '../../shell/viewport.js';
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

/** The uncertainty instance as a gridded layer, when it is what is drawn (#60). */
interface SpreadState {
  coverage?: GridCoverage;
  /** Which range of the spread coverage answers for the chosen parameter. */
  parameterKey?: string;
  refusal?: string;
  servedFrom?: string;
}

/**
 * The provenance holding as a gridded layer (feature 116): each cell tinted by which
 * of the four shares owns most of it. One area query answers for all four, because
 * they are four parameters of one coverage.
 */
interface ProvenanceState {
  coverage?: GridCoverage;
  /** The four share parameters, in the order the analyst stores them. */
  parameterKeys?: readonly string[];
  refusal?: string;
  servedFrom?: string;
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

export function MapPanel({ params }: PanelProps) {
  const { config, client, validator } = params;
  const rootRef = useRef<HTMLDivElement>(null);
  const narrow = useIsNarrow(rootRef);
  const [simTime, setSimTime] = useState('');
  const [plan, setPlan] = useState<Plan | undefined>();
  const [latestRun, setLatestRun] = useState<RunPublished | undefined>();
  const [latestAnalysis, setLatestAnalysis] = useState<AnalysisPublished | undefined>();
  const [advisories, setAdvisories] = useState<readonly AdvisoryFeature[]>([]);
  /**
   * The ownship track, and whether the query has answered yet (FR-55). Held as two
   * facts rather than one, because an empty array before the first answer and an empty
   * array after an empty answer are different things to say.
   */
  const [track, setTrack] = useState<{ points: TrackPoint[]; answered: boolean }>({
    points: [],
    answered: false,
  });
  const [platformState, setPlatformState] = useState<PlatformState | undefined>();
  const [reference, setReference] = useState<readonly FeaturesResponseFeature[]>([]);
  const [field, setField] = useState<FieldState>({});
  /** The store's inventory: each holding's manifest states its own axes. */
  const [inventory, setInventory] = useState<readonly CoverageHolding[]>([]);
  /** Which doubt is drawn: the plan's projection cells, the run's spread, neither. */
  const [doubt, setDoubt] = useState<'projection' | 'spread' | 'provenance' | 'none'>('projection');
  const [spread, setSpread] = useState<SpreadState>({});
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
      client.subscribe(config.topics.analysis_published, (message) =>
        setLatestAnalysis(message.payload as AnalysisPublished),
      ),
      client.subscribe(config.topics.platform_state, (message) =>
        setPlatformState(message.payload as PlatformState),
      ),
    ];
    return () => stops.forEach((stop) => stop());
  }, [
    client,
    config.topics.clock,
    config.topics.plan,
    config.topics.platform_state,
    config.topics.run_published,
  ]);

  // The track is a genuine SensorThings read through the seam — the same read any
  // client would make, which is what makes it a query rather than a wire from the
  // platform to the canvas. Refetched when the platform reports; never polled.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `${config.endpoints.sensorthings}/Datastreams('ownship/ownship-course')/Observations?%24top=500`,
        );
        if (!response.ok) return;
        const body = (await response.json()) as { value?: ServedObservation[] };
        if (!cancelled) setTrack({ points: ownshipTrack(body.value ?? []), answered: true });
      } catch {
        // A read that did not complete is not an empty track: the panel goes on saying
        // it has not been answered, rather than drawing nothing and implying nothing
        // is there. Constitution VII, in its second direction.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.endpoints.sensorthings, platformState?.tick]);

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

  const collectionId = source === 'forecast' ? latestRun?.collections.forecast : 'nowcast';

  // The store's inventory, through the seam: each holding's ground-truth manifest
  // states the depth axis the cube stacks (#59) and the time axis its own field
  // advances on (#60) — and the forecast's spread keeps a different axis from the
  // now-cast's, which is why the inventory is held whole rather than one holding.
  // One GET, refreshed when the store announces; nothing polls.
  const refreshInventory = useCallback(async () => {
    const response = await fetch(config.endpoints.holdings);
    const body = (await response.json()) as unknown;
    if (!response.ok || !validator.validate('holdings-inventory', body).ok) {
      setInventory([]);
      return;
    }
    setInventory((body as HoldingsInventory).holdings);
  }, [config.endpoints.holdings, validator]);

  useEffect(() => {
    void refreshInventory();
    return client.subscribe(config.topics.holdings, () => void refreshInventory());
  }, [client, config.topics.holdings, refreshInventory]);

  const holdingFor = useCallback(
    (id: string | undefined) =>
      id === undefined
        ? undefined
        : inventory.find((candidate) => candidate.era === id || candidate.holding_id === id),
    [inventory],
  );
  const holding = holdingFor(collectionId);
  const displayedSimTime = useMemo(() => {
    if (!simTime) return '';
    if (timeOffset === 0) return simTime;
    const millis = Date.parse(simTime.slice(0, 23) + 'Z') + timeOffset * 1000;
    return `${new Date(millis).toISOString().slice(0, 23)}000Z`;
  }, [simTime, timeOffset]);

  // The field, scrubbed (#60): the displayed instant moves continuously, but the
  // holding stores steps, so the field is asked for the step the displayed instant
  // falls on. No cache — a client-side copy of the holding would be a second store,
  // and one that goes stale the moment the holding is replaced — and no timer: the
  // refetch is thrown by the *snapped* instant changing, which happens at the
  // holding's own step and no faster. What throttles the scrubber is therefore a
  // number in the manifest, not one typed into the shell.
  const fieldInstants = useMemo(
    () => (holding ? manifestInstants(holding.manifest.grid.time) : []),
    [holding],
  );
  const snapped = nearestInstant(fieldInstants, displayedSimTime);

  useEffect(() => {
    // The cube asks for every level itself; one more query for a slice nobody is
    // looking at would be a round trip spent on nothing.
    if (!domainRing || !collectionId || projection === 'cube') return;
    void (async () => {
      const wkt = `POLYGON((${domainRing.map(([lon, lat]) => `${lon} ${lat}`).join(', ')}))`;
      const query = new URLSearchParams({ coords: wkt, z: String(depthM), 'parameter-name': parameter });
      if (snapped) query.set('datetime', snapped.instant);
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
    snapped?.instant,
    validator,
    latestRun,
  ]);

  // Doubt as a gridded field (#60): the run publishes its ensemble spread as its own
  // instance, servable through the very same area query, so this is one more genuine
  // query rather than a second computation of doubt. It *replaces* the projection
  // cells rather than joining them — two doubt layers at once read as one wrong one —
  // and it is the run's doubt about the field, where the cells are the planner's
  // doubt about the plan. The parameter is chosen from what the coverage answers
  // with, because the spread's variables carry the producer's own names.
  const spreadCollection = latestRun?.collections.uncertainty;
  const spreadHolding = holdingFor(spreadCollection);
  const spreadSnapped = nearestInstant(
    spreadHolding ? manifestInstants(spreadHolding.manifest.grid.time) : [],
    displayedSimTime,
  );
  /**
   * The provenance holding, when the tint is what is drawn (feature 116). Four share
   * parameters of one coverage, so one area query answers for all of them — asking
   * four times would be four chances for the answers to disagree about an instant.
   *
   * Its time axis carries a single step, because an analysis is a correction at one
   * instant rather than a series; there is therefore nothing to snap a datetime to,
   * and asking for one would be asking the holding about a time it does not claim.
   */
  const provenanceCollection = latestAnalysis?.collections.provenance;
  const [provenance, setProvenance] = useState<ProvenanceState>({});
  useEffect(() => {
    if (doubt !== 'provenance' || !domainRing || !provenanceCollection || projection === 'cube') return;
    let abandoned = false;
    void (async () => {
      const wkt = `POLYGON((${domainRing.map(([lon, lat]) => `${lon} ${lat}`).join(', ')}))`;
      const query = new URLSearchParams({ coords: wkt, z: String(depthM) });
      const response = await fetch(
        `${config.endpoints.edr}/collections/${provenanceCollection}/area?${query.toString()}`,
      );
      const body = (await response.json()) as unknown;
      if (abandoned) return;
      if (!response.ok) {
        setProvenance({ refusal: `the provenance query was refused: ${response.status}` });
        return;
      }
      const verdict = validator.validate('coveragejson', body);
      if (!verdict.ok) {
        setProvenance({ refusal: `the provenance coverage was refused by its master: ${verdict.refusals[0]}` });
        return;
      }
      const coverage = body as GridCoverage;
      // The share parameters are read from what the coverage actually served, in the
      // order it serves them, rather than from a list of names written down here: the
      // analyst names its own shares in its configuration, and a second list would be
      // free to drift from it.
      const keys = Object.keys(coverage.ranges).filter((key) => key.startsWith('temperature_share_'));
      setProvenance({
        coverage,
        parameterKeys: keys,
        servedFrom: `${provenanceCollection}, ${coverage.domain.axes.z.values[0]} m`,
      });
    })();
    return () => {
      abandoned = true;
    };
  }, [config.endpoints.edr, depthM, domainRing, doubt, projection, provenanceCollection, validator]);

  useEffect(() => {
    if (doubt !== 'spread' || !domainRing || !spreadCollection || projection === 'cube') return;
    let abandoned = false;
    void (async () => {
      const wkt = `POLYGON((${domainRing.map(([lon, lat]) => `${lon} ${lat}`).join(', ')}))`;
      const query = new URLSearchParams({ coords: wkt, z: String(depthM) });
      // The run's spread keeps its own time axis, which starts when the run did and
      // ends at its horizon: snapping it to the *field's* step would ask a forecast
      // about an instant it does not cover, and be refused for asking.
      if (spreadSnapped) query.set('datetime', spreadSnapped.instant);
      const response = await fetch(
        `${config.endpoints.edr}/collections/${spreadCollection}/area?${query.toString()}`,
      );
      const body = (await response.json()) as unknown;
      if (abandoned) return;
      if (!response.ok) {
        setSpread({
          refusal: (body as { refused?: string }).refused ?? `the spread query answered ${response.status}`,
        });
        return;
      }
      const verdict = validator.validate('coveragejson', body);
      if (!verdict.ok) {
        setSpread({ refusal: `the spread coverage was refused by its master: ${verdict.refusals[0]}` });
        return;
      }
      const coverage = body as GridCoverage;
      const parameterKey = Object.keys(coverage.ranges).find((name) => name.startsWith(parameter));
      setSpread({
        coverage,
        parameterKey,
        refusal: parameterKey
          ? undefined
          : `the spread instance answers for ${Object.keys(coverage.ranges).join(', ')}, none of which is ${parameter}`,
        servedFrom: `${spreadCollection} at ${displayInstant(coverage.domain.axes.t.values[0])}, ${coverage.domain.axes.z.values[0]} m`,
      });
    })();
    return () => {
      abandoned = true;
    };
  }, [
    config.endpoints.edr,
    depthM,
    domainRing === undefined,
    doubt,
    parameter,
    projection,
    spreadCollection,
    spreadSnapped?.instant,
    validator,
  ]);

  // The cube (issue #59): the levels are the holding's own depth axis, read from the
  // ground-truth manifest the coverage store publishes, and each level is a genuine
  // EDR area query — the same query the plan view issues, asked once per level. EDR's
  // own `cube` query type stays refused by this subset (the composer will say so);
  // this is the client stacking what the served subset does answer.
  useEffect(() => {
    if (projection !== 'cube' || !domainRing || !collectionId) return;
    if (!holding) {
      setVolume({
        levels: [],
        refusal: `the inventory names no holding for collection '${collectionId}', so the depth axis is unknown`,
      });
      return;
    }
    let abandoned = false;
    void (async () => {
      const grid = holding.manifest.grid;
      const wkt = `POLYGON((${domainRing.map(([lon, lat]) => `${lon} ${lat}`).join(', ')}))`;
      const levels: VolumeLevel[] = [];
      const refusals: string[] = [];
      for (const requestedDepthM of axisValues(grid.depth)) {
        // Checked per level, not once after the loop. The cleanup below sets the flag,
        // but a loop already in flight kept issuing the remaining queries regardless —
        // one await per depth level, each outliving the effect that started it. In the
        // panel that is a burst of queries whose answers are discarded; under test it is
        // worse, because the shim `panels.test.tsx` installs comes off when the test
        // ends and the next iteration hands a relative URL to the real fetch, which
        // cannot parse one ("Failed to parse URL from /api/edr/…").
        if (abandoned) return;
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
    domainRing === undefined,
    holding,
    parameter,
    projection,
    validator,
  ]);

  const grid = field.coverage ? gridCells(field.coverage, parameter) : undefined;
  const validAdvisories = advisories.filter((feature) => validAt(feature.properties, displayedSimTime));
  const platform = plan ? routePositionAt(plan, displayedSimTime) : undefined;
  // The ownship track is where the platform SAID it was, drawn point to point and
  // never interpolated. The route above is what the planner recommends, drawn as a
  // curve — reading one as the other would be reading a recommendation as a record.
  const trackRing: [number, number][] = track.points.map((point) => [point.longitude, point.latitude]);
  const ray =
    platformState && platformState.demanded
      ? demandRay(
          platformState.current,
          platformState.demanded.course_degrees,
          platformState.demanded.speed_m_per_s,
          // One hour of the demanded speed, so the ray's length means something the
          // status line can state rather than being a pleasing number of pixels.
          3600,
        )
      : undefined;
  const doubtCells = doubt === 'projection' && plan ? projectionCells(plan, 0) : [];
  const spreadGrid =
    doubt === 'spread' && spread.coverage && spread.parameterKey
      ? gridCells(spread.coverage, spread.parameterKey)
      : undefined;
  const provenanceGrid =
    doubt === 'provenance' && provenance.coverage && provenance.parameterKeys
      ? provenanceCells(provenance.coverage, provenance.parameterKeys)
      : undefined;

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

  // The platform in the volume (FR-69), in the frame's own cartesian space. Computed by a
  // pure function so that the claim SC-07 makes — the track is at the depths the platform
  // reported, not at the surface — is one a test can assert without a WebGL context.
  const ownshipVolume = frame
    ? ownshipInCube(frame, track.points, ray, platformState?.current.depth_m)
    : { track: [], demand: undefined };

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
        // The platform, in the volume (feature 116, FR-74). The plan view and the globe
        // have drawn the track and the demanded course since 113; the cube drew neither,
        // because `cubeLayers` and `geographicLayers` are selected whole and the ownship
        // layers lived only in the second. That absence was not a decision — it was where
        // the seam between the two coordinate systems fell.
        //
        // The track is drawn at the depths the platform *reported*, against the levels
        // the volume already draws. Ownship depth is a reported measurement (FR-54), and
        // a track flattened to the surface in a display whose subject is depth would be
        // the panel discarding the one dimension that view exists for.
        ownshipVolume.track.length > 1
          ? new PathLayer({
              id: 'cube-ownship-track',
              data: [ownshipVolume.track],
              coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
              getPath: (path) => path,
              getColor: [99, 190, 222, 220],
              getWidth: 2,
              widthUnits: 'pixels',
            })
          : undefined,
        ownshipVolume.track.length > 0
          ? new ScatterplotLayer({
              id: 'cube-ownship-reports',
              data: ownshipVolume.track,
              coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
              getPosition: (position) => position,
              getFillColor: [99, 190, 222, 200],
              getRadius: 3,
              radiusUnits: 'pixels',
              billboard: true,
            })
          : undefined,
        ownshipVolume.demand
          ? new PathLayer({
              id: 'cube-ownship-demand',
              data: [ownshipVolume.demand],
              coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
              getPath: (path) => path,
              getColor: [99, 190, 222, 160],
              getWidth: 1.5,
              widthUnits: 'pixels',
              getDashArray: [6, 4],
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
    spreadGrid &&
      new PolygonLayer({
        id: 'spread',
        data: spreadGrid.cells,
        getPolygon: (cell) => {
          const [west, south, east, north] = cell.bounds;
          return [
            [west, south],
            [east, south],
            [east, north],
            [west, north],
          ];
        },
        // The same white-alpha language the projection cells speak, so doubt reads
        // as doubt whichever of the two is drawn, scaled against the spread's own
        // observed range — which the status line states, since a normalised shade
        // means nothing without it.
        getFillColor: (cell) => [
          255,
          255,
          255,
          Math.round(
            190 *
              (spreadGrid.maximum > spreadGrid.minimum
                ? (cell.value - spreadGrid.minimum) / (spreadGrid.maximum - spreadGrid.minimum)
                : 0),
          ),
        ],
        stroked: false,
        pickable: false,
      }),
    provenanceGrid &&
      new PolygonLayer({
        id: 'provenance',
        data: provenanceGrid.cells,
        getPolygon: (cell) => {
          const [west, south, east, north] = cell.bounds;
          return [
            [west, south],
            [east, south],
            [east, north],
            [west, north],
          ];
        },
        // Tinted by which share owns the cell, with opacity carrying how decisively.
        // A share past one is drawn at full opacity rather than scaled beyond it: the
        // overshoot is stated in the status line, where it can be explained.
        getFillColor: (cell) => {
          const ink = PROVENANCE_INK[cell.dominant].colour;
          return [ink[0], ink[1], ink[2], Math.round(60 + 150 * Math.min(Math.max(cell.fraction, 0), 1))];
        },
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
    // Where the platform has been: circles at reported positions, joined point to
    // point, deliberately unlike the planner's interpolated route.
    trackRing.length > 1 &&
      new PathLayer({
        id: 'ownship-track',
        data: [trackRing],
        getPath: (path) => path,
        getColor: [99, 190, 222, 220],
        getWidth: 2,
        widthUnits: 'pixels',
      }),
    trackRing.length > 0 &&
      new ScatterplotLayer({
        id: 'ownship-reports',
        data: trackRing,
        getPosition: (point: [number, number]) => point,
        getFillColor: [99, 190, 222, 200],
        getRadius: 3,
        radiusUnits: 'pixels',
      }),
    ray &&
      new PathLayer({
        id: 'ownship-demand',
        data: [ray],
        getPath: (path) => path,
        getColor: [99, 190, 222, 160],
        getWidth: 1.5,
        widthUnits: 'pixels',
        getDashArray: [6, 4],
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
  /**
   * The layer ids actually handed to deck.gl, published on the panel's own root (feature
   * 114, FR-70). It is not decoration: it is what holds the layer registry honest, and
   * what lets the capture proof read which layers a projection drew without a WebGL
   * context to interrogate. Derived from the same array deck.gl is given, so the two
   * cannot drift.
   */
  const drawnLayerIds = layers.flatMap((layer) => {
    // `geographicLayers` carries falsy placeholders where a layer is not drawn, and one
    // entry is an array of two; both are flattened here rather than upstream, because the
    // shape deck.gl accepts is the shape that array is for.
    const flat: unknown[] = Array.isArray(layer) ? layer : [layer];
    return flat.flatMap((entry) =>
      entry && typeof entry === 'object' && 'id' in entry ? [String((entry as { id: unknown }).id)] : [],
    );
  });

  const horizonSpan = plan?.horizon.span_seconds ?? 21600;

  return (
    <div
      className="panel map-panel"
      ref={rootRef}
      data-narrow={narrow}
      data-projection={projection}
      data-map-layers={drawnLayerIds.join(' ')}
    >
      {/* The panel carries its own help control (FR-70, ADR-0037). */}
      <div className="panel-head">
        <span className="panel-head-title">the field, the doubt over it, and the route through it</span>
        <HelpButton tour={mapTour()} />
      </div>
      <Disclosure label="view controls" narrow={narrow} className="map-controls-disclosure">
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
        <label className="map-time" data-testid="time-control">
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
          doubt{' '}
          <select
            value={doubt}
            data-testid="doubt-select"
            disabled={projection === 'cube'}
            onChange={(event) =>
              setDoubt(event.target.value as 'projection' | 'spread' | 'provenance' | 'none')
            }
          >
            <option value="projection">the plan's projection cells</option>
            <option value="spread" disabled={!spreadCollection}>
              the run's spread{spreadCollection ? '' : ' (no run published yet)'}
            </option>
            {/* Kept no longer than the option above it: the select takes its width from
                its widest option, and at a phone's width the control row has none to
                spare — a longer label here put the whole row two pixels over. */}
            <option value="provenance" disabled={!provenanceCollection}>
              where it came from{provenanceCollection ? '' : ' (none published yet)'}
            </option>
            <option value="none">none</option>
          </select>
        </label>
        <label>
          view{' '}
          <select
            value={projection}
            data-testid="projection-select"
            onChange={(event) => setProjection(event.target.value as 'globe' | 'flat' | 'cube')}
          >
            <option value="globe">globe (drag to rotate)</option>
            <option value="flat">flat</option>
            <option value="cube">depth cube (drag to rotate)</option>
          </select>
        </label>
      </div>
      </Disclosure>
      <p className="map-status" data-testid="ownship-status">
        {/* The track says what it is, and what it is not. An empty answer is a
            statement, never a stub or the configured loiter drawn from nowhere. */}
        {track.answered
          ? track.points.length > 0
            ? `ownship track: ${track.points.length} reported position(s), drawn point to point`
            : 'no ownship observations have been served: nothing is drawn for the track'
          : 'ownship track: not asked for yet'}
        {ray ? ` · demanded course drawn as one hour at the demanded speed` : ''}
        {/* Parity, said (FR-69). The track and the demand are in every projection, and in
            the volume the track is at the depths the platform reported — a track flattened
            to the surface in a display whose subject is depth would discard the one
            dimension that view exists for. */}
        {projection === 'cube' && track.points.length > 0
          ? ' · in the volume the track is drawn at the depths the platform reported, not at the surface'
          : ''}
        {' · '}
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
        {projection !== 'cube' && snapped?.beyond
          ? ` · the displayed instant is ${snapped.beyond === 'after' ? 'past the end of' : 'before the start of'} this holding's time axis, so the field shows its ${snapped.beyond === 'after' ? 'last' : 'first'} step`
          : ''}
        {projection !== 'cube' && doubt === 'spread'
          ? spread.refusal
            ? ` · spread declined: ${spread.refusal}`
            : spreadGrid
              ? ` · spread: ${spread.servedFrom}, ${spreadGrid.minimum.toFixed(3)} to ${spreadGrid.maximum.toFixed(3)} across the shade` +
                (spreadSnapped?.beyond
                  ? `; the displayed instant is ${spreadSnapped.beyond === 'after' ? 'past the end of' : 'before the start of'} this run's horizon, so its ${spreadSnapped.beyond === 'after' ? 'last' : 'first'} step is shown`
                  : '')
              : ' · spread: querying…'
          : ''}
        {doubt === 'provenance'
          ? provenance.refusal
            ? ` · provenance declined: ${provenance.refusal}`
            : provenanceGrid
              ? ` · provenance: ${provenance.servedFrom}, each cell tinted by the share that owns most of it` +
                (provenanceGrid.overshooting > 0
                  ? `; ${provenanceGrid.overshooting} cell(s) hold a share past 100%, where the analysis extrapolated past the reading rather than averaging toward it`
                  : '')
              : ' · provenance: querying…'
          : ''}
        {plan ? ` · plan ${plan.plan_id} (${plan.route.vertices.length} stop(s))` : ' · no plan published yet'}
        {` · ${validAdvisories.length} of ${advisories.length} advisory(ies) valid at the displayed instant`}
      </p>
      {doubt === 'provenance' && provenanceGrid ? (
        <ul className="map-legend" aria-label="what the provenance tint means">
          {PROVENANCE_INK.map((entry, index) => (
            <li key={entry.label}>
              <span
                className="map-legend-swatch"
                style={{ background: `rgb(${entry.colour[0]}, ${entry.colour[1]}, ${entry.colour[2]})` }}
              />
              {entry.label}
              {` (${provenanceGrid.cells.filter((cell) => cell.dominant === index).length} cell(s))`}
            </li>
          ))}
        </ul>
      ) : null}
      {arrival && <p className="map-arrival">{arrival}</p>}
      {/* The composer's toggle is the map's own control and not one of the view
          controls: inside that disclosure it was behind a summary named for something
          else at a narrow width, which is where 112's plan already put it — "the
          composer keeps its own toggle". It sits against the canvas because that is
          what opening it arms. */}
      <div className="map-compose">
        <button
          className="map-compose-toggle"
          data-testid="composer-toggle"
          aria-expanded={composing}
          onClick={() => setComposing((previous) => !previous)}
        >
          {composing ? 'close the composer' : 'compose an EDR query'}
        </button>
        {!composing && (
          <span className="map-compose-hint">
            build a genuine OGC API-EDR request against the served collections
            {canDraw ? ', placing its position by clicking the map' : ''}
          </span>
        )}
      </div>
      <div className="map-body">
        <div className="map-canvas" ref={canvasHost} data-picking={composing && canDraw}>
          {/* The instruction sits where the gesture is, not at the tail of the status
              line. It is inert to the pointer, so it can never swallow the click it
              asks for. */}
          {composing && canDraw && (
            <p className="map-pick-prompt" data-testid="map-pick-prompt">
              {pickPrompt(projection, positionNote)}
            </p>
          )}
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
            canPick={canDraw}
          />
        )}
      </div>
      <Disclosure label="advisories" narrow={narrow} className="map-advisories-disclosure">
      <div className="map-advisories">
        {!narrow && <h4>advisories (queryable whether or not drawn)</h4>}
        {narrow && <p className="panel-footnote">queryable whether or not drawn</p>}
        {advisories.length === 0 ? (
          <p>none yet: the collection is present and stating empty.</p>
        ) : (
          <div className="table-scroll">
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
          </div>
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
      </Disclosure>
    </div>
  );
}
