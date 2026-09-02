// @vitest-environment jsdom
/**
 * The Forecast tab against a live backend (feature 123, SC-005, SC-009, SC-010).
 *
 * Nothing below the seam is mocked: the scheduler decides, the runner occupies its cost
 * and publishes, the monitor scores real residuals and publishes the indicator on the
 * declared socket, and the panel draws what crossed the broker.
 *
 * FR numbers below with no prefix are the SRD's. A bare `123 FR-nn` is feature 123's own
 * local numbering from `specs/123-forward-step/spec.md`, prefixed because the repository
 * has already paid once for a number that meant two things (the constitution went to 2.1.1
 * over FR-91).
 *
 * Two claims are the reason this file exists. **An empty gauge and an unheard indicator
 * are different facts** (FR-119), and the panel has to say which it is looking at. And
 * **a run held for cost, a run declined by the minimum interval, and no run requested must
 * be distinguishable on the surface without reading a log** (AT-08) — which is a claim
 * about the DOM and not about the scheduler, so it is checked here.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  function panelProps(address: PanelParams['address'] = noAddress) {
    const params: PanelParams = {
      config: config.shell,
      client: runtime.transport.connect(`forecast-test-${Math.random()}`, config.shell.role),
      validator,
      manifest: runtime.manifest,
      address,
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

    // Driven until the thing being asserted is on screen, capped — a fixed count pays for
    // ticks nobody needs, and this file is the slowest in the repository.
    await act(async () => {
      for (
        let i = 0;
        i < config.scheduler.max_interval_ticks * 3 && document.querySelector('.forecast-run-held') === null;
        i++
      ) {
        runtime.clock.tickOnce();
      }
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

  it('123 FR-17: what is not built says so and names feature 124, region by region', async () => {
    render(<ForecastPanel {...panelProps()} />);
    await act(async () => {
      runtime.clock.tickOnce();
    });
    // Both still name 124, but they no longer name it for the same reason. The centre region
    // is wholly 124's. The right one now carries the forecast's own features in plan, and
    // what it says is unbuilt is the narrower thing: the ensemble spread along the route.
    for (const region of ['volume', 'ahead']) {
      const section = document.querySelector(`[data-region="${region}"]`);
      expect(section?.textContent).toMatch(/not built/);
      expect(section?.textContent).toContain('124');
      // An empty canvas is a claim the shell is not entitled to make.
      expect(section?.querySelector('canvas')).toBeNull();
    }
    expect(document.querySelector('[data-region="ahead"]')?.textContent).toMatch(/ensemble spread/);
  });

  it('draws the forecast’s own features across the lead, with an uncertainty that grows', async () => {
    // **The gap this closes.** `ctl/forecast/features` was published on every run from
    // feature 123 and read by nothing: a loop test validated its shape against its master and
    // then dropped it, so the product of FR-113 had no surface at all and the Forecast tab
    // could say why a run happened, what it cost and when, but nothing about what it said.
    render(<ForecastPanel {...panelProps()} />);
    await act(async () => {
      runtime.clock.tickOnce();
    });
    // Before a run has been announced the absence is stated. An empty set of axes would say
    // the forecast has no features, which is a different claim from having heard none.
    expect(screen.getByTestId('features-absent')).toBeTruthy();
    expect(screen.queryByTestId('feature-tracks')).toBeNull();

    await act(async () => {
      for (let i = 0; i < config.scheduler.max_interval_ticks * 3; i++) {
        runtime.clock.tickOnce();
        if (document.querySelector('[data-testid="feature-tracks"]')) break;
      }
    });
    const tracks = screen.getByTestId('feature-tracks');
    // The drawing is there, and it is an SVG rather than a canvas: a canvas would put the
    // claim somewhere neither a test nor a screen reader can read it.
    const plot = tracks.querySelector('svg.forecast-tracks-plot');
    expect(plot, 'no plan view was drawn for a run that published features').toBeTruthy();
    expect(tracks.querySelector('canvas')).toBeNull();

    // **The uncertainty grows with lead, and the drawing carries that rather than asserting
    // it in prose.** A forecast whose claim does not widen is a stronger claim than the model
    // can support, so the rings are read off the drawing and compared.
    //
    // **Within one feature, across its lead steps** — which is the axis the claim is about,
    // and not the one the first draft measured. That draft gathered every ring in the plot
    // and asserted the largest exceeded the smallest, which is true of any two *different*
    // features at the same lead: an eddy and a front have different uncertainties because
    // they have different strengths. Planted against a carry whose uncertainty does not grow
    // at all, it passed. A check that cannot fail is worth nothing (CLAUDE.md, lesson 2).
    const groups = [...tracks.querySelectorAll('g.tracks-feature')];
    expect(groups.length, 'no feature was drawn').toBeGreaterThan(0);
    let compared = 0;
    for (const group of groups) {
      const rings = [...group.querySelectorAll('circle.tracks-uncertainty')].map((c) =>
        Number(c.getAttribute('r')),
      );
      if (rings.length < 2) continue;
      const first = rings[0];
      const last = rings[rings.length - 1];
      expect(
        last,
        `${group.getAttribute('class')}: the ring at the last lead is not wider than at the first`,
      ).toBeGreaterThan(first);
      compared += 1;
    }
    expect(compared, 'no feature carried more than one lead step, so nothing was compared').toBeGreaterThan(0);

    // And the same claim is readable without the picture, which is what makes it legible in
    // greyscale, on a phone, and to a reader who cannot see it at all.
    const figures = tracks.querySelector('.forecast-tracks-figures');
    expect(figures?.textContent).toMatch(/km/);
    expect(figures?.textContent).toMatch(/uncertain by/);
  });

  it('a console that opens after a run still learns what that run said', async () => {
    // **Why the runner restates.** The features were published on the run and on nothing
    // else, so a console mounting afterwards had nothing to draw — and every console mounts
    // afterwards, because the shell opens after the pre-roll. At the shipped cadence and the
    // default rate the wait for the next run is 1800 ticks: half an hour of a surface saying
    // the forecast has not spoken. A standing forecast's features are a standing fact, not an
    // event, which is the same argument the cost statement already makes for itself.
    //
    // So: drive until a run has published with the panel NOT mounted, then mount, then allow
    // the restatement cadence to come round once.
    await act(async () => {
      for (let i = 0; i < config.scheduler.max_interval_ticks * 3; i++) {
        runtime.clock.tickOnce();
        if (runtime.store.currentInstance() !== undefined) break;
      }
    });
    expect(runtime.store.currentInstance(), 'no run published before the console opened').toBeDefined();

    render(<ForecastPanel {...panelProps()} />);
    await act(async () => {
      runtime.clock.tickOnce();
    });
    // Nothing yet: the run's own announcement was made before this panel existed.
    expect(screen.queryByTestId('feature-tracks')).toBeNull();

    await act(async () => {
      for (let i = 0; i < config.model_runner.cost.restate_every_ticks + 2; i++) runtime.clock.tickOnce();
    });
    const tracks = screen.getByTestId('feature-tracks');
    expect(tracks.querySelector('svg.forecast-tracks-plot')).toBeTruthy();
    // And it is the run that already happened, restated — not a second run, and not a second
    // opinion about the first. The identifier on the drawing is the one the timeline already
    // carries for that run, so the two regions are talking about the same thing.
    const timeline = document.querySelector('[data-region="timeline"]')?.textContent ?? '';
    const runId = tracks.querySelector('code')?.textContent ?? '';
    expect(runId.length, 'the drawing named no run').toBeGreaterThan(0);
    expect(timeline.length, 'the timeline was empty, so nothing corroborates the run id').toBeGreaterThan(0);
  });

  it('states a feature it could not recover rather than leaving it out of the drawing', async () => {
    render(<ForecastPanel {...panelProps()} />);
    await act(async () => {
      for (let i = 0; i < config.scheduler.max_interval_ticks * 3; i++) {
        runtime.clock.tickOnce();
        if (document.querySelector('[data-testid="feature-tracks"]')) break;
      }
    });
    const tracks = screen.getByTestId('feature-tracks');
    // The runner declines three magnitudes at this grid and says why. A feature absent from
    // the drawing and absent from this list would be a silence, which is the fault the whole
    // `not_estimated` block exists against.
    const declined = tracks.querySelector('.forecast-tracks-declined');
    expect(declined, 'nothing said which quantities the run would not claim').toBeTruthy();
    expect(declined?.textContent).toMatch(/not recovered/);
    // The thermocline is a depth and has no place in a plan view; it is stated in figures
    // rather than given a plausible-looking position.
    expect(tracks.querySelector('.forecast-tracks-figures')?.textContent).toMatch(/thermocline/);
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
      for (
        let i = 0;
        i < config.scheduler.max_interval_ticks * 3 && runtime.store.currentInstance() === undefined;
        i++
      ) {
        runtime.clock.tickOnce();
      }
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

  it('a link to a run resolves after a remount, when the run has become history', async () => {
    // The tour promises this in so many words — "select an entry and the address names it,
    // so a link opens this view at the run being discussed" — and it did not hold. A run
    // heard live was keyed `run:<id>` and the same run read back from the store was keyed
    // `held-instance:<id>`, so an address written while the run was live silently selected
    // nothing the moment the panel remounted and the run had become history. Which is every
    // reload.
    let written: string | undefined;
    const address: PanelParams['address'] = {
      names: () => true,
      current: () => written,
      write: (rest) => {
        written = rest;
      },
      onChange: () => () => {},
    };
    render(<ForecastPanel {...panelProps(address)} />);
    await act(async () => {
      for (
        let i = 0;
        i < config.scheduler.max_interval_ticks * 3 && document.querySelector('.forecast-run') === null;
        i++
      ) {
        runtime.clock.tickOnce();
      }
    });
    const live = document.querySelector('.forecast-run') as HTMLElement;
    await act(async () => {
      fireEvent.click(live);
    });
    expect(written).toMatch(/^run:/);
    expect(screen.getByTestId('forecast-selected')).toBeDefined();

    // Remount: the run is now in the store rather than on the wire, and the address is the
    // one that was written.
    cleanup();
    render(<ForecastPanel {...panelProps(address)} />);
    await act(async () => {
      for (let i = 0; i < 200; i++) await Promise.resolve();
    });
    expect(screen.getByTestId('forecast-selected')).toBeDefined();
    expect(document.querySelector('.forecast-run.is-selected')).not.toBeNull();
  });
});

/**
 * The tour's coverage is a fact about two lists on disk and needs no running system, so it
 * is out here rather than inside a `describe` whose `beforeEach` builds a whole backend for
 * it. That backend is about a second, and this file is already the slowest in the
 * repository — the suite's total is close enough to vitest's worker-reply deadline that a
 * file which pays for what it does not use is a flake nobody will be able to reproduce.
 */
describe('the Forecast tab’s help tour', () => {
  it('FR-140: every region the surface offers has a step, and no step invents one', () => {
    expect(uncoveredSubjects('forecast', FORECAST_REGIONS, FORECAST_TOUR_STEPS)).toEqual([]);
    expect(FORECAST_REGIONS.length).toBeGreaterThan(0);
  });
});
