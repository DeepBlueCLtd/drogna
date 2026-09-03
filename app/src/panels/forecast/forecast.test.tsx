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
import type { AnalysisContributions, ConfigRun } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { buildBackend, type BackendRuntime } from '../../backend/runtime/runtime.js';
import { createSeamFetch } from '../../seam/http.js';
import type { PanelParams } from '../../shell/Shell.js';
import { ForecastPanel, FORECAST_REGIONS } from './ForecastPanel.js';
import { contributionResidual, raysFor } from './rays.js';
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
    // Both still name 124, but neither names it for the whole region any more, and what each
    // says is unbuilt has narrowed to something specific. The centre region reads the shares
    // the analyst already publishes and names 124 for the rays alone; the right one draws the
    // forecast's features and names 124 for the ensemble spread along the route.
    for (const region of ['volume', 'ahead']) {
      const section = document.querySelector(`[data-region="${region}"]`);
      expect(section?.textContent).toMatch(/not built/);
      expect(section?.textContent).toContain('124');
      // An empty canvas is a claim the shell is not entitled to make.
      expect(section?.querySelector('canvas')).toBeNull();
    }
    expect(document.querySelector('[data-region="ahead"]')?.textContent).toMatch(/ensemble spread/);
    expect(document.querySelector('[data-region="volume"]')?.textContent).toMatch(/rays/);
  });

  it('draws the share field as a map, and opens a column from it', async () => {
    // **The region this replaces was a stub, and then a grid of grey buttons over a list of
    // percentages.** Neither showed the thing: the interesting fact in the provenance field is
    // spatial — the measurement share is a footprint, bright where a sensor reached — and a
    // list of four numbers for one column cannot show a footprint.
    render(<ForecastPanel {...panelProps()} />);
    await act(async () => {
      for (let i = 0; i < config.scheduler.max_interval_ticks * 3; i++) {
        runtime.clock.tickOnce();
        if (document.querySelector('.forecast-share-map')) break;
      }
    });
    await act(async () => {
      await Promise.resolve();
    });

    const map = document.querySelector('svg.forecast-share-map');
    expect(map, 'no share field was drawn after an analysis was announced').toBeTruthy();
    const cells = map?.querySelectorAll('rect.share-cell') ?? [];
    expect(cells.length, 'the field was drawn with no cells in it').toBeGreaterThan(50);

    // **The field varies.** A map whose cells all carry the same value is a map of nothing —
    // which is what a broken parameter match, or a slab read off the wrong axis, would produce.
    const opacities = new Set([...cells].map((cell) => cell.getAttribute('fill-opacity')));
    expect(opacities.size, 'every cell in the field was drawn at one value').toBeGreaterThan(1);

    // It was read through the query layer, by the query the standard has for a field.
    expect(fetched.some((url) => url.includes('/area?') && url.includes('-provenance'))).toBe(true);

    // The legend is always present, because identity is never colour alone.
    const legend = document.querySelectorAll('.forecast-share-legend li');
    expect(legend.length).toBe(4);

    // Clicking a cell opens its water column, read one position query per depth.
    await act(async () => {
      fireEvent.click(cells[Math.floor(cells.length / 2)]);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const profile = screen.getByTestId('column-profile');
    expect(profile.querySelectorAll('.forecast-column-segment').length, 'the column drew no stack').toBeGreaterThan(0);
    // And the same claim is printed, so the profile reads with the colour removed.
    expect(profile.textContent).toMatch(/measurement/);
    expect(profile.textContent).toMatch(/%/);
    expect(fetched.some((url) => url.includes('/position?') && url.includes('-provenance'))).toBe(true);
  });

  it('changes depth on a reader’s word, and asks the query layer again for it', async () => {
    // The footprint is a claim about depth as well as position — a sensor reaches the surface
    // and not the bottom — so the depth control has to actually re-read the field, and the
    // proof of that is a second area query naming the second depth.
    render(<ForecastPanel {...panelProps()} />);
    await act(async () => {
      for (let i = 0; i < config.scheduler.max_interval_ticks * 3; i++) {
        runtime.clock.tickOnce();
        if (document.querySelector('.forecast-share-map')) break;
      }
    });
    await act(async () => {
      await Promise.resolve();
    });
    const areasBefore = fetched.filter((url) => url.includes('/area?')).length;
    expect(areasBefore).toBeGreaterThan(0);

    const depthChips = [...document.querySelectorAll('[aria-label="depth"] .forecast-chip')];
    expect(depthChips.length, 'the depth control offered no levels').toBeGreaterThan(1);
    await act(async () => {
      fireEvent.click(depthChips[depthChips.length - 1]);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const areas = fetched.filter((url) => url.includes('/area?'));
    expect(areas.length, 'changing depth asked the query layer nothing').toBeGreaterThan(areasBefore);
    // **And it asked for a different depth**, which is the part that could quietly not happen:
    // a control that re-renders without re-reading would grow the count and fetch the same
    // slab for ever, and the map would sit still while the label above it changed.
    const zOf = (url: string) => /[?&]z=([^&]+)/.exec(url)?.[1];
    expect(zOf(areas[areas.length - 1]), 'the second read asked for the depth it already had').not.toBe(
      zOf(areas[0]),
    );
  });

  it('a console that opens after an analysis can still read a column from it', async () => {
    // **The centre region's version of the same fault the features had.** An analysis cycle's
    // collections are a standing fact — the provenance of a cell is what the current analysis
    // made it until another cycle replaces it — but they were announced on the cycle alone.
    // A console mounting afterwards had no collection to name and said so, for up to a whole
    // cadence: 1800 ticks, half an hour at the default rate, on the region whose entire
    // subject is what a cell's value was made from.
    //
    // Measured in a built instance before the fix: three cadences of warming and the chooser
    // never drew a square.
    await act(async () => {
      for (let i = 0; i < config.scheduler.max_interval_ticks * 3; i++) {
        runtime.clock.tickOnce();
        if (runtime.store.currentInstance() !== undefined) break;
      }
    });
    expect(runtime.store.currentInstance(), 'no cycle completed before the console opened').toBeDefined();

    render(<ForecastPanel {...panelProps()} />);
    await act(async () => {
      runtime.clock.tickOnce();
    });
    // Nothing yet: the cycle's announcement was made before this panel existed.
    expect(document.querySelector('.forecast-share-map')).toBeNull();

    await act(async () => {
      for (let i = 0; i < config.analyst.restate_every_ticks + 2; i++) runtime.clock.tickOnce();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      document.querySelector('.forecast-share-map'),
      'the analysis was never restated, so the field stayed undrawn',
    ).toBeTruthy();
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

  /**
   * Feature 124's own: the rays, and the profile they are re-weighted from.
   *
   * The column these pick is not chosen here — it is read off the served contributions header,
   * so the test opens a column some instrument actually reached rather than a cell of open
   * water this file happened to like the look of. Every number asserted is the analyst's.
   */
  describe('what a column was made from, source by source (feature 124)', () => {
    /** Drive until an analysis cycle has published its contributions, then draw the field. */
    async function toAField() {
      render(<ForecastPanel {...panelProps()} />);
      await act(async () => {
        for (let i = 0; i < config.scheduler.max_interval_ticks * 3; i++) {
          runtime.clock.tickOnce();
          if (document.querySelector('.forecast-share-map')) break;
        }
      });
      await act(async () => {
        await Promise.resolve();
      });
      // **The standing cycle, not the first one.** A start condition pre-rolls several analysis
      // cycles before the shell mounts, so the store holds several of these; the panel draws
      // the one the standing announcement names, which is the last published. Reading the first
      // instead compares two different cycles — measured, when this test did exactly that: six
      // rays drawn against four sources served, and attributed cells one apart, because the
      // platform had moved between them.
      const holdings = runtime.store
        .holdings()
        .filter((candidate) => candidate.field.format === 'drogna-contributions-v1');
      const holding = holdings[holdings.length - 1];
      if (!holding) throw new Error('the loop published no contributions holding');
      return holding;
    }

    /** The served column at a position, exactly as the panel asks for it. */
    async function servedColumn(holdingId: string, longitude: number, latitude: number) {
      const point = `POINT(${longitude.toFixed(4)} ${latitude.toFixed(4)})`;
      const response = await runtime.httpBackend.handle({
        method: 'GET',
        path: `${config.query.http.contributions_prefix}/${holdingId}/column?coords=${encodeURIComponent(point)}`,
        body: '',
      });
      return JSON.parse(response.body) as AnalysisContributions;
    }

    /** Click the drawn cell nearest a position, using the coordinates the cells carry. */
    async function openColumnAt(longitude: number, latitude: number) {
      const cells = [...document.querySelectorAll('rect.share-cell')];
      expect(cells.length, 'the field was drawn with no cells to pick from').toBeGreaterThan(0);
      let nearest = cells[0];
      let best = Infinity;
      for (const cell of cells) {
        const lon = Number(cell.getAttribute('data-lon'));
        const lat = Number(cell.getAttribute('data-lat'));
        const distance = Math.hypot(lon - longitude, lat - latitude);
        if (distance < best) {
          best = distance;
          nearest = cell;
        }
      }
      await act(async () => {
        fireEvent.click(nearest);
      });
      await act(async () => {
        await Promise.resolve();
      });
      return { longitude: Number(nearest.getAttribute('data-lon')), latitude: Number(nearest.getAttribute('data-lat')) };
    }

    /**
     * A column some source reached. The instruments sit at 50 m and 200 m and the platform
     * loiters, so the sources cluster; the header's own first source names where to look.
     */
    async function reachedColumn(holdingId: string) {
      const header = JSON.parse(
        (await runtime.httpBackend.handle({
          method: 'GET',
          path: `${config.query.http.contributions_prefix}/${holdingId}`,
          body: '',
        })).body,
      ) as { sources: { cell: { longitude: number; latitude: number } }[] };
      expect(header.sources.length, 'the cycle assimilated nothing, so no column can be reached').toBeGreaterThan(0);
      return header.sources[0].cell;
    }

    it('FR-122: draws one ray per contributing source, on the surface plane and nowhere else', async () => {
      const holding = await toAField();
      const at = await reachedColumn(holding.holding_id);
      const picked = await openColumnAt(at.longitude, at.latitude);
      const served = await servedColumn(holding.holding_id, picked.longitude, picked.latitude);

      const group = screen.getByTestId('forecast-rays');
      const rays = [...group.querySelectorAll('line.forecast-ray')];
      expect(rays.length, 'a column with sources drew no rays').toBeGreaterThan(0);
      // One per source the served document carries for this column, and no more: the remainder
      // is a band in the profile and never a line to somewhere.
      expect(rays.length).toBe(served.sources.length);
      expect(new Set(rays.map((ray) => ray.getAttribute('data-source'))).size).toBe(rays.length);

      // **On the surface plane, and the check has to be one that could fail.** The first
      // version walked each ray's attributes refusing a `z` — which an SVG line cannot carry, so
      // it passed on any code that drew lines at all, including code drawing them through a
      // volume in another element. What can fail: *every* ray in the whole document lives
      // inside the map's own SVG, and every endpoint lies within that SVG's own view box. A ray
      // drawn into a volume elsewhere, or reaching outside the plane, fails here.
      const surface = document.querySelector('svg.forecast-share-map');
      expect(surface).toBeTruthy();
      const everyRay = [...document.querySelectorAll('line.forecast-ray')];
      expect(everyRay.length).toBe(rays.length);
      for (const ray of everyRay) {
        expect(surface?.contains(ray), 'a ray was drawn outside the surface plane').toBe(true);
      }
      const box = (surface?.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
      expect(box).toHaveLength(4);
      for (const ray of rays) {
        for (const [axis, limit] of [
          ['x1', box[2]],
          ['x2', box[2]],
          ['y1', box[3]],
          ['y2', box[3]],
        ] as const) {
          const value = Number(ray.getAttribute(axis));
          expect(Number.isFinite(value), `a ray has no ${axis}`).toBe(true);
          expect(value, `a ray's ${axis} lies outside the surface plane`).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(limit);
        }
      }

      // **FR-122's "proportional" is proportional, and the drawn width is what is checked.**
      // The first version drew `1 + weight * 7` — affine — so a 6.5:1 contribution ratio came
      // out as 3.85:1 on screen while the only test looked at `data-weight`, which is the
      // arithmetic and not the drawing. Two rays' stroke widths now stand in the same ratio as
      // the contributions behind them.
      const reached = rays.filter((ray) => ray.getAttribute('data-reached') === 'yes');
      const byWeight = [...reached].sort(
        (a, b) => Number(b.getAttribute('data-weight')) - Number(a.getAttribute('data-weight')),
      );
      if (byWeight.length >= 2) {
        const widest = byWeight[0];
        const narrowest = byWeight[byWeight.length - 1];
        const small = Number(narrowest.getAttribute('data-weight'));
        const weightRatio = Number(widest.getAttribute('data-weight')) / small;
        const drawnRatio = Number(widest.getAttribute('stroke-width')) / Number(narrowest.getAttribute('stroke-width'));
        expect(Number.isFinite(drawnRatio)).toBe(true);
        // The bound is the attribute's own rounding, not a number chosen here: `data-weight` is
        // written to four decimals, so each weight carries up to 5e-5 of error and the ratio
        // carries twice that, relative to the smaller of the two. Anything wider than that is
        // the drawing departing from the arithmetic rather than the attribute being rounded.
        const fromRounding = (2 * 5e-5) / small;
        expect(
          Math.abs(drawnRatio - weightRatio) / weightRatio,
          'the drawn widths are not in the ratio of the contributions',
        ).toBeLessThanOrEqual(fromRounding);
      }

      // **SC-005 over the drawn ray set**, which is where the requirement asks for it: the
      // standing forecast is the background and never a ray. The shell's own named condition
      // reports any that appears, and the region carries no such notice.
      expect(screen.queryByTestId('background-drawn')).toBeNull();
      for (const ray of rays) {
        const named = ray.getAttribute('data-source') ?? '';
        for (const background of ['archive', 'departure', 'model', 'forecast', 'background']) {
          expect(named.startsWith(`${background}.`), `${named} is the background drawn as a ray`).toBe(false);
        }
      }

      // And it was read from the contributions prefix, not from EDR: a sparse per-source
      // holding is not a coverage, and the standard has no query that would serve it.
      expect(fetched.some((url) => url.includes(config.query.http.contributions_prefix) && url.includes('/column?'))).toBe(true);
      expect(fetched.some((url) => url.includes('/collections/') && url.includes('-contributions'))).toBe(false);
    });

    it('SC-003: choosing a level re-weights the rays without moving them or changing their count', async () => {
      const holding = await toAField();
      const at = await reachedColumn(holding.holding_id);
      await openColumnAt(at.longitude, at.latitude);

      const read = () =>
        [...document.querySelectorAll('line.forecast-ray')].map((ray) => ({
          source: ray.getAttribute('data-source'),
          at: `${ray.getAttribute('x2')},${ray.getAttribute('y2')}`,
          weight: ray.getAttribute('data-weight'),
        }));
      const whole = read();
      expect(whole.length).toBeGreaterThan(0);

      // The level the sources actually reach: the instruments are at 50 m and 200 m, so the
      // surface level is the one with something in it, and a level chosen blindly would be
      // asserting about an empty re-weighting.
      const levels = [...document.querySelectorAll('button.forecast-column-level')];
      expect(levels.length, 'the profile offered no levels to choose').toBeGreaterThan(1);
      await act(async () => {
        fireEvent.click(levels[0]);
      });
      await act(async () => {
        await Promise.resolve();
      });
      const level = read();

      // Same sources, same order, same origins — the profile says *where they mattered*, and
      // the volume says *which sources*; neither is read through the other (FR-128).
      expect(level.map((ray) => ray.source)).toEqual(whole.map((ray) => ray.source));
      expect(level.map((ray) => ray.at)).toEqual(whole.map((ray) => ray.at));
      // Different widths, which is the whole of what selecting a level does.
      expect(level.map((ray) => ray.weight)).not.toEqual(whole.map((ray) => ray.weight));
      expect(screen.getByTestId('column-profile').textContent).toMatch(/re-weighted to/);
    });

    it('SC-001, AT-07: the drawn contributions and the remainder sum to the weight the holding published', async () => {
      const holding = await toAField();
      const at = await reachedColumn(holding.holding_id);
      const picked = await openColumnAt(at.longitude, at.latitude);
      const served = await servedColumn(holding.holding_id, picked.longitude, picked.latitude);

      // The tolerance is the holding's own, derived from float32's width at the magnitude it
      // actually stores. A number chosen here would be a second opinion about how close is
      // close enough, and it would drift as the gain's magnitudes grow cycle by cycle.
      const tolerance = runtime.store.holding(holding.holding_id)?.descriptor.manifest.variables[0].tolerance_absolute;
      expect(tolerance, 'the holding declares no tolerance to check against').toBeGreaterThan(0);

      // Checked through `contributionResidual` — the function the surface's own ray set is
      // built by — rather than re-summed here, so what is held is the drawn arithmetic and not
      // a second implementation of it that could agree while the surface disagreed.
      let checked = 0;
      for (const level of served.levels) {
        // By depth, as the surface selects: passing `depth_index` here selected the level
        // nearest *one metre* and the assertion compared two different levels' weights, which
        // is the same fault this round fixed in the region and is why the function takes a
        // depth at all.
        const residual = contributionResidual(raysFor(served, level.depth_m));
        // The bound is the holding's declared tolerance times the number of terms summed: each
        // of the contributions, the remainder and ω carries at most one ulp of float32 error at
        // the magnitude the holding stores, and the tolerance *is* that ulp (four of them, as
        // the analyst derives it). Nothing here is chosen; the count comes from the document.
        const terms = level.contributions.length + 2;
        expect(
          Math.abs(residual.difference),
          `the contributions drawn at ${level.depth_m} m do not sum to the weight published for it`,
        ).toBeLessThanOrEqual((tolerance ?? 0) * terms);
        expect(residual.published).toBe(level.observation_weight);
        checked += 1;
      }
      expect(checked).toBe(served.levels.length);

      // And the picture is the same set: every source the document carries has a ray, and the
      // rays carry no source the document does not.
      const drawnSources = [...document.querySelectorAll('line.forecast-ray')].map((ray) => ray.getAttribute('data-source'));
      expect([...drawnSources].sort()).toEqual(served.sources.map((source) => source.source_id).sort());
    });

    it('every profile row reads the analysis level it is labelled with, on an axis that is the analysis’s own', async () => {
      // **The fault this exists for was structural and drew a plausible picture.** The panel
      // took its depth axis from whichever holding the inventory listed first — the archive, at
      // four levels — while an analysis is filed at six, and the profile then paired a row with
      // the served level *of the same index*. Three rows in four carried one depth's background
      // against another depth's contributions, two of the analysis's levels were never shown,
      // and the published capture's headline figure was an artefact of it. The printed
      // "sums to 100.0%" could not catch it: ω cancels out of that sum.
      const holding = await toAField();
      const at = await reachedColumn(holding.holding_id);
      const picked = await openColumnAt(at.longitude, at.latitude);
      const served = await servedColumn(holding.holding_id, picked.longitude, picked.latitude);

      // The rows the reader sees, and the depths the analysis is actually filed at.
      const rows = [...document.querySelectorAll('button.forecast-column-level')].map((row) =>
        Number(row.getAttribute('data-depth')),
      );
      expect(rows.length).toBeGreaterThan(0);
      const analysisDepths = served.levels.map((level) => level.depth_m);
      // Every row is a depth the analysis carries — not a neighbouring era's rounding of it.
      for (const row of rows) {
        expect(analysisDepths, `the profile offers ${row} m, which the analysis is not filed at`).toContain(row);
      }
      // And every level the analysis carries is offered: a row missing is a level a reader
      // cannot reach, which is how 800 m went unshown.
      expect([...rows].sort((a, b) => a - b)).toEqual([...analysisDepths].sort((a, b) => a - b));

      // The axis came from the analysis holding, whose depth count differs from the archive's
      // on the shipped configuration — which is what made an index join wrong rather than merely
      // untidy.
      const analysisGrid = runtime.store.holding(holding.holding_id)?.descriptor.manifest.grid.depth;
      expect(rows.length).toBe(analysisGrid?.count);
    });

    it('the readout under the field names the cell it is pointing at, not one two cells away', async () => {
      // A fault the `data-lon`/`data-lat` attributes made visible: `cursor` holds *drawn*
      // positions and the readout indexed the *served* axes with them, so at the shipped grid —
      // thinned by two — hovering a cell printed the position and the shares of a cell two rows
      // and two columns away. The keyboard handler translated; the readout did not.
      await toAField();
      const cells = [...document.querySelectorAll('rect.share-cell')];
      const target = cells[Math.floor(cells.length / 3)];
      await act(async () => {
        fireEvent.mouseEnter(target);
      });
      const readout = document.querySelector('.forecast-share-readout')?.textContent ?? '';
      const lon = Number(target.getAttribute('data-lon'));
      const lat = Number(target.getAttribute('data-lat'));
      // The cell carries the truth; the readout beneath has to print the same place.
      expect(readout).toContain(lat.toFixed(2));
      expect(readout).toContain(lon.toFixed(2));
    });

    it('FR-129: a level nothing reached says so, and says it differently from one that contributed nothing', async () => {
      const holding = await toAField();
      const at = await reachedColumn(holding.holding_id);
      await openColumnAt(at.longitude, at.latitude);

      // The instruments sit at 50 m and 200 m against a 320 m vertical support, so the bottom
      // of the column is out of every source's reach — the reading FR-127 says the profile
      // exists to make obvious, and it is stated rather than drawn as an empty bar.
      const absent = [...document.querySelectorAll('[data-testid^="level-absent-"]')];
      expect(absent.length, 'no level stated an absence, in a column whose deepest levels nothing reaches').toBeGreaterThan(0);
      expect(absent.some((note) => /within reach/.test(note.textContent ?? ''))).toBe(true);
      // The figures are still printed beside the statement: what is absent is the observational
      // part, and the background's own composition is known.
      const profile = screen.getByTestId('column-profile');
      expect(profile.textContent).toMatch(/archive/);
      expect(profile.textContent).toMatch(/%/);
    });
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
