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
import { ColumnProvenance, columnGridOf, type ColumnGrid, type StandingAnalysis } from './ColumnProvenance.js';
import './forecast.css';

/**
 * The regions this surface offers, on disk, so a region gaining a feature and not a help
 * step is reported by name rather than noticed by somebody re-reading the tour (FR-140).
 * The two feature 124 will fill are listed here already: they are regions of this view now,
 * and what they say is part of what the view says.
 */
/** How many failed inventory fetches the depth axis is retried over before the region gives up. */
export const GRID_ATTEMPTS = 3;

/**
 * What one attempt at the depth axis costs, by what came back.
 *
 * A function rather than three `+= 1`s in an effect, because the *policy* is the thing that was
 * wrong twice and neither version could be reached by a test: the panel asks for the axis only
 * when a new analysis cycle lands, and on the shipped configuration that is rarer than the window
 * a reasonable test can drive.
 *
 * - `'answered'` — the axis is in hand. The allowance resets: a seam that answers once is not the
 *   seam the allowance is for.
 * - `'absent'` — the inventory answered, and honestly, and does not carry this cycle's holding
 *   yet. **Spends nothing.** It used to spend one, and enough of those in a row silenced the
 *   region for the life of the panel however many later cycles would have answered — which is the
 *   fault the deleted holdings subscription existed against, in a smaller shape.
 * - `'refused'` — a non-2xx, a body that fails its master, or a throw. This is what the allowance
 *   is for, and the only thing that spends it.
 *
 * A *cancelled* attempt is not an outcome at all and is deliberately absent from this list. React
 * runs the previous effect's cleanup before the next body, so a restatement arriving mid-fetch
 * discards that result — counting the attempt before the request made that cost one, and three
 * fast restatements then disabled the region. A restatement is 60 ticks, which is about 60 ms of
 * real time at the configured `max_rate`, and `capture:forecast` drives at exactly that right
 * after a breakpoint crossing has remounted the panel.
 */
export function spendAttempt(spent: number, outcome: 'answered' | 'absent' | 'refused'): number {
  if (outcome === 'answered') return 0;
  return outcome === 'refused' ? spent + 1 : spent;
}

/**
 * Whether two depth axes are the same axis, so the region can keep the object it already has.
 *
 * By value, because the grid is rebuilt from the holding's manifest on every cycle and a fresh
 * object literal is a fresh dependency for anything keyed on it.
 *
 * **Exported for the test that walks `ColumnGrid`'s own keys.** Hand-written field equality is
 * complete only against the shape it was written for: it names five members and `ColumnGrid` has
 * five, and nothing would fail if a sixth arrived. The failure would be silent and would look
 * like a fix — either the duplicate full-grid area query per cycle coming back, or a stale grid
 * held across a genuine axis change — so the test perturbs every key the type actually carries
 * rather than the five this function happens to know about.
 */
export function sameGrid(standing: ColumnGrid | undefined, fresh: ColumnGrid): boolean {
  if (!standing) return false;
  return (
    standing.depthsM.length === fresh.depthsM.length &&
    standing.depthsM.every((depth, index) => depth === fresh.depthsM[index]) &&
    standing.minimumLongitude === fresh.minimumLongitude &&
    standing.maximumLongitude === fresh.maximumLongitude &&
    standing.minimumLatitude === fresh.minimumLatitude &&
    standing.maximumLatitude === fresh.maximumLatitude
  );
}

export const FORECAST_REGIONS = [
  { id: 'indicator', label: 'why a run is warranted, and what one costs', element: '[data-region="indicator"]' },
  { id: 'volume', label: 'what a cell’s value was made from', element: '[data-region="volume"]' },
  { id: 'ahead', label: 'the spread ahead', element: '[data-region="ahead"]' },
  { id: 'timeline', label: 'the runs, in simulation time, labelled by cause', element: '[data-region="timeline"]' },
] as const;


