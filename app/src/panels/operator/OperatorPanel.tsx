/**
 * The Operator tab (FR-35, FR-36, FR-57 to FR-59): the machinery interrogated, drawn
 * as the picture the SRD has always said the architecture is — *a flow chart with a
 * loop in it*. A table has no cycle in it, and consequence should be visible where the
 * cause was applied: stop the platform here and the sensors' own sentence changes two
 * nodes along.
 *
 * What is drawn is derived, never authored (graph.ts): nodes are the declared
 * components, topic edges come from the topology master, port edges are declared
 * beside them because they carry no broker traffic. A gate fails the build when the
 * picture and the wiring disagree.
 *
 * Illumination is heartbeats and nothing else, on the System tab's rule. Every figure
 * says which of three kinds it is — declared, reported, observed — and a figure may
 * not change kind between states.
 *
 * The table has not retired: it is the list view, fed from the same graph, with the
 * same controls and the same refusals. An SVG graph is not a keyboard surface and not
 * a screen-reader surface, and neither view is the other's fallback.
 *
 * The tab is a control plane as well as a picture (feature 114). Everything a reader
 * can do to the running system is done at the node it acts on: the platform's demand
 * in the platform's drawer, the monitor's threshold beside the streak that fills
 * against it, the prompt for a forecast run beside the scheduler's own record of what
 * it decided about the last one. What is offered is not decided here — it is the
 * operator surface's controls statement, fetched like everything else, so the panel
 * cannot offer a control the surface would refuse or draw a bound the surface does not
 * hold (Constitution IV). And every control says what it did rather than what
 * happened: a tuning is published, a prompt may be declined, and the value in force is
 * whatever the component reports about itself.
 *
 * The telemetry the tab has always carried is not lost in the redraw: the skill
 * sentence, the residual statistics for the scenario and for each sampled region of
 * the configured grid, throughput per simulation second, and end-to-end latency in
 * simulation seconds (issue #61) are in the telemetry component's own drawer, which is
 * where a reader now goes to ask that component what it has to say.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { PanelProps } from '../../shell/registry.js';
import { useIsNarrow } from '../../shell/viewport.js';
import { Disclosure } from '../../shell/Disclosure.js';
import type { PanelParams } from '../../shell/Shell.js';
import type {
  Heartbeat,
  HoldingsInventory,
  Observation,
  OperatorComponents,
  OperatorControls,
  PlatformState,
  Telemetry,
  TelemetryReport,
  TelemetryResidualSampleReport,
  TelemetrySchedulerDecision,
} from '../../generated/types.js';
import { topology } from '../../generated/topology.js';
import { topicMatchesFilter } from '../messages/topic-match.js';
import { displayInstant } from '../../shell/display.js';
import { BANDS, buildFlow, type Band, type FlowNode } from './graph.js';
import { METRICS, NARROW_METRICS } from './layout.js';
import { PulseBoard, topicsWithSeveralSenders, type PulseKind } from './pulse.js';
import { Series } from './series.js';
import { FACES, type FaceContext } from './faces.js';
import { FlowCanvas } from './FlowCanvas.js';
import { DemandControl } from './DemandControl.js';
import { HelpButton } from '../../shell/walkthrough/HelpButton.js';
import { componentTour } from '../../shell/walkthrough/tour.js';
import { TuningControl } from './TuningControl.js';
import { EventControl } from './EventControl.js';
import './operator.css';

interface Heard {
  heartbeat: Heartbeat;
  heardAtHostMs: number;
}

/**
 * What a component says about itself, and the two different silences. A heartbeat with
 * no detail line is not an absent heartbeat: the clock, the broker and the release gate
 * publish none, and reading them as never heard was the display inventing a silence
 * that had not happened. Found by looking at the running page, not by a test.
 */
function detailOf(entry: Heard | undefined): string {
  if (!entry) return 'no heartbeat has ever arrived';
  return entry.heartbeat.detail ?? 'beating, and saying nothing beyond that';
}

const BAND_CAPTION: Record<Band, string> = {
  loop: 'the loop — assimilation',
  path: 'the path — sensing to serving',
  downstream: 'deciding, advising, leaving',
  plane: 'the plane the flow runs on',
};

