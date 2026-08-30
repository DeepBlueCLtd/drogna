// @vitest-environment jsdom
/**
 * The Data tab against a live backend (feature 120): the tree, the address, the liveness
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
import { BRANCHES } from './tree.js';

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

describe('the Data tab (feature 120)', { timeout: 180_000 }, () => {
  let config: ConfigRun;
  let runtime: BackendRuntime;
  let asked: string[];
  /** The address, as a controllable stand-in for the shell's own. */
  let rest: string | undefined;
  let listener: ((rest: string | undefined) => void) | undefined;

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
    runtime = buildBackend(config, { rootSeed: 77, revision: 'test', dirty: false }, validator);
    asked = [];
    rest = undefined;
    listener = undefined;
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

  it('SC-005: refreshes only on the announcement its store makes, and never on a timer', async () => {
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

    // A genuine publication, driven by the clock the components share, does move it.
    await act(async () => {
      await driveUntil(runtime.clock, () => inventoryRequests() > inventoryBefore, 2000);
      await settle(() => inventoryRequests() > inventoryBefore);
    });
    expect(inventoryRequests()).toBeGreaterThan(inventoryBefore);
    expect(observationRequests()).toBeGreaterThan(observationsBefore);
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

  it('SC-008 through the shell: every holding’s volume asks for a collection the server serves', async () => {
    // `Volume.tsx` derives the EDR collection id from the same convention the query
    // component uses, on the other side of the seam where it cannot import it. This is
    // what stops the two drifting: every holding the store reports must name a
    // collection the collections list actually offers.
    await mounted();
    await act(async () => {
      await settle(() => runtime.store.holdings().length > 0);
    });
    const response = await fetch(`${config.shell.endpoints.edr}/collections`);
    const served = new Set(
      ((await response.json()) as { collections: { id: string }[] }).collections.map((entry) => entry.id),
    );
    for (const holding of runtime.store.holdings()) {
      const manyPerEra = holding.era === 'instance' || holding.era === 'analysis';
      const asksFor = manyPerEra ? holding.holding_id : holding.era;
      expect(served.has(asksFor), `nothing serves '${asksFor}' for ${holding.holding_id}`).toBe(true);
    }
  });
});
