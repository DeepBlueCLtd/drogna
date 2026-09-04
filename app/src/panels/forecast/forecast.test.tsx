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
import { ForecastPanel, FORECAST_REGIONS, GRID_ATTEMPTS, spendAttempt } from './ForecastPanel.js';
import { RAY_MIN_DRAWN_PX, RAY_WIDTH_PX, contributionResidual, raysFor } from './rays.js';
import { sourceOf } from './shares.js';
import { FORECAST_TOUR_STEPS, uncoveredSubjects } from '../../shell/walkthrough/tour.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The ground the map is drawn on, read out of the stylesheet that declares it rather than
 * restated here — a marker asserted against a hard-coded `#10151b` would stop being an
 * assertion the day the shell's background moved.
 */
const ground = ((): string => {
  const declared = /--shell-bg:\s*(#[0-9a-f]{3,8})/i.exec(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'shell', 'shell.css'), 'utf8'),
  )?.[1];
  // Thrown rather than defaulted to `''`. With an empty ground the "not painted in the ground
  // colour" assertion below becomes a verbatim duplicate of the "carries paint at all" one above
  // it, and the check this file exists for disappears with nothing going red — which is what a
  // `?? ''` bought. `greyscale.test.ts` guards the same read; this one did not.
  if (!declared) throw new Error('shell.css declares no --shell-bg, so a marker cannot be held against the ground');
  return declared;
})();

