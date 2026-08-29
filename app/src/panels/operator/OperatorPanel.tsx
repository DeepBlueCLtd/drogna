/**
 * The Operator tab (FR-35, FR-36): the machinery interrogated. Component state as
 * the components report it (unheard is a statement, not a blank), commands with
 * their refusals surfaced verbatim, and telemetry — residual statistics, forecast
 * skill against persistence in the telemetry component's own sentence, and
 * throughput per simulation second. Everything here crosses the seam as genuine
 * requests; a stopped component goes dark in System because its heartbeats cease,
 * never because a response here said so.
 */
import { useCallback, useEffect, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import type { PanelParams } from '../../shell/Shell.js';
import type { OperatorComponents, TelemetryReport } from '../../generated/types.js';

export function OperatorPanel({ params }: IDockviewPanelProps<PanelParams>) {
  const { config, client, validator } = params;
  const [components, setComponents] = useState<OperatorComponents | undefined>();
  const [report, setReport] = useState<TelemetryReport | undefined>();
  const [refusal, setRefusal] = useState<string | undefined>();

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
    // Refreshed when telemetry or heartbeats move — subscription, not polling.
    const unsubscribe = client.subscribe(config.topics.heartbeat, () => void refresh());
    return unsubscribe;
  }, [client, config.topics.heartbeat, refresh]);

  const command = async (path: string, method = 'POST') => {
    const response = await fetch(path, { method });
    const body = (await response.json()) as { refused?: string };
    setRefusal(response.ok ? undefined : (body.refused ?? `refused with status ${response.status}`));
    void refresh();
  };

  return (
    <div className="panel">
      <h3>Telemetry</h3>
      {report ? (
        <div className="operator-telemetry">
          <p data-testid="skill-statement">
            <strong>skill:</strong> {report.skill?.statement ?? 'nothing published yet'}
            {report.skill?.freshness === 'stale' && <span className="shell-refusal"> (stale)</span>}
          </p>
          <p>
            <strong>residuals:</strong>{' '}
            {report.statistics && report.statistics.count > 0
              ? `${report.statistics.count} scored · mean |r| ${report.statistics.mean_absolute_m_per_s?.toFixed(2)} m/s · rms ${report.statistics.root_mean_square_m_per_s?.toFixed(2)} m/s`
              : (report.statistics?.state ?? 'nothing published yet')}
          </p>
          <p>
            <strong>throughput:</strong> {report.throughput.observations_per_sim_second.toFixed(3)} obs/sim-s ·{' '}
            {report.throughput.telemetry_messages_per_sim_second.toFixed(3)} telemetry msg/sim-s
          </p>
        </div>
      ) : (
        <p className="panel-footnote">no telemetry report yet</p>
      )}

      <h3>Commands</h3>
      <p>
        <button onClick={() => void command(config.endpoints.clock_step)} data-testid="step-button">
          step the clock one tick
        </button>
        <span className="panel-footnote">
          {' '}
          rate lives in the header; commands are ephemeral and outside the replay claim
        </span>
      </p>
      {refusal && (
        <p className="shell-refusal" data-testid="command-refusal">
          {refusal}
        </p>
      )}

      <h3>Components, as they report themselves</h3>
      <table className="system-grid" data-testid="operator-components">
        <thead>
          <tr>
            <th>component</th>
            <th>reported</th>
            <th>control</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {components?.components.map((component) => (
            <tr key={component.id} data-operator-component={component.id}>
              <td>{component.id}</td>
              <td>
                {component.heard
                  ? `${component.last_heartbeat?.status} · ${component.last_heartbeat?.detail ?? ''}`
                  : 'unheard — no heartbeat has ever arrived'}
              </td>
              <td>{component.stoppable ? (component.running ? 'running' : 'stopped') : 'protected'}</td>
              <td>
                {component.stoppable && (
                  <>
                    <button
                      onClick={() =>
                        void command(`${config.endpoints.component_command}/${component.id}/${component.running ? 'stop' : 'start'}`)
                      }
                    >
                      {component.running ? 'stop' : 'start'}
                    </button>{' '}
                    <button onClick={() => void command(`${config.endpoints.component_command}/${component.id}/restart`)}>
                      restart
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="panel-footnote">
        This table is what components say about themselves, aggregated. Whether one is
        alive is the System tab&rsquo;s heartbeat column; a stopped component goes dark
        there because its heartbeats cease, not because a command claimed success.
      </p>
    </div>
  );
}
