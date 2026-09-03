/**
 * The Forecast tab (feature 123, SRD-v2 §5.20): why now, and what it costs.
 *
 * §5.20 specifies one view, three regions and a timeline, left to right in time — why now,
 * what changed, what next. **This feature builds the left region, the timeline, and the plan
 * view of the forecast's own features in the right one.**
 *
 * That last one was added after the tab was first built, because the tab had no graphic of
 * the forecast at all: a gauge about the run loop, a cost, and a list of runs. Meanwhile
 * `ctl/forecast/features` — the eddy, the drifting feature, the front and the thermocline,
 * per lead step, each with an uncertainty that grows — was published on every run and read by
 * nothing. Feature 124 claims those features for its volume, but the volume waits on an
 * analyst change 124 is itself blocked on, and a plan view needs neither.
 * They are the two that FR-115's four scheduler facts need in order to be visible at all: a
 * run held for cost has to be visible somewhere, or the hold is a behaviour nothing can
 * see. The centre and right regions — the volume, the clickable column grid, the rays, the
 * depth profile and the ghost layer — are feature 124's, and until they exist this view says
 * so where they will be. An empty canvas is a claim the shell is not entitled to make.
 *
 * **The gauge is reported, never derived from a configured expectation** (FR-119). What it
 * draws is whatever is published on the declared indicator topic, and it names which
 * indicator that is; with the topic silent it states the absence and draws no gauge, because
 * an empty gauge and an unheard indicator are different facts. The indicator itself is
 * environmental science and belongs to the environmental-indicators workstream (FR-117);
 * drogna's own residual statistic is wired into the socket as the reference implementation,
 * published by the monitor, which already holds both the residual and the threshold in force.
 *
 * **Need and cost are read together or the region has not done its job** (FR-118), so the
 * cost of a run is stated beneath the gauge in the same frame — from the model runner's own
 * statement, the only component entitled to make one.
 *
 * **Each run on the timeline is labelled by cause**, and the cause is read from the run
 * request, which is where the scheduler declares it. It is not inferred from a decision's
 * prose: a display that parses a sentence is a display inventing figures.
 *
 * Nothing here polls (FR-136). Every figure arrives on an announcement, validated against
 * the master its topic declares before it is drawn; what is refused is counted and stated
 * rather than silently discarded.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PanelProps } from '../../shell/registry.js';
import type {
  AnalysisPublished,
  CoverageHolding,
  ForecastFeatures,
  ForecastIndicator,
  HoldingsInventory,
  RunCost,
  RunPublished,
  RunRequest,
  RunStarted,
  TelemetryRunFailed,
  TelemetrySchedulerDecision,
} from '../../generated/types.js';
import { topicMatchesFilter } from '../messages/topic-match.js';
import { displayInstant } from '../../shell/display.js';
import { HelpButton } from '../../shell/walkthrough/HelpButton.js';
import { forecastTour } from '../../shell/walkthrough/tour.js';
import { FeatureTracks } from './FeatureTracks.js';
import { ColumnProvenance, columnGridOf, type ColumnGrid } from './ColumnProvenance.js';
import './forecast.css';

/**
 * The regions this surface offers, on disk, so a region gaining a feature and not a help
 * step is reported by name rather than noticed by somebody re-reading the tour (FR-140).
 * The two feature 124 will fill are listed here already: they are regions of this view now,
 * and what they say is part of what the view says.
 */
export const FORECAST_REGIONS = [
  { id: 'indicator', label: 'why a run is warranted, and what one costs', element: '[data-region="indicator"]' },
  { id: 'volume', label: 'what a cell’s value was made from', element: '[data-region="volume"]' },
  { id: 'ahead', label: 'the spread ahead', element: '[data-region="ahead"]' },
  { id: 'timeline', label: 'the runs, in simulation time, labelled by cause', element: '[data-region="timeline"]' },
] as const;

/**
 * A short, stable fingerprint of a sentence, so two holds at one tick get two keys.
 *
 * Not a digest for any security purpose and not a claim of uniqueness — it is the smallest
 * thing that distinguishes two entries a reader can see are different, and it is stable
 * across mounts, which is the property an addressable entry needs.
 */
