/**
 * Tab 1 — **Sampling** (FR-77, FR-78): a downstream consumer that answers *where should
 * the vessel go next, and where should it drop what it cannot carry back?*
 *
 * It is not part of drogna. Everything it knows arrives through the seam: the domain and
 * the collections from the published run's own announcement, the observations from the
 * broker's observation namespace, the vessel's position and depth limit from the
 * platform's state topic, simulation time from the clock. Nothing here reads a store and
 * nothing here polls.
 *
 * The field it colours by is **observation-driven uncertainty** and is labelled that
 * everywhere it appears: a coverage proxy, not the ensemble spread drogna genuinely
 * publishes (`uncertainty.ts` carries the argument).
 *
 * **Why the route does not move on its own.** The coverage field changes with every
 * observation; a route recomputed continuously would jitter and no reader could tell a
 * new forecast from a new sample. So a plan is computed against the field *as it stood
 * when it was planned*, and stands. Local controls — resolution, budget, expendable rate
 * — replan instantly against a fresh reading (FR-74); a newly published forecast raises
 * the halo and changes nothing until the reader clicks (FR-73).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PanelProps } from '../../../shell/registry.js';
import type { Observation, Plan, PlatformState } from '../../../generated/types.js';
import { displayInstant } from '../../../shell/display.js';
import { ConsumerFrame, Provenance } from '../ConsumerFrame.js';
import { useForecastFreshness, useGhostOnRunChange } from '../freshness.js';
import { consumerStream } from '../rng.js';
import {
  depthZones,
  domainFromRun,
  vesselReach,
  zoneOfDepth,
  type DepthZone,
  type Domain,
} from '../domain.js';
import { coverDomain, hexAt, isRefusal, projector, uncertaintyColour } from '../hexes.js';
import {
  coverageAtResolution,
  recordObservation,
  uncertaintyField,
  type CoverageBin,
  type ZoneUncertainty,
} from './uncertainty.js';
import { dropsFor, planRoute, type ConsumerPlan, type PlannableCell } from './plan.js';

/** The ocean properties. The platform's own three describe the vehicle, not the water. */
const OCEAN_PROPERTIES = new Set(['temperature', 'salinity', 'pressure']);

const MAP_WIDTH = 720;
const MAP_HEIGHT = 480;

