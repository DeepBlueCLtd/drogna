// @vitest-environment jsdom
/**
 * The panels against a genuine backend: nothing here is mocked below the seam. The
 * runtime is provisioned exactly as the bootstrap provisions it, the shell client is
 * a read-only broker connection, and what the assertions read is what a heartbeat or
 * a clock sample actually caused (Constitution VII: the test would fail against a
 * fixture, because a fixture publishes nothing).
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDockviewPanelProps } from 'dockview-react';
import runConfigDocument from '../../config/run.json';
import type { ConfigRun } from '../generated/types.js';
import { createSeamValidator } from '../seam/validate.js';
import { buildBackend, type BackendRuntime } from '../backend/runtime/runtime.js';
import type { PanelParams } from '../shell/Shell.js';
import { createSeamFetch } from '../seam/http.js';
import { SystemPanel } from './system/SystemPanel.js';
import { MessagesPanel } from './messages/MessagesPanel.js';
import { HoldingsPanel } from './holdings/HoldingsPanel.js';
import { IntroPanel } from './intro/IntroPanel.js';
import { MapPanel } from './map/MapPanel.js';

const validator = createSeamValidator();

function lockstepConfig(): ConfigRun {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  return config;
}

function panelProps(config: ConfigRun, runtime: BackendRuntime) {
  const params: PanelParams = {
    config: config.shell,
    client: runtime.transport.connect('shell-test', config.shell.role),
    validator,
    manifest: runtime.manifest,
  };
  return { params } as unknown as IDockviewPanelProps<PanelParams>;
}

describe('the panels against a live backend', () => {
  let config: ConfigRun;
  let runtime: BackendRuntime;

  beforeEach(() => {
    vi.useFakeTimers();
    config = lockstepConfig();
    runtime = buildBackend(config, { rootSeed: 7, revision: 'test', dirty: false }, validator);
  });

  afterEach(() => {
    runtime.stop();
    cleanup();
    vi.useRealTimers();
  });

  it('System lights exactly the components whose heartbeats arrived, greys the rest', () => {
    render(<SystemPanel {...panelProps(config, runtime)} />);
    act(() => vi.advanceTimersByTime(2100));
    const lit = document.querySelectorAll('tr[data-lit="true"]');
    expect([...lit].map((row) => row.getAttribute('data-component')).sort()).toEqual([
      'advisory-source',
      'advisory-store',
      'boundary',
      'broker',
      'clock',
      'coverage-store',
      'env-generator',
      'feature-store',
      'ingest',
      'model-runner',
      'monitor',
      'observation-store',
      'offload',
      'operator',
      'planner',
      'query',
      'scheduler',
      'sensors',
      'telemetry',
    ]);
    // The full declared layout renders from day one (FR-16): every future beat greyed.
    expect(document.querySelectorAll('tr[data-component]')).toHaveLength(
      config.shell.components.length,
    );
    // Every declared beat has now landed: nothing renders greyed.
    expect(screen.queryAllByText('not heard').length).toBe(config.shell.components.length - 19);
  });

  it('a component that stops goes dark because its heartbeats cease', () => {
    render(<SystemPanel {...panelProps(config, runtime)} />);
    act(() => vi.advanceTimersByTime(2100));
    expect(document.querySelectorAll('tr[data-lit="true"]')).toHaveLength(19);
    runtime.stop();
    // Past every liveness window, with the sweep interval re-evaluating.
    act(() => vi.advanceTimersByTime(8000));
    expect(document.querySelectorAll('tr[data-lit="true"]')).toHaveLength(0);
  });

  it('Messages counts received traffic and holds the refusal claim at zero', () => {
    render(<MessagesPanel {...panelProps(config, runtime)} />);
    // Provoke traffic: heartbeats on their cadence.
    act(() => vi.advanceTimersByTime(2100));
    const counter = screen.getByTestId('refusal-counter');
    expect(counter.textContent).toMatch(/\d+ received · 0 refused by their schema/);
    expect(Number(/^(\d+) received/.exec(counter.textContent ?? '')?.[1])).toBeGreaterThan(0);
  });

  it('Messages hides heartbeats from the list by default and the toggle displays them; both stay counted', () => {
    render(<MessagesPanel {...panelProps(config, runtime)} />);
    act(() => vi.advanceTimersByTime(2100));
    const listedTopics = () =>
      [...document.querySelectorAll('.message-topic')].map((cell) => cell.textContent);
    // Heartbeats arrived (the counter proves it) but are not rendered.
    expect(Number(/^(\d+) received/.exec(screen.getByTestId('refusal-counter').textContent ?? '')?.[1])).toBeGreaterThan(0);
    expect(listedTopics()).not.toContain(config.shell.topics.heartbeat);
    // The toggle is display-only: checking it reveals the buffered heartbeats.
    const toggle = screen.getByRole('checkbox');
    act(() => toggle.click());
    expect(listedTopics()).toContain(config.shell.topics.heartbeat);
  });

  it('Holdings lists what the store holds, fetched through the seam, and opens a manifest', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = createSeamFetch('/api', runtime.httpBackend, realFetch);
    try {
      render(<HoldingsPanel {...panelProps(config, runtime)} />);
      // Flush the fetch → validate → setState chain (microtasks only; timers are fake).
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByTestId('holdings-count').textContent).toMatch(/^2 holding\(s\)/);
      const archiveRow = document.querySelector('tr[data-era="archive"]');
      expect(archiveRow).not.toBeNull();
      act(() => (archiveRow as HTMLElement).click());
      expect(screen.getByTestId('manifest-json').textContent).toMatch(/"analytic_form_version"/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('the topic tree lights only from received traffic, and never hides an undeclared topic (E12, E13)', () => {
    render(<MessagesPanel {...panelProps(config, runtime)} />);
    // Structure renders dark: declared nodes exist before any traffic is heard by
    // this subscription.
    const obsNode = document.querySelector('[data-topic-path="obs"]');
    expect(obsNode).not.toBeNull();
    expect(obsNode?.getAttribute('data-lit')).toBe('false');
    // A sample tick produces observation traffic; the branch and its leaves light.
    act(() => {
      for (let i = 0; i < 30; i++) runtime.clock.tickOnce();
    });
    expect(document.querySelector('[data-topic-path="obs"]')?.getAttribute('data-lit')).toBe('true');
    expect(
      document.querySelector('[data-topic-path="obs/platform-a/temperature-050m"]')?.getAttribute('data-lit'),
    ).toBe('true');
    // An arrival on a topic no declaration names is a visible finding, not a silence.
    const rogue = runtime.transport.connect('rogue', 'sensors');
    act(() => rogue.publish('obs/platform-a/mystery', { not: 'declared' }));
    const undeclared = document.querySelector('[data-topic-path="obs/platform-a/mystery"]');
    expect(undeclared?.className).toMatch(/topic-undeclared/);
  });

  it('Map states WebGL absence honestly, lists advisories as present-and-stating-empty, and the composer offers only what is served', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = createSeamFetch('/api', runtime.httpBackend, realFetch);
    try {
      render(<MapPanel {...panelProps(config, runtime)} />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      // jsdom has no WebGL: the canvas says so instead of pretending (FR-40).
      expect(screen.getByText(/WebGL is unavailable here/)).toBeTruthy();
      // The advisories collection is present and stating empty (108's claim, read here).
      expect(screen.getByText(/present and stating empty/)).toBeTruthy();
      // Open the composer: it enumerates from the served subset statement and
      // collections list, never a stub (FR-41).
      act(() => screen.getByText('EDR composer').click());
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      const collectionOptions = [...document.querySelectorAll('.composer select')].flatMap((select) =>
        [...select.querySelectorAll('option')].map((option) => option.value),
      );
      expect(collectionOptions).toContain('nowcast');
      expect(collectionOptions).toContain('archive');
      expect(collectionOptions).toContain('area');
      // The missing step is named until the URL can assemble.
      expect(screen.getByTestId('composer-url').textContent).toMatch(/choose a collection/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('Intro states the synthetic-throughout disclaimer and the run identity (FR-01)', () => {
    render(<IntroPanel {...panelProps(config, runtime)} />);
    expect(screen.getByText(/deliberately\s+fake/)).toBeTruthy();
    expect(screen.getByText(runtime.manifest.run_id)).toBeTruthy();
  });
});