/** The region's own stylesheet, for the carriers jsdom cannot apply but a file can be read for. */
const FORECAST_CSS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'forecast.css'), 'utf8');

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
    // says is unbuilt has narrowed to something specific: the centre region names 124 for the
    // **volume** — the rays and the profile are built and it says so — and the right one draws
    // the forecast's features and names 124 for the ensemble spread along the route.
    //
    // The comment here used to say the centre region "names 124 for the rays alone", and the
    // assertion below matched `/rays/` against it. That stopped being true when `stillToCome`
    // was rewritten: the match now succeeds against a clause saying the rays *work*, so the
    // check passed for the opposite of its stated reason. Matched on what each region actually
    // names as missing.
    for (const region of ['volume', 'ahead']) {
      const section = document.querySelector(`[data-region="${region}"]`);
      expect(section?.textContent).toMatch(/not built/);
      expect(section?.textContent).toContain('124');
      // An empty canvas is a claim the shell is not entitled to make.
      expect(section?.querySelector('canvas')).toBeNull();
    }
    expect(document.querySelector('[data-region="ahead"]')?.textContent).toMatch(/ensemble spread/);
    expect(document.querySelector('[data-region="volume"]')?.textContent).toMatch(/volume/);
  });

  it('FR-140: the help tour does not call a region unbuilt that the panel draws', async () => {
    // **The fault this is for.** The tour's volume step read "This region is feature 124 and is
    // not built" for the whole of this feature's life, while the region behind the tooltip drew
    // the share map, the rays, the profile and the numbers table; the `ahead` step said the same
    // over the feature tracks. Nothing caught it: `uncoveredSubjects` asks whether every region
    // has *a* step and never what the step says, and the panel's own prose — which is careful to
    // name the *part* that is missing — was rewritten without the tour beside it.
    //
    // The rule is the narrow one that fault violates: a step may say a region is not built only
    // where there is nothing in it to read. What counts as something to read is taken from the
    // rendered region rather than from a list here, so a region that grows a surface moves the
    // check with it.
    render(<ForecastPanel {...panelProps()} />);
    await act(async () => {
      for (let i = 0; i < config.scheduler.max_interval_ticks * 3; i++) runtime.clock.tickOnce();
    });
    for (const region of FORECAST_REGIONS) {
      const section = document.querySelector(`[data-region="${region.id}"]`);
      const step = FORECAST_TOUR_STEPS.find((entry) => entry.subject === region.id);
      expect(step, `no tour step for ${region.id}`).toBeDefined();
      const claimsTheRegion = /this region\b[^.]*\bnot built/i.test(step?.panel ?? '');
      // `section?.querySelector(...) !== null` reads as "it draws something" and evaluates to
      // `true` when there is no section at all — so the one case where "this region is not built"
      // is honest was the case it would have flagged.
      const drawsSomething = section !== null && section.querySelector('svg, button, table, ol') !== null;
      expect(
        claimsTheRegion && drawsSomething,
        `the tour calls the whole ${region.id} region unbuilt while the panel draws in it`,
      ).toBe(false);
    }
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
    const area = fetched.find((url) => url.includes('/area?') && url.includes('-provenance'));
    expect(area).toBeTruthy();

    // **Every share the query layer serves resolves, and all four are there.** `shares.test.ts`
    // asks this of names it builds by re-implementing the analyst's own munging of a configured
    // label — so a change to that munging moves the test with the shell and leaves the real path
    // broken, which is how the departure share went unread from feature 116. These names come
    // off the wire.
    const body = (await (await fetch(area as string)).json()) as { ranges?: Record<string, unknown> };
    const names = Object.keys(body.ranges ?? {});
    expect(names.length, 'the area query served no ranges to name').toBeGreaterThan(0);
    const resolved = names.map((name) => sourceOf(name));
    expect(resolved.includes(undefined), `a served share resolves to nothing: ${names.join(', ')}`).toBe(false);
    expect([...new Set(resolved)].sort()).toEqual(['archive', 'departure', 'measurement', 'model']);
    // **One name per share, and this is the half a `Set` hid.** `sourceOf` reads the segment
    // after the last `_share_`, so it discards the variable: eight names from two variables
    // collapse to the same four keys and satisfy both assertions above exactly, while the slab
    // loop drew whichever was written last. Counted, so a second variable's provenance is a red
    // test rather than a wrong picture under a legend naming the other one.
    expect(resolved.length, `${names.length} ranges resolve to ${new Set(resolved).size} shares`).toBe(
      new Set(resolved).size,
    );

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
      // **There was a loop here checking every endpoint lay inside the viewBox, and it is gone.**
      // The viewBox is `0 0 cols rows` and `placeOn`'s last statement clamps to
      // `[0, kept.length]` — the clamp bound *is* the assertion bound, so no input could fail it:
      // not a source outside the grid, not a reversed axis, not a thinning step. That is the
      // second time this assertion has been worthless for a structural reason, and the first time
      // is written into T017's own tick. Coverage of the clamp belongs where the clamp is, and
      // `rays.test.ts` asserts it directly against out-of-range inputs.
      //
      // What is kept is what can fail: every ray carries four finite coordinates, and no ray is
      // a point.
      for (const ray of rays) {
        for (const axis of ['x1', 'x2', 'y1', 'y2'] as const) {
          expect(Number.isFinite(Number(ray.getAttribute(axis))), `a ray has no ${axis}`).toBe(true);
        }
      }

      // **FR-122's "proportional" is proportional, and the drawn width is what is checked.**
      // The first version drew `1 + weight * 7` — affine — so a 6.5:1 contribution ratio came
      // out as 3.85:1 on screen while the only test looked at `data-weight`, which is the
      // arithmetic and not the drawing. Two rays' stroke widths now stand in the same ratio as
      // the contributions behind them.
      const reached = rays.filter((ray) => ray.getAttribute('data-reached') === 'yes');
      expect(reached.length, 'no reached ray to measure a width on').toBeGreaterThan(0);

      // Checked per ray against the width the arithmetic asks for, rather than as a ratio
      // between the widest and the narrowest. The ratio form was the first correction and it
      // set its own strength from the data: the tolerance was `1e-4 / smallest weight`, so a
      // narrowest weight near 1e-4 made it a 100% tolerance the affine drawing would have
      // passed, and a weight rounding to `0.0000` made it divide by zero. This form has no
      // such degree of freedom — every reached ray above the floor must be drawn at
      // `weight * RAY_WIDTH_PX`, within the four decimals `data-weight` is written to.
      let measured = 0;
      for (const ray of reached) {
        const weight = Number(ray.getAttribute('data-weight'));
        const drawn = Number(ray.getAttribute('stroke-width'));
        const wanted = weight * RAY_WIDTH_PX;
        if (ray.classList.contains('is-under-scale')) {
          // Below the floor the width is the map's limit and the ray says so; what is asserted
          // is that it is *at* the floor and marked, never that it is proportional.
          expect(drawn, 'an under-scale ray is not drawn at the floor').toBeCloseTo(RAY_MIN_DRAWN_PX, 6);
          expect(wanted).toBeLessThan(RAY_MIN_DRAWN_PX);
          continue;
        }
        measured += 1;
        expect(wanted).toBeGreaterThanOrEqual(RAY_MIN_DRAWN_PX);
        // 5e-5 of weight is 5e-5 * RAY_WIDTH_PX of width; anything wider is the drawing
        // departing from the arithmetic rather than the attribute being rounded.
        expect(
          Math.abs(drawn - wanted),
          `a ray is drawn ${drawn} wide for a weight of ${weight}`,
        ).toBeLessThanOrEqual(5e-5 * RAY_WIDTH_PX);
      }
      // The widest contribution in a column is weight 1 by construction, so at least one ray is
      // always above the floor and this loop always measures something.
      expect(measured, 'every ray was under the floor, so proportionality went unchecked').toBeGreaterThan(0);

      // **A ray has length.** Four of six came out as points, `x1 === x2 && y1 === y2`, because
      // the placement snapped a position to the nearest *drawn* column — and nothing saw it: the
      // SC-003 check below compares each ray's endpoint to itself between levels, and the
      // containment loop above cannot fail while the placement returns cell centres by
      // construction. A picture of six sources that draws one mark is not a picture of six
      // sources.
      const points = rays.filter(
        (ray) =>
          ray.getAttribute('x1') === ray.getAttribute('x2') && ray.getAttribute('y1') === ray.getAttribute('y2'),
      );
      expect(
        points.map((ray) => ray.getAttribute('data-source')),
        'a ray is drawn as a point, so the source it names has no line',
      ).toEqual([]);

      // **The under-scale rays are counted where a reader meets them.** A floor that is not
      // stated is the quiet lie the proportional scale exists to avoid.
      const note = screen.queryByTestId('forecast-under-scale');
      const underScaleDrawn = rays.filter((ray) => ray.classList.contains('is-under-scale')).length;
      if (underScaleDrawn === 0) expect(note).toBeNull();
      else expect(note?.textContent).toContain(String(underScaleDrawn));

      // The marker an absent source keeps its place by is asserted in SC-003 below, at a level
      // where sources *are* absent. Asserting it here, where every source reached, would iterate
      // an empty set — which it did, and passed with the fault planted.

      // **SC-005 over the drawn ray set**, which is where the requirement asks for it: the
      // standing forecast is the background and never a ray. The shell's own named condition
      // reports any that appears, and the region carries no such notice.
      expect(screen.queryByTestId('modelled-drawn')).toBeNull();
      // Asked of the master's own field and not of a source id's spelling. The loop this
      // replaces tested `data-source` against five words from the *share* vocabulary, while a
      // source id is `<datastream>.cell-<n>` — so no document the analyst can publish could
      // have made it fire. That is the same fault T022j found and fixed in `rays.test.ts`; the
      // unfalsifiable spelling was left standing here, reading as coverage.
      for (const ray of rays) {
        const named = ray.getAttribute('data-source') ?? '';
        expect(ray.getAttribute('data-kind'), `${named} is drawn as a ray`).toBe('measured');
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

      // **The deepest level, where the correlation reaches nothing and every source is absent.**
      // This is where FR-128's promise is hardest and where it was being broken: every line has
      // width 0 there, so the *only* mark left is the origin marker — and the marker was
      // painted in `--shell-bg`, because the hue went on as an SVG presentation attribute and
      // the stylesheet's class selector outranks one. The ray layer went blank under a caption
      // saying the same sources were still there at that level's widths.
      await act(async () => {
        fireEvent.click(levels[levels.length - 1]);
      });
      await act(async () => {
        await Promise.resolve();
      });
      const deep = read();
      expect(deep.map((ray) => ray.source), 'a source left the set at the deepest level').toEqual(
        whole.map((ray) => ray.source),
      );
      const absent = [...document.querySelectorAll('circle.forecast-ray-origin.is-absent')];
      expect(absent.length, 'no source is absent at the deepest level, so nothing is being asserted').toBeGreaterThan(
        0,
      );
      for (const marker of absent) {
        const painted = (marker as SVGCircleElement).style.stroke;
        expect(painted, 'an absent source’s marker carries no paint of its own').not.toBe('');
        expect(painted, 'an absent source’s marker is painted in the ground colour').not.toBe(ground);
        expect(marker.getAttribute('fill')).toBe('none');
      }
    });

    it('FR-138: every band carries a texture, and the caption prints the sum of the rays drawn', async () => {
      const holding = await toAField();
      const at = await reachedColumn(holding.holding_id);
      const picked = await openColumnAt(at.longitude, at.latitude);
      const served = await servedColumn(holding.holding_id, picked.longitude, picked.latitude);

      // **Texture on every band, not only on this cycle's sources.** `shares.ts` says a profile
      // band carries its hatch angle and `greyscale.test.ts` rests its cross-vocabulary check on
      // it — but only `kind: 'source'` bands were given an angle, so the three background bands
      // and the earlier-cycles band were flat fills at 1.067:1 of each other in greyscale, in
      // adjacent segments of one bar. Read off the rendered style, which is where the claim is
      // either true or not.
      const segments = [...document.querySelectorAll('.forecast-column-segment')];
      expect(segments.length, 'no bands were drawn to inspect').toBeGreaterThan(0);
      // The remainder's stripe comes from the stylesheet rather than from an inline style — it is
      // the one band that is not a place, and it is marked as such by a rule and not by an angle.
      // jsdom applies no stylesheet, so that carrier is checked against the file that declares
      // it; exempting the band without checking anything would be the hole this is closing.
      const flat = segments
        .filter((band) => !band.className.includes('is-remainder'))
        .filter((band) => !(band as HTMLElement).style.backgroundImage);
      expect(
        flat.map((band) => band.className),
        'a band is drawn as a flat fill, so colour is its only carrier',
      ).toEqual([]);
      expect(segments.some((band) => band.className.includes('is-remainder'))).toBe(true);
      expect(
        /\.forecast-column-segment\.is-remainder\s*\{[^}]*background-image:/.test(FORECAST_CSS),
        'the remainder band has no stripe declared for it either',
      ).toBe(true);

      // **The caption's own number**, which nothing read. The figure it prints is the sum of the
      // drawn contributions; it used to print `ω − remainder`, a rearrangement of the published
      // weight that agrees with the drawn rays by construction — so the surface could lose a ray
      // and go on printing a total including it. Checked against the served document rather than
      // against the expression that produces it.
      const whole = raysFor(served);
      const summed = whole.rays.reduce((total, ray) => total + ray.contribution, 0);
      const caption = document.querySelector('.forecast-column-caption')?.textContent ?? '';
      expect(caption, 'the caption prints no total').toContain(summed.toFixed(4));
      expect(caption).toContain(whole.observationWeight.toFixed(4));
    });

    it('a cycle whose axis is not in the inventory yet does not spend the retry allowance', async () => {
      // **The fault.** The depth-axis retry is bounded so a permanently-failing inventory is not
      // one fetch per restatement for the life of the tab. The attempt was counted before the
      // request and given back only on success — so a cycle whose axis the inventory does not
      // carry *yet*, which is an honest answer and not a failed fetch, spent one too. Enough of
      // those and the region stopped asking for good, however many later analyses would have
      // answered: the deleted holdings subscription's own fault, in a smaller shape.
      //
      // Warmed first, so the loop is announcing analyses before the store is made to answer
      // empty — the state the fault lives in is "asked, answered honestly, nothing there yet".
      await toAField();
      expect(document.querySelectorAll('rect.share-cell').length).toBeGreaterThan(0);

      const passthrough = globalThis.fetch;
      let empties = 0;
      vi.stubGlobal('fetch', ((input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes(config.shell.endpoints.holdings)) {
          empties += 1;
          return Promise.resolve(new Response('{"holdings":[]}', { status: 200 }));
        }
        return passthrough(input, init);
      }) as typeof globalThis.fetch);
      // Well past the allowance: every new cycle's axis is asked for and is not there.
      await act(async () => {
        for (let i = 0; i < config.scheduler.max_interval_ticks * 8; i++) runtime.clock.tickOnce();
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(empties, 'the axis was never asked for while the store was empty').toBeGreaterThan(0);

      // Now the store answers again. If a not-yet answer had spent the allowance, the region has
      // stopped asking and the field never comes back.
      vi.stubGlobal('fetch', passthrough);
      await act(async () => {
        for (let i = 0; i < config.scheduler.max_interval_ticks * 3; i++) runtime.clock.tickOnce();
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(
        document.querySelectorAll('rect.share-cell').length,
        'the region stopped asking for an axis it had only not been given yet',
      ).toBeGreaterThan(0);
    });

    it('FR-136: a restatement of the standing analysis re-queries nothing', async () => {
      // **The claim this holds, and why the existing one could not.** `ColumnProvenance`'s header
      // says "not on a tick, not on an announcement, not on a timer". The slab effect depended on
      // the `analysis` *object*, and the analyst republishes `analysis_standing` every
      // `restate_every_ticks` with a fresh `sim_time` — a new object, so a new dependency, so one
      // full-grid EDR area query a minute for as long as the tab is open.
      //
      // `SC-010: nothing polls` advances a window in which **no analysis exists at all**
      // (`scheduler.max_interval_ticks` is far longer than the window it measures), so it has
      // never been in a state where this could fail. This one warms until a field is drawn first,
      // which is the state the fault lives in.
      await toAField();
      expect(document.querySelectorAll('rect.share-cell').length).toBeGreaterThan(0);

      const before = fetched.length;
      const areasBefore = fetched.filter((url) => url.includes('/area?')).length;
      await act(async () => {
        // Past a restatement, and well short of another analysis cycle.
        for (let i = 0; i < config.analyst.restate_every_ticks + 5; i++) runtime.clock.tickOnce();
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(
        fetched.filter((url) => url.includes('/area?')).length,
        `the field was re-queried on the restatement: ${fetched.slice(before).join(', ')}`,
      ).toBe(areasBefore);
      expect(fetched.length, `${fetched.length - before} fetch(es) on a restatement`).toBe(before);
    });

    it('XI: a 200 that is not the master’s shape is a refusal, not a document', async () => {
      // The panel above validates the holdings inventory before touching it and every broker
      // payload goes through `drawable`; this crossing cast a 200 straight to
      // `AnalysisContributions` and iterated `document.levels` inside a render-time `useMemo`.
      // A body without `levels` is a TypeError thrown in render, which unwinds the panel instead
      // of stating a refusal — and Principle XI is that no code path may know whether the seam is
      // answered locally or remotely, so "our backend cannot send that" is not available here.
      const holding = await toAField();
      const at = await reachedColumn(holding.holding_id);

      const passthrough = globalThis.fetch;
      vi.stubGlobal('fetch', ((input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes('/column?')) {
          return Promise.resolve(new Response('{"schema_version":1}', { status: 200 }));
        }
        return passthrough(input, init);
      }) as typeof globalThis.fetch);

      await openColumnAt(at.longitude, at.latitude);
      // The region stands, and says what happened.
      const region = screen.getByTestId('column-provenance');
      expect(region.textContent).toMatch(/did not match its master/);
      expect(document.querySelectorAll('line.forecast-ray')).toHaveLength(0);
      // The profile is still there with the four shares it read through EDR — the column's own
      // position queries answered, and only the per-source document did not.
      expect(screen.getByTestId('column-profile').textContent).toMatch(/archive/);
    });

    it('FR-130: a refused field takes the map and leaves the numbers, which do not read it', async () => {
      // **The fault.** The numbers table, the SC-001 caption and FR-125's named condition were
      // all gated on the ray *geometry*, which is undefined whenever the slab is. None of the
      // three reads the slab — they are the served column's own arithmetic — so a reader who
      // moved to a depth whose area query was refused lost the two numbers FR-130 requires along
      // with the map, and the only message on the page named the refused *field*.
      const holding = await toAField();
      const at = await reachedColumn(holding.holding_id);
      await openColumnAt(at.longitude, at.latitude);
      expect(screen.queryByTestId('contribution-numbers'), 'no table to lose').toBeTruthy();

      // Refuse the field, and only the field: the column's own queries still answer.
      const passthrough = globalThis.fetch;
      vi.stubGlobal('fetch', ((input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes('/area?')) {
          return Promise.resolve(new Response('{"refused":"planted"}', { status: 503 }));
        }
        return passthrough(input, init);
      }) as typeof globalThis.fetch);

      const depths = [...document.querySelectorAll('[aria-label="depth"] button.forecast-chip')];
      expect(depths.length, 'no depth to change to').toBeGreaterThan(1);
      await act(async () => {
        fireEvent.click(depths[depths.length - 1]);
      });
      await act(async () => {
        await Promise.resolve();
      });

      // The map is gone, and the region says why.
      expect(document.querySelector('svg.forecast-share-map rect.share-cell')).toBeNull();
      expect(screen.getByTestId('column-provenance').textContent).toMatch(/refused/);
      // The numbers are not, because they never came from the field.
      const table = screen.queryByTestId('contribution-numbers');
      expect(table, 'the numbers table went with the map it does not read').toBeTruthy();
      expect(table?.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
      expect(screen.getByTestId('column-profile').textContent).toMatch(/reached/);
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

      // Checked through `contributionResidual`. **It has no production caller**, and saying so
      // is more useful than the two spellings this comment has carried: it claimed first that
      // the ray set was built by it and then that the caption sums with it, and neither was
      // true — the caption sums its own rays inline, because routing a sum through a function
      // that adds the remainder and then subtracting it again was machinery around an addition.
      // What this function is for is *this* assertion: it states the SC-001 identity once,
      // beside the `RaySet` shape it reads, so the test does not carry a second opinion about
      // what "the drawn contributions and the remainder" means.
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
describe('what one attempt at the depth axis costs', () => {
  // The policy is out here rather than driven through the panel, and that is the finding as much
  // as the fix: the region asks for the axis only when a *new analysis cycle* lands, and on the
  // shipped configuration that is rarer than the window a test can afford to drive — the panel
  // test above sees one such ask across eight scheduler intervals. Two versions of this policy
  // were wrong and neither could be reached.
  it('spends nothing on an inventory that answered honestly and had nothing yet', () => {
    // The fault: this used to cost one, and enough of them in a row silenced the region for the
    // life of the panel however many later cycles would have answered.
    let spent = 0;
    for (let cycle = 0; cycle < GRID_ATTEMPTS * 4; cycle++) spent = spendAttempt(spent, 'absent');
    expect(spent, 'a cycle whose axis is not published yet spent the allowance').toBe(0);
  });

  it('spends on a refusal, which is the only thing the allowance is for', () => {
    // The *stopping* is the effect's, and this does not reach it — the title used to say it did.
    // What is asserted here is the arithmetic the effect's guard reads.
    let spent = 0;
    for (let attempt = 0; attempt < GRID_ATTEMPTS; attempt++) spent = spendAttempt(spent, 'refused');
    expect(spent).toBe(GRID_ATTEMPTS);
  });

  it('gives the whole allowance back on an answer, because one answer is not that seam', () => {
    let spent = spendAttempt(spendAttempt(0, 'refused'), 'refused');
    expect(spent).toBe(2);
    spent = spendAttempt(spent, 'answered');
    expect(spent).toBe(0);
  });
});

describe('the Forecast tab’s help tour', () => {
  it('FR-140: every region the surface offers has a step, and no step invents one', () => {
    expect(uncoveredSubjects('forecast', FORECAST_REGIONS, FORECAST_TOUR_STEPS)).toEqual([]);
    expect(FORECAST_REGIONS.length).toBeGreaterThan(0);
  });
});
