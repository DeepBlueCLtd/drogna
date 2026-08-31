/**
 * The Data tab (feature 121): everything the system holds, in one place.
 *
 * Three stores, three standard interfaces, one tree. The spine is **by data kind** —
 * measurements, the coverage eras in the order the store fills them, then what shore has
 * sent — rather than by the standard that answers, because that is how a reader thinks
 * about the data. The cost is stated in the specification and is real: this tab is the
 * best view of what the system holds and says nothing about the conformance story.
 * Background explains all three interfaces; the Map's composer shows EDR on the wire.
 *
 * This tab absorbs the Holdings tab, whose obligations it carries unchanged (FR-46,
 * FR-69, FR-70 — see `CoverageBranch.tsx`).
 *
 * Two rules run through everything here:
 *
 *  - **Nothing polls**, and not everything that announces is acted on. The coverage
 *    store and the advisory store announce rarely — a publication, a new advisory — so
 *    their branches refresh on the announcement and at no other time (FR-04, FR-46).
 *    Observations announce constantly, and the first cut treated them the same way: it
 *    refetched the whole datastream list on *every* observation, and — because the open
 *    chart's fetch was keyed on the datastream alone — never refetched the one thing a
 *    reader was actually watching. So the tab sat still while it worked hardest.
 *    Arrivals are now *counted* rather than acted on, the tab says how many are waiting,
 *    and a refresh applies them. Redrawing a chart on every sample is a picture that
 *    jitters under the reader, which is worse than one that admits it is a moment old.
 *  - **An empty display is a claim.** Where a store refuses, or a response fails its
 *    master, the branch says so where its content would have been. It never draws an
 *    empty table, an empty canvas or a chart with no points as though those were the
 *    answer (FR-06, Constitution VII).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PanelProps } from '../../shell/registry.js';
import { useIsNarrow } from '../../shell/viewport.js';
import type {
  Clock,
  CoverageHolding,
  FeaturesResponseFeatureCollection,
  TelemetryReport,
} from '../../generated/types.js';
import { HelpButton } from '../../shell/walkthrough/HelpButton.js';
import { dataTour } from '../../shell/walkthrough/tour.js';
import { CoverageBranch } from './CoverageBranch.js';
import { Measurements } from './Measurements.js';
import { ShoreUpdates } from './lazy.js';
import { BRANCHES, branchById, holdingsForBranch } from './tree.js';
import { restForSelection, selectionFromRest } from './address.js';
import {
  readAdvisories,
  readDatastreams,
  readHoldings,
  readObservationCount,
  readReference,
  readThings,
  type Datastream,
  type Thing,
} from './read.js';
import './data.css';

/**
 * The regions this panel declares, and the authority its tour is held to (FR-75). The
 * bound is this list rather than a number typed into a test, so a region added here with
 * no step is named by the check.
 */
export const DATA_REGIONS = [
  { id: 'tree', label: 'the tree of what is held', element: '[data-region="tree"]' },
  { id: 'timeline', label: 'the coverage store in simulation time', element: '[data-region="timeline"]' },
  { id: 'manifest', label: 'the ground-truth manifest', element: '[data-region="manifest"]' },
  { id: 'comparison', label: 'forecast against truth', element: '[data-region="comparison"]' },
  { id: 'volume', label: 'the field as a volume', element: '[data-region="volume"]' },
  { id: 'chart', label: 'a datastream’s history, charted and tabulated', element: '[data-region="chart"]' },
  { id: 'advisories', label: 'what shore has sent', element: '[data-region="advisories"]' },
] as const;

const isBranch = (id: string) => BRANCHES.some((branch) => branch.id === id);

