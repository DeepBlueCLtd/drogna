// @vitest-environment jsdom
/**
 * The Forecast tab against a live backend (feature 123, SC-005, SC-009, SC-010).
 *
 * Nothing below the seam is mocked: the scheduler decides, the runner occupies its cost
 * and publishes, the monitor scores real residuals and publishes the indicator on the
 * declared socket, and the panel draws what crossed the broker.
 *
 * Two claims are the reason this file exists. **An empty gauge and an unheard indicator
 * are different facts** (FR-119), and the panel has to say which it is looking at. And
 * **a run held for cost, a run declined by the minimum interval, and no run requested must
 * be distinguishable on the surface without reading a log** (AT-08) — which is a claim
 * about the DOM and not about the scheduler, so it is checked here.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDockviewPanelProps } from 'dockview-react';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { buildBackend, type BackendRuntime } from '../../backend/runtime/runtime.js';
import { createSeamFetch } from '../../seam/http.js';
import type { PanelParams } from '../../shell/Shell.js';
import { ForecastPanel, FORECAST_REGIONS } from './ForecastPanel.js';
import { FORECAST_TOUR_STEPS, uncoveredSubjects } from '../../shell/walkthrough/tour.js';

const validator = createSeamValidator();
const realFetch = globalThis.fetch;

function lockstepConfig(): ConfigRun {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  return config;
}

const noAddress: PanelParams['address'] = {
  names: () => false,
  current: () => undefined,
  write: () => {},
  onChange: () => () => {},
};

describe('the Forecast tab (feature 123)', { timeout: 240_000 }, () => {
  let config: ConfigRun;
  let runtime: BackendRuntime;
  let fetched: string[];

  function panelProps() {
    const params: PanelParams = {
      config: config.shell,
      client: runtime.transport.connect(`forecast-test-${Math.random()}`, config.shell.role),
      validator,
      manifest: runtime.manifest,
      address: noAddress,
    };
    return { params } as unknown as IDockviewPanelProps<PanelParams>;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    config = lockstepConfig();
    runtime = buildBackend(config, { rootSeed: 4242, startCondition: 'loitering', revision: 'test', dirty: false }, validator);
    // The panel reads the store's inventory once on mount, through the seam the browser
    // uses. Counted, so the no-polling claim below is about fetches and not only about
    // rendered text.
    const seamFetch = createSeamFetch(config.boundary.api_prefix, runtime.httpBackend, realFetch);
    fetched = [];
    vi.stubGlobal('fetch', ((input: RequestInfo | URL, init?: RequestInit) => {
      fetched.push(String(input));
      return seamFetch(input, init);
    }) as typeof globalThis.fetch);
  });

  afterEach(() => {
    cleanup();
    runtime.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('FR-119: with the indicator topic silent it names the absence and draws no gauge', async () => {
    render(<ForecastPanel {...panelProps()} />);
    await act(async () => {
      runtime.clock.tickOnce();
    });
    // Nothing has been measured, so nothing has been published on the socket. The panel
    // says which topic is silent — an empty gauge would say "the figure is zero", which is
    // a different claim from "nobody has published one".
    expect(screen.queryByTestId('indicator-gauge')).toBeNull();
    const absent = screen.getByTestId('indicator-absent');
    expect(absent.textContent).toContain(config.shell.topics.forecast_indicator);
    expect(absent.textContent).toMatch(/empty rather than zero/);
  });

  it('AT-10: with the monitor’s residual published, the gauge names what it is showing', async () => {
    render(<ForecastPanel {...panelProps()} />);
    await act(async () => {
      // Driven until the monitor has something to publish: it scores a residual only once
      // a forecast instance exists to score against, which is the loop having turned.
      for (let i = 0; i < config.scheduler.max_interval_ticks * 3 && screen.queryByTestId('indicator-gauge') === null; i++) {
        runtime.clock.tickOnce();
      }
    });
    const gauge = screen.getByTestId('indicator-gauge');
    // Which indicator, and whose. The socket may carry somebody else's figure one day, so
    // a gauge that did not say would be a number with a shape around it.
    expect(gauge.textContent).toContain('sound-speed-residual');
    expect(gauge.textContent).toContain(config.monitor.id);
    // Reported, never derived from a configured expectation: the threshold drawn is the
    // one the monitor is scoring against.
    expect(gauge.textContent).toContain(String(config.monitor.threshold_m_per_s));
  });

  it('FR-118: the cost of a run is stated beneath the gauge, in the same frame', async () => {
    render(<ForecastPanel {...panelProps()} />);
    await act(async () => {
      for (let i = 0; i < config.model_runner.cost.restate_every_ticks + 2; i++) runtime.clock.tickOnce();
    });
    const cost = screen.getByTestId('run-cost');
    expect(cost.textContent).toMatch(/A run costs/);
    // Stated by the component that will spend it, and said so: the panel names the
    // publisher rather than presenting the figure as its own.
    expect(cost.textContent).toContain(config.model_runner.id);
    // It sits inside the same region as the gauge. Need and cost are read together or the
    // region has not done its job.
    const region = document.querySelector('[data-region="indicator"]');
    expect(region?.contains(cost)).toBe(true);
  });

  it('AT-08: a run, a hold and nothing requested are three different things on the surface', async () => {
    render(<ForecastPanel {...panelProps()} />);
    // Nothing requested: the timeline says so, in those terms, rather than being empty.
    expect(screen.getByText(/no run has been announced yet/)).toBeDefined();

    await act(async () => {
      for (let i = 0; i < config.scheduler.max_interval_ticks * 3; i++) runtime.clock.tickOnce();
    });
    const entries = [...document.querySelectorAll('.forecast-run')];
    expect(entries.length).toBeGreaterThan(0);
    const text = entries.map((entry) => entry.textContent ?? '');
    // A run, labelled by what asked for it and saying what it occupied.
    expect(text.some((line) => /scheduled/.test(line))).toBe(true);
    expect(text.some((line) => /tick\(s\) after it began/.test(line))).toBe(true);
    // A hold, which is a different entry with a different mark and a different sentence —
    // not the same row in another colour.
    expect(document.querySelector('.forecast-run-held')).not.toBeNull();
    expect(text.some((line) => /held for cost/.test(line))).toBe(true);
    expect(text.some((line) => /validity still to decay/.test(line))).toBe(true);
    // Every entry is a button, so the whole timeline is reachable from the keyboard.
    expect(entries.every((entry) => entry.tagName === 'BUTTON')).toBe(true);
  });

  it('FR-17: the centre and right regions state that they are not built, and name feature 124', async () => {
    render(<ForecastPanel {...panelProps()} />);
    await act(async () => {
      runtime.clock.tickOnce();
    });
    for (const region of ['volume', 'ahead']) {
      const section = document.querySelector(`[data-region="${region}"]`);
      expect(section?.textContent).toMatch(/not built/);
      expect(section?.textContent).toContain('124');
      // An empty canvas is a claim the shell is not entitled to make.
      expect(section?.querySelector('canvas')).toBeNull();
    }
  });

  it('SC-010: nothing polls — the clock alone changes nothing the store did not announce', async () => {
    render(<ForecastPanel {...panelProps()} />);
    await act(async () => {
      for (let i = 0; i < config.model_runner.cost.restate_every_ticks + 2; i++) runtime.clock.tickOnce();
    });
    const before = document.querySelector('[data-region="timeline"]')?.textContent;
    const fetchesBefore = fetched.length;
    // A hundred ticks with no run announced: the timeline is a record of announcements, so
    // it cannot move — and no request may be made either. The one fetch this panel makes is
    // the store's inventory, on mount, and a timer that repeated it would be a poll whatever
    // the display did with the answer.
    await act(async () => {
      for (let i = 0; i < 100; i++) runtime.clock.tickOnce();
    });
    expect(document.querySelector('[data-region="timeline"]')?.textContent).toBe(before);
    expect(fetched.length).toBe(fetchesBefore);
  });

  it('draws the runs that happened before the console opened, and claims no cause for them', async () => {
    // A console opens after the pre-roll, so a situation's own runs are already past and no
    // announcement of them is coming. A timeline showing none of them would say "no run has
    // been announced yet" about a store holding several, which is a silence the display
    // invented. What it must not do is guess: a holding says when it was published and
    // nothing about what asked for it.
    await act(async () => {
      for (let i = 0; i < config.scheduler.max_interval_ticks * 3; i++) runtime.clock.tickOnce();
    });
    cleanup();
    render(<ForecastPanel {...panelProps()} />);
    await act(async () => {
      for (let i = 0; i < 200; i++) await Promise.resolve();
    });
    const entries = [...document.querySelectorAll('.forecast-run')];
    expect(entries.length).toBeGreaterThan(0);
    const text = entries.map((entry) => entry.textContent ?? '');
    expect(text.some((line) => /before this console opened/.test(line))).toBe(true);
    expect(text.some((line) => /not recoverable from a holding/.test(line))).toBe(true);
  });

  it('FR-140: every region the surface offers has a step in the tour, and no step invents one', () => {
    expect(uncoveredSubjects('forecast', FORECAST_REGIONS, FORECAST_TOUR_STEPS)).toEqual([]);
    expect(FORECAST_REGIONS.length).toBeGreaterThan(0);
  });
});
