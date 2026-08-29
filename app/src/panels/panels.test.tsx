// @vitest-environment jsdom
/**
 * The panels against a genuine backend: nothing here is mocked below the seam. The
 * runtime is provisioned exactly as the bootstrap provisions it, the shell client is
 * a read-only broker connection, and what the assertions read is what a heartbeat or
 * a clock sample actually caused (Constitution VII: the test would fail against a
 * fixture, because a fixture publishes nothing).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDockviewPanelProps } from 'dockview-react';
import runConfigDocument from '../../config/run.json';
import type { ConfigRun } from '../generated/types.js';
import { createSeamValidator } from '../seam/validate.js';
import { buildBackend, type BackendRuntime } from '../backend/runtime/runtime.js';
import type { PanelParams } from '../shell/Shell.js';
import { createSeamFetch } from '../seam/http.js';
import { displayInstant } from '../shell/display.js';
import { SystemPanel } from './system/SystemPanel.js';
import { MessagesPanel } from './messages/MessagesPanel.js';
import { HoldingsPanel } from './holdings/HoldingsPanel.js';
import { IntroPanel } from './intro/IntroPanel.js';
import { MapPanel } from './map/MapPanel.js';
import { OperatorPanel } from './operator/OperatorPanel.js';

const validator = createSeamValidator();

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

/**
 * Flush until the thing being waited for has happened, rather than a fixed number of
 * microtasks. A count is a guess about how many turns a fetch → validate → setState
 * chain takes, and CI took more turns than this machine did: the cube test went red
 * on a runner with an empty query list while passing here every time.
 */
async function settle(until: () => boolean, rounds = 2000): Promise<void> {
  for (let round = 0; round < rounds && !until(); round++) await Promise.resolve();
}

