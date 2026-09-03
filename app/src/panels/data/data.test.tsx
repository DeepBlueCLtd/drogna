// @vitest-environment jsdom
/**
 * The Data tab against a live backend (feature 121): the tree, the address, the liveness
 * rule, the measurement chart and the shore canvas.
 *
 * Nothing here is mocked below the seam. The three stores are the real ones, the three
 * query components answer the real requests, and every response the panel renders has
 * been through its master on the way. The coverage branches' own claims — the timeline,
 * the manifest, the comparison — are in `coverage.test.tsx`, which carries the Holdings
 * tab's tests into the tab that absorbed them.
 *
 * The checks that matter most here are the negative ones: that nothing polls, and that an
 * empty branch says *why* it is empty. Both look identical to a working tab in a
 * screenshot, which is why they are asserted rather than looked at.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDockviewPanelProps } from 'dockview-react';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { driveUntil } from '../../backend/test-support/drive.js';
import { createSeamFetch } from '../../seam/http.js';
import { buildBackend, type BackendRuntime } from '../../backend/runtime/runtime.js';
import type { PanelParams } from '../../shell/Shell.js';
import { DataPanel } from './DataPanel.js';
import { BRANCHES, isGriddedCoverage } from './tree.js';
import { TABLE_ROWS } from './table.js';

const validator = createSeamValidator();
const realFetch = globalThis.fetch;

function lockstepConfig(): ConfigRun {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  return config;
}

async function settle(until: () => boolean, rounds = 4000): Promise<void> {
  for (let round = 0; round < rounds && !until(); round++) await Promise.resolve();
}

/**
 * Wait on something that needs a *macrotask* turn, not just a microtask one.
 *
 * The two code-split surfaces (the volume and the shore canvas) resolve through a
 * dynamic import, and an import is file I/O: flushing microtasks forever never lets it
 * land, so a settle() loop sits watching the Suspense fallback until it gives up.
 * `setImmediate` is the yield `test-support/drive.ts` documents — it arms no timer and
 * reads no clock, so it is not the wall-clock dependency the gate forbids, and this file
 * fakes setTimeout but not setImmediate.
 */