/**
 * The depth axis the centre region walks, taken from the **analysis** the region is reading and
 * not from whichever holding the inventory happens to list first.
 *
 * **"Every era shares the one grid" is false, and the depth axis is where.** The shipped
 * configuration authors the archive over four levels and the now-cast, the departure brief and
 * every analysis over six (`config.env_generator`), so the first holding in the inventory — the
 * archive — offered 0, 333, 667 and 1000 m for a column whose analysis is filed at 0, 200, 400,
 * 600, 800 and 1000. While the region drew four aggregate shares that was wrong but survivable:
 * each depth was queried by value and EDR snapped it to the nearest level, so a reader saw the
 * right numbers under a rounded label. Feature 124 made the row's position an *index into
 * another document*, and it stopped being survivable: the row labelled 333 m carried the 400 m
 * level's background against the 200 m level's contributions, and the analysis's 800 m level was
 * never shown at all.
 *
 * So the axis comes from the holding the analysis names. Where that holding is not in the
 * inventory yet the chooser stays undrawn, which is the honest state — a chooser over the wrong
 * axis is worse than no chooser.
 */
function gridForAnalysis(inventory: HoldingsInventory, analysis: StandingAnalysis | undefined): ColumnGrid | undefined {
  if (!analysis) return undefined;
  const named = inventory.holdings.find((holding) => holding.holding_id === analysis.collections.analysis);
  return columnGridOf(named as CoverageHolding | undefined);
}

/**
 * The analysis this console should read, taken from the store's own inventory, for a console
 * that was not listening when the last one was published.
 *
 * **The gap this closes, which a reader met as a region that never filled.** The centre region
 * reads `analysis_standing`, and the analyst publishes that by restating what it holds *in
 * memory* — `restateLastAnalysis` returns immediately when it has nothing. A start condition
 * restores the coverage store and not the analyst's memory, so on a snapshot-seeded visit the
 * analyst has no standing analysis to restate: the store holds the pre-roll's analyses, the query
 * layer will serve them, and the region says "no analysis has been announced yet" for the whole
 * visit — until a *new* analysis happens, which needs a breach or the cadence floor. Reported
 * from a running instance sitting at that sentence with three analyses in the store.
 *
 * It is the fault feature 125 was written for, one component further on. `backend/lib/standing-run.ts`
 * names the four components that "hold nothing but what it told them" and lists the analyst among
 * them; the scheduler, telemetry, the model runner and the offload packager each adopt from the
 * store now, and the analyst does not — its file carries no reference to that module.
 *
 * **Read here rather than announced there, and that is the honest half of the fix.** An
 * `AnalysisPublished` carries `observations` — how many were assimilated, how many clamped, the
 * worst displacement — which are facts about a cycle that ran and are on no descriptor. An
 * analyst reconstructing its own announcement would have to invent them, which is exactly the
 * thing ADR-0041 forbids: a snapshot source composing an announcement no component ever made. The
 * region does not need them. It needs three collection names, so three collection names are what
 * this recovers, and the surface says it read them rather than heard them.
 *
 * The sibling collections are required to be present, not merely named: the ids follow the
 * analyst's own convention (`spreadHoldingIdFor` reads the run's spread the same way), and a base
 * holding whose provenance or contributions has not landed means the store is mid-publication
 * rather than standing on something — the rule `standingPair` applies to a run.
 */