export function OperatorPanel({ params }: PanelProps) {
  const { config, client, validator } = params;
  const flow = useMemo(() => buildFlow(config, topology), [config]);
  const [components, setComponents] = useState<OperatorComponents | undefined>();
  const [report, setReport] = useState<TelemetryReport | undefined>();
  const [controls, setControls] = useState<OperatorControls | undefined>();
  const [decision, setDecision] = useState<TelemetrySchedulerDecision | undefined>();
  const [platformState, setPlatformState] = useState<PlatformState | undefined>();
  const [breach, setBreach] = useState<TelemetryResidualSampleReport['breach']>();
  const [refusal, setRefusal] = useState<string | undefined>();
  const [selected, setSelected] = useState<string | undefined>();
  const [asList, setAsList] = useState(false);
  const [heard, setHeard] = useState<ReadonlyMap<string, Heard>>(new Map());
  const [clock, setClock] = useState<{ tick: number | null; rate: number | undefined }>({
    tick: null,
    rate: undefined,
  });
  /**
   * The wires' lights (pulse.ts). Built from the same derived edge set the canvas
   * draws, and held across renders: it owns DOM the panel does not re-render.
   */
  const pulses = useMemo(() => new PulseBoard(flow.edges), [flow]);
  /**
   * Which kind of light traffic gets, as the broker subscription sees it. A ref rather
   * than the state it follows, because the subscription is established once and a rate
   * change must not tear every subscription down and build it again.
   */
  const pulseKindRef = useRef<PulseKind>('fading');
  const holdingSizesRef = useRef<number[]>([]);
  /**
   * Ocean datastreams the shell has genuinely heard, in arrival order. Kept rather
   * than typed into the sensors' face: a hardcoded list drew the pressure instrument
   * as silent while it had been publishing all along.
   */
  const oceanStreamsRef = useRef<string[]>([]);
  const [, setSweep] = useState(0);

  // The rolling windows. Held in a ref rather than in state: they are drawn from, not
  // rendered by identity, and a new Map per sample would re-render the whole graph on
  // every message that crosses the broker.
  const seriesRef = useRef(new Map<string, Series>());
  const countedRef = useRef(new Map<string, number>());
  const series = useCallback(
    (key: string) => {
      const existing = seriesRef.current.get(key);
      if (existing) return existing;
      const created = new Series(config.flow.series_samples);
      seriesRef.current.set(key, created);
      return created;
    },
    [config.flow.series_samples],
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const narrow = useIsNarrow(rootRef);
  /** Messages this panel refused against their master and did not draw from. */
  const refusedRef = useRef(0);

  /**
   * Whether a received message may be drawn from at all.
   *
   * The Messages tab has validated every crossing against its declared master since
   * E4; this panel drew from raw traffic, and a message that failed its master went
   * straight into a face. The first deliberately malformed sample — published by the
   * sensors on request, exactly as feature 114 asks them to — put a string where a
   * result should be, and `toFixed` took the whole flow chart down with it. A picture
   * of the machinery that cannot survive the machinery being wrong is not much of a
   * picture, and only a running page could have said so.
   *
   * A refusal here is not silence: what was refused is counted and stated below the
   * chart, because a display quietly discarding traffic is the other way to lie.
   */
  const drawable = useCallback(
    (topic: string, payload: unknown): boolean => {
      const mapping = config.message_schemas.find((entry) => topicMatchesFilter(entry.filter, topic));
      const ok = mapping !== undefined && validator.validate(mapping.schema, payload).ok;
      if (!ok) refusedRef.current += 1;
      return ok;
    },
    [config.message_schemas, validator],
  );

  /**
   * The sizes of what the coverage store holds, from the inventory it serves. Read on
   * announcement rather than polled: the store says when something became visible, and
   * this asks it how big the visible things are.
   */
  const refreshHoldings = useCallback(async () => {
    const response = await fetch(config.endpoints.holdings);
    if (!response.ok) return;
    const body = (await response.json()) as unknown;
    if (!validator.validate('holdings-inventory', body).ok) return;
    const inventory = body as HoldingsInventory;
    holdingSizesRef.current = [...inventory.holdings]
      .sort((a, b) => b.published_at.tick - a.published_at.tick)
      .map((holding) => holding.field.byte_length)
      .slice(0, 12);
  }, [config.endpoints.holdings, validator]);

  const refresh = useCallback(async () => {
    const [componentsResponse, reportResponse, controlsResponse] = await Promise.all([
      fetch(config.endpoints.components),
      fetch(config.endpoints.telemetry),
      // What the plane offers, stated by the plane: the panel holds no list of
      // controls and no bound of its own (Constitution IV).
      fetch(config.endpoints.operator_controls),
    ]);
    if (controlsResponse.ok) {
      const body = (await controlsResponse.json()) as unknown;
      if (validator.validate('operator-controls', body).ok) setControls(body as OperatorControls);
    }
    if (componentsResponse.ok) {
      const body = (await componentsResponse.json()) as unknown;
      if (validator.validate('operator-components', body).ok) setComponents(body as OperatorComponents);
    }
    if (reportResponse.ok) {
      const body = (await reportResponse.json()) as unknown;
      if (validator.validate('telemetry-report', body).ok) setReport(body as TelemetryReport);
    }
  }, [
    config.endpoints.components,
    config.endpoints.operator_controls,
    config.endpoints.telemetry,
    validator,
  ]);

  useEffect(() => {
    void refresh();
    void refreshHoldings();
    const stop = [
      client.subscribe(config.topics.all, (message) => {
        // Counted here, and marked as counted here: nobody publishes a throughput.
        const namespace = message.topic.split('/')[0];
        countedRef.current.set(namespace, (countedRef.current.get(namespace) ?? 0) + 1);
        countedRef.current.set('all', (countedRef.current.get('all') ?? 0) + 1);
        // And the wires that carry this topic light. Deliberately here, on the same
        // subscription as the counter above and under the same rule: this says traffic
        // crossed, which is true of a message whichever way its master then judges it.
        // A light is not a figure drawn from a payload, and nothing below reads one.
        pulses.mark(message.topic, pulseKindRef.current);
      }),
      client.subscribe(config.topics.heartbeat, (message) => {
        if (!drawable(message.topic, message.payload)) return;
        const heartbeat = message.payload as Heartbeat;
        const rows = heartbeat.figures?.find((entry) => entry.key === 'rows');
        if (heartbeat.component === 'observation-store' && rows && heartbeat.tick !== null && heartbeat.tick !== undefined) {
          // The store's own count, followed over simulation time: the growth line is
          // a series of reported figures, not a rate the shell worked out.
          series('store:rows').push(heartbeat.tick, rows.value);
        }
        setHeard((previous) => {
          const next = new Map(previous);
          // harness:allow-wallclock liveness evaluation measures arrival in host time (ADR-0006)
          next.set(heartbeat.component, { heartbeat, heardAtHostMs: Date.now() });
          return next;
        });
        void refresh();
      }),
      client.subscribe(config.topics.platform_state, (message) => {
        if (!drawable(message.topic, message.payload)) return;
        const state = message.payload as PlatformState;
        setPlatformState(state);
        series('platform:course').push(state.tick, state.current.course_degrees);
        series('platform:speed').push(state.tick, state.current.speed_m_per_s);
      }),
      client.subscribe(config.topics.clock, (message) => {
        const sample = message.payload as { tick: number; rate?: number };
        setClock({ tick: sample.tick, rate: sample.rate });
      }),
      client.subscribe(config.topics.holdings, () => {
        // The store announces that something became visible; it does NOT carry how
        // big it is — the announcement is light on purpose (holding-published's own
        // note), and the size lives in the inventory the store serves.
        //
        // This read the announcement for a `holding.field.byte_length` that has never
        // been on it, through optional chaining that turned the mistake into silence:
        // the stack drew nothing at all while its caption promised bars whose length
        // was bytes on the wire. Found when a prompted now-cast published a holding
        // and the face did not move. Now the sizes come from where the store actually
        // publishes them, and they are still the store's own figures.
        void refreshHoldings();
      }),
      client.subscribe(config.topics.telemetry, (message) => {
        if (!drawable(message.topic, message.payload)) return;
        const payload = message.payload as Telemetry;
        // The scheduler's own record of what it decided, kept for its drawer: a
        // prompted run and a declined one are the same kind of fact, and this is
        // where the consequence of pressing the button becomes visible.
        if ('kind' in payload && payload.kind === 'scheduler-decision') setDecision(payload);
        if (!('kind' in payload) || payload.kind !== 'residual-sample') return;
        // The monitor's own numbers, drawn as it reported them: the threshold it scores
        // against and how far its streak has got. Recomputing either here would be a
        // second implementation of the rule (FR-58).
        setBreach(payload.breach);
        for (const sample of payload.samples) {
          series('residual').push(payload.tick, sample.residual_m_per_s);
        }
      }),
      client.subscribe(config.topics.observations, (message) => {
        // Counted as traffic by the namespace counter above either way; drawn from
        // only if it is what its master says it is.
        if (!drawable(message.topic, message.payload)) return;
        const observation = message.payload as Observation;
        // Counted here, and marked as counted here: nobody publishes a throughput.
        countedRef.current.set(
          `obs:${observation.datastream_id}`,
          (countedRef.current.get(`obs:${observation.datastream_id}`) ?? 0) + 1,
        );
        countedRef.current.set('obs:all', (countedRef.current.get('obs:all') ?? 0) + 1);
        series(`obs:${observation.datastream_id}`).push(observation.tick, observation.result);
        if (
          observation.thing_id !== 'ownship' &&
          !oceanStreamsRef.current.includes(observation.datastream_id)
        ) {
          oceanStreamsRef.current = [...oceanStreamsRef.current, observation.datastream_id];
        }
      }),
    ];
    return () => stop.forEach((unsubscribe) => unsubscribe());
  }, [
    client,
    config.topics.all,
    config.topics.clock,
    config.topics.heartbeat,
    config.topics.holdings,
    config.topics.observations,
    config.topics.platform_state,
    config.topics.telemetry,
    drawable,
    pulses,
    refresh,
    refreshHoldings,
    series,
  ]);

  useEffect(() => {
    // harness:allow-wallclock liveness windows lapse in host time (ADR-0006)
    const sweep = setInterval(() => {
      // A wire that carried nothing since the last sweep goes out. Held here rather
      // than on a timer of its own: one beat darkens a component whose window lapsed
      // and a wire whose traffic stopped, and both are the same kind of statement —
      // nothing arrived, and the picture stops saying something did.
      pulses.settle();
      setSweep((n) => n + 1);
    }, 1000);
    return () => clearInterval(sweep);
  }, [pulses]);

  const command = async (path: string, method = 'POST', body?: unknown) => {
    const response = await fetch(path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const answer = (await response.json()) as { refused?: string };
    setRefusal(response.ok ? undefined : (answer.refused ?? `refused with status ${response.status}`));
    void refresh();
  };

  /**
   * Whether the clock is outrunning real time by enough that a wire should be held lit
   * rather than re-lit per message. The rate is the clock's own reported figure and the
   * bound is declared configuration; neither is a judgement made here (Constitution IV).
   */
  const holding = (clock.rate ?? 0) > config.flow.pulse.hold_above_rate;
  useEffect(() => {
    pulseKindRef.current = holding ? 'held' : 'fading';
  }, [holding]);

  // harness:allow-wallclock liveness evaluation measures arrival in host time (ADR-0006)
  const nowMs = Date.now();
  const stateOf = (id: string) => {
    const entry = heard.get(id);
    const record = components?.components.find((component) => component.id === id);
    const windowSeconds =
      entry?.heartbeat.liveness_window_seconds ?? config.liveness.default_window_seconds;
    const lit = entry !== undefined && nowMs - entry.heardAtHostMs <= windowSeconds * 1000;
    // The window a component is *judged against* is configuration; a component may also
    // report its own, and where it does the two are drawn as the two different kinds of
    // figure they are (FR-58: a figure may not change kind between states).
    const word = lit
      ? entry.heartbeat.status
      : entry
        ? record && !record.running
          ? 'stopped'
          : 'silent'
        : 'unheard';
    return { lit, word, entry, record };
  };

  /**
   * What a face is allowed to draw from: the component's own heartbeat figures, the
   * messages the shell subscribes to, and counts the shell made of traffic it heard
   * itself. Nothing else — a face that reached past this would be drawing something
   * nobody published (FR-008).
   */
  const faceContext = (id: string, heartbeat: Heartbeat | undefined): FaceContext => ({
    id,
    heartbeat,
    platformState,
    breach,
    series,
    counted: (key) => countedRef.current.get(key) ?? 0,
    holdingSizes: holdingSizesRef.current,
    oceanDatastreams: oceanStreamsRef.current,
    clock,
  });

  const selectedNode = flow.nodes.find((node) => node.id === selected);
  /** Named rather than counted, and derived rather than listed (pulse.ts). */
  const shared = useMemo(() => topicsWithSeveralSenders(flow.edges), [flow]);

  /**
   * The components in the order the arrows walk them, which is `flow.nodes` itself and
   * nothing this file decides: the graph is built in the order the chart is drawn in —
   * band by band down the arc, rank by rank across each — by the same rule the layout
   * places by (`inReadingOrder`). A sort of its own here would be a second opinion about
   * the order, agreeing with the picture today and free to drift from it later, and a
   * reader following a sequence the picture does not show is worse off than one with no
   * arrows at all.
   */
  const order = flow.nodes;
  /**
   * How the open card was arrived at, for the keyboard. Stepping with an arrow must
   * leave the focus on the arrow — the card it was in is gone and a new one is in the
   * document, so without this the second press has nothing to press.
   */
  const arrivedBy = useRef<'card' | 'step-previous' | 'step-next'>('card');
  /**
   * ← and → walk the components, from wherever the reader's focus is in the open card.
   *
   * The first cut of the walk left these keys unbound, for a real reason: the card holds
   * range inputs, and a range input's own keys *are* the arrow keys, so a handler at the
   * card would have taken fine adjustment away from every tuning control in order to move
   * the card. The reason was right and the conclusion was not — the fix is to leave the
   * keys with the control that owns them and take them everywhere else, which is what
   * this does. A slider, a number field, a text field or a select keeps its arrows; the
   * card takes them anywhere else, including on the arrow buttons themselves, so a reader
   * who has stepped once can keep going without moving their hands.
   *
   * A modifier means something else is being asked for — a browser's own back, a word
   * jump — and is left alone.
   */
  const walkKeys = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (direction === 0) return;
    const from = event.target as HTMLElement;
    if (from.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    event.preventDefault();
    step(direction);
  };

  const step = (direction: -1 | 1) => {
    const at = order.findIndex((node) => node.id === selected);
    if (at < 0) return;
    // Round, because the chart is: the arc has no first or last component, and an arrow
    // that stopped would be answering a question about the list rather than the system.
    // Where it goes is named on the control itself, so the wrap is never a surprise.
    arrivedBy.current = direction === 1 ? 'step-next' : 'step-previous';
    setSelected(order[(at + direction + order.length) % order.length].id);
  };

  /**
   * A component's full account: its state, its instrument at full size, the controls it
   * takes and the wires it is on. One component, rendered in the one place the reader
   * asked for it — inside the node in the chart, below the table in the list.
   */
  const account = (node: FlowNode, where: 'in-place' | 'below') => (
    <Drawer
      node={node}
      where={where}
      onKeys={walkKeys}
      walk={{
        at: order.findIndex((entry) => entry.id === node.id) + 1,
        of: order.length,
        previous: order[(order.findIndex((entry) => entry.id === node.id) + order.length - 1) % order.length],
        next: order[(order.findIndex((entry) => entry.id === node.id) + 1) % order.length],
      }}
      onStep={step}
      state={stateOf(node.id)}
      flow={flow}
      config={config}
      faceContext={faceContext}
      report={report}
      controls={controls}
      platformState={platformState}
      decision={decision}
      counted={(key) => countedRef.current.get(key) ?? 0}
      command={command}
      onRefusal={setRefusal}
      onClose={() => setSelected(undefined)}
    />
  );

  return (
    <div className="panel operator-panel" ref={rootRef} data-narrow={narrow}>
      {/* The tab carries its own help control (FR-70, ADR-0037). This is the tour that
          used to live in the shell header: it explains the components, and the components
          are what this tab draws. */}
      <div className="panel-head">
        <span className="panel-head-title">the harness, component by component</span>
        <HelpButton tour={componentTour(config)} />
      </div>
      <Disclosure label="views and commands" narrow={narrow} className="operator-controls">
        <button
          onClick={() => setAsList((value) => !value)}
          data-testid="view-toggle"
          aria-pressed={asList}
        >
          {asList ? 'show the flow chart' : 'show the list'}
        </button>
        <button onClick={() => void command(config.endpoints.clock_step)} data-testid="step-button">
          step the clock one tick
        </button>
        {/* A burst is the same command with a number on it, and the number the surface
            will accept comes from the surface. Offered only once it has said so: a
            button drawn against a bound nobody stated is a button that can be refused
            for reasons the reader was never told. */}
        {controls ? (
          <button
            onClick={() =>
              void command(config.endpoints.clock_step, 'POST', { ticks: controls.step.maximum_ticks })
            }
            data-testid="step-burst-button"
          >
            step {controls.step.maximum_ticks} ticks
          </button>
        ) : null}
        <span className="panel-footnote">
          {flow.nodes.length} components · {flow.edges.length} edges derived from the topology ·{' '}
          {config.flow.suppressed_filters.join(' and ')} drawn as the plane, not as edges
          {controls
            ? ` · ${controlled(controls).size} components take controls: open one to use them`
            : ''}
          {refusedRef.current > 0
            ? ` · ${refusedRef.current} message(s) refused by their master and not drawn`
            : ''}
        </span>
      </Disclosure>
      {refusal && (
        <p className="shell-refusal" data-testid="command-refusal">
          {refusal}
        </p>
      )}

      {asList ? (
        <ListView
          flow={flow}
          stateOf={stateOf}
          onSelect={setSelected}
          command={command}
          config={config}
        />
      ) : (
        <FlowCanvas
          nodes={flow.nodes}
          edges={flow.edges}
          pulses={pulses}
          fadeMs={config.flow.pulse.fade_ms}
          bandOrder={BANDS}
          bandCaption={(band) => BAND_CAPTION[band as Band]}
          selected={selected}
          // A phone's space is vertical, so the open card is a different shape there.
          metrics={narrow ? NARROW_METRICS : METRICS}
          openFocus={arrivedBy.current}
          // The open node is what holds the focus in the chart, so it is what hears the
          // walk's keys — including from everything inside it, by bubbling.
          onOpenKeyDown={walkKeys}
          stateOf={(id) => {
            const { lit, word } = stateOf(id);
            return { lit, word };
          }}
          onSelect={(id) => {
            arrivedBy.current = 'card';
            setSelected(id === selected ? undefined : id);
          }}
          // The open node *is* the account: the reader stays where they clicked, and
          // the instrument they came to read is at a size they can read it at.
          renderExpanded={(node) => account(node, 'in-place')}
          renderNode={(node) => {
            const { lit, word, entry, record } = stateOf(node.id);
            const face = FACES[node.id];
            return (
              <span className={lit ? 'flow-node-body flow-node-lit' : 'flow-node-body flow-node-dark'}>
                <span className="flow-node-head">
                  <span className={`status-dot status-${lit && entry ? entry.heartbeat.status : 'dark'}`} />
                  <span className="flow-node-name">{node.label}</span>
                  {controls && controlled(controls).has(node.id) ? (
                    // The affordance the first cut of this tab did not have: a reader
                    // who cannot see that a node takes controls does not open it, and
                    // the controls may as well not exist. Drawn from what the surface
                    // said it offers, not from a list here.
                    <span className="flow-node-controls" data-has-controls={node.id} aria-label="takes controls">
                      ▸
                    </span>
                  ) : null}
                  {record && !record.stoppable ? (
                    <svg
                      className="flow-node-lock"
                      viewBox="0 0 12 14"
                      role="img"
                      aria-label="protected from the operator plane by rule"
                    >
                      <path d="M 3 6 a 3 3 0 0 1 6 0" fill="none" stroke="currentColor" strokeWidth="1.4" />
                      <rect x="1.5" y="6" width="9" height="7" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  ) : null}
                </span>
                {/* Lit or dark, the face draws only what was reported; a dark node's
                    figures keep the simulation time they were reported at. */}
                <span className="flow-node-face">
                  {face ? face(faceContext(node.id, entry?.heartbeat)) : null}
                </span>
                <span className="flow-node-state">
                  {word}
                  <i>{entry ? displayInstant(entry.heartbeat.sim_time) : 'never heard'}</i>
                </span>
              </span>
            );
          }}
        />
      )}

      {/* What the lights mean, said where they are — and only where they are: the list
          view has no wires, so it makes no claim about them. The sentence changes with
          the clock because the behaviour does, and a reader who speeds the clock up and
          watches the flicker become a steady light should be able to find out why
          without reading the source. */}
      {asList ? null : (
        <p className="panel-footnote" data-testid="flow-pulse-note">
          {holding
            ? `A wire stays lit while traffic runs down it — the clock is at ${clock.rate}× real time, and a light restarted for every message at that rate is a flicker rather than a signal.`
            : `A wire lights as a message crosses it, and fades over ${config.flow.pulse.fade_ms / 1000} s.`}{' '}
          What lights is derived, like the wires themselves: the broker hands a subscriber
          a topic and never a sender, so a topic more than one component publishes lights
          all of their wires
          {shared.length > 0 ? ` — ${shared.join(' and ')} today` : ''}. A port carries no
          broker traffic and never lights at all.
        </p>
      )}

      <Legend />

      {/* The list is a column of rows and has no room to open one of them in place, so
          there the account still opens below the table. It is the same account, from the
          same component, with the same controls and the same refusals (FR-015). */}
      {asList && selectedNode ? account(selectedNode, 'below') : null}

      {selectedNode ? null : (
        <p className="panel-footnote">
          Select a component to open it: the node expands where it stands, carrying its
          instrument at a readable size and the controls that act on it, and the rest of the
          chart moves aside for it. Structure above is declared configuration; a node is lit only
          because a heartbeat from it arrived within its declared window, and every figure says
          whether it was declared, reported by the component, or counted here.
        </p>
      )}
    </div>
  );
}

/**
 * A figure that came from the configuration document (FR-57's first kind). Drawn with
 * the treatment the stylesheet has carried since 113, which until feature 115 nothing
 * used: the three kinds were named in CSS and the faces drew reported figures only.
 */
function Declared({ value, unit }: { value: number | string | undefined; unit?: string }) {
  if (value === undefined) return <span className="flow-figure-absent">not declared</span>;
  return (
    <span className="flow-figure flow-figure-declared">
      <span className="flow-figure-label">declared</span>
      <span className="flow-figure-value">
        {value}
        {unit ? ` ${unit}` : ''}
      </span>
    </span>
  );
}

/**
 * The legend (feature 115, FR-68). Six states a node can be in, named — and with them
 * the sentence the System tab's footnote carried and nothing else did: *a grey node is a
 * component that has not run yet, or has stopped, and the display cannot tell you which,
 * only the silence.* That is a true statement about what liveness-from-heartbeats can and
 * cannot distinguish, and it had to survive the withdrawal of the tab that made it.
 *
 * It is not quite true of every grey node any more, and the legend says the finer thing
 * too: where the operator plane has *told* the shell a component is stopped, the word is
 * `stopped` rather than `silent`, because that is a fact the surface was given rather
 * than one it inferred from silence.
 */
function Legend() {
  const states: { status: string; word: string; meaning: string }[] = [
    { status: 'ok', word: 'ok', meaning: 'heartbeats arriving inside the declared window, and the component says it is working' },
    { status: 'starting', word: 'starting', meaning: 'alive and not yet working — the component’s own word for it' },
    { status: 'degraded', word: 'degraded', meaning: 'alive and working badly, said rather than gone quiet' },
    { status: 'stalled', word: 'stalled', meaning: 'alive and not working, said rather than gone quiet' },
    { status: 'dark', word: 'silent', meaning: 'heard from once, and not inside its window since' },
    { status: 'dark', word: 'unheard', meaning: 'no heartbeat from it has ever arrived' },
  ];
  return (
    <div className="flow-legend" data-testid="flow-legend">
      <ul>
        {states.map((state) => (
          <li key={state.word} data-legend-state={state.word}>
            <span className={`status-dot status-${state.status}`} />
            <b>{state.word}</b> — {state.meaning}
          </li>
        ))}
      </ul>
      <p className="panel-footnote">
        A grey node is a component that has not run yet, or has stopped — the display
        cannot tell you which, only the silence. The one exception is a component the
        operator plane has reported stopped: that is a fact this surface was given, not one
        it inferred, and it is drawn as <b>stopped</b> rather than as silence.
      </p>
    </div>
  );
}

/**
 * Which components the surface says take a control of any kind. Derived from the
 * statement rather than listed here, so a tunable added to the operator's
 * configuration shows up on its node without a line changing in this panel.
 */
function controlled(controls: OperatorControls): ReadonlySet<string> {
  return new Set([
    controls.demand.target,
    ...controls.tunables.map((tunable) => tunable.target),
    ...controls.events.map((event) => event.target),
  ]);
}

/** What a node's chrome needs to know, shared by the graph, the list and the drawer. */
interface StateOf {
  lit: boolean;
  word: string;
  entry: Heard | undefined;
  record: OperatorComponents['components'][number] | undefined;
}

function ListView({
  flow,
  stateOf,
  onSelect,
  command,
  config,
}: {
  flow: ReturnType<typeof buildFlow>;
  stateOf: (id: string) => StateOf;
  onSelect: (id: string) => void;
  command: (path: string, method?: string) => void | Promise<void>;
  config: PanelParams['config'];
}) {
  const declaredBeat = (id: string) => config.components.find((entry) => entry.id === id)?.beat;
  return (
    <table className="system-grid" data-testid="operator-components">
      <thead>
        <tr>
          <th>component</th>
          {/* The two facts the System tab carried alone, moved here before that tab was
              withdrawn (FR-68). Both are configuration and both are drawn as declared
              figures, which is what makes withdrawing System a move rather than a loss. */}
          <th>beat</th>
          <th>liveness window</th>
          <th>state</th>
          <th>last heard (sim time)</th>
          <th>what it says about itself</th>
          <th>control</th>
        </tr>
      </thead>
      <tbody>
        {flow.nodes.map((node) => {
          const { lit, word, entry, record } = stateOf(node.id);
          const reportedWindow = entry?.heartbeat.liveness_window_seconds;
          return (
            <tr key={node.id} data-operator-component={node.id} data-lit={lit}>
              <td>
                <button className="link-button" onClick={() => onSelect(node.id)}>
                  {node.label}
                </button>
              </td>
              <td data-declared-beat={declaredBeat(node.id)}>
                <Declared value={declaredBeat(node.id)} />
              </td>
              <td data-declared-window={config.liveness.default_window_seconds}>
                <Declared value={config.liveness.default_window_seconds} unit="s" />
                {/* A component may report its own window. It is a different figure from a
                    different source, so it is drawn as one rather than quietly replacing
                    the declared one in the same cell. */}
                {reportedWindow !== undefined &&
                  reportedWindow !== config.liveness.default_window_seconds && (
                    <span className="flow-figure flow-figure-reported">
                      <span className="flow-figure-label">reported</span>
                      <span className="flow-figure-value">{reportedWindow} s</span>
                    </span>
                  )}
              </td>
              <td>{word}</td>
              <td>{entry ? displayInstant(entry.heartbeat.sim_time) : '—'}</td>
              <td>{detailOf(entry)}</td>
              <td>
                {record?.stoppable ? (
                  <>
                    <button
                      onClick={() =>
                        void command(
                          `${config.endpoints.component_command}/${node.id}/${record.running ? 'stop' : 'start'}`,
                        )
                      }
                    >
                      {record.running ? 'stop' : 'start'}
                    </button>{' '}
                    <button onClick={() => void command(`${config.endpoints.component_command}/${node.id}/restart`)}>
                      restart
                    </button>
                  </>
                ) : (
                  'protected'
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * A component's account. Since feature 117 this is drawn inside the node itself in the
 * chart — the reason the panel was sent back was that a 208-pixel card could be glanced
 * at and not read, and an account that opened somewhere else made the reader carry the
 * node's name across the page to find it. In the list view, where a row has nowhere to
 * expand into, it still opens below the table.
 *
 * The content does not change between the two: same figures, same controls, same
 * refusals. Only the chrome does.
 */
function Drawer({
  node,
  where,
  walk,
  onStep,
  onKeys,
  state,
  flow,
  config,
  faceContext,
  report,
  controls,
  platformState,
  decision,
  counted,
  command,
  onRefusal,
  onClose,
}: {
  node: FlowNode;
  /** In the node it belongs to, or below the list that has no room for it. */
  where: 'in-place' | 'below';
  /** Where this component sits in the order the chart reads, and its two neighbours. */
  walk: { at: number; of: number; previous: FlowNode; next: FlowNode };
  onStep: (direction: -1 | 1) => void;
  /** ← and → walk the components. See `walkKeys`. */
  onKeys: (event: KeyboardEvent<HTMLElement>) => void;
  state: StateOf;
  flow: ReturnType<typeof buildFlow>;
  config: PanelParams['config'];
  faceContext: (id: string, heartbeat: Heartbeat | undefined) => FaceContext;
  report: TelemetryReport | undefined;
  /** What the operator surface says its plane offers; undefined until it has said. */
  controls: OperatorControls | undefined;
  platformState: PlatformState | undefined;
  /** The scheduler's last published decision, drawn in the scheduler's own drawer. */
  decision: TelemetrySchedulerDecision | undefined;
  counted: (key: string) => number;
  command: (path: string, method?: string, body?: unknown) => void | Promise<void>;
  onRefusal: (refusal: string | undefined) => void;
  onClose: () => void;
}) {
  const { entry, record } = state;
  const inbound = flow.edges.filter((edge) => edge.to === node.id);
  const outbound = flow.edges.filter((edge) => edge.from === node.id);
  return (
    <div
      className={where === 'in-place' ? 'flow-drawer flow-drawer-in-place' : 'flow-drawer'}
      data-testid="flow-drawer"
      data-drawer-component={node.id}
      data-drawer-where={where}
      {...(where === 'below'
        ? // In the list the account itself is what a reader is in, so it hears the keys
          // and can be focused to start hearing them. In the chart the open node hears
          // them already — everything in here bubbles up to it — so a listener here as
          // well would be a second call on one press. Planting that showed it changes
          // nothing today, because both calls read the same selection and ask for the
          // same next component; that is a property of this render, not a design, and
          // one listener with one job does not need it to hold.
          { onKeyDown: onKeys, tabIndex: -1 }
        : {})}
    >
      <div className="flow-drawer-head">
        <h3>{node.label}</h3>
        {/* Forward and back through the components, in the order the chart draws them.
            Each arrow names the component it will open, so the reader knows what they
            are about to get and the wrap at either end is stated rather than sprung —
            and so a screen reader announces a destination rather than a glyph.

            ← and → do the same from the keyboard, everywhere in the card except inside a
            control whose own keys they are (`walkKeys`). The shortcut is declared on the
            buttons rather than only implemented, so it is discoverable by the reader who
            most needs it. */}
        <span className="flow-drawer-walk">
          <button
            data-step="previous"
            onClick={() => onStep(-1)}
            aria-label={`back to ${walk.previous.label}`}
            aria-keyshortcuts="ArrowLeft"
            title={`back to ${walk.previous.label} (left arrow)`}
          >
            ←
          </button>
          <span className="flow-drawer-place" data-walk-place={`${walk.at}/${walk.of}`}>
            {walk.at} of {walk.of}
          </span>
          <button
            data-step="next"
            onClick={() => onStep(1)}
            aria-label={`on to ${walk.next.label}`}
            aria-keyshortcuts="ArrowRight"
            title={`on to ${walk.next.label} (right arrow)`}
          >
            →
          </button>
        </span>
        <button onClick={onClose} aria-label={`close ${node.label}`} data-testid="drawer-close">
          ×
        </button>
      </div>
      <p className="flow-drawer-state">
        <span className={`status-dot status-${state.lit ? entry?.heartbeat.status : 'dark'}`} />
        {state.word}
        {entry ? ` · heard at ${displayInstant(entry.heartbeat.sim_time)}` : ' · nothing has ever arrived'}
      </p>
      <p className="flow-drawer-detail">{detailOf(entry)}</p>

      {/* The node's own instrument again at full size: the drawer is where a reader
          goes to read it rather than to glance at it. */}
      <div className="flow-drawer-face">{FACES[node.id]?.(faceContext(node.id, entry?.heartbeat))}</div>

      {/* The controls this component takes, immediately under its own instrument, so
          the thing a reader changes and the thing that changes are one glance apart.
          Which controls those are is the surface's answer, not this file's. */}
      {controls && controls.demand.target === node.id ? (
        <DemandControl config={config} state={platformState} onRefusal={onRefusal} />
      ) : null}
      {controls ? (
        <TuningControl
          config={config}
          tunables={controls.tunables.filter((tunable) => tunable.target === node.id)}
          heartbeat={entry?.heartbeat}
          onRefusal={onRefusal}
        />
      ) : null}
      {controls ? (
        <EventControl
          config={config}
          events={controls.events.filter((event) => event.target === node.id)}
          onRefusal={onRefusal}
        />
      ) : null}
      {/* What the scheduler decided about the last thing it was asked, in its own
          words. The prompt button is a few lines above this: pressing it and being
          declined is a complete, ordinary outcome, and this is where it is read. */}
      {node.id === 'scheduler' && decision ? (
        <p className="flow-drawer-detail" data-testid="scheduler-decision">
          <strong>last decision:</strong> {decision.decision} — {decision.detail}
        </p>
      ) : null}
      {node.id === 'telemetry' && report ? (
        <div className="operator-telemetry">
          <p className="flow-drawer-detail" data-testid="skill-statement">
            <strong>skill:</strong> {report.skill?.statement ?? 'nothing published yet'}
            {report.skill?.freshness === 'stale' && <span className="shell-refusal"> (stale)</span>}
          </p>
          <p className="flow-drawer-detail">
            <strong>residuals:</strong>{' '}
            {report.statistics && report.statistics.count > 0
              ? `${report.statistics.count} scored · mean |r| ${report.statistics.mean_absolute_m_per_s?.toFixed(2)} m/s · rms ${report.statistics.root_mean_square_m_per_s?.toFixed(2)} m/s`
              : (report.statistics?.state ?? 'nothing published yet')}
          </p>
          <p className="flow-drawer-detail">
            <strong>throughput:</strong>{' '}
            {report.throughput.observations_per_sim_second.toFixed(3)} obs/sim-s ·{' '}
            {report.throughput.telemetry_messages_per_sim_second.toFixed(3)} telemetry msg/sim-s
          </p>
          <p className="flow-drawer-detail" data-testid="latency">
            <strong>latency:</strong>{' '}
            {report.latency.sample_count === 0
              ? 'nothing folded yet — no figure rather than a zero'
              : report.latency.maximum_sim_seconds === 0
                ? `0 sim-s over ${report.latency.sample_count} residual(s): the monitor scores within the tick the observation was taken, so this loop carries no delay to report`
                : `mean ${report.latency.mean_sim_seconds?.toFixed(1)} sim-s · worst ${report.latency.maximum_sim_seconds?.toFixed(1)} sim-s over ${report.latency.sample_count} residual(s)`}
            <span className="panel-footnote"> — {report.latency.basis}</span>
          </p>
          <div className="operator-regions">
            <strong>by region:</strong>{' '}
            {report.regions.length === 0 ? (
              <span className="panel-footnote">
                no region has been sampled yet; an unsampled region is absent here rather than
                present with zeroes
              </span>
            ) : (
              <table data-testid="region-statistics">
                <thead>
                  <tr>
                    <th>region</th>
                    <th>extent</th>
                    <th>scored</th>
                    <th>mean |r| (m/s)</th>
                    <th>rms (m/s)</th>
                    <th>state</th>
                  </tr>
                </thead>
                <tbody>
                  {report.regions.map((region) => (
                    <tr key={region.scope.region_id ?? 'scenario'} data-region={region.scope.region_id}>
                      <td>{region.scope.region_id}</td>
                      <td>
                        {region.scope.bounds
                          ? `${region.scope.bounds.minimum_longitude}…${region.scope.bounds.maximum_longitude}, ${region.scope.bounds.minimum_latitude}…${region.scope.bounds.maximum_latitude}`
                          : '—'}
                      </td>
                      <td>{region.count}</td>
                      <td>{region.mean_absolute_m_per_s?.toFixed(2) ?? '—'}</td>
                      <td>{region.root_mean_square_m_per_s?.toFixed(2) ?? '—'}</td>
                      <td>{region.state}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}
      {node.id === 'observation-store' ? (
        <p className="flow-drawer-counted">
          {counted('obs:all')} observations counted here, from traffic the shell heard itself
        </p>
      ) : null}

      <h4>wires</h4>
      <ul className="flow-wires">
        {inbound.map((edge) => (
          <li key={`in-${edge.from}-${edge.label}`}>
            <span className={`flow-wire flow-wire-${edge.kind}`} /> from <b>{edge.from}</b> — {edge.label}
            {edge.kind === 'port' ? ' (a port: no broker traffic crosses it)' : ''}
          </li>
        ))}
        {outbound.map((edge) => (
          <li key={`out-${edge.to}-${edge.label}`}>
            <span className={`flow-wire flow-wire-${edge.kind}`} /> to <b>{edge.to}</b> — {edge.label}
            {edge.kind === 'port' ? ' (a port: no broker traffic crosses it)' : ''}
          </li>
        ))}
      </ul>

      {record?.stoppable ? (
        <p>
          <button
            onClick={() =>
              void command(
                `${config.endpoints.component_command}/${node.id}/${record.running ? 'stop' : 'start'}`,
              )
            }
            data-testid="drawer-stop"
          >
            {record.running ? 'stop' : 'start'}
          </button>{' '}
          <button onClick={() => void command(`${config.endpoints.component_command}/${node.id}/restart`)}>
            restart
          </button>
        </p>
      ) : (
        <p className="panel-footnote">
          protected from the operator plane by rule: stopping it would take the evidence of the
          stopping with it.
        </p>
      )}
    </div>
  );
}
