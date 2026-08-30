// @vitest-environment jsdom
/**
 * The consumer tabs against a genuine backend (feature 115).
 *
 * Nothing below the seam is mocked: the runtime is provisioned exactly as the bootstrap
 * provisions it, the forecast these panels go stale against is one the model runner
 * genuinely produced and the publisher genuinely announced, and every fetch is answered
 * by the release gate. A fixture would publish nothing, and the freshness assertions
 * below would have nothing to assert.
 *
 * The two claims that matter most here are the ones a screenshot cannot make: that a
 * newly published forecast changes **nothing** until the reader asks, and that the tabs
 * are marked as not-drogna in both presentations.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { createSeamFetch } from '../../seam/http.js';
import { buildBackend, type BackendRuntime } from '../../backend/runtime/runtime.js';
import { Shell } from '../../shell/Shell.js';
import type { PanelParams } from '../../shell/registry.js';
import { SamplingPanel } from './sampling/SamplingPanel.js';
import { CoursesPanel } from './courses/CoursesPanel.js';
import { FeasibilityPanel } from './feasibility/FeasibilityPanel.js';

class NoLayoutResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoLayoutResizeObserver as unknown as typeof ResizeObserver;

const validator = createSeamValidator();

const noAddress: PanelParams['address'] = {
  current: () => undefined,
  write: () => {},
  onChange: () => () => {},
};

function lockstepConfig(): ConfigRun {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  return config;
}

describe('the downstream consumers against a live backend', { timeout: 180_000 }, () => {
  let config: ConfigRun;
  let runtime: BackendRuntime;
  let removeSeam: (() => void) | undefined;

  function seam(): void {
    const realFetch = globalThis.fetch;
    globalThis.fetch = createSeamFetch(config.boundary.api_prefix, runtime.httpBackend, realFetch);
    removeSeam = () => {
      globalThis.fetch = realFetch;
    };
  }

  function panelProps() {
    return {
      params: {
        config: config.shell,
        client: runtime.transport.connect('consumer-test', config.shell.role),
        validator,
        manifest: runtime.manifest,
        address: noAddress,
      } satisfies PanelParams,
    };
  }

  /** Drive the harness's own loop until it has published `wanted` forecasts. */
  async function tickUntilPublished(wanted: number, limit = 5000): Promise<number> {
    let published = 0;
    const watcher = runtime.transport.connect('consumer-test-watch', config.shell.role);
    const stop = watcher.subscribe(config.shell.topics.run_published, (message) => {
      if ((message.payload as { current: boolean }).current) published += 1;
    });
    for (let tick = 0; tick < limit && published < wanted; tick++) {
      await act(async () => {
        runtime.clock.tickOnce();
        await Promise.resolve();
      });
    }
    stop();
    watcher.disconnect();
    return published;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    config = lockstepConfig();
    runtime = buildBackend(config, { rootSeed: 7, revision: 'test', dirty: false }, validator);
  });

  afterEach(async () => {
    cleanup();
    await act(async () => {
      for (let flush = 0; flush < 200; flush++) await Promise.resolve();
    });
    removeSeam?.();
    removeSeam = undefined;
    runtime.stop();
    vi.useRealTimers();
  });

  it('every consumer tab carries the provenance strip, and it is not dismissible (FR-71)', async () => {
    seam();
    render(<SamplingPanel {...panelProps()} />);
    const strip = document.querySelector('.consumer-strip');
    expect(strip?.textContent).toBe(config.shell.consumers.notice);
    // Outside the scrolling body, so a screenshot from anywhere in the tab carries it.
    expect(strip?.parentElement?.className).toContain('consumer-panel');
    expect(document.querySelector('.consumer-strip button')).toBeNull();
  });

  it('says it has computed nothing before a forecast has been heard (Constitution VII)', () => {
    seam();
    render(<SamplingPanel {...panelProps()} />);
    expect(screen.getByTestId('sampling-run').textContent).toContain('no forecast heard yet');
    expect(screen.getByTestId('sampling-waiting')).toBeTruthy();
  });

  it('goes stale on a newly published forecast and recomputes only when asked (FR-73)', async () => {
    seam();
    render(<SamplingPanel {...panelProps()} />);
    expect(await tickUntilPublished(1)).toBeGreaterThan(0);

    const runShown = () => screen.getByTestId('sampling-run').textContent ?? '';
    const first = runShown();
    expect(first).toContain('against forecast');
    // Nothing is stale yet: one forecast is not a change of forecast.
    expect(screen.queryByTestId('sampling-update')).toBeNull();

    // Plan against it, so there is an answer that could move.
    await act(async () => {
      fireEvent.click(screen.getByTestId('sampling-plan'));
      await Promise.resolve();
    });

    expect(await tickUntilPublished(2)).toBeGreaterThan(1);
    // The halo is up — and the displayed answer still names the forecast it was
    // computed against. This is the assertion the whole feature turns on.
    expect(screen.getByTestId('sampling-update').textContent).toBe('New forecast available — update');
    expect(runShown()).toBe(first);

    await act(async () => {
      fireEvent.click(screen.getByTestId('sampling-update'));
      await Promise.resolve();
    });
    expect(runShown()).not.toBe(first);
    expect(screen.queryByTestId('sampling-update')).toBeNull();
  });

  it('couples the drop count to the budget and the rate, and recomputes at once (FR-74, FR-78)', async () => {
    seam();
    render(<SamplingPanel {...panelProps()} />);
    await tickUntilPublished(1);
    const drops = () => screen.getByTestId('sampling-drops').textContent ?? '';
    fireEvent.change(screen.getByTestId('sampling-budget'), { target: { value: '12' } });
    fireEvent.change(screen.getByTestId('sampling-rate'), { target: { value: '6' } });
    expect(drops()).toContain('2 in 12 h');
    fireEvent.change(screen.getByTestId('sampling-budget'), { target: { value: '24' } });
    expect(drops()).toContain('4 in 24 h');
    fireEvent.change(screen.getByTestId('sampling-rate'), { target: { value: '1' } });
    expect(drops()).toContain('24 in 24 h');
  });

  it('Courses draws the roster, the cloud and three or four candidates (FR-79)', async () => {
    seam();
    render(<CoursesPanel {...panelProps()} />);
    await tickUntilPublished(1);
    await act(async () => {
      for (let flush = 0; flush < 200; flush++) await Promise.resolve();
    });
    const rows = document.querySelectorAll('[data-testid^="courses-row-"]');
    expect(rows.length).toBe(config.shell.consumers.courses.candidate_count);
    expect(screen.getByTestId('courses-map')).toBeTruthy();
    expect(screen.getByTestId('courses-roster')).toBeTruthy();
  });

  it('Courses reorders its candidates when the weighting moves (FR-79)', async () => {
    seam();
    render(<CoursesPanel {...panelProps()} />);
    await tickUntilPublished(1);
    await act(async () => {
      for (let flush = 0; flush < 200; flush++) await Promise.resolve();
    });
    const leader = () =>
      document.querySelector('[data-testid^="courses-row-"] td:nth-child(2)')?.textContent;
    fireEvent.change(screen.getByTestId('courses-weight'), { target: { value: '0' } });
    const byObjective = leader();
    fireEvent.change(screen.getByTestId('courses-weight'), { target: { value: '1' } });
    expect(leader()).not.toBe(byObjective);
  });

  it('Feasibility lanes say where they came from, and Off changes the answer (FR-76, FR-80)', async () => {
    seam();
    render(<FeasibilityPanel {...panelProps()} />);
    await tickUntilPublished(1);
    await act(async () => {
      for (let flush = 0; flush < 200; flush++) await Promise.resolve();
    });
    const lanes = document.querySelectorAll('[data-testid="feasibility-lanes"] .lane-row');
    expect(lanes.length).toBe(config.shell.consumers.feasibility.lanes.length);
    // Every lane wears its provenance, and at least one of each kind is present.
    const provenances = [...document.querySelectorAll('[data-provenance]')].map((node) =>
      node.getAttribute('data-provenance'),
    );
    expect(provenances).toContain('synthesised');
    expect(provenances).toContain('seam');

    const setsBefore = screen.getByTestId('feasibility-sets').textContent;
    await act(async () => {
      fireEvent.change(screen.getByTestId('feasibility-confidence-sea-state'), {
        target: { value: 'off' },
      });
      await Promise.resolve();
    });
    expect(screen.getByTestId('feasibility-sets').textContent).not.toBe(setsBefore);
  });

  it('Feasibility recomputes around a locked task (FR-80)', async () => {
    seam();
    render(<FeasibilityPanel {...panelProps()} />);
    await tickUntilPublished(1);
    await act(async () => {
      for (let flush = 0; flush < 200; flush++) await Promise.resolve();
    });
    const before = screen.getByTestId('feasibility-sets').textContent ?? '';
    const locks = document.querySelectorAll('[data-testid^="feasibility-lock-"]');
    expect(locks.length).toBe(config.shell.consumers.feasibility.tasks.length);
    // Lock whatever the leading set gives up: the sets have to rearrange around it.
    const givenUp = /gives up: ([^\n]+)/.exec(before)?.[1];
    expect(givenUp).toBeTruthy();
    const task = config.shell.consumers.feasibility.tasks.find((entry) =>
      givenUp?.includes(entry.label),
    );
    expect(task).toBeTruthy();
    if (!task) return;
    await act(async () => {
      fireEvent.click(screen.getByTestId(`feasibility-lock-${task.id}`));
      await Promise.resolve();
    });
    const after = screen.getByTestId('feasibility-sets').textContent ?? '';
    expect(after).not.toBe(before);
    expect(after).toContain(task.label);
  });
});