export function standingAnalysisIn(inventory: HoldingsInventory): StandingAnalysis | undefined {
  const held = new Set(inventory.holdings.map((holding) => holding.holding_id));
  let best: { id: string; tick: number } | undefined;
  for (const holding of inventory.holdings) {
    if (holding.era !== 'analysis') continue;
    // The base holding of a cycle, not one of its three siblings.
    const id = holding.holding_id;
    if (/-(error|provenance|contributions)$/.test(id)) continue;
    if (!held.has(`${id}-provenance`) || !held.has(`${id}-contributions`)) continue;
    if (!best || holding.published_at.tick > best.tick) best = { id, tick: holding.published_at.tick };
  }
  if (!best) return undefined;
  return {
    collections: { analysis: best.id, provenance: `${best.id}-provenance`, contributions: `${best.id}-contributions` },
    heard: false,
  };
}

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
  const [announced, setAnnounced] = useState<AnalysisPublished | undefined>();
  /**
   * The standing analysis read off the store's inventory, for a console that heard none.
   *
   * Asked for **once**, when this panel mounts without an announcement, and never again: an
   * analysis that lands later arrives on the topic, because anything that produces one announces
   * it. So this is not a poll and cannot become one — there is no cadence here to make it a fetch
   * per tick, which is the sentence `ColumnProvenance`'s own header has to stay true to.
   */
  const [adopted, setAdopted] = useState<StandingAnalysis | undefined>();

  /**
   * What the region reads: what this console was told, or failing that what the store says
   * stands. An announcement always wins — it is the current cycle, and the adopted one is
   * whatever was last published before anyone was listening.
   */
  const analysis: StandingAnalysis | undefined = useMemo(
    () => (announced ? { collections: announced.collections, heard: true } : adopted),
    [announced, adopted],
  );
  /**
   * Which analysis the depth axis in hand was taken from, so it is fetched once per cycle and a
   * standing restatement — which carries the same collection names — asks for nothing.
   */
  const gridForRef = useRef<string | undefined>(undefined);
  /**
   * How many times the depth axis has been asked for and not got. The allowance is small because
   * the thing it bounds is a retry on the analyst's restatement cadence, not a user action.
   */
  const attemptsRef = useRef(0);
  /** Whether the store has been asked what stands; see the adoption effect below. */
  const askedStoreRef = useRef(false);
  /** Which analysis the axis has already been asked for and honestly not got. */
  const askedForRef = useRef<string | undefined>(undefined);
  /** True once the axis has been asked for its allowance of times and not got. */
  const [gridGaveUp, setGridGaveUp] = useState(false);
  const [columnGrid, setColumnGrid] = useState<ColumnGrid | undefined>();
  /**
   * The analysis collection `columnGrid` was read for, as *state* beside the ref that bounds the
   * asking.
   *
   * **The ref cannot answer the question the surface asks.** A ref does not re-render, and the
   * question — are the depths on screen this cycle's? — is a fact the region has to state. It was
   * being answered with `gridGaveUp`, which is a narrower predicate: that covers the route where
   * the inventory *refuses* three times, and not the route where it answers 200 without carrying
   * this cycle's holding, which spends nothing, is asked once per cycle by design, and leaves the
   * previous cycle's axis standing exactly the same way. The second route is the one the shipped
   * configuration actually produces. Comparing the names covers both and needs no counter.
   */
  const [gridFor, setGridFor] = useState<string | undefined>(undefined);
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
      // Which analysis the centre region reads from — the *standing* declaration, not the
      // announcement. They carry the same message under the same master, and the difference
      // is what listens: the announcement is what the model runner starts a forecast on, so
      // a component repeating it repeats the work. This panel wants the fact, not the event.
      // Nothing is fetched here, and nothing is fetched until a reader picks a square.
      client.subscribe(config.topics.analysis_standing, (message) => {
        if (!drawable(message.topic, message.payload)) return;
        setAnnounced(message.payload as AnalysisPublished);
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
    // `config.endpoints.holdings` is gone from this list: the subscription that fetched the
    // inventory on a holdings announcement was removed, and nothing in this effect has read that
    // endpoint since. A dependency here tears down and rebuilds every subscription, which is why
    // the list is worth keeping honest even where the value is stable.
  }, [client, config.topics, drawable, validator]);

  /**
   * The depth axis, fetched once for each analysis cycle the panel comes to draw. The only
   * place it is fetched.
   *
   * Driven by the announcement and not by a timer, and it is `gridForRef` that makes that true
   * rather than the dependency list. The docstring here used to say "the dependency is the
   * analysis's own collection name, so a standing restatement changes nothing" — the dependency
   * is the analysis *object*, whose identity changes on every restatement, and what actually
   * stops the re-fetch is the guard on the line below. The distinction is not academic: on a
   * fetch that fails, the ref is never set and every restatement asks again, which is a retry
   * and is what should happen, but it is a retry rather than the nothing the old sentence
   * claimed.
   *
   * Keyed on the *analysis holding* rather than taking whatever the inventory lists first,
   * because the eras do not share a depth axis and a row's depth is joined against the
   * contributions document (`gridForAnalysis`).
   *
   * A cycle whose axis cannot be read leaves the *previous* cycle's grid standing rather than
   * clearing it: the chooser then offers depths the new analysis may not be filed at, which
   * `levelAtDepth` refuses row by row and the profile states. Clearing it would take the whole
   * region away over one failed inventory fetch, which is the worse of the two.
   */
  /**
   * Ask the store, once, what analysis stands — for a console that heard none.
   *
   * See `standingAnalysisIn` for why this exists: the analyst restates only what it holds in
   * memory, a start condition restores the store and not that memory, and a reader who opens the
   * console after a snapshot-seeded pre-roll therefore meets a region that says nothing has been
   * announced while the store holds several analyses the query layer will serve.
   *
   * **Once, and only where nothing was heard.** The guard is `announced`, not `analysis` — with
   * `analysis` this would re-ask the moment it adopted one, having just satisfied its own
   * condition. Nothing here is clocked: an analysis published later is announced, and the
   * subscription above supersedes whatever this found.
   */
  useEffect(() => {
    if (announced || adopted || askedStoreRef.current) return;
    askedStoreRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(config.endpoints.holdings);
        if (!response.ok || cancelled) return;
        const body: unknown = await response.json();
        if (cancelled || !validator.validate('holdings-inventory', body).ok) return;
        const standing = standingAnalysisIn(body as HoldingsInventory);
        if (standing) setAdopted(standing);
      } catch {
        // Nothing to say and nothing to retry: the region's existing sentence — that no analysis
        // has been announced — is then exactly true of this console, and the next cycle announces.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [announced, adopted, config.endpoints.holdings, validator]);

  useEffect(() => {
    const named = analysis?.collections.analysis;
    if (!named || gridForRef.current === named) return;
    // **Bounded, because a retry clocked by restatements is a fetch on a cadence.** On a failed
    // inventory fetch `gridForRef` is never set, so the next standing restatement asks again —
    // which is right once or twice and is, with the endpoint down, one fetch every
    // `restate_every_ticks` for the life of the tab, unbacked-off and invisible. The region's own
    // header two files away says "not on a tick, not on an announcement, not on a timer", and the
    // sibling slab effect was corrected against that sentence in this same series. After the
    // allowance the region stops asking and says so — `gaveUp`, below, rather than leaving the
    // "the store had none when this console asked" sentence standing, which describes a state it
    // is no longer in.
    // **Set where the allowance is spent, not on the next entry.** It was set here — on the
    // *following* effect run — so between the last failure and the next restatement the region
    // went on saying "the store had none when this console asked", describing a wait it had
    // already abandoned. With the clock pinned, which is every capture proof and any harness an
    // operator has stopped, no next restatement arrives and that sentence is permanent. Two
    // representations of one fact, updated at different moments.
    if (attemptsRef.current >= GRID_ATTEMPTS) return;
    // Asked once for this analysis, whatever the answer was: see the `!grid` branch below.
    if (askedForRef.current === named) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(config.endpoints.holdings);
        // **Checked here, not after the body is read.** `spendAttempt`'s docstring says a
        // cancelled attempt is not an outcome, and two of the three spend sites did not honour
        // it: a refusal or a throw on a request whose effect had already been torn down spent one
        // and moved the give-up flag. Two overlapping requests against a refusing endpoint —
        // which a restatement every 60 ticks makes ordinary, and which the narrow capture pass
        // drives deliberately — burned two of three allowances in one restatement interval.
        if (cancelled) return;
        // **The attempt is spent where the answer was bad, and nowhere else.** It used to be
        // counted *before* the request, which made a cancellation cost one: React runs the
        // previous effect's cleanup before the next body, so a restatement arriving while a fetch
        // was in flight discarded that fetch's result and then spent another attempt on the
        // retry. Three fast restatements — a restatement is 60 ticks, which is ~60 ms of real
        // time at the configured `max_rate`, and `capture:forecast` drives at exactly that right
        // after a breakpoint crossing has remounted the panel — and the region was dead for the
        // session. Over a network seam the round trip is bounded by nothing at all, which is the
        // case Principle XI says no code path may assume away.
        if (!response.ok) {
          attemptsRef.current = spendAttempt(attemptsRef.current, 'refused');
          setGridGaveUp(attemptsRef.current >= GRID_ATTEMPTS);
          return;
        }
        const body: unknown = await response.json();
        if (cancelled) return;
        if (!validator.validate('holdings-inventory', body).ok) {
          attemptsRef.current = spendAttempt(attemptsRef.current, 'refused');
          setGridGaveUp(attemptsRef.current >= GRID_ATTEMPTS);
          return;
        }
        const grid = gridForAnalysis(body as HoldingsInventory, analysis);
        // **Given back here, and the comment that said so used to be the only thing doing it.** A
        // cycle whose axis the inventory does not carry *yet* is not a failed fetch — the request
        // answered, and answered honestly — so it must not spend the allowance. It did: the
        // attempt was counted before the request and never returned on this path, so three such
        // cycles in a row silenced the region for the life of the panel, however many later
        // analyses would have answered. That is the fault the deleted holdings subscription
        // existed against, in a smaller shape.
        // **An honest "not there" is answered once per cycle, not once per restatement.** It
        // spends none of the allowance — the allowance is for a seam that will not answer at all —
        // but it must not be asked again for the *same* analysis either: `analysis` is a fresh
        // object on every restatement, so "spends nothing" alone meant one full inventory fetch
        // every `restate_every_ticks`, unbacked-off, for the life of the tab, two files from a
        // header that says "not on a tick, not on an announcement, not on a timer". Recording the
        // name here bounds it to one ask per cycle, and the next cycle's own name asks again.
        if (!grid) {
          attemptsRef.current = spendAttempt(attemptsRef.current, 'absent');
          askedForRef.current = named;
          return;
        }
        gridForRef.current = named;
        setGridFor(named);
        // Through the policy, not beside it. The reset was written inline, so `spendAttempt`'s
        // `'answered'` arm had no production caller and the test asserting it held a path the
        // panel never took — in a function extracted *because* the policy could not be reached
        // through the panel.
        attemptsRef.current = spendAttempt(attemptsRef.current, 'answered');
        setGridGaveUp(false);
        // **The same object where the axis is the same, because the identity is a dependency.**
        // `columnGridOf` returns a fresh literal, and `ColumnProvenance`'s slab effect depends on
        // it — so a new cycle fired the area query once on the analysis and again, one round trip
        // later, on this object's new identity: two byte-identical full-grid queries a cycle, one
        // discarded, under a header saying "never twice for one cycle". A cycle that spans the
        // same depths hands back the object already in hand.
        setColumnGrid((standing) => (sameGrid(standing, grid) ? standing : grid));
      } catch {
        // Left for the next restatement to ask again, within the allowance above; a chooser over
        // no axis is drawn as absent. Cancelled reads spend nothing, as above.
        if (cancelled) return;
        attemptsRef.current = spendAttempt(attemptsRef.current, 'refused');
        setGridGaveUp(attemptsRef.current >= GRID_ATTEMPTS);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [analysis, config.endpoints.holdings, validator]);

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
      // The depth axis is *not* read here. It was, and so was a holdings-announcement
      // subscription, and so is the per-analysis effect below — three paths and two refs
      // answering one question, able to disagree about it: the announcement path set the grid
      // without setting `gridForRef`, so the effect then re-fetched the whole inventory for a
      // cycle whose axis was already in hand. The axis belongs to an analysis, the effect below
      // is keyed on exactly that, and the analyst publishes the holdings before it announces the
      // analysis that names them — so by the time there is an analysis to take an axis from, the
      // inventory carrying it is already in the store. This effect seeds the history and nothing
      // else.
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
            validator={validator}
            gridGaveUp={gridGaveUp}
            // The axis on screen is not this cycle's: it was read for an earlier analysis and
            // every route that could replace it has failed or not answered. Computed from the
            // two names rather than from the retry counter, which is a per-tab total and cannot
            // say anything about *this* cycle (three refusals spread over three cycles satisfy
            // it while this cycle was asked once).
            axisIsStale={analysis !== undefined && gridFor !== undefined && gridFor !== analysis.collections.analysis}
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
