/**
 * Tab 2 — **Courses** (FR-84): a downstream consumer that answers *of three or four ways
 * to do this, which one, and what am I trading?*
 *
 * It is not part of drogna, and it stands closest of the three to the line Constitution V
 * draws. It holds no track, no position anybody inferred, and no entity the harness did
 * not place: what it holds is a hypothesis about *classes* of vessel that may be present,
 * seeded across the whole domain from a likelihood the reader sets. A Monte Carlo over an
 * entire domain infers no position at all, which is exactly the distinction the principle
 * already makes between an entity and a hypothesis about a class. The panel says so on
 * screen, under the strip, because the yellow chrome explains the boundary to a reader who
 * knows the argument and that sentence explains it to one who does not.
 *
 * The field is a genuine EDR area query — the same request the Map issues — and it is not
 * decoration: the evasive class reads concealment out of it to decide where to go, so that
 * class's cloud is the one that changes when the ocean does.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { gridDisk } from 'h3-js';
import type { PanelProps } from '../../../shell/registry.js';
import type { PlatformState } from '../../../generated/types.js';
import { gridCells, type GridCoverage } from '../../map/map-data.js';
import { ConsumerFrame, Provenance } from '../ConsumerFrame.js';
import { useGhostOnRunChange } from '../freshness.js';
import { useConsumerBasis } from '../basis.js';
import { consumerStream } from '../rng.js';
import { domainRing, type Domain } from '../domain.js';
import { aggregateOntoHexes, coverExtent, isRefusal, projector, uncertaintyColour } from '../hexes.js';
import { useMapView } from '../view.js';
import { concealmentFromField, seedCloud, type ClassHypothesis } from './participants.js';
import { buildCandidates, rank, type ScoredCandidate } from './candidates.js';

const MAP_WIDTH = 720;
const MAP_HEIGHT = 480;
const FIELD_PARAMETER = 'temperature';
const COURSE_LEGS = 14;

export function CoursesPanel({ params }: PanelProps) {
  const { config, client, validator, manifest } = params;
  const settings = config.consumers.courses;
  const freshness = useConsumerBasis(config, client, validator);

  const [platform, setPlatform] = useState<PlatformState | undefined>();
  const [resolution, setResolution] = useState(config.consumers.hexes.default_resolution);
  const [objective, setObjective] = useState(settings.default_objective);
  const [exposureWeight, setExposureWeight] = useState(settings.default_exposure_weight);
  const [roster, setRoster] = useState<readonly ClassHypothesis[]>(() =>
    settings.classes.map((entry) => ({
      id: entry.id,
      label: entry.label,
      motion: entry.motion,
      likelihood: entry.default_likelihood,
      included: entry.included,
      speedMetresPerSecond: entry.speed_m_per_s,
    })),
  );
  const [field, setField] = useState<{ coverage?: GridCoverage; refusal?: string; servedFrom?: string }>({});
  const [chosen, setChosen] = useState<string | undefined>();

  useEffect(() => {
    return client.subscribe(config.topics.platform_state, (message) => {
      const verdict = validator.validate('platform-state', message.payload);
      if (verdict.ok) setPlatform(message.payload as PlatformState);
    });
  }, [client, config.topics.platform_state, validator]);

  const domain: Domain | undefined = freshness.basis?.domain;
  const collection = freshness.basis?.collection;

  // The field, fetched once per accepted forecast. A newly published run does not refetch
  // it: the halo is raised, and this fires again only when the reader takes the run up,
  // which is the whole of FR-78 as it applies to a fetch.
  useEffect(() => {
    if (!domain || !collection) return;
    void (async () => {
      const ring = domainRing(domain)
        .map(([longitude, latitude]) => `${longitude} ${latitude}`)
        .join(', ');
      const query = new URLSearchParams({
        coords: `POLYGON((${ring}))`,
        z: String(domain.minimumDepthM),
        'parameter-name': FIELD_PARAMETER,
      });
      const response = await fetch(`${config.endpoints.edr}/collections/${collection}/area?${query.toString()}`);
      const body = (await response.json()) as unknown;
      if (!response.ok) {
        setField({
          refusal: (body as { refused?: string }).refused ?? `the area query answered ${response.status}`,
        });
        return;
      }
      const verdict = validator.validate('coveragejson', body);
      if (!verdict.ok) {
        setField({ refusal: `the coverage was refused by its master: ${verdict.refusals[0]}` });
        return;
      }
      const coverage = body as GridCoverage;
      setField({
        coverage,
        servedFrom: `${collection} at ${coverage.domain.axes.z.values[0]} m`,
      });
    })();
  }, [domain, collection, config.endpoints.edr, validator]);

  // What the map is looking at: the wheel zooms it and a drag pans it (`view.ts`).
  const view = useMapView(domain, MAP_WIDTH, MAP_HEIGHT);
  const cover = useMemo(
    () => (domain ? coverExtent(view.rect, resolution, config.consumers.hexes.cell_ceiling) : undefined),
    [domain, view.rect, resolution, config.consumers.hexes.cell_ceiling],
  );
  const refusedResolution = cover && isRefusal(cover) ? cover.refused : undefined;
  const cells = cover && !isRefusal(cover) ? cover.cells : [];

  /** The fetched field, resampled onto the reader's hexes, and the concealment from it. */
  const concealment = useMemo(() => {
    if (!field.coverage) return new Map<string, number>();
    const grid = gridCells(field.coverage, FIELD_PARAMETER);
    if (!grid) return new Map<string, number>();
    const aggregate = aggregateOntoHexes(
      grid.cells.map((cell) => ({
        longitude: (cell.bounds[0] + cell.bounds[2]) / 2,
        latitude: (cell.bounds[1] + cell.bounds[3]) / 2,
        value: cell.value,
      })),
      resolution,
    );
    const values = new Map([...aggregate].map(([hex, entry]) => [hex, entry.mean]));
    return concealmentFromField(values, (hex) => gridDisk(hex, 1));
  }, [field.coverage, resolution]);

  const draw = useMemo(
    () => consumerStream(manifest.root_seed, 'consumer', 'courses'),
    [manifest.root_seed, freshness.basis?.identity],
  );

  const cloud = useMemo(() => {
    if (!domain) return undefined;
    return seedCloud({
      domain,
      resolution,
      classes: roster,
      steps: settings.steps,
      stepSeconds: settings.step_seconds,
      samplesPerLikelihood: settings.samples_per_likelihood,
      bankCount: settings.bank_count,
      concealment,
      // A fresh stream per computation, so the cloud is a function of the roster and the
      // seed rather than of how many times the reader has moved a slider.
      draw: consumerStream(manifest.root_seed, 'consumer', 'courses', 'cloud'),
    });
  }, [domain, resolution, roster, concealment, settings, manifest.root_seed]);

  const start = platform
    ? { longitude: platform.current.longitude, latitude: platform.current.latitude }
    : domain
      ? { longitude: (domain.west + domain.east) / 2, latitude: (domain.south + domain.north) / 2 }
      : undefined;

  const candidates = useMemo(() => {
    if (!cloud || !start || cells.length === 0) return [];
    return buildCandidates({
      start,
      resolution,
      density: cloud.density,
      highestDensity: cloud.highest,
      concealment,
      objective,
      count: settings.candidate_count,
      cells,
      legs: COURSE_LEGS,
      draw,
    });
  }, [cloud, start?.longitude, start?.latitude, cells, resolution, concealment, objective, settings.candidate_count, draw]);

  const ranked: ScoredCandidate[] = useMemo(
    () => rank(candidates, exposureWeight),
    [candidates, exposureWeight],
  );
  const leader = ranked[0];

  /**
   * Whether this objective presents a trade at all.
   *
   * Under evasion the two components move *together*: staying clear of the density is
   * both the objective and the way to lower exposure, so no weighting reorders anything.
   * That is a real property of the problem rather than a defect, and the tab says so —
   * a slider that cannot change the answer is worse than no slider if nobody is told.
   */
  const trades = useMemo(() => {
    if (candidates.length < 2) return false;
    return rank(candidates, 0)[0].id !== rank(candidates, 1)[0].id;
  }, [candidates]);

  const { ghost, dismiss } = useGhostOnRunChange(ranked, freshness.basis?.identity);
  const ghostLeader = ghost?.value?.[0];

  const plot = useMemo(() => (domain ? projector(view.rect, MAP_WIDTH, MAP_HEIGHT) : undefined), [domain, view.rect]);

  const setLikelihood = useCallback((id: string, likelihood: number) => {
    setRoster((standing) =>
      standing.map((entry) => (entry.id === id ? { ...entry, likelihood } : entry)),
    );
  }, []);
  const setIncluded = useCallback((id: string, included: boolean) => {
    setRoster((standing) => standing.map((entry) => (entry.id === id ? { ...entry, included } : entry)));
  }, []);

  return (
    <ConsumerFrame
      config={config}
      testId="courses"
      summary="Comparative courses of action — three or four ways, scored apart"
      freshness={freshness}
      ghostRunId={ghost?.runId}
      onDismissGhost={dismiss}
    >
      <p className="consumer-note">
        This tab reasons about <strong>classes of vessel that may be present</strong>{' '}
        <Provenance of="synthesised" />. It holds no position anybody inferred: every hypothesis is
        seeded across the whole domain from the likelihood set below, and nothing here represents a
        known entity at a known place. Concealment is read from the forecast field{' '}
        <Provenance of="seam" />
        {field.servedFrom ? ` (${field.servedFrom})` : ''} as a proxy — a sharp gradient hides
        things — not from an acoustic model.
        {field.refusal && <span className="shell-refusal"> · {field.refusal}</span>}
      </p>

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
          <span>{resolution}</span>
        </label>
        <label className="consumer-control">
          <span>objective</span>
          <select
            value={objective}
            data-testid="courses-objective"
            onChange={(event) => setObjective(event.target.value)}
          >
            {settings.objectives.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className="consumer-control">
          <span>weighting: exposure</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={exposureWeight}
            data-testid="courses-weight"
            onChange={(event) => setExposureWeight(Number(event.target.value))}
          />
          <span data-testid="courses-weight-value">
            {Math.round(exposureWeight * 100)}% exposure / {Math.round((1 - exposureWeight) * 100)}%
            objective
          </span>
        </label>
        <span className="consumer-control" data-testid="courses-zoom">
          <span>zoom</span> ×{view.factor.toFixed(1)}
          <button type="button" onClick={view.reset}>
            whole domain
          </button>
        </span>
      </div>

      {/* Its own scrolling container, so the page never scrolls sideways (FR-017). */}
      <div className="table-scroll">
      <table className="consumer-table" data-testid="courses-roster">
        <caption>Roster — which classes may be present, and how likely each is</caption>
        <thead>
          <tr>
            <th>class</th>
            <th>in</th>
            <th>likelihood</th>
            <th>how it moves</th>
            <th>hypotheses</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((entry) => (
            <tr key={entry.id}>
              <td>{entry.label}</td>
              <td>
                <input
                  type="checkbox"
                  checked={entry.included}
                  aria-label={`include ${entry.label}`}
                  onChange={(event) => setIncluded(entry.id, event.target.checked)}
                />
              </td>
              <td>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={entry.likelihood}
                  aria-label={`likelihood of ${entry.label}`}
                  data-testid={`courses-likelihood-${entry.id}`}
                  onChange={(event) => setLikelihood(entry.id, Number(event.target.value))}
                />{' '}
                {entry.likelihood}
              </td>
              <td>
                {entry.motion === 'corridor' && 'a fixed corridor, on a schedule'}
                {entry.motion === 'loiter' && 'loiters over shallow banks, indifferent'}
                {entry.motion === 'evasive' && 'seeks concealment, reading the forecast field'}
              </td>
              <td>{entry.included ? entry.likelihood * settings.samples_per_likelihood : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {refusedResolution && <p className="consumer-refusal">{refusedResolution}</p>}

      {plot && cloud && cells.length > 0 ? (
        <svg
          className="consumer-map"
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          role="img"
          aria-label={`${cloud.hypotheses} hypotheses over ${cells.length} hexes, and ${ranked.length} candidate courses`}
          data-testid="courses-map"
          ref={view.ref}
          data-panning={view.panning}
        >
          {cells.map((cell) => {
            const density = cloud.highest > 0 ? (cloud.density.get(cell.index) ?? 0) / cloud.highest : 0;
            return (
              <polygon
                key={cell.index}
                className="consumer-hex consumer-cloud"
                points={plot.ring(cell.boundary)}
                fill={uncertaintyColour(density)}
                opacity={0.25 + 0.75 * density}
              >
                <title>
                  {cell.index}: {(cloud.density.get(cell.index) ?? 0).toFixed(0)} hypothesis-steps
                </title>
              </polygon>
            );
          })}
          {ghostLeader && (
            <polyline
              className="consumer-ghost"
              data-testid="courses-ghost"
              points={plot.ring(ghostLeader.points)}
            />
          )}
          {ranked.map((candidate) => (
            <polyline
              key={candidate.id}
              className={candidate.rank === 1 ? 'consumer-route' : 'consumer-comparison'}
              data-testid={`courses-course-${candidate.id}`}
              points={plot.ring(candidate.points)}
              onClick={() => setChosen(candidate.id)}
            />
          ))}
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
        <p className="consumer-note" data-testid="courses-waiting">
          Waiting for the coverage store to say what it holds: with no domain and no field there
          is nothing to seed a hypothesis across, and a cloud drawn over a guessed domain would be
          a picture of nothing.
        </p>
      )}

      <div className="table-scroll">
      <table className="consumer-table" data-testid="courses-candidates">
        <caption>
          Candidates — component scores kept apart, so the weighting is what you argue with
        </caption>
        <thead>
          <tr>
            <th>rank</th>
            <th>course</th>
            <th>exposure risk</th>
            <th>objective achievement</th>
            <th>headline</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((candidate) => (
            <tr
              key={candidate.id}
              aria-selected={chosen === candidate.id}
              data-testid={`courses-row-${candidate.id}`}
              onClick={() => setChosen(candidate.id)}
            >
              <td>{candidate.rank}</td>
              <td>{candidate.label}</td>
              <td>{candidate.exposure.toFixed(2)}</td>
              <td>{candidate.achievement.toFixed(2)}</td>
              <td>{candidate.headline.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {leader && (
        <p className="consumer-note" data-testid="courses-leader">
          Leading at this weighting: <strong>{leader.label}</strong>, exposure{' '}
          {leader.exposure.toFixed(2)} against achievement {leader.achievement.toFixed(2)}.{' '}
          <span data-testid="courses-trade">
            {trades
              ? 'Move the weighting and the order changes — that is the trade, and it is the tool reasoning rather than reciting.'
              : 'At this objective the two components move together — what the objective wants is also what keeps the course clear — so no weighting reorders these candidates. That is a property of the objective, not a broken slider; try another one.'}
          </span>
          {ghostLeader && ghostLeader.id !== leader.id && (
            <> Against forecast {ghost?.runId} the leader was {ghostLeader.label}.</>
          )}
        </p>
      )}
    </ConsumerFrame>
  );
}