function hashOf(text: string): string {
  let hash = 0;
  for (let index = 0; index < text.length; index++) hash = (Math.imul(hash, 31) + text.charCodeAt(index)) | 0;
  return (hash >>> 0).toString(36);
}

/**
 * How a cause is said to a reader. Three causes — the scheduler declares them on the run
 * request — and a hold, which is not a cause but a decision, drawn as its own kind of entry
 * below. FR-32's four facts are four *decisions*, not four causes.
 */
const CAUSE_LABEL: Record<string, string> = {
  scheduled: 'scheduled',
  divergence: 'divergence-triggered',
  operator: 'reader-requested',
};

/** One entry on the timeline: a run, or a hold that produced no run. */
interface Entry {
  readonly key: string;
  readonly kind: 'run' | 'held';
  readonly tick: number;
  readonly simTime: string;
  readonly cause: string;
  /** For a run: the cost it announced, and whether it has published yet. */
  readonly costTicks?: number;
  /** Null where the configured kernel integrates nothing, which is not the same as one. */
  readonly subStepsPerStep?: number | null;
  readonly publishedAtTick?: number;
  readonly runId?: string;
  /** For a hold: how much validity must still decay before it is released. */
  readonly shortfallTicks?: number;
  readonly detail?: string;
  /** Why a run will never publish, where the runner said so. */
  readonly abandoned?: string;
}

/**
 * The instances the coverage store already holds, as timeline entries.
 *
 * A console opens after the run has been provisioned and pre-rolled, so every run the
 * situation began with is in the past and no announcement of it is coming. A timeline that
 * showed none of them would say "no run has been announced yet" about a system that has
 * published four, which is the display inventing a silence — the exact fault the Operator
 * tab's own head comment records being found by looking at the running page.
 *
 * **What is not claimed is as important as what is.** A holding says when it was published
 * and nothing about what asked for it: the cause lives in the run request, which happened
 * before anyone was listening and is not recoverable from the store. So these entries say
 * so, in those words, rather than guessing a cause or borrowing the commonest one. Nor do
 * they claim a cost: the cost of a run is what its own start announcement carried, and this
 * is a holding, not a run announcement.
 *
 * One fetch, on mount. Nothing after it: live runs arrive by announcement (FR-136).
 */
function entriesFromInventory(inventory: HoldingsInventory): Entry[] {
  return inventory.holdings
    // Separated from its uncertainty sibling by what the manifest DECLARES the holding is,
    // not by the shape of its id. The runner happens to name the spread `<run>-spread`, but
    // no master says so: `coverage-holding.schema.json`'s id pattern admits `spread-x`
    // equally, so a rename in the backend would have put every ensemble-spread field on
    // this timeline as a second run at the same tick — a display asserting a run nothing
    // performed. `composition.rule` is on the same object and is governed by a master.
    .filter((holding) => holding.era === 'instance' && holding.manifest.composition.rule !== 'ensemble-spread')
    .map((holding) => ({
      // Keyed as a run, because it is one. A holding published by a run carries the run's
      // own id, so the live announcement and the store's record of the same run must key
      // alike or an address written while the run was live stops resolving the moment the
      // panel remounts and the run has become history — which is every reload.
      key: `run:${holding.holding_id}`,
      kind: 'run' as const,
      tick: holding.published_at.tick,
      simTime: holding.published_at.sim_time,
      cause: 'before this console opened',
      runId: holding.holding_id,
      publishedAtTick: holding.published_at.tick,
    }));
}