export function DataPanel({ params }: PanelProps) {
  const { config, client, validator, address } = params;
  const rootRef = useRef<HTMLDivElement>(null);
  const narrow = useIsNarrow(rootRef);

  const [holdings, setHoldings] = useState<readonly CoverageHolding[]>([]);
  const [holdingsRefusal, setHoldingsRefusal] = useState<string | undefined>();
  const [things, setThings] = useState<readonly Thing[]>([]);
  const [datastreams, setDatastreams] = useState<readonly Datastream[]>([]);
  const [measurementsRefusal, setMeasurementsRefusal] = useState<string | undefined>();
  /** What the observation store says it holds: the figure the tree counts by. */
  const [observationsHeld, setObservationsHeld] = useState(0);
  const [advisories, setAdvisories] = useState<FeaturesResponseFeatureCollection | undefined>();
  const [advisoriesRefusal, setAdvisoriesRefusal] = useState<string | undefined>();
  const [reference, setReference] = useState<FeaturesResponseFeatureCollection | undefined>();
  const [telemetry, setTelemetry] = useState<TelemetryReport | undefined>();
  const [nowSimTime, setNowSimTime] = useState<string | undefined>();
  /**
   * Observations announced, and observations the tab has read.
   *
   * The difference is what a reader is owed before they decide whether to press
   * anything: "3 waiting" and "nothing waiting" are different facts, and a refresh
   * control that cannot tell them apart asks the reader to press it to find out.
   */
  const [announced, setAnnounced] = useState(0);
  const [readAt, setReadAt] = useState(0);
  /**
   * The same count, in a ref.
   *
   * `refreshMeasurements` needs the latest value and must not *depend* on it: a
   * dependency would rebuild the callback on every observation, and the effect that
   * calls it once on mount would then call it once per observation — reintroducing, by
   * a longer route, exactly the refetch-per-sample this change removes.
   */
  const announcedRef = useRef(0);
  useEffect(() => {
    announcedRef.current = announced;
  }, [announced]);
  /** Bumped by a refresh, and read by the open chart as its cue to fetch again. */
  const [refreshToken, setRefreshToken] = useState(0);

  // The address is the selection (FR-03): one place, so a link and a click cannot
  // disagree about what is open.
  const [selection, setSelection] = useState(
    () => selectionFromRest(address.current(), isBranch) ?? { branchId: BRANCHES[0].id },
  );
  useEffect(() => {
    return address.onChange((rest) => {
      const asked = selectionFromRest(rest, isBranch);
      if (asked) setSelection(asked);
    });
  }, [address]);


  const branch = branchById(selection.branchId) ?? BRANCHES[0];

  const refreshCoverage = useCallback(async () => {
    const answer = await readHoldings(config.endpoints.holdings, validator);
    if (answer.ok) {
      setHoldings(answer.value);
      setHoldingsRefusal(undefined);
    } else {
      setHoldingsRefusal(answer.refusal);
    }
  }, [config.endpoints.holdings, validator]);

  const refreshTelemetry = useCallback(async () => {
    const response = await fetch(config.endpoints.telemetry);
    if (!response.ok) return;
    const body = (await response.json()) as unknown;
    if (validator.validate('telemetry-report', body).ok) setTelemetry(body as TelemetryReport);
  }, [config.endpoints.telemetry, validator]);

  const refreshMeasurements = useCallback(async () => {
    // Recorded before the fetch, not after: an observation that arrives while these two
    // requests are in flight is one this read may not carry, and counting it as read
    // would lose it silently. Erring the other way shows a reader one more waiting than
    // strictly is, which costs a press and no information.
    setReadAt(announcedRef.current);
    const [platforms, streams, held] = await Promise.all([
      readThings(config.endpoints.sensorthings, validator),
      readDatastreams(config.endpoints.sensorthings, validator),
      readObservationCount(config.endpoints.sensorthings, validator),
    ]);
    if (!platforms.ok) {
      setMeasurementsRefusal(platforms.refusal);
      return;
    }
    if (!streams.ok) {
      setMeasurementsRefusal(streams.refusal);
      return;
    }
    setMeasurementsRefusal(undefined);
    setThings(platforms.value);
    setDatastreams(streams.value);
    if (held.ok) setObservationsHeld(held.value);
  }, [config.endpoints.sensorthings, validator]);

  const refreshAdvisories = useCallback(async () => {
    const answer = await readAdvisories(config.endpoints.features, validator);
    if (answer.ok) {
      setAdvisories(answer.value);
      setAdvisoriesRefusal(undefined);
    } else {
      setAdvisoriesRefusal(answer.refusal);
    }
  }, [config.endpoints.features, validator]);

  // Each branch on its own announcement, and nothing on a timer (FR-04).
  useEffect(() => {
    void refreshCoverage();
    void refreshTelemetry();
    return client.subscribe(config.topics.holdings, () => {
      void refreshCoverage();
      void refreshTelemetry();
    });
  }, [client, config.topics.holdings, refreshCoverage, refreshTelemetry]);

  useEffect(() => {
    void refreshMeasurements();
  }, [refreshMeasurements]);

  // Counted, not acted on. Every observation used to refetch the platforms and the
  // datastream list — two requests per sample, for a list that changes when a sensor
  // first reports and at no other time.
  useEffect(() => {
    return client.subscribe(config.topics.observations, () => {
      setAnnounced((seen) => seen + 1);
    });
  }, [client, config.topics.observations]);

  useEffect(() => {
    void refreshAdvisories();
    return client.subscribe(config.topics.advisories, () => {
      void refreshAdvisories();
    });
  }, [client, config.topics.advisories, refreshAdvisories]);

  // The reference geometry is immutable for the run, so it is read once and never
  // announced on: subscribing to something that cannot change is a subscription that
  // only ever costs.
  useEffect(() => {
    void (async () => {
      const answer = await readReference(config.endpoints.features, validator);
      if (answer.ok) setReference(answer.value);
    })();
  }, [config.endpoints.features, validator]);

  // Whether an advisory is in force, or an instance's validity has elapsed, are questions
  // about simulation time, and the clock component is the only thing that answers them.
  useEffect(() => {
    return client.subscribe(config.topics.clock, (message) => {
      setNowSimTime((message.payload as Clock).sim_time);
    });
  }, [client, config.topics.clock]);

  const counts = useMemo(() => {
    const perBranch = new Map<string, number>();
    for (const candidate of BRANCHES) {
      if (candidate.kind === 'coverage') perBranch.set(candidate.id, holdingsForBranch(candidate, holdings).length);
      // Measurements are counted in *measurements*, not in datastreams. Seven datastreams
      // is a fact about how the platform is instrumented; the branch is there to say how
      // much has been reported, which is the number that moves.
      if (candidate.kind === 'measurements') perBranch.set(candidate.id, observationsHeld);
      if (candidate.kind === 'shore') perBranch.set(candidate.id, advisories?.features.length ?? 0);
    }
    return perBranch;
  }, [advisories, holdings, observationsHeld]);

  /**
   * Selecting is what writes the address, and mounting is not.
   *
   * An effect keyed on the selection looked equivalent and was not: it fired on mount,
   * so simply opening the tab rewrote `#/view/data` to `#/view/data/measurements` — the
   * shell's default branch presented as though the reader had chosen it. Crossing the
   * width threshold remounts the panel, which turned that into an address the reader
   * had never asked for changing under them (feature 112, SC-005, which caught it).
   * A deep link selects what is shown; it never records what happened (FR-15).
   */
  /**
   * How many observations the tab has not read yet.
   *
   * Clamped at zero because the two counters are written from different places and a
   * refresh records the count *before* its fetch: a reader is never shown a negative
   * backlog, which would be arithmetic leaking through the display.
   */
  const waiting = Math.max(announced - readAt, 0);

  /** Read every store again, and tell the open chart to do the same. */
  const refreshAll = () => {
    void refreshCoverage();
    void refreshTelemetry();
    void refreshMeasurements();
    void refreshAdvisories();
    setRefreshToken((token) => token + 1);
  };

  const select = (branchId: string, nodeId?: string) => {
    setSelection({ branchId, nodeId });
    if (address.names()) address.write(restForSelection({ branchId, nodeId }));
  };

  const branchHoldings = holdingsForBranch(branch, holdings);
  // What the address asked for that this branch does not hold. Reported rather than
  // absorbed: a link to a holding the store has since replaced is a question this tab
  // knows the answer to, and opening silently on something else answers a different one.
  const missing =
    selection.nodeId !== undefined &&
    ((branch.kind === 'coverage' && !branchHoldings.some((holding) => holding.holding_id === selection.nodeId)) ||
      (branch.kind === 'measurements' && !datastreams.some((stream) => stream.id === selection.nodeId)))
      ? selection.nodeId
      : undefined;

  return (
    <div className="panel data-panel" ref={rootRef} data-narrow={narrow}>
      <div className="panel-head">
        <p className="messages-counters" data-testid="data-counts">
          {holdings.length} holding(s), {observationsHeld} measurement(s) on{' '}
          {datastreams.length} datastream(s), {advisories?.features.length ?? 0} advisory(ies)
          {holdingsRefusal && <span className="shell-refusal"> · {holdingsRefusal}</span>}
        </p>
        <div className="data-head-controls">
          {/* What is waiting, said before it is asked for. A control whose effect a
              reader can only discover by pressing it is a control that has stopped
              saying anything (feature 117's rule about the walk arrows, applied here). */}
          <span className="data-waiting" data-testid="data-waiting">
            {waiting > 0
              ? `${waiting} observation(s) have arrived since the last read`
              : 'nothing has arrived since the last read'}
          </span>
          <button
            type="button"
            className="data-refresh"
            data-testid="data-refresh"
            aria-label={
              waiting > 0
                ? `refresh: read the ${waiting} observation(s) that have arrived`
                : 'refresh: read the stores again'
            }
            onClick={refreshAll}
          >
            refresh
          </button>
          <HelpButton tour={dataTour()} />
        </div>
      </div>

      <div className="data-body">
        <nav className="data-tree" data-region="tree" aria-label="what the system holds">
          <ul>
            {BRANCHES.map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  className="data-branch-button"
                  data-branch={candidate.id}
                  aria-current={candidate.id === branch.id}
                  onClick={() => select(candidate.id)}
                >
                  <span className="branch-label">{candidate.label}</span>
                  <span className="branch-count" data-testid={`count-${candidate.id}`}>
                    {counts.get(candidate.id) ?? 0}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="data-branch-region">
          {holdingsRefusal !== undefined && branch.kind === 'coverage' ? (
            <p className="shell-refusal" data-testid="branch-refusal">
              {holdingsRefusal}
            </p>
          ) : branch.kind === 'coverage' ? (
            <CoverageBranch
              branch={branch}
              holdings={branchHoldings}
              allHoldings={holdings}
              selected={missing === undefined ? selection.nodeId : undefined}
              onSelect={(holdingId) => select(branch.id, holdingId)}
              nowSimTime={nowSimTime}
              telemetry={telemetry}
              edrPrefix={config.endpoints.edr}
              validator={validator}
              narrow={narrow}
              missing={missing}
            />
          ) : branch.kind === 'measurements' ? (
            <Measurements
              things={things}
              datastreams={datastreams}
              refreshToken={refreshToken}
              refusal={measurementsRefusal}
              selected={missing === undefined ? selection.nodeId : undefined}
              onSelect={(datastreamId) => select(branch.id, datastreamId)}
              stPrefix={config.endpoints.sensorthings}
              validator={validator}
              missing={missing}
            />
          ) : (
            <ShoreUpdates
              advisories={advisories}
              reference={reference}
              refusal={advisoriesRefusal}
              nowSimTime={nowSimTime}
              selected={selection.nodeId}
              onSelect={(advisoryId) => select(branch.id, advisoryId)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