async function arrive(until: () => boolean, rounds = 200): Promise<void> {
  for (let round = 0; round < rounds && !until(); round++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe('the Data tab (feature 121)', { timeout: 180_000 }, () => {
  let config: ConfigRun;
  let runtime: BackendRuntime;
  let asked: string[];
  /** The address, as a controllable stand-in for the shell's own. */
  let rest: string | undefined;
  let listener: ((rest: string | undefined) => void) | undefined;
  let observationCount = 0;

  function panelProps(overrides?: Partial<ConfigRun['shell']>) {
    const params: PanelParams = {
      config: { ...config.shell, ...overrides },
      client: runtime.transport.connect('shell-test', config.shell.role),
      validator,
      manifest: runtime.manifest,
      address: {
        names: () => true,
        current: () => rest,
        write: (next) => {
          rest = next;
        },
        onChange: (fn) => {
          listener = fn;
          return () => {
            listener = undefined;
          };
        },
      },
    };
    return { params } as unknown as IDockviewPanelProps<PanelParams>;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    config = lockstepConfig();
    runtime = buildBackend(config, { rootSeed: 77, startCondition: 'loitering', revision: 'test', dirty: false }, validator);
    asked = [];
    rest = undefined;
    listener = undefined;
    observationCount = 0;
    runtime.transport
      .connect('observation-watch', config.shell.role)
      .subscribe(config.shell.topics.observations, () => {
        observationCount += 1;
      });
    const seamFetch = createSeamFetch(config.boundary.api_prefix, runtime.httpBackend, realFetch);
    vi.stubGlobal('fetch', ((input: RequestInfo | URL, init?: RequestInit) => {
      asked.push(String(input));
      return seamFetch(input, init);
    }) as typeof globalThis.fetch);
  });

  afterEach(() => {
    cleanup();
    runtime.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function mounted(): Promise<void> {
    render(<DataPanel {...panelProps()} />);
    await act(async () => {
      await settle(() => document.querySelectorAll('[data-branch]').length >= BRANCHES.length);
    });
  }

  /** Observation messages the broker has actually delivered, counted independently. */
  function announcedObservations(): number {
    return observationCount;
  }

  async function openBranch(branchId: string): Promise<void> {
    const button = document.querySelector<HTMLElement>(`[data-branch="${branchId}"]`);
    if (!button) throw new Error(`no '${branchId}' branch in the tree`);
    await act(async () => {
      fireEvent.click(button);
      await settle(() => false, 400);
    });
  }

  it('SC-002: draws all seven branches, each from what a store actually answered', async () => {
    await mounted();
    const drawn = [...document.querySelectorAll('[data-branch]')].map((node) =>
      node.getAttribute('data-branch'),
    );
    expect(drawn).toEqual(BRANCHES.map((branch) => branch.id));

    // The counts are the stores', not the tab's: each is checked against the component
    // that answered, so a branch cannot quietly draw a subset.
    await act(async () => {
      await settle(() => (screen.getByTestId('count-archive').textContent ?? '0') !== '0');
    });
    const held = runtime.store.holdings();
    for (const branch of BRANCHES.filter((candidate) => candidate.kind === 'coverage')) {
      const reported = held.filter((holding) => holding.era === branch.era).length;
      expect(
        screen.getByTestId(`count-${branch.id}`).textContent,
        `the '${branch.id}' branch disagrees with the store`,
      ).toBe(String(reported));
    }
    // The departure brief has a branch of its own and it is not empty: the interview's
    // "recent", which had no publisher before this feature.
    expect(screen.getByTestId('count-departure').textContent).toBe('1');
  });

  it('counts measurements in measurements, not in datastreams (reported)', async () => {
    // Reported against the built tab: the branch showed how many *properties* were being
    // measured, which is a fact about how the platform is instrumented and does not move.
    // The figure the branch is there for is how much has been reported.
    await mounted();
    await act(async () => {
      await driveUntil(runtime.clock, () => runtime.observationStore.all().length > 10, 2000);
      await settle(() => false, 200);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('data-refresh'));
      await settle(() => (screen.getByTestId('count-measurements').textContent ?? '0') !== '0');
    });
    const held = runtime.observationStore.all().length;
    expect(held).toBeGreaterThan(10);
    // The store's own figure, and distinguishable from the datastream count it replaced.
    expect(screen.getByTestId('count-measurements').textContent).toBe(String(held));
    expect(Number(screen.getByTestId('count-measurements').textContent)).toBeGreaterThan(
      runtime.observationStore.datastreams().size,
    );
  });

  it('SC-005: refreshes on the announcement its store makes, and never on a timer', async () => {
    const inventoryRequests = () =>
      asked.filter((path) => path.includes(config.shell.endpoints.holdings)).length;
    const observationRequests = () =>
      asked.filter((path) => path.includes(`${config.shell.endpoints.sensorthings}/Things`)).length;
    await mounted();
    await act(async () => {
      await settle(() => inventoryRequests() >= 1 && observationRequests() >= 1);
    });
    const inventoryBefore = inventoryRequests();
    const observationsBefore = observationRequests();

    // Time passing is not an announcement. The clock is faked, so this advances the host
    // timers a panel would poll on — and nothing must move.
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await settle(() => false, 200);
    });
    expect(inventoryRequests()).toBe(inventoryBefore);
    expect(observationRequests()).toBe(observationsBefore);

    // A genuine publication, driven by the clock the components share, does move the
    // coverage branches: the store announces rarely, so acting on the announcement costs
    // a request when there is something new and nothing when there is not.
    await act(async () => {
      await driveUntil(runtime.clock, () => inventoryRequests() > inventoryBefore, 2000);
      await settle(() => inventoryRequests() > inventoryBefore);
    });
    expect(inventoryRequests()).toBeGreaterThan(inventoryBefore);
    // The measurements do *not* move with it, and that is the change rather than an
    // oversight: observations announce constantly, and this used to refetch the platform
    // list on every one of them while never refetching the chart a reader was watching.
    // The backlog is counted and the refresh control applies it (the two tests above).
    expect(observationRequests()).toBe(observationsBefore);
  });

  it('the open chart is stale until refreshed, and the tab says how stale (feature 121, reported)', async () => {
    // The fault this was written for, reported against the built page and reproduced at
    // ×600: the chart held 66 points while twenty-six simulated minutes ran past it,
    // because its fetch was keyed on the datastream alone. The tab was busiest exactly
    // when it looked most static.
    await mounted();
    await openBranch('measurements');
    await act(async () => {
      await driveUntil(runtime.clock, () => document.querySelector('[data-datastream]') !== null, 2000);
      await settle(() => document.querySelector('[data-datastream]') !== null);
    });
    const stream = document.querySelector<HTMLElement>('[data-datastream]');
    if (!stream) throw new Error('no datastream reached the tab');
    const datastreamId = stream.getAttribute('data-datastream') ?? '';
    const [thingId, streamId] = datastreamId.split('/');
    await act(async () => {
      fireEvent.click(stream);
      await settle(() => screen.queryByTestId('datastream-chart') !== null, 8000);
    });
    const plotted = () =>
      (document.querySelector('.series-line')?.getAttribute('points') ?? '')
        .split(' ')
        .filter((pair) => pair !== '').length;
    const drawnAt = plotted();
    expect(drawnAt).toBe(runtime.observationStore.byDatastream(thingId, streamId).length);

    // More observations arrive. The chart does not move — deliberately, because a
    // picture that jitters under the reader is worse than one a moment old — and the
    // tab says how many are waiting rather than leaving that to be guessed.
    await act(async () => {
      await driveUntil(
        runtime.clock,
        () => runtime.observationStore.byDatastream(thingId, streamId).length > drawnAt,
        2000,
      );
      await settle(() => (screen.getByTestId('data-waiting').textContent ?? '').includes('have arrived'));
    });
    const held = runtime.observationStore.byDatastream(thingId, streamId).length;
    expect(held).toBeGreaterThan(drawnAt);
    expect(plotted()).toBe(drawnAt);
    expect(screen.getByTestId('data-waiting').textContent).toMatch(/\d+ observation\(s\) have arrived/);

    // Refreshing applies them, and the chart is the store's again.
    await act(async () => {
      fireEvent.click(screen.getByTestId('data-refresh'));
      await settle(() => plotted() > drawnAt, 8000);
    });
    expect(plotted()).toBe(runtime.observationStore.byDatastream(thingId, streamId).length);
    expect(screen.getByTestId('data-waiting').textContent).toMatch(/nothing has arrived/);
  });

  it('does not refetch the datastream list on every observation (feature 121)', async () => {
    // The other half of the same fault: the observation subscription refetched the
    // platforms and the datastream list on every single sample — two requests each, for
    // a list that changes when a sensor first reports and at no other time.
    const listRequests = () =>
      asked.filter((path) => path.includes(`${config.shell.endpoints.sensorthings}/Datastreams`) && !path.includes('Observations')).length;
    await mounted();
    await act(async () => {
      await settle(() => listRequests() >= 1);
    });
    const atMount = listRequests();
    await act(async () => {
      await driveUntil(runtime.clock, () => announcedObservations() > 20, 2000);
      await settle(() => false, 200);
    });
    expect(announcedObservations()).toBeGreaterThan(20);
    expect(listRequests()).toBe(atMount);
    // And the control still reads them when asked.
    await act(async () => {
      fireEvent.click(screen.getByTestId('data-refresh'));
      await settle(() => listRequests() > atMount);
    });
    expect(listRequests()).toBe(atMount + 1);
  });

  it('SC-004: an address names a branch and a node, and a node the store lacks is reported rather than absorbed', async () => {
    rest = 'archive';
    await mounted();
    await act(async () => {
      await settle(() => document.querySelector('[data-holding]') !== null);
    });
    // The address opened the archive rather than the tab's first branch.
    expect(document.querySelector('[data-branch="archive"]')?.getAttribute('aria-current')).toBe('true');

    // Choosing writes the address back, so the link a reader copies is the view they see.
    const bar = document.querySelector<HTMLElement>('[data-holding][data-era="archive"]');
    if (!bar) throw new Error('the store published no archive holding');
    const holdingId = bar.getAttribute('data-holding');
    await act(async () => {
      fireEvent.click(bar);
      await settle(() => rest !== 'archive');
    });
    expect(rest).toBe(`archive/${holdingId}`);

    // And an address naming a holding the store does not hold says which was asked for,
    // rather than opening silently on something else (FR-03).
    await act(async () => {
      listener?.('archive/a-holding-that-went');
      await settle(() => screen.queryByTestId('node-missing') !== null);
    });
    expect(screen.getByTestId('node-missing').textContent).toMatch(/a-holding-that-went/);
    expect(screen.queryByTestId('manifest-json')).toBeNull();
  });

  it('SC-006: a datastream’s chart plots every observation the store holds for it', async () => {
    await mounted();
    await openBranch('measurements');
    await act(async () => {
      await driveUntil(runtime.clock, () => document.querySelector('[data-datastream]') !== null, 2000);
      await settle(() => document.querySelector('[data-datastream]') !== null);
    });
    const stream = document.querySelector<HTMLElement>('[data-datastream]');
    if (!stream) throw new Error('no datastream reached the tab');
    const datastreamId = stream.getAttribute('data-datastream') ?? '';

    await act(async () => {
      fireEvent.click(stream);
      await settle(() => screen.queryByTestId('datastream-chart') !== null, 8000);
    });
    const points = document.querySelector('.series-line')?.getAttribute('points') ?? '';
    const plotted = points.split(' ').filter((pair) => pair !== '').length;

    // The bound is the store's own count for this datastream, read through the same
    // interface the panel used — not a number typed here.
    const [thingId, streamId] = datastreamId.split('/');
    const held = runtime.observationStore.byDatastream(thingId, streamId).length;
    expect(plotted).toBe(held);
    expect(screen.getByTestId('chart-summary').textContent).toContain(String(held));
  });

  it('the same history reads as a table, from the one fetch that drew the chart (reported)', async () => {
    // Asked for against the built tab: a chart answers "what has this instrument been
    // doing", and the reader wanted the other question — exactly what it said, and when.
    // The claim under test is not that a table appears. It is that switching to it asks
    // the store *nothing*: two presentations of one fetched history cannot disagree,
    // where two fetches could land either side of a publication and would.
    await mounted();
    await openBranch('measurements');
    await act(async () => {
      await driveUntil(runtime.clock, () => document.querySelector('[data-datastream]') !== null, 2000);
      await settle(() => document.querySelector('[data-datastream]') !== null);
    });
    const stream = document.querySelector<HTMLElement>('[data-datastream]');
    if (!stream) throw new Error('no datastream reached the tab');
    const datastreamId = stream.getAttribute('data-datastream') ?? '';
    const [thingId, streamId] = datastreamId.split('/');
    // A history of one observation cannot be out of order, and a check that cannot fail
    // is worth nothing: the first draft of this test asserted a row order against a
    // single row and passed with the ordering deliberately reversed. So the store is
    // driven until this datastream has a history worth ordering, and only then read.
    await act(async () => {
      await driveUntil(
        runtime.clock,
        () => runtime.observationStore.byDatastream(thingId, streamId).length >= 5,
        4000,
      );
    });
    expect(runtime.observationStore.byDatastream(thingId, streamId).length).toBeGreaterThanOrEqual(5);
    await act(async () => {
      fireEvent.click(stream);
      await settle(() => screen.queryByTestId('datastream-chart') !== null, 8000);
    });
    const historyRequests = () => asked.filter((path) => path.includes('/Observations')).length;
    const fetchedFor = historyRequests();
    expect(fetchedFor).toBeGreaterThan(0);

    const tableTab = document.querySelector<HTMLElement>('[role="tab"][data-presentation="table"]');
    if (!tableTab) throw new Error('the history offers no table');
    await act(async () => {
      fireEvent.click(tableTab);
      await settle(() => screen.queryByTestId('datastream-table') !== null, 8000);
    });
    expect(historyRequests()).toBe(fetchedFor);
    expect(screen.queryByTestId('datastream-chart')).toBeNull();

    // One row per observation the store holds, and the values are the store's own —
    // bounds read back through the store rather than typed here. The window is the
    // module's own ceiling for the same reason: a history longer than the table draws its
    // recent end, and a number typed here would stop being the one the table uses.
    const held = runtime.observationStore.byDatastream(thingId, streamId);
    const expected = Math.min(held.length, TABLE_ROWS);
    const rows = [...document.querySelectorAll('[data-observation]')];
    expect(rows.length).toBe(expected);
    // `byDatastream` is already ordered on phenomenon time, so the window is the tail of
    // it — sliced by *time* and then compared row for row, which is the claim the table
    // makes. Comparing sorted values instead would pass for any 500 observations.
    const shown = rows.map((row) => Number(row.querySelector('.table-value')?.textContent ?? 'x'));
    expect(shown).toEqual(held.slice(held.length - expected).map((observation) => observation.result));
    expect(screen.getByTestId('table-summary').textContent).toContain(String(held.length));

    // And back, still on the one fetch: the chart the reader left is the chart they get.
    const chartTab = document.querySelector<HTMLElement>('[role="tab"][data-presentation="chart"]');
    if (!chartTab) throw new Error('the history offers no chart');
    await act(async () => {
      fireEvent.click(chartTab);
      await settle(() => screen.queryByTestId('datastream-chart') !== null, 8000);
    });
    expect(historyRequests()).toBe(fetchedFor);
    const plotted = (document.querySelector('.series-line')?.getAttribute('points') ?? '')
      .split(' ')
      .filter((pair) => pair !== '').length;
    expect(plotted).toBe(held.length);
  });

  it('SC-011: every advisory the collection returned is drawn, lapsed ones included', async () => {
    // The shore canvas is code-split — deck.gl is about a third of the bundle and this
    // tab must not drag it into the first load — so its module is brought in here before
    // the panel asks for it. Without this the lazy import is still resolving when the
    // assertions run, and the test measures the Suspense fallback instead of the branch:
    // the same fault the `panel-arriving` marker was added for on the map.
    await import('./ShoreUpdates.js');
    await mounted();
    await openBranch('shore');
    await act(async () => {
      await arrive(() => screen.queryByTestId('panel-arriving') === null);
    });
    // Before shore has sent anything the branch states that the collection is present and
    // empty, rather than drawing an empty sea.
    expect(screen.getByTestId('branch-empty').textContent).toMatch(/present and states that it holds nothing/);

    await act(async () => {
      await driveUntil(runtime.clock, () => runtime.advisoryStore.all().length > 0, 4000);
      await settle(() => screen.queryByTestId('advisory-list') !== null, 8000);
    });
    const held = runtime.advisoryStore.all().length;
    if (held === 0) throw new Error('shore sent no advisory in 4000 ticks');
    const drawn = document.querySelectorAll('[data-advisory]');
    expect(drawn).toHaveLength(held);
    // Selecting one opens its document whole.
    await act(async () => {
      fireEvent.click(drawn[0] as HTMLElement);
      await settle(() => screen.queryByTestId('advisory-json') !== null);
    });
    expect(screen.getByTestId('advisory-json').textContent).toMatch(/"guidance"/);

    // And the regions are drawn on something. Reported against the built tab: with no
    // reference geometry beneath them an advised bbox is a rectangle in a void, which
    // says a region was advised and nothing about where — half of what an advisory is.
    // The legend is the assertable half of that; the drawing itself needs WebGL.
    expect(screen.getByTestId('advisory-legend').textContent).toMatch(/scenario domain/);
    expect(screen.getByTestId('advisory-legend').textContent).toMatch(/loiter region/);
    // The reference is fetched through the seam like everything else in this tab.
    expect(asked.some((path) => path.includes('/collections/reference/items'))).toBe(true);
  });

  it('SC-010: the volume loads the step it is on, and says which steps it holds', async () => {
    // Written after driving the built page in a browser found the volume stuck on
    // "fetching 4 level(s)" forever: the effect listed the cache in its dependencies, so
    // writing `loading` into the cache re-ran the effect, whose cleanup abandoned the
    // fetch that would have replaced it. Every unit test passed throughout — none of them
    // drove the fetch — which is what this test is for.
    await import('./Volume.js');
    await mounted();
    await openBranch('archive');
    await act(async () => {
      await settle(() => document.querySelector('[data-holding]') !== null);
    });
    const bar = document.querySelector<HTMLElement>('[data-holding]');
    if (!bar) throw new Error('the store published no archive holding');
    await act(async () => {
      fireEvent.click(bar);
      await arrive(() => screen.queryByTestId('volume-loading') !== null);
    });

    // It reaches 'loaded' rather than sitting on 'loading'. Asserted as the absence of
    // the loading state *and* the presence of the summary, because a volume that fell
    // over would show neither.
    await act(async () => {
      await arrive(
        () => (screen.queryByTestId('volume-loading')?.textContent ?? '').includes('1 of'),
        400,
      );
    });
    expect(screen.getByTestId('volume-loading').textContent).toMatch(/^1 of \d+ step\(s\) fetched/);
    // And it asked for the levels the manifest declares, one area query each.
    const areaQueries = asked.filter((path) => path.includes('/area?'));
    const holdingId = bar.getAttribute('data-holding');
    const levels = runtime.store.holding(holdingId ?? '')?.descriptor.manifest.grid.depth.count ?? 0;
    expect(levels).toBeGreaterThan(0);
    expect(areaQueries).toHaveLength(levels);
    // Every one named the same instant: a step is one instant across all its levels.
    const instants = new Set(areaQueries.map((path) => new URLSearchParams(path.split('?')[1]).get('datetime')));
    expect(instants.size).toBe(1);
  });

  it('SC-008 through the shell: every coverage’s volume asks for a collection the server serves, and a non-coverage asks for none', async () => {
    // `Volume.tsx` derives the EDR collection id from the same convention the query
    // component uses, on the other side of the seam where it cannot import it. This is
    // what stops the two drifting: every coverage the store reports must name a
    // collection the collections list actually offers.
    //
    // **Driven to an analysis cycle, deliberately.** This test used to wait for the store
    // to hold anything, which the pre-rolled archive satisfied at once, so it never saw
    // an analysis holding — and when feature 124 put a holding in the store that EDR does
    // not serve, the property it guards was false on the running system while this
    // passed (found by review). The state it guards is the one with every kind of
    // holding present, so that is the state it waits for.
    await mounted();
    await act(async () => {
      await driveUntil(runtime.clock, () => runtime.store.holdings().some((holding) => holding.era === 'analysis'), 4000);
    });
    const response = await fetch(`${config.shell.endpoints.edr}/collections`);
    const served = new Set(
      ((await response.json()) as { collections: { id: string }[] }).collections.map((entry) => entry.id),
    );
    let coverages = 0;
    let others = 0;
    for (const holding of runtime.store.holdings()) {
      const manyPerEra = holding.era === 'instance' || holding.era === 'analysis';
      const asksFor = manyPerEra ? holding.holding_id : holding.era;
      if (isGriddedCoverage(holding)) {
        coverages += 1;
        expect(served.has(asksFor), `nothing serves '${asksFor}' for ${holding.holding_id}`).toBe(true);
      } else {
        // Not a coverage: EDR must not list it, and the tab must not ask.
        others += 1;
        expect(served.has(asksFor), `EDR lists '${asksFor}', which is not a coverage`).toBe(false);
      }
    }
    expect(coverages).toBeGreaterThan(3);
    expect(others).toBeGreaterThan(0);
  });
});
