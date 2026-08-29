/**
 * The System tab (FR-16, Constitution VII): the full declared component layout from
 * day one, greyed out; a component is lit only because a heartbeat from it arrived
 * over the broker within its declared liveness window. Structure comes from the
 * configuration document, illumination from received traffic, and the two never mix.
 *
 * Liveness is evaluated against host time — the standing ADR-0006 exemption: whether
 * a process is alive is a fact about the machinery, with no simulation-time answer.
 */
import { useEffect, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import type { PanelParams } from '../../shell/Shell.js';
import type { Heartbeat } from '../../generated/types.js';
import { displayInstant } from '../../shell/display.js';

interface Heard {
  heartbeat: Heartbeat;
  heardAtHostMs: number;
}

export function SystemPanel({ params }: IDockviewPanelProps<PanelParams>) {
  const { config, client } = params;
  const [heard, setHeard] = useState<ReadonlyMap<string, Heard>>(new Map());
  const [, setSweep] = useState(0);

  useEffect(() => {
    return client.subscribe(config.topics.heartbeat, (message) => {
      const heartbeat = message.payload as Heartbeat;
      setHeard((previous) => {
        const next = new Map(previous);
        // harness:allow-wallclock liveness evaluation measures arrival in host time (ADR-0006)
        next.set(heartbeat.component, { heartbeat, heardAtHostMs: Date.now() });
        return next;
      });
    });
  }, [client, config.topics.heartbeat]);

  useEffect(() => {
    // harness:allow-wallclock liveness windows lapse in host time (ADR-0006)
    const sweep = setInterval(() => setSweep((n) => n + 1), 1000);
    return () => clearInterval(sweep);
  }, []);

  // harness:allow-wallclock liveness evaluation measures arrival in host time (ADR-0006)
  const nowMs = Date.now();

  return (
    <div className="panel">
      <table className="system-grid">
        <thead>
          <tr>
            <th>component</th>
            <th>beat</th>
            <th>status</th>
            <th>last heard (sim time)</th>
            <th>detail</th>
          </tr>
        </thead>
        <tbody>
          {config.components.map((declared) => {
            const entry = heard.get(declared.id);
            const windowSeconds =
              entry?.heartbeat.liveness_window_seconds ?? config.liveness.default_window_seconds;
            const lit = entry !== undefined && nowMs - entry.heardAtHostMs <= windowSeconds * 1000;
            const status = lit ? entry.heartbeat.status : entry ? 'silent' : 'not heard';
            return (
              <tr key={declared.id} className={lit ? 'component-lit' : 'component-dark'} data-component={declared.id} data-lit={lit}>
                <td>{declared.label}</td>
                <td>{declared.beat}</td>
                <td>
                  <span className={`status-dot status-${lit ? entry.heartbeat.status : 'dark'}`} />
                  {status}
                </td>
                <td>{entry ? displayInstant(entry.heartbeat.sim_time) : '—'}</td>
                <td>{entry?.heartbeat.detail ?? ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="panel-footnote">
        Structure above is declared configuration; light is received heartbeats and
        nothing else. A grey row is a component that has not run yet, or has stopped —
        the display cannot tell you which, only the silence.
      </p>
    </div>
  );
}