export function ForecastPanel({ params }: PanelProps) {
  const { config, client, validator, address } = params;
  const [indicator, setIndicator] = useState<ForecastIndicator | undefined>();
  const [cost, setCost] = useState<RunCost | undefined>();
  const [features, setFeatures] = useState<ForecastFeatures | undefined>();
  const [analysis, setAnalysis] = useState<AnalysisPublished | undefined>();
  const [columnGrid, setColumnGrid] = useState<ColumnGrid | undefined>();
  const [entries, setEntries] = useState<readonly Entry[]>([]);
  const [selected, setSelected] = useState<string | undefined>(() => address.current());
  const [refused, setRefused] = useState(0);
  /** Causes heard, by run id, so a started run can be labelled with what asked for it. */
  const causesRef = useRef(new Map<string, string>());

  /**
   * A payload is drawn only if the master its topic declares accepts it. The mapping is the
   * shell's own `message_schemas` list, so this panel holds no second opinion about which
   * master governs which topic (Constitution IV).
   */
  const drawable = useCallback(
    (topic: string, payload: unknown): boolean => {
      const mapping = config.message_schemas.find((entry) => topicMatchesFilter(entry.filter, topic));
      const ok = mapping !== undefined && validator.validate(mapping.schema, payload).ok;
      // One counter, not a ref shadowing a state: the functional update is safe under
      // batching, which is the only thing the ref was there for.
      if (!ok) setRefused((count) => count + 1);
      return ok;
    },
    [config.message_schemas, validator],
  );

  useEffect(() => {
    // No clock subscription, deliberately. Everything this panel draws arrives on an
    // announcement, so a tick that announced nothing must change nothing here — and a
    // clock reading rendered in this panel would make that untestable as well as
    // duplicating the strip at the top of the shell.
    const stops: (() => void)[] = [];
    stops.push(
      client.subscribe(config.topics.forecast_indicator, (message) => {
        if (!drawable(message.topic, message.payload)) return;
        setIndicator(message.payload as ForecastIndicator);
      }),
    );
    stops.push(
      client.subscribe(config.topics.run_cost, (message) => {
        if (!drawable(message.topic, message.payload)) return;
        setCost(message.payload as RunCost);
      }),
    );
    stops.push(
      // The forecast's own product. Published on every run since feature 123 and read by
      // nothing until now: the message was validated against its master by a loop test and
      // then dropped, so what the run actually said had no surface at all.
      client.subscribe(config.topics.forecast_features, (message) => {
        if (!drawable(message.topic, message.payload)) return;
        setFeatures(message.payload as ForecastFeatures);
      }),
    );
    stops.push(
      // **A second chance at the grid, and only while there is not one.** It was read from
      // the inventory on mount and nowhere else, so a console that mounted while the store
      // was still empty — which a browser does, since the page loads before the pre-roll
      // finishes — never got one, and the centre region said "no analysis yet" for the rest
      // of the session however many analyses arrived. Measured that way in a built instance
      // before this: the chooser drew no squares at all.
      //
      // This is not a poll and cannot become one: it is driven by an announcement, and the
      // guard means it can fire at most once in the life of the panel.
      client.subscribe(config.topics.holdings, () => {
        if (!gridWantedRef.current) return;
        gridWantedRef.current = false;
        void (async () => {
          try {
            const response = await fetch(config.endpoints.holdings);
            if (!response.ok) return;
            const body: unknown = await response.json();
            if (!validator.validate('holdings-inventory', body).ok) return;
            const grid = columnGridOf((body as HoldingsInventory).holdings[0] as CoverageHolding | undefined);
            if (grid) setColumnGrid(grid);
            else gridWantedRef.current = true;
          } catch {
            gridWantedRef.current = true;
          }
        })();
      }),
    );
    stops.push(
      // Which analysis the centre region reads from — the *standing* declaration, not the
      // announcement. They carry the same message under the same master, and the difference
      // is what listens: the announcement is what the model runner starts a forecast on, so
      // a component repeating it repeats the work. This panel wants the fact, not the event.
      // Nothing is fetched here, and nothing is fetched until a reader picks a square.
      client.subscribe(config.topics.analysis_standing, (message) => {
        if (!drawable(message.topic, message.payload)) return;
        setAnalysis(message.payload as AnalysisPublished);
      }),
    );
    stops.push(
      client.subscribe(config.topics.run_request, (message) => {
        if (!drawable(message.topic, message.payload)) return;
        const request = message.payload as RunRequest;
        causesRef.current.set(request.run_id, request.cause);
      }),
    );
    stops.push(
      client.subscribe(config.topics.run_started, (message) => {
        if (!drawable(message.topic, message.payload)) return;
        const started = message.payload as RunStarted;
        setEntries((previous) => [
          ...previous,
          {
            key: `run:${started.run_id}`,
            kind: 'run',
            tick: started.tick,
            simTime: started.sim_time,
            cause: causesRef.current.get(started.run_id) ?? 'unlabelled',
            costTicks: started.cost_ticks,
            subStepsPerStep: started.sub_steps_per_step,
            runId: started.run_id,
          },
        ]);
      }),
    );
    stops.push(
      client.subscribe(config.topics.run_published, (message) => {
        if (!drawable(message.topic, message.payload)) return;
        const published = message.payload as RunPublished;
        setEntries((previous) =>
          previous.map((entry) =>
            entry.runId === published.run_id ? { ...entry, publishedAtTick: published.tick } : entry,
          ),
        );
      }),
    );
    stops.push(
      client.subscribe(config.topics.telemetry, (message) => {
        if (!drawable(message.topic, message.payload)) return;
        const report = message.payload as { kind?: string };
        // A run the runner gave up on. **The panel used to receive this and drop it**, so a
        // run stopped mid-cost read as still occupying its cost for the rest of the session — a
        // surface built to make an occupancy visible saying work is in progress that the
        // component owing it had already said would never finish, with the contradicting
        // message delivered and discarded.
        if (report.kind === 'run-failed') {
          const failed = message.payload as TelemetryRunFailed;
          setEntries((previous) =>
            previous.map((entry) => (entry.runId === failed.run_id ? { ...entry, abandoned: failed.detail } : entry)),
          );
          return;
        }
        if (report.kind !== 'scheduler-decision') return;
        const decision = message.payload as TelemetrySchedulerDecision;
        if (decision.decision !== 'held-for-cost') return;
        setEntries((previous) => [
          ...previous,
          {
            // Keyed by the tick and by **what the scheduler said**, not by position in the
            // list: a scheduled hold and a reader's prompt held at the same tick compute
            // the same shortfall from the same validity and the same cost, so neither the
            // tick nor the shortfall tells them apart — and `divergence_id` never can,
            // because a divergence is never held and it is always null here. An index
            // assigned at insertion would differ on every mount, which is what made a hold
            // unaddressable in the first place. The detail is the one field that differs.
            key: `held:${decision.tick}:${hashOf(decision.detail)}`,
            kind: 'held',
            tick: decision.tick,
            simTime: decision.sim_time,
            cause: 'held for cost',
            shortfallTicks: decision.shortfall_ticks ?? undefined,
            detail: decision.detail,
          },
        ]);
      }),
    );
    return () => {
      for (const stop of stops) stop();
    };
  }, [client, config.topics, config.endpoints.holdings, drawable, validator]);

  // Whether the centre region's grid is still unknown, read inside a subscription without
  // making the subscription depend on it — a dependency there would tear down and rebuild
  // every subscription the moment the grid arrived.
  const gridWantedRef = useRef(true);

  // The store's own inventory, once, on mount. Everything after it arrives on an
  // announcement; this is the history that had already happened when the console opened.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let body: unknown;
      try {
        const response = await fetch(config.endpoints.holdings);
        if (!response.ok) return;
        body = await response.json();
      } catch {
        // A history that could not be fetched is a history the panel does not draw. It says
        // nothing about it rather than showing an empty list as if it were the answer: the
        // timeline's own sentence already distinguishes 'nothing announced' from 'nothing
        // fetched' only when something arrives, so the honest move here is silence.
        return;
      }
      if (cancelled || !validator.validate('holdings-inventory', body).ok) return;
      const inventory = body as HoldingsInventory;
      // The grid the centre region's chooser spans, read off a holding's own manifest rather
      // than from configuration: a chooser laid over a domain the store does not hold would
      // offer squares that resolve to nothing. Any holding will do — every era shares the
      // one grid — so the first is taken, and its absence leaves the chooser undrawn.
      const grid = columnGridOf(inventory.holdings[0] as CoverageHolding | undefined);
      if (grid) {
        setColumnGrid(grid);
        gridWantedRef.current = false;
      }
      const seeded = entriesFromInventory(inventory);
      setEntries((previous) => {
        const known = new Set(previous.map((entry) => entry.runId));
        return [...seeded.filter((entry) => !known.has(entry.runId)), ...previous];
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [config.endpoints.holdings, validator]);

  // The address names a run, so a link opens this view at the run being discussed
  // (ADR-0032). The remainder is this panel's vocabulary and the shell never parses it.
  useEffect(() => address.onChange((rest) => setSelected(rest)), [address]);
  const select = useCallback(
    (key: string | undefined) => {
      setSelected(key);
      address.write(key);
    },
    [address],
  );

  const ordered = useMemo(() => [...entries].sort((a, b) => a.tick - b.tick), [entries]);
  const chosen = ordered.find((entry) => entry.key === selected);

  return (
    <div className="panel forecast-panel">
      <header className="forecast-header">
        <h2 className="forecast-title">Forecast</h2>
        <p className="forecast-disclosure">
          The physics is a teaching approximation and the data is synthetic. The forward step is a shallow two-layer
          advection–diffusion scheme standing in for the real thing — NEMO, ROMS, MITgcm, PDAF, DART, OceanVar, OpenDA —
          and claims no kinship with any of them beyond structure. What a run costs here is a declared rate, not a
          measurement.
        </p>
        <HelpButton tour={forecastTour()} />
      </header>

      <div className="forecast-regions">
        <section className="forecast-region" data-region="indicator" aria-label="why a run is warranted, and what one costs">
          <h3>Why now</h3>
          {indicator === undefined ? (
            // FR-119: the absence is stated and no gauge is drawn. An empty gauge would say
            // "the figure is zero", which is a different claim from "nobody has published one".
            <p className="not-landed" data-testid="indicator-absent">
              nothing has been published on <code>{config.topics.forecast_indicator}</code>, the declared indicator
              topic. The indicator that re-forecasting is becoming valuable is environmental science and belongs to the
              environmental-indicators workstream; this is the socket it publishes into, and it is empty rather than
              zero.
            </p>
          ) : (
            <Gauge indicator={indicator} />
          )}
          <p className="forecast-cost" data-testid="run-cost">
            {cost === undefined ? (
              <>the model runner has not stated what a run costs yet; no other component may state it</>
            ) : (
              <>
                A run costs <strong>{cost.cost_ticks}</strong> tick{cost.cost_ticks === 1 ? '' : 's'} of simulation
                time — <span className="forecast-basis">{cost.basis}</span>. Stated by <code>{cost.component}</code>,
                which is the component that will spend it.
              </>
            )}
          </p>
        </section>

        <section className="forecast-region" data-region="volume" aria-label="what a cell’s value was made from">
          <h3>What it is made from</h3>
          {/* The stub this replaced named the whole region as feature 124's, and then this
              comment said the per-source rays were still blocked. Both have been overtaken: the
              analyst publishes the contributions, the rays are drawn from them, and what is
              still to come — the volume the plan is a section through — is said inside the
              region, beneath the reading, where a reader meets it after the thing that works. */}
          <ColumnProvenance
            analysis={analysis}
            grid={columnGrid}
            edrPrefix={config.endpoints.edr}
            contributionsPrefix={config.endpoints.contributions}
          />
        </section>

        <section className="forecast-region" data-region="ahead" aria-label="the spread ahead">
          <h3>What next</h3>
          <FeatureTracks features={features} />
          <p className="not-landed">
            The ensemble spread ahead, along the planned route, is <strong>feature 124</strong>, and is not built. The
            spread itself is published and the Map draws it today; what is missing is this region, not the figure.
          </p>
        </section>
      </div>

      <section className="forecast-region" data-region="timeline" aria-label="the runs, in simulation time, labelled by cause">
        <h3>Runs, in simulation time</h3>
        {ordered.length === 0 ? (
          <p className="not-landed">
            no run has been announced yet. Nothing here is drawn from a configured expectation: this list is what
            arrived.
          </p>
        ) : (
          <ol className="forecast-timeline">
            {ordered.map((entry) => (
              <li key={entry.key}>
                <button
                  type="button"
                  className={`forecast-run forecast-run-${entry.kind}${entry.key === selected ? ' is-selected' : ''}`}
                  aria-pressed={entry.key === selected}
                  onClick={() => select(entry.key === selected ? undefined : entry.key)}
                >
                  <span className="forecast-run-tick">tick {entry.tick}</span>
                  {/* The mark is a shape as well as a colour: colour alone would not
                      survive greyscale, and the cause is the fact this list is for. */}
                  <span className={`forecast-run-mark forecast-mark-${entry.kind}`} aria-hidden="true">
                    {entry.kind === 'held' ? '⌛' : '▶'}
                  </span>
                  <span className="forecast-run-cause">{CAUSE_LABEL[entry.cause] ?? entry.cause}</span>
                  <span className="forecast-run-detail">
                    {entry.kind === 'held'
                      ? `${entry.shortfallTicks ?? 0} tick(s) of validity still to decay`
                      : entry.abandoned !== undefined
                        ? 'never published: the runner gave it up'
                        : entry.costTicks === undefined
                        ? 'in the store; what asked for it is not recoverable from a holding'
                        : entry.publishedAtTick === undefined
                          ? `occupying ${entry.costTicks} tick(s)`
                          : `published at tick ${entry.publishedAtTick}, ${
                              entry.publishedAtTick - entry.tick
                            } tick(s) after it began`}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
        {chosen && (
          <p className="forecast-selected" data-testid="forecast-selected">
            {chosen.kind === 'held' ? (
              <>{chosen.detail}</>
            ) : (
              chosen.costTicks === undefined ? (
              <>
                Run <code>{chosen.runId}</code> was published at {displayInstant(chosen.simTime)}, before this console
                opened. It is in the store and it can be queried; what asked for it, and what it cost, were said on the
                wire at the time and are not recoverable from the holding.
              </>
            ) : (
              <>
                Run <code>{chosen.runId}</code>, announced at {displayInstant(chosen.simTime)}. It declared a cost of{' '}
                {chosen.costTicks} tick(s), and{' '}
                {chosen.subStepsPerStep === null || chosen.subStepsPerStep === undefined
                  ? 'the kernel that ran integrates nothing, so it reported no sub-steps at all — a different answer from one'
                  : `the grid it was handed required ${chosen.subStepsPerStep} integration sub-step(s) per forecast step`}
                . A declared figure and a reported one, and they are not the same kind of claim.
              </>
            )
            )}
          </p>
        )}
        {refused > 0 && (
          <p className="forecast-refused">
            {refused} message(s) were refused by their masters and are not drawn. Counted rather than discarded: a
            display quietly dropping traffic is the other way to lie.
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * The gauge: a vertical bar with the threshold marked across it.
 *
 * Vertical because FR-118 asks for one, and because the cost sits beneath it in the same
 * frame — need above, cost below, read together.
 *
 * The span is twice the threshold, so the threshold mark sits at the middle of the bar and
 * a reader learns one position instead of re-reading a scale — **until the figure passes
 * twice the threshold**, when the span becomes the figure and the mark slides down. That is
 * the alarming case, and it is the case where a fixed scale would have nothing left to
 * show: a bar pinned at full for every value above 2.4 m/s says the same thing at three as
 * at thirty. The mark moving is the price of the bar going on meaning something, and it is
 * why both numbers are printed beside it — which is also what makes the region legible in
 * greyscale.
 */
function Gauge({ indicator }: { indicator: ForecastIndicator }) {
  const span = Math.max(indicator.threshold * 2, Math.abs(indicator.value), 1e-9);
  const fill = Math.min(100, (Math.abs(indicator.value) / span) * 100);
  const mark = Math.min(100, (indicator.threshold / span) * 100);
  const breaching = Math.abs(indicator.value) > indicator.threshold;
  return (
    <div className="forecast-gauge" data-testid="indicator-gauge">
      <div
        className="forecast-gauge-bar"
        role="meter"
        aria-valuenow={indicator.value}
        aria-valuemin={0}
        aria-valuemax={span}
        aria-label={`${indicator.label}: ${indicator.value.toFixed(2)} ${indicator.unit}, threshold ${indicator.threshold} ${indicator.unit}`}
      >
        <div className={`forecast-gauge-fill${breaching ? ' is-breaching' : ''}`} style={{ height: `${fill}%` }} />
        <div className="forecast-gauge-threshold" style={{ bottom: `${mark}%` }} />
      </div>
      <div className="forecast-gauge-legend">
        <p className="forecast-gauge-value">
          {indicator.value.toFixed(2)} {indicator.unit}
          {breaching ? ' — past the threshold' : ''}
        </p>
        <p className="forecast-gauge-threshold-value">
          threshold {indicator.threshold} {indicator.unit}, streak {indicator.streak.count} of {indicator.streak.of}
        </p>
        <p className="forecast-gauge-name">
          showing <strong>{indicator.label}</strong>, published by <code>{indicator.component}</code> as{' '}
          <code>{indicator.indicator}</code>
        </p>
      </div>
    </div>
  );
}