describe('the consumer tabs are marked in both presentations (FR-71)', () => {
  const shellConfig = (JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun).shell;
  const consumerViews = shellConfig.views.filter((view) => view.kind === 'consumer');

  afterEach(cleanup);

  async function shellAt(viewport: number) {
    const config = lockstepConfig();
    const runtime = buildBackend(config, { rootSeed: 11, revision: 'test', dirty: false }, validator);
    const realFetch = globalThis.fetch;
    globalThis.fetch = createSeamFetch(config.boundary.api_prefix, runtime.httpBackend, realFetch);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: viewport });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    window.location.hash = '#/view/intro';
    await act(async () => {
      render(
        <Shell
          config={config.shell}
          client={runtime.transport.connect('shell-test', config.shell.role)}
          validator={validator}
          manifest={runtime.manifest}
          onImportManifest={() => undefined}
        />,
      );
      await Promise.resolve();
    });
    return () => {
      globalThis.fetch = realFetch;
      runtime.stop();
    };
  }

  it('declares three consumer views, and none of the harness’s own', () => {
    expect(consumerViews.length).toBe(3);
    // The kind is a property of the configuration, not a list in the shell: this is what
    // makes a fourth consumer a line in a document rather than an edit to the tab strip.
    expect(shellConfig.views.filter((view) => view.kind !== 'consumer').length).toBeGreaterThan(0);
  });

  it('marks them in the narrow stack', async () => {
    const done = await shellAt(390);
    try {
      const marked = [...document.querySelectorAll('.stack-tab[data-kind="consumer"]')].map(
        (tab) => tab.getAttribute('data-view'),
      );
      expect(marked.sort()).toEqual(consumerViews.map((view) => view.id).sort());
    } finally {
      done();
    }
  });

  it('marks them in the dock', async () => {
    const done = await shellAt(1440);
    try {
      const marked = document.querySelectorAll('.tab-kind[data-kind="consumer"]');
      expect(marked.length).toBe(consumerViews.length);
      // And the harness's own tabs are drawn as they always were.
      expect(document.querySelectorAll('.tab-kind[data-kind="harness"]').length).toBe(
        shellConfig.views.length - consumerViews.length,
      );
    } finally {
      done();
    }
  });
});
