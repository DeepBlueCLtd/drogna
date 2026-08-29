// @vitest-environment jsdom
/**
 * The Operator flow chart against a genuine backend (SRD-v2 FR-52 to FR-54). Nothing
 * below the seam is mocked: what the assertions read is what a heartbeat, a clock
 * sample or a genuine command actually caused.
 *
 * The consequence chain is the reason this tab was redrawn, so it is the test that
 * matters most here: stop the platform, and the picture shows the cost of it two nodes
 * along — the sensors' own sentence changes, and the ocean rows stop.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDockviewPanelProps } from 'dockview-react';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { buildBackend, type BackendRuntime } from '../../backend/runtime/runtime.js';
import { createSeamFetch } from '../../seam/http.js';
import { topology } from '../../generated/topology.js';
import type { PanelParams } from '../../shell/Shell.js';
import { OperatorPanel } from './OperatorPanel.js';
import { buildFlow } from './graph.js';

const validator = createSeamValidator();
const realFetch = globalThis.fetch;

function lockstepConfig(): ConfigRun {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  return config;
}

/** A panel that addresses no position inside itself never reads this (ADR-0032). */
const noAddress: PanelParams['address'] = {
  current: () => undefined,
  write: () => {},
  onChange: () => () => {},
};

function panelProps(config: ConfigRun, runtime: BackendRuntime) {
  const params: PanelParams = {
    config: config.shell,
    client: runtime.transport.connect('shell-test', config.shell.role),
    validator,
    manifest: runtime.manifest,
    address: noAddress,
  };
  return { params } as unknown as IDockviewPanelProps<PanelParams>;
}

