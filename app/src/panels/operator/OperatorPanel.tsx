/**
 * The Operator tab (FR-35, FR-36, FR-52 to FR-54): the machinery interrogated, drawn
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
 * The telemetry the tab has always carried is not lost in the redraw: the skill
 * sentence, the residual statistics for the scenario and for each sampled region of
 * the configured grid, throughput per simulation second, and end-to-end latency in
 * simulation seconds (issue #61) are in the telemetry component's own drawer, which is
 * where a reader now goes to ask that component what it has to say.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import type { PanelParams } from '../../shell/Shell.js';
import type {
  Heartbeat,
  Observation,
  OperatorComponents,
  PlatformState,
  Telemetry,
  TelemetryReport,
  TelemetryResidualSampleReport,
} from '../../generated/types.js';
import { topology } from '../../generated/topology.js';
import { displayInstant } from '../../shell/display.js';
import { BANDS, buildFlow, type Band, type FlowNode } from './graph.js';
import { Series } from './series.js';
import { Figure, MonitorFace, PlatformFace, Spark } from './faces.js';
import { DemandControl } from './DemandControl.js';
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

export function OperatorPanel({ params }: IDockviewPanelProps<PanelParams>) {
  const { config, client, validator } = params;
  const flow = useMemo(() => buildFlow(config, topology), [config]);
  const [components, setComponents] = useState<OperatorComponents | undefined>();
  const [report, setReport] = useState<TelemetryReport | undefined>();
  const [platformState, setPlatformState] = useState<PlatformState | undefined>();
  const [breach, setBreach] = useState<TelemetryResidualSampleReport['breach']>();
  const [refusal, setRefusal] = useState<string | undefined>();
  const [selected, setSelected] = useState<string | undefined>();
  const [asList, setAsList] = useState(false);
  const [heard, setHeard] = useState<ReadonlyMap<string, Heard>>(new Map());
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

  const refresh = useCallback(async () => {
    const [componentsResponse, reportResponse] = await Promise.all([
      fetch(config.endpoints.components),
      fetch(config.endpoints.telemetry),
    ]);
    if (componentsResponse.ok) {
      const body = (await componentsResponse.json()) as unknown;
      if (validator.validate('operator-components', body).ok) setComponents(body as OperatorComponents);
    }
    if (reportResponse.ok) {
      const body = (await reportResponse.json()) as unknown;
      if (validator.validate('telemetry-report', body).ok) setReport(body as TelemetryReport);
    }
  }, [config.endpoints.components, config.endpoints.telemetry, validator]);

  useEffect(() => {
    void refresh();
    const stop = [
      client.subscribe(config.topics.heartbeat, (message) => {
        const heartbeat = message.payload as Heartbeat;
        setHeard((previous) => {
          const next = new Map(previous);
          // harness:allow-wallclock liveness evaluation measures arrival in host time (ADR-0006)
          next.set(heartbeat.component, { heartbeat, heardAtHostMs: Date.now() });
          return next;
        });
        void refresh();
      }),
      client.subscribe(config.topics.platform_state, (message) => {
        const state = message.payload as PlatformState;
        setPlatformState(state);
        series('platform:course').push(state.tick, state.current.course_degrees);
        series('platform:speed').push(state.tick, state.current.speed_m_per_s);
      }),
      client.subscribe(config.topics.telemetry, (message) => {
        const payload = message.payload as Telemetry;
        if (!('kind' in payload) || payload.kind !== 'residual-sample') return;
        // The monitor's own numbers, drawn as it reported them: the threshold it scores
        // against and how far its streak has got. Recomputing either here would be a
        // second implementation of the rule (FR-53).
        setBreach(payload.breach);
        for (const sample of payload.samples) {
          series('residual').push(payload.tick, sample.residual_m_per_s);
        }
      }),
      client.subscribe(config.topics.observations, (message) => {
        const observation = message.payload as Observation;
        // Counted here, and marked as counted here: nobody publishes a throughput.
        countedRef.current.set(
          `obs:${observation.datastream_id}`,
          (countedRef.current.get(`obs:${observation.datastream_id}`) ?? 0) + 1,
        );
        countedRef.current.set('obs:all', (countedRef.current.get('obs:all') ?? 0) + 1);
        series(`obs:${observation.datastream_id}`).push(observation.tick, observation.result);
      }),
    ];
    return () => stop.forEach((unsubscribe) => unsubscribe());
  }, [
    client,
    config.topics.heartbeat,
    config.topics.observations,
    config.topics.platform_state,
    config.topics.telemetry,
    refresh,
    series,
  ]);

  useEffect(() => {
    // harness:allow-wallclock liveness windows lapse in host time (ADR-0006)
    const sweep = setInterval(() => setSweep((n) => n + 1), 1000);
    return () => clearInterval(sweep);
  }, []);

  const command = async (path: string, method = 'POST') => {
    const response = await fetch(path, { method });
    const body = (await response.json()) as { refused?: string };
    setRefusal(response.ok ? undefined : (body.refused ?? `refused with status ${response.status}`));
    void refresh();
  };

  // harness:allow-wallclock liveness evaluation measures arrival in host time (ADR-0006)
  const nowMs = Date.now();
  const stateOf = (id: string) => {
    const entry = heard.get(id);
    const record = components?.components.find((component) => component.id === id);
    const windowSeconds =
      entry?.heartbeat.liveness_window_seconds ?? config.liveness.default_window_seconds;
    const lit = entry !== undefined && nowMs - entry.heardAtHostMs <= windowSeconds * 1000;
    const word = lit
      ? entry.heartbeat.status
      : entry
        ? record && !record.running
          ? 'stopped'
          : 'silent'
        : 'unheard';
    return { lit, word, entry, record };
  };

  const bands = BANDS.map((band) => ({
    band,
    nodes: flow.nodes.filter((node) => node.band === band),
  })).filter((row) => row.nodes.length > 0);

  const selectedNode = flow.nodes.find((node) => node.id === selected);

  return (
    <div className="panel operator-panel">
      <div className="operator-controls">
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
        <span className="panel-footnote">
          {flow.nodes.length} components · {flow.edges.length} edges derived from the topology ·{' '}
          {config.flow.suppressed_filters.join(' and ')} drawn as the plane, not as edges
        </span>
      </div>
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
        <div className="flow-bands" data-testid="flow-chart">
          {bands.map(({ band, nodes }) => (
            <section key={band} className={`flow-band flow-band-${band}`}>
              <h4 className="flow-band-caption">{BAND_CAPTION[band]}</h4>
              <div className="flow-row">
                {nodes.map((node) => {
                  const { lit, word, entry, record } = stateOf(node.id);
                  return (
                    <button
                      key={node.id}
                      type="button"
                      className={`flow-node ${lit ? 'flow-node-lit' : 'flow-node-dark'}`}
                      data-flow-node={node.id}
                      data-lit={lit}
                      data-state={word}
                      aria-pressed={selected === node.id}
                      onClick={() => setSelected(node.id === selected ? undefined : node.id)}
                    >
                      <span className="flow-node-head">
                        <span className={`status-dot status-${lit && entry ? entry.heartbeat.status : 'dark'}`} />
                        <span className="flow-node-name">{node.label}</span>
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
                      <span className="flow-node-state">{word}</span>
                      <span className="flow-node-detail">{detailOf(entry)}</span>
                      <span className="flow-node-heard">
                        {entry ? displayInstant(entry.heartbeat.sim_time) : '—'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {selectedNode ? (
        <Drawer
          node={selectedNode}
          state={stateOf(selectedNode.id)}
          flow={flow}
          config={config}
          platformState={platformState}
          breach={breach}
          report={report}
          series={series}
          counted={(key) => countedRef.current.get(key) ?? 0}
          command={command}
          onClose={() => setSelected(undefined)}
        />
      ) : (
        <p className="panel-footnote">
          Select a component to open its account. Structure above is declared configuration; a node
          is lit only because a heartbeat from it arrived within its declared window, and every
          figure says whether it was declared, reported by the component, or counted here.
        </p>
      )}
    </div>
  );
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
  return (
    <table className="system-grid" data-testid="operator-components">
      <thead>
        <tr>
          <th>component</th>
          <th>state</th>
          <th>last heard (sim time)</th>
          <th>what it says about itself</th>
          <th>control</th>
        </tr>
      </thead>
      <tbody>
        {flow.nodes.map((node) => {
          const { lit, word, entry, record } = stateOf(node.id);
          return (
            <tr key={node.id} data-operator-component={node.id} data-lit={lit}>
              <td>
                <button className="link-button" onClick={() => onSelect(node.id)}>
                  {node.label}
                </button>
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

function Drawer({
  node,
  state,
  flow,
  config,
  platformState,
  breach,
  report,
  series,
  counted,
  command,
  onClose,
}: {
  node: FlowNode;
  state: StateOf;
  flow: ReturnType<typeof buildFlow>;
  config: PanelParams['config'];
  platformState: PlatformState | undefined;
  breach: TelemetryResidualSampleReport['breach'];
  report: TelemetryReport | undefined;
  series: (key: string) => Series;
  counted: (key: string) => number;
  command: (path: string, method?: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const { entry, record } = state;
  const inbound = flow.edges.filter((edge) => edge.to === node.id);
  const outbound = flow.edges.filter((edge) => edge.from === node.id);
  return (
    <aside className="flow-drawer" data-testid="flow-drawer" data-drawer-component={node.id}>
      <div className="flow-drawer-head">
        <h3>{node.label}</h3>
        <button onClick={onClose} aria-label="close">
          ×
        </button>
      </div>
      <p className="flow-drawer-state">
        <span className={`status-dot status-${state.lit ? entry?.heartbeat.status : 'dark'}`} />
        {state.word}
        {entry ? ` · heard at ${displayInstant(entry.heartbeat.sim_time)}` : ' · nothing has ever arrived'}
      </p>
      <p className="flow-drawer-detail">{detailOf(entry)}</p>

      {node.id === 'platform' ? (
        <>
          <PlatformFace
            state={platformState}
            series={series('platform:course')}
            stride={config.flow.series_samples}
          />
          <DemandControl config={config} onRefusal={() => undefined} />
        </>
      ) : null}
      {node.id === 'monitor' ? (
        breach ? (
          <MonitorFace
            series={series('residual')}
            stride={config.flow.series_samples}
            threshold={breach.threshold_m_per_s}
            streak={breach.streak}
            streakOf={breach.persistence_count}
          />
        ) : (
          <p className="flow-face-quiet">no residual has been reported yet</p>
        )
      ) : null}
      {node.id === 'sensors' ? (
        <Spark
          series={series('obs:temperature-050m')}
          stride={config.flow.series_samples}
          hue="var(--flow-pts)"
          label="temperature at 50 m, recent samples"
        />
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
        <p className="flow-drawer-detail">
          <Figure kind="observed" label="observations heard" value={counted('obs:all')} />
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
    </aside>
  );
}