describe('the panels against a live backend', () => {
  let config: ConfigRun;
  let runtime: BackendRuntime;
  let removeSeam: (() => void) | undefined;

  /**
   * Install the seam for one test: every request the panels make is answered by this
   * runtime's own backend, and every requested URL is recorded for the tests that
   * count them. Taking it off again is the fixture's job, deliberately — a test
   * abandoned mid-await (a timeout) never runs its own `finally`, so a shim removed
   * there leaves a mounted panel handing a relative seam path to the real fetch, and
   * undici's `Invalid URL` lands on whichever test runs next. One timeout cost three
   * CI failures that way, two of them on innocent tests.
   */
  function seam(): { asked: string[] } {
    const realFetch = globalThis.fetch;
    const seamFetch = createSeamFetch('/api', runtime.httpBackend, realFetch);
    const asked: string[] = [];
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      asked.push(String(input));
      return seamFetch(input, init);
    }) as typeof globalThis.fetch;
    removeSeam = () => {
      globalThis.fetch = realFetch;
    };
    return { asked };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    config = lockstepConfig();
    runtime = buildBackend(config, { rootSeed: 7, revision: 'test', dirty: false }, validator);
  });

  afterEach(async () => {
    // Unmount first, then let whatever the last effects started run to its end, and
    // only then take the seam off: in that order there is no moment where a live
    // panel can reach a fetch that cannot answer it.
    cleanup();
    await settle(() => false, 200);
    removeSeam?.();
    removeSeam = undefined;
    runtime.stop();
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
    act(() => screen.getByLabelText('show heartbeats').click());
    expect(listedTopics()).toContain(config.shell.topics.heartbeat);
  });

  it('Messages hides clock samples from the list by default and its own toggle displays them; both stay counted', () => {
    render(<MessagesPanel {...panelProps(config, runtime)} />);
    // Provoke clock traffic: the lockstep clock advances only when stepped.
    act(() => runtime.clock.step());
    act(() => vi.advanceTimersByTime(2100));
    const listedTopics = () =>
      [...document.querySelectorAll('.message-topic')].map((cell) => cell.textContent);
    const received = () =>
      Number(/^(\d+) received/.exec(screen.getByTestId('refusal-counter').textContent ?? '')?.[1]);
    // Clock samples arrived and are counted, but are not rendered.
    expect(received()).toBeGreaterThan(0);
    expect(listedTopics()).not.toContain(config.shell.topics.clock);
    const countedBefore = received();
    // Its toggle is independent of the heartbeat one and display-only.
    act(() => screen.getByLabelText('show clock').click());
    expect(listedTopics()).toContain(config.shell.topics.clock);
    expect(listedTopics()).not.toContain(config.shell.topics.heartbeat);
    expect(received()).toBe(countedBefore);
  });

  it('Holdings lists what the store holds, fetched through the seam, and opens a manifest', async () => {
    seam();
    {
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

  it('Holdings refreshes on the store\'s announcement and never polls (FR-46)', async () => {
    const { asked } = seam();
    const inventoryRequests = () => asked.length;
    {
      render(<HoldingsPanel {...panelProps(config, runtime)} />);
      await act(async () => {
        await Promise.resolve();
      });
      expect(inventoryRequests()).toBe(1);
      const nowcastBefore = document.querySelector('tr[data-era="nowcast"] .message-topic')?.textContent;
      expect(nowcastBefore).toBeTruthy();
      // Time passing is not an announcement: nothing polls, so nothing is refetched.
      await act(async () => {
        vi.advanceTimersByTime(30_000);
        await Promise.resolve();
      });
      expect(inventoryRequests()).toBe(1);
      // A genuine replacement: the generator's own cadence, driven by the clock, and
      // the store announces it on the topic the shell's configuration names.
      await act(async () => {
        for (let tick = 0; tick < config.env_generator.nowcast.interval_ticks; tick++) {
          runtime.clock.tickOnce();
        }
        await settle(() => inventoryRequests() > 1);
      });
      expect(inventoryRequests()).toBe(2);
      const nowcastAfter = document.querySelector('tr[data-era="nowcast"] .message-topic')?.textContent;
      expect(nowcastAfter).not.toBe(nowcastBefore);
    }
  });

  it('Holdings states the gate\'s refusal rather than showing an empty store (FR-46)', async () => {
    seam();
    {
      // A path the release gate does not clear: the refusal is the real gate's, and
      // an empty table would be a lie about what the store holds (Constitution VII).
      const misconfigured = lockstepConfig();
      misconfigured.shell.endpoints.holdings = '/api/not-a-cleared-prefix/holdings';
      render(<HoldingsPanel {...panelProps(misconfigured, runtime)} />);
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByTestId('holdings-count').textContent).toMatch(/the inventory answered 403/);
    }
  });

  it('Map states WebGL absence honestly, lists advisories as present-and-stating-empty, and the composer offers only what is served', async () => {
    seam();
    {
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
      // The position is the map panel's, not the pane's — which is what lets a click
      // on the canvas place it (issue #53). Writing it through the boxes exercises the
      // same state the click writes: the URL assembles, and the map says where the
      // position falls against the domain it fetched from the reference collection.
      const selects = [...document.querySelectorAll('.composer select')] as HTMLSelectElement[];
      act(() => {
        fireEvent.change(selects[0], { target: { value: 'nowcast' } });
        fireEvent.change(selects[1], { target: { value: 'position' } });
      });
      const numbers = [...document.querySelectorAll('.composer input[type="number"]')] as HTMLInputElement[];
      act(() => {
        fireEvent.change(numbers[0], { target: { value: '-11.235' } });
        fireEvent.change(numbers[1], { target: { value: '46.512' } });
        fireEvent.change(numbers[2], { target: { value: '50' } });
      });
      expect(screen.getByTestId('composer-url').textContent).toContain('POINT%28-11.235+46.512%29');
      expect(screen.getByText(/position -11.235, 46.512 — inside the domain/)).toBeTruthy();
      act(() => {
        fireEvent.change(numbers[0], { target: { value: '-25' } });
      });
      expect(screen.getByText(/outside the domain: the server will decline/)).toBeTruthy();
    }
  });

  it('scrubbing the field refetches at the holding\'s own step, and no faster (#60)', async () => {
    const { asked } = seam();
    {
      render(<MapPanel {...panelProps(config, runtime)} />);
      // One clock sample, so there is a displayed instant to scrub away from.
      await act(async () => {
        runtime.clock.tickOnce();
        for (let flush = 0; flush < 12; flush++) await Promise.resolve();
      });
      const nowcast = runtime.store.holdings().find((holding) => holding.era === 'nowcast');
      if (!nowcast) throw new Error('the store holds no now-cast to scrub');
      const time = nowcast.manifest.grid.time;
      const originMillis = Date.parse(time.origin_sim_time.slice(0, 23) + 'Z');
      const stepInstant = (index: number) =>
        `${new Date(originMillis + (time.start_offset_seconds + index * time.step_seconds) * 1000).toISOString().slice(0, 23)}000Z`;
      const areaQueries = () => asked.filter((url) => url.includes('/area?'));

      asked.length = 0;
      const slider = document.querySelector('.map-time input') as HTMLInputElement;
      // A quarter of a step: the displayed instant moves, the field does not, because
      // the holding has nothing else to answer with — and no query is spent finding
      // that out a second time.
      await act(async () => {
        fireEvent.change(slider, { target: { value: String(Math.round(time.step_seconds / 4)) } });
        for (let flush = 0; flush < 8; flush++) await Promise.resolve();
      });
      expect(areaQueries()).toHaveLength(0);

      // A whole step: exactly one query, and its datetime is the manifest's step,
      // not the instant the slider happens to sit on.
      await act(async () => {
        fireEvent.change(slider, { target: { value: String(time.step_seconds) } });
        await settle(() => areaQueries().length > 0);
      });
      const scrubbed = areaQueries();
      expect(scrubbed).toHaveLength(1);
      expect(new URL(scrubbed[0], 'http://x').searchParams.get('datetime')).toBe(stepInstant(1));
      expect(screen.getByText(new RegExp(`field: nowcast at ${displayInstant(stepInstant(1))}`))).toBeTruthy();
    }
  });

  it('doubt as the run\'s spread is a genuine query against the run\'s own instance and axis (#60)', async () => {
    const { asked } = seam();
    const watcher = runtime.transport.connect('run-watch', config.shell.role);
    let announced: { collections: { uncertainty: string } } | undefined;
    watcher.subscribe(config.shell.topics.run_published, (message) => {
      announced ??= message.payload as { collections: { uncertainty: string } };
    });
    {
      render(<MapPanel {...panelProps(config, runtime)} />);
      // Turn the loop until the model runner genuinely publishes: the spread is the
      // run's own instance, so there is nothing to draw until a run exists.
      await act(async () => {
        for (let tick = 0; tick < 2000 && !announced; tick++) runtime.clock.tickOnce();
        for (let flush = 0; flush < 24; flush++) await Promise.resolve();
      });
      if (!announced) throw new Error('no run published in 2000 ticks; the loop is not turning');
      const spreadId = announced.collections.uncertainty;
      const spreadHolding = runtime.store.holdings().find((holding) => holding.holding_id === spreadId);
      if (!spreadHolding) throw new Error(`the store holds no spread instance '${spreadId}'`);

      // The steps each holding actually stores, computed here rather than borrowed
      // from the panel's own helper, so the two are checked against each other.
      const stepsOf = (holding: { manifest: { grid: { time: { origin_sim_time: string; start_offset_seconds: number; step_seconds: number; count: number } } } }) => {
        const time = holding.manifest.grid.time;
        const originMillis = Date.parse(time.origin_sim_time.slice(0, 23) + 'Z');
        return Array.from(
          { length: time.count },
          (_, index) =>
            `${new Date(originMillis + (time.start_offset_seconds + index * time.step_seconds) * 1000).toISOString().slice(0, 23)}000Z`,
        );
      };
      const nearest = (steps: string[], instant: string) =>
        steps.reduce((best, step) =>
          Math.abs(Date.parse(step.slice(0, 23) + 'Z') - Date.parse(instant.slice(0, 23) + 'Z')) <
          Math.abs(Date.parse(best.slice(0, 23) + 'Z') - Date.parse(instant.slice(0, 23) + 'Z'))
            ? step
            : best,
        );
      const spreadSteps = stepsOf(spreadHolding);
      // The displayed instant is the clock's own, the slider being at zero.
      const displayed = () => runtime.clock.simTime();
      const nowcastSteps = () => {
        const nowcast = runtime.store.holdings().find((holding) => holding.era === 'nowcast');
        if (!nowcast) throw new Error('the store holds no now-cast');
        return stepsOf(nowcast);
      };
      // Turn on until the two axes disagree about the displayed instant: while they
      // agree, a spread query snapped to the *field's* step would pass for the wrong
      // reason — and that is exactly the fault this holds.
      const steps = nowcastSteps();
      await act(async () => {
        for (let tick = 0; tick < 900; tick++) {
          const instant = displayed();
          if (instant && nearest(spreadSteps, instant) !== nearest(steps, instant)) break;
          runtime.clock.tickOnce();
        }
        for (let flush = 0; flush < 24; flush++) await Promise.resolve();
      });
      const instant = displayed();
      expect(nearest(spreadSteps, instant)).not.toBe(nearest(steps, instant));

      asked.length = 0;
      const doubt = document.querySelectorAll('.map-controls select')[3] as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(doubt, { target: { value: 'spread' } });
        await settle(() => asked.some((url) => url.includes('/area?')));
      });
      const spreadQueries = asked.filter((url) => url.includes('/area?'));
      expect(spreadQueries).toHaveLength(1);
      const asked_url = new URL(spreadQueries[0], 'http://x');
      expect(asked_url.pathname).toContain(`/collections/${spreadId}/area`);
      // The datetime is the nearest step of the *spread's* own time axis, not the
      // field's: snapping a forecast to the now-cast's steps asks it about an instant
      // outside its horizon, and the server refuses it for asking — which is how this
      // was found, in the running page rather than here.
      expect(asked_url.searchParams.get('datetime')).toBe(nearest(spreadSteps, instant));
      // Drawn, and its range stated: a normalised shade means nothing without one.
      expect(screen.getByText(/across the shade/)).toBeTruthy();
      expect(screen.queryByText(/spread declined/)).toBeNull();
    }
  });

  it('the depth cube asks one area query per level of the holding\'s own depth axis (#59)', async () => {
    const { asked } = seam();
    {
      render(<MapPanel {...panelProps(config, runtime)} />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      // The plan view's own single-level query has already gone out; from here on
      // every area query counted is the cube's.
      asked.length = 0;
      const view = [...document.querySelectorAll('.map-controls select')].at(-1) as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(view, { target: { value: 'cube' } });
        await Promise.resolve();
      });
      // The inventory, then one area query per level, and the levels are the ones
      // the now-cast's ground-truth manifest states — not a list typed into the shell.
      const nowcast = runtime.store.holdings().find((holding) => holding.era === 'nowcast');
      if (!nowcast) throw new Error('the store holds no now-cast to take a depth axis from');
      const depth = nowcast.manifest.grid.depth;
      const expected = Array.from({ length: depth.count }, (_, index) => depth.minimum + index * depth.spacing);
      const asked_area = () => asked.filter((url) => url.includes('/area?'));
      await act(async () => {
        // The cube waits on the inventory before it can ask for a single level, so
        // what is waited for is the level queries themselves.
        await settle(() => asked_area().length >= expected.length);
      });
      const areaQueries = asked_area();
      expect(areaQueries).toHaveLength(expected.length);
      expect(areaQueries.map((url) => Number(new URL(url, 'http://x').searchParams.get('z')))).toEqual(expected);
      expect(screen.getByText(new RegExp(`${expected.length} level\\(s\\), one area query each`))).toBeTruthy();
      // Every level is drawn from a coverage that passed its master; a level that
      // did not would be named as declined rather than quietly missing.
      expect(screen.queryByText(/level\(s\) declined/)).toBeNull();
    }
  });

  it('Operator shows the region table and the latency figure the report carries (#61)', async () => {
    seam();
    {
      // Turn the loop until telemetry has region figures to serve — driven before
      // the panel mounts, so what the display shows is what the report already had.
      for (let tick = 0; tick < 8000 && runtime.telemetry.lastRegionStatistics.length === 0; tick++) {
        runtime.clock.tickOnce();
      }
      expect(runtime.telemetry.lastRegionStatistics.length).toBeGreaterThan(0);
      render(<OperatorPanel {...panelProps(config, runtime)} />);
      await act(async () => {
        await settle(() => screen.queryByTestId('region-statistics') !== null);
      });
      const table = screen.getByTestId('region-statistics');
      const rows = [...table.querySelectorAll('tbody tr')];
      expect(rows).toHaveLength(runtime.telemetry.lastRegionStatistics.length);
      expect(rows.map((row) => row.getAttribute('data-region'))).toEqual(
        runtime.telemetry.lastRegionStatistics.map((region) => region.scope.region_id),
      );
      // Latency reads in simulation seconds and says what it measured.
      expect(screen.getByTestId('latency').textContent).toMatch(/sim-s/);
      expect(screen.getByTestId('latency').textContent).toMatch(/simulation instant/);
    }
  });

  it('Intro states the synthetic-throughout disclaimer and the run identity (FR-01)', () => {
    render(<IntroPanel {...panelProps(config, runtime)} />);
    expect(screen.getByText(/deliberately\s+fake/)).toBeTruthy();
    expect(screen.getByText(runtime.manifest.run_id)).toBeTruthy();
  });
});