export function SamplingPanel({ params }: PanelProps) {
  const { config, client, validator, manifest } = params;
  const settings = config.consumers.sampling;
  const freshness = useForecastFreshness(client, config.topics.run_published, validator);

  const [simTime, setSimTime] = useState<string | undefined>();
  const [plan, setPlan] = useState<Plan | undefined>();
  const [platform, setPlatform] = useState<PlatformState | undefined>();
  const [resolution, setResolution] = useState(config.consumers.hexes.default_resolution);
  const [budgetHours, setBudgetHours] = useState(settings.default_time_budget_hours);
  const [intervalHours, setIntervalHours] = useState(settings.default_expendable_interval_hours);
  const [zone, setZone] = useState(0);
  const [planCount, setPlanCount] = useState(0);
  const [chosenDrop, setChosenDrop] = useState<number | undefined>();

  /**
   * The coverage, binned once at the finest resolution the configuration offers and read
   * upward by containment (`coverageAtResolution`). It lives in a ref because it changes
   * with every observation and the display's cadence is the clock's, not the sensors'.
   */
  const coverage = useRef(new Map<string, CoverageBin>());
  const heard = useRef(0);
  const [heardAtSample, setHeardAtSample] = useState(0);
  /** The domain the observations are binned against, for the subscription's closure. */
  const domainRef = useRef<Domain | undefined>(undefined);

  useEffect(() => {
    return client.subscribe(config.topics.clock, (message) => {
      const sample = message.payload as { sim_time?: string };
      if (typeof sample.sim_time !== 'string') return;
      setSimTime(sample.sim_time);
      // The field is redrawn on the clock's cadence rather than the sensors'. Observations
      // accumulate silently in between: a re-render per observation would be a re-render
      // per message, and the display would be paced by traffic rather than by time.
      setHeardAtSample(heard.current);
    });
  }, [client, config.topics.clock]);

  useEffect(() => {
    const finest = config.consumers.hexes.maximum_resolution;
    return client.subscribe(config.topics.observations, (message) => {
      const observation = message.payload as Observation;
      // The observation store's ingestion seam is the refusal authority for these
      // (FR-03); a consumer re-validating every one of them would be a second authority
      // for one fact, and a validation on the delivery path of every message besides. A
      // structural guard is what a downstream reader legitimately does.
      if (!observation || typeof observation.sim_time !== 'string' || !observation.location) return;
      if (!OCEAN_PROPERTIES.has(observation.observed_property)) return;
      const hex = hexAt(observation.location.longitude, observation.location.latitude, finest);
      // Zones are cut from the published run's column; before one is heard there is
      // nothing to bin against, and an observation binned to the wrong column would be
      // worse than one not counted.
      const domain = domainRef.current;
      if (!domain) return;
      const zones = depthZones(domain, settings.depth_zones, undefined);
      recordObservation(
        coverage.current,
        hex,
        zoneOfDepth(zones, observation.location.depth_m),
        observation.sim_time,
      );
      heard.current += 1;
    });
  }, [
    client,
    config.topics.observations,
    config.consumers.hexes.maximum_resolution,
    settings.depth_zones,
  ]);

  useEffect(() => {
    return client.subscribe(config.topics.plan, (message) => {
      const verdict = validator.validate('plan', message.payload);
      if (verdict.ok) setPlan(message.payload as Plan);
    });
  }, [client, config.topics.plan, validator]);

  useEffect(() => {
    return client.subscribe(config.topics.platform_state, (message) => {
      const verdict = validator.validate('platform-state', message.payload);
      if (verdict.ok) setPlatform(message.payload as PlatformState);
    });
  }, [client, config.topics.platform_state, validator]);

  const domain: Domain | undefined = useMemo(
    () => (freshness.accepted ? domainFromRun(freshness.accepted) : undefined),
    [freshness.accepted],
  );
  domainRef.current = domain;

  const reach = vesselReach(platform, plan);
  const zones: DepthZone[] = useMemo(
    () => (domain ? depthZones(domain, settings.depth_zones, reach.metres) : []),
    [domain, settings.depth_zones, reach.metres],
  );
  const reachableZones = zones.filter((band) => band.reachable).length;

  const cover = useMemo(
    () =>
      domain ? coverDomain(domain, resolution, config.consumers.hexes.cell_ceiling) : undefined,
    [domain, resolution, config.consumers.hexes.cell_ceiling],
  );
  const refusedResolution = cover && isRefusal(cover) ? cover.refused : undefined;
  const cells = cover && !isRefusal(cover) ? cover.cells : [];

  const field: ZoneUncertainty[] = useMemo(() => {
    if (cells.length === 0 || !simTime) return [];
    const coarse = coverageAtResolution(coverage.current, resolution);
    return uncertaintyField(
      cells.map((cell) => cell.index),
      zones.length,
      coarse,
      simTime,
      {
        saturation: settings.uncertainty.saturation,
        recencyTimescaleSeconds: settings.uncertainty.recency_timescale_seconds,
        densityHalvingCount: settings.uncertainty.density_halving_count,
      },
    );
    // heardAtSample is a dependency on purpose: it is what the clock's cadence moves.
  }, [cells, resolution, zones.length, simTime, heardAtSample, settings.uncertainty]);
  const fieldRef = useRef<ZoneUncertainty[]>([]);
  fieldRef.current = field;

  const speed = platform?.current.speed_m_per_s;
  const speedUsed = speed && speed > 0 ? speed : settings.nominal_speed_m_per_s;
  const speedFrom =
    speed && speed > 0 ? 'the platform’s reported speed' : 'the configured nominal speed';

  const start = platform
    ? { longitude: platform.current.longitude, latitude: platform.current.latitude }
    : plan
      ? { longitude: plan.platform.longitude, latitude: plan.platform.latitude }
      : undefined;

  const dropCount = dropsFor(budgetHours, intervalHours);

  const [planned, setPlanned] = useState<
    { readonly withDrops: ConsumerPlan; readonly withoutDrops: ConsumerPlan; readonly atSimTime: string } | undefined
  >();

  const draw = useMemo(
    () => consumerStream(manifest.root_seed, 'consumer', 'sampling'),
    [manifest.root_seed],
  );

  const makePlan = useCallback(() => {
    if (!start || fieldRef.current.length === 0 || !simTime) return;
    const byHex = new Map(cells.map((cell) => [cell.index, cell]));
    const plannable: PlannableCell[] = [];
    for (const entry of fieldRef.current) {
      const cell = byHex.get(entry.hex);
      if (!cell) continue;
      let reachable = 0;
      let deep = 0;
      let deepest = 0;
      let deepestValue = -1;
      for (const band of zones) {
        const value = entry.byZone[band.index] ?? 0;
        if (band.reachable) reachable += value;
        else {
          deep += value;
          if (value > deepestValue) {
            deepestValue = value;
            deepest = band.index;
          }
        }
      }
      plannable.push({
        hex: entry.hex,
        longitude: cell.longitude,
        latitude: cell.latitude,
        reachableValue: reachable,
        deepValue: deep,
        deepestZone: deepest,
      });
    }
    const request = {
      start,
      cells: plannable,
      budgetSeconds: budgetHours * 3600,
      speedMetresPerSecond: speedUsed,
      draw,
    };
    setPlanned({
      withDrops: planRoute({ ...request, dropCount }),
      // The same plan with nothing to drop: the comparison that shows depth changed the
      // route's shape rather than merely adding markers to it (FR-78).
      withoutDrops: planRoute({ ...request, dropCount: 0 }),
      atSimTime: simTime,
    });
    setChosenDrop(undefined);
  }, [start?.longitude, start?.latitude, cells, zones, budgetHours, speedUsed, dropCount, draw, simTime]);

  // Local controls replan instantly; a new forecast does not, and neither does the clock.
  useEffect(() => {
    if (planCount === 0) return;
    makePlan();
  }, [resolution, budgetHours, intervalHours, planCount, freshness.accepted?.run_id]);

  const { ghost, dismiss } = useGhostOnRunChange(planned?.withDrops, freshness.accepted?.run_id);

  const plot = useMemo(
    () => (domain ? projector(domain, MAP_WIDTH, MAP_HEIGHT) : undefined),
    [domain],
  );
  const zoneValues = field.map((entry) => entry.byZone[zone] ?? 0);
  const highest = zoneValues.length > 0 ? Math.max(...zoneValues) : 1;
  const byHexValue = new Map(field.map((entry) => [entry.hex, entry.byZone[zone] ?? 0]));

  const chosen = chosenDrop !== undefined ? planned?.withDrops.drops[chosenDrop] : undefined;

  return (
    <ConsumerFrame
      config={config}
      testId="sampling"
      summary="Adaptive sampling — where to go next, and where to drop what cannot come back"
      freshness={freshness}
      ghostRunId={ghost?.runId}
      onDismissGhost={dismiss}
    >
      <div className="consumer-controls">
        <label className="consumer-control">
          <span>hex resolution</span>
          <input
            type="range"
            min={config.consumers.hexes.minimum_resolution}
            max={config.consumers.hexes.maximum_resolution}
            value={resolution}
            onChange={(event) => setResolution(Number(event.target.value))}
          />
          <span data-testid="sampling-resolution">{resolution}</span>
        </label>
        <label className="consumer-control">
          <span>depth zone</span>
          <select value={zone} onChange={(event) => setZone(Number(event.target.value))}>
            {zones.map((band) => (
              <option key={band.index} value={band.index}>
                {band.index + 1}: {Math.round(band.minimumDepthM)}–{Math.round(band.maximumDepthM)} m
                {band.reachable ? ' (vessel)' : ' (expendable only)'}
              </option>
            ))}
          </select>
        </label>
        <label className="consumer-control">
          <span>time budget</span>
          <select
            value={budgetHours}
            data-testid="sampling-budget"
            onChange={(event) => setBudgetHours(Number(event.target.value))}
          >
            {settings.time_budget_hours.map((hours) => (
              <option key={hours} value={hours}>
                {hours} h
              </option>
            ))}
          </select>
        </label>
        <label className="consumer-control">
          <span>expendable rate</span>
          <select
            value={intervalHours}
            data-testid="sampling-rate"
            onChange={(event) => setIntervalHours(Number(event.target.value))}
          >
            {settings.expendable_interval_hours.map((hours) => (
              <option key={hours} value={hours}>
                1 per {hours} h
              </option>
            ))}
          </select>
        </label>
        <span className="consumer-control" data-testid="sampling-drops">
          <span>drops</span> {dropCount} in {budgetHours} h
        </span>
        <button type="button" onClick={() => setPlanCount((count) => count + 1)} data-testid="sampling-plan">
          {planCount === 0 ? 'plan' : 'replan now'}
        </button>
      </div>

      <p className="consumer-note">
        Hexes are coloured by <strong>observation-driven uncertainty</strong> <Provenance of="seam-derived" /> —
        a coverage proxy from recency, density and age decay over the {heardAtSample} observation(s)
        this tab has heard since it opened, not forecast uncertainty and not ensemble spread.
        {reach.metres !== undefined ? (
          <>
            {' '}
            The vessel reaches {Math.round(reach.metres)} m, which is {reachableZones} of{' '}
            {zones.length} zones, from {reach.from}; below that only an expendable can help.
          </>
        ) : (
          ' The vessel’s reach is not known yet — no platform state and no plan has been heard, so no zone is drawn as reachable.'
        )}{' '}
        Transit is costed at {speedUsed.toFixed(1)} m/s, from {speedFrom}.
      </p>

      {refusedResolution && (
        <p className="consumer-refusal" data-testid="sampling-refusal">
          {refusedResolution}
        </p>
      )}

      {plot && cells.length > 0 ? (
        <svg
          className="consumer-map"
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          role="img"
          aria-label={`observation-driven uncertainty over ${cells.length} hexes at depth zone ${zone + 1}`}
          data-testid="sampling-map"
        >
          {cells.map((cell) => (
            <polygon
              key={cell.index}
              className="consumer-hex"
              points={plot.ring(cell.boundary)}
              fill={uncertaintyColour(highest > 0 ? (byHexValue.get(cell.index) ?? 0) / highest : 0)}
            >
              <title>
                {cell.index}: {(byHexValue.get(cell.index) ?? 0).toFixed(2)} at zone {zone + 1}
              </title>
            </polygon>
          ))}
          {ghost && ghost.value && ghost.value.vertices.length > 0 && (
            <polyline
              className="consumer-ghost"
              data-testid="sampling-ghost"
              points={plot.ring(ghost.value.vertices.map((vertex) => [vertex.longitude, vertex.latitude]))}
            />
          )}
          {planned && planned.withoutDrops.vertices.length > 0 && (
            <polyline
              className="consumer-comparison"
              data-testid="sampling-comparison"
              points={plot.ring(
                planned.withoutDrops.vertices.map((vertex) => [vertex.longitude, vertex.latitude]),
              )}
            />
          )}
          {planned && planned.withDrops.vertices.length > 0 && start && (
            <polyline
              className="consumer-route"
              data-testid="sampling-route"
              points={plot.ring([
                [start.longitude, start.latitude],
                ...planned.withDrops.vertices.map(
                  (vertex) => [vertex.longitude, vertex.latitude] as [number, number],
                ),
              ])}
            />
          )}
          {planned?.withDrops.drops.map((drop, index) => {
            const [x, y] = plot.at(drop.longitude, drop.latitude);
            return (
              <rect
                key={`${drop.hex}-${drop.zone}`}
                className="consumer-drop"
                data-testid="sampling-drop"
                x={x - 5}
                y={y - 5}
                width={10}
                height={10}
                onClick={() => setChosenDrop(index)}
              >
                <title>
                  expendable at {drop.hex}, zone {drop.zone + 1}
                </title>
              </rect>
            );
          })}
          {start && (
            <circle
              className="consumer-vessel"
              cx={plot.at(start.longitude, start.latitude)[0]}
              cy={plot.at(start.longitude, start.latitude)[1]}
              r={5}
            />
          )}
        </svg>
      ) : (
        <p className="consumer-note" data-testid="sampling-waiting">
          Waiting for the first published forecast: until one arrives this consumer does not know
          what water it is reasoning about, and draws nothing rather than a guess.
        </p>
      )}

      <div className="consumer-legend">
        <span>route: this plan</span>
        <span>dashed fine: the same plan with no expendables — the difference is what depth cost</span>
        {ghost && <span>dashed heavy: the plan against forecast {ghost.runId}</span>}
      </div>

      {planned && (
        <p className="consumer-note" data-testid="sampling-summary">
          {planned.withDrops.emptyReason ??
            `${planned.withDrops.vertices.length} hexes over ${(planned.withDrops.distanceMetres / 1000).toFixed(0)} km, ` +
              `${(planned.withDrops.consumedSeconds / 3600).toFixed(1)} h of the ${budgetHours} h budget, ` +
              `collapsing ${planned.withDrops.reachableValue.toFixed(1)} of reachable uncertainty and ` +
              `${planned.withDrops.deepValue.toFixed(1)} below the vessel’s reach. ` +
              `Planned against the field as it stood at ${displayInstant(planned.atSimTime)}.`}
        </p>
      )}

      {planned && planned.withDrops.drops.length > 0 && (
        <table className="consumer-table">
          <caption>Expendables — each on the route, because a sensor cannot be dropped where the vessel does not go</caption>
          <thead>
            <tr>
              <th>drop</th>
              <th>at hex</th>
              <th>route stop</th>
              <th>zone addressed</th>
              <th>uncertainty addressed</th>
            </tr>
          </thead>
          <tbody>
            {planned.withDrops.drops.map((drop, index) => (
              <tr
                key={`${drop.hex}-${drop.zone}`}
                aria-selected={chosen === drop}
                onClick={() => setChosenDrop(index)}
              >
                <td>{index + 1}</td>
                <td>{drop.hex}</td>
                <td>{drop.vertexIndex + 1}</td>
                <td>
                  {drop.zone + 1}: {Math.round(zones[drop.zone]?.minimumDepthM ?? 0)}–
                  {Math.round(zones[drop.zone]?.maximumDepthM ?? 0)} m
                </td>
                <td>{drop.uncertaintyAddressed.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ConsumerFrame>
  );
}