describe('the Operator flow chart (feature 112)', () => {
  let config: ConfigRun;
  let runtime: BackendRuntime;

  beforeEach(() => {
    vi.useFakeTimers();
    config = lockstepConfig();
    runtime = buildBackend(config, { rootSeed: 41, revision: 'test', dirty: false }, validator);
    // The seam shim, exactly as the bootstrap installs it: seam paths answered by the
    // backend, everything else passed through.
    vi.stubGlobal('fetch', createSeamFetch(config.boundary.api_prefix, runtime.httpBackend, realFetch));
  });

  afterEach(() => {
    runtime.stop();
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('draws every declared component, and nothing that is not one', async () => {
    render(<OperatorPanel {...panelProps(config, runtime)} />);
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    const drawn = [...document.querySelectorAll('[data-flow-node]')].map(
      (node) => node.getAttribute('data-flow-node'),
    );
    expect(drawn.sort()).toEqual(config.shell.components.map((c) => c.id).sort());
    // And the picture agrees with the wiring, which is the gate's claim held here too.
    const flow = buildFlow(config.shell, topology);
    expect(flow.edges.length).toBeGreaterThan(config.shell.components.length);
    expect(flow.suppressed).toEqual(['ctl/clock', 'ctl/heartbeat']);
  });

  it('lights only from heartbeats, and names the two suppressed namespaces on screen', async () => {
    render(<OperatorPanel {...panelProps(config, runtime)} />);
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    expect(document.querySelectorAll('[data-lit="true"]').length).toBe(
      config.shell.components.length,
    );
    expect(screen.getByText(/drawn as the plane, not as edges/)).toBeTruthy();

    // Silence darkens it, and nothing else can.
    runtime.stop();
    await act(async () => {
      vi.advanceTimersByTime(9000);
    });
    expect(document.querySelectorAll('[data-lit="true"]').length).toBe(0);
  });

  it('the list view carries the same components and the same controls', async () => {
    render(<OperatorPanel {...panelProps(config, runtime)} />);
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('view-toggle'));
    });
    const rows = [...document.querySelectorAll('[data-operator-component]')].map((row) =>
      row.getAttribute('data-operator-component'),
    );
    // One shared source, asserted as one — not two lists that happen to agree today.
    expect(rows).toEqual(buildFlow(config.shell, topology).nodes.map((node) => node.id));
    // Protection reads the same in both views, in the surface's own word.
    const clockRow = document.querySelector('[data-operator-component="clock"]');
    expect(within(clockRow as HTMLElement).getByText('protected')).toBeTruthy();
  });

  it('a refused command is surfaced verbatim, in the words the surface used', async () => {
    render(<OperatorPanel {...panelProps(config, runtime)} />);
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('view-toggle'));
    });
    // The clock is protected: its row offers no control, so the refusal is provoked
    // through the seam exactly as the surface would answer it.
    const response = await fetch(`${config.operator.http.command_prefix}/clock/stop`, {
      method: 'POST',
    });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { refused: string }).refused).toMatch(
      /'clock' is protected from the operator plane by rule/,
    );
  });

  it('stop the platform, and the picture shows what it cost two nodes along (SC-001)', async () => {
    render(<OperatorPanel {...panelProps(config, runtime)} />);
    await act(async () => {
      vi.advanceTimersByTime(2100);
      for (let i = 0; i < 90; i++) runtime.clock.tickOnce();
    });

    const sensorsNode = () => document.querySelector('[data-flow-node="sensors"]');
    expect(sensorsNode()?.textContent).toContain('sampling where ownship reported');
    const oceanRows = () =>
      runtime.observationStore.byDatastream(config.sensors.platform.thing_id, 'temperature-050m').length;
    const before = oceanRows();
    expect(before).toBeGreaterThan(0);

    // The cause, applied at the node that owns it.
    await act(async () => {
      await fetch(`${config.operator.http.command_prefix}/platform/stop`, { method: 'POST' });
    });
    await act(async () => {
      for (let i = 0; i < 200; i++) runtime.clock.tickOnce();
      vi.advanceTimersByTime(9000);
    });

    // The platform darkens because its heartbeats ceased, not because the command said so.
    expect(document.querySelector('[data-flow-node="platform"]')?.getAttribute('data-lit')).toBe('false');
    // And two nodes along, the consequence is on screen in the sensors' own words.
    expect(sensorsNode()?.textContent).toContain('ticks old');
    // The ocean sampling stopped: one more sample at most, then nothing.
    expect(oceanRows()).toBeLessThanOrEqual(before + 1);
  });

  it('the platform’s face shows demanded against current, and names the binding limit (SC-002)', async () => {
    render(<OperatorPanel {...panelProps(config, runtime)} />);
    await act(async () => {
      vi.advanceTimersByTime(2100);
      runtime.clock.tickOnce();
    });
    await act(async () => {
      fireEvent.click(document.querySelector('[data-flow-node="platform"]') as HTMLElement);
    });
    expect(screen.getByTestId('flow-drawer').getAttribute('data-drawer-component')).toBe('platform');
    // No demand yet: the face says so rather than showing a demand equal to current.
    expect(screen.getByTestId('platform-binding').textContent).toContain('no demand heard');

    // A demand that cannot be reached: applied to the limit, and the shortfall stated.
    await act(async () => {
      await fetch(config.shell.endpoints.platform_demand, {
        method: 'POST',
        body: JSON.stringify({ course_degrees: 270, speed_m_per_s: 12 }),
      });
      for (let i = 0; i < 5; i++) runtime.clock.tickOnce();
    });
    expect(screen.getByTestId('platform-binding').textContent).toMatch(/binding: turn rate/);
    expect(screen.getByTestId('platform-shortfall').textContent).toMatch(/demanded 12 m\/s/);

    // Turn all the way: the limit stops binding when the platform gets there.
    await act(async () => {
      for (let i = 0; i < 400; i++) runtime.clock.tickOnce();
    });
    expect(screen.getByTestId('platform-binding').textContent).not.toMatch(/turn rate/);
  });

  it('a heartbeat with no detail is not an absent heartbeat', async () => {
    render(<OperatorPanel {...panelProps(config, runtime)} />);
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    // The clock, the broker and the release gate publish no detail line. Reading that
    // as "no heartbeat has ever arrived" was the display inventing a silence that had
    // not happened — found by looking at the running page, and held here.
    const clock = document.querySelector('[data-flow-node="clock"]');
    expect(clock?.getAttribute('data-lit')).toBe('true');
    expect(clock?.textContent).not.toContain('no heartbeat has ever arrived');
    expect(clock?.textContent).toContain('beating, and saying nothing beyond that');
    // A component that genuinely says something says it instead.
    expect(document.querySelector('[data-flow-node="platform"]')?.textContent).toContain('m/s');
  });

  it('an empty series says it is empty rather than drawing a flat line at zero', async () => {
    render(<OperatorPanel {...panelProps(config, runtime)} />);
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    // Nothing has been scored yet, so the monitor's face has nothing to draw and says
    // so — the one thing a zero-height line would quietly claim it did have.
    await act(async () => {
      fireEvent.click(document.querySelector('[data-flow-node="monitor"]') as HTMLElement);
    });
    expect(screen.getByTestId('flow-drawer').textContent).toContain('no residual has been reported yet');
  });
});
