// @vitest-environment jsdom
/**
 * The coverage branches of the Data tab against a live backend (feature 115's FR-69 and
 * FR-70, carried by feature 121 into the tab that absorbed them). Nothing here is mocked
 * below the seam: the coverage store is the real one, the EDR service answers the real
 * queries, and the coverages differenced are the ones the seam actually served.
 *
 * These were the Holdings tab's tests and they still ask the Holdings tab's questions.
 * What changed is where the answers live: a branch draws one era, so the parity claim —
 * *every holding the store reports is reachable* — is now checked by walking the branches
 * rather than by counting bars on one timeline. Weakening it to "every holding of the era
 * I happened to open" would have been the easy edit and would have retired the check.
 *
 * The rendered half of the parity check lives here — SC-03's *every holding reachable by
 * keyboard in publication order, each announcing what the master declares* — because it
 * needs holdings the store genuinely published. The half that can be held to the master
 * alone is `parity.test.ts`, and that half was written before the timeline existed.
 *
 * SC-04 and SC-05 are here too, and both are the kind of check a screenshot cannot make:
 * SC-04 fetches the three URLs the panel put on screen and asserts they return the three
 * documents it was drawn from, and SC-05 selects an instance still inside its validity
 * and asserts the panel states why there is nothing to compare.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDockviewPanelProps } from 'dockview-react';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun, CoverageHolding } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { driveTicks, driveUntil } from '../../backend/test-support/drive.js';
import { createSeamFetch } from '../../seam/http.js';
import { buildBackend, type BackendRuntime } from '../../backend/runtime/runtime.js';
import type { PanelParams } from '../../shell/Shell.js';
import { DataPanel, DATA_REGIONS } from './DataPanel.js';
import { DATA_TOUR_STEPS, uncoveredSubjects } from '../../shell/walkthrough/tour.js';
import { BRANCHES } from './tree.js';
import { announceHolding } from './announce.js';

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

/**
 * Flush until the thing being waited for has happened, rather than a fixed number of
 * microtasks — the same rule `panels.test.tsx` records: a count is a guess about how many
 * turns a fetch → validate → setState chain takes, and CI took more turns than this
 * machine did.
 */
async function settle(until: () => boolean, rounds = 4000): Promise<void> {
  for (let round = 0; round < rounds && !until(); round++) await Promise.resolve();
}

describe('the Data tab’s coverage branches (features 115, 118)', { timeout: 180_000 }, () => {
  let config: ConfigRun;
  let runtime: BackendRuntime;
  let asked: string[];

  function panelProps() {
    const params: PanelParams = {
      config: config.shell,
      client: runtime.transport.connect('shell-test', config.shell.role),
      validator,
      manifest: runtime.manifest,
      address: noAddress,
    };
    return { params } as unknown as IDockviewPanelProps<PanelParams>;
  }

  beforeEach(() => {
    // Everything but setImmediate, and for a reason worth stating. These tests turn the
    // loop thousands of times, and a drive that never reaches a macrotask turn stops the
    // vitest worker answering the main process — birpc's deadline for that reply is 60
    // seconds and is not configurable, so the run exits non-zero on
    // `Timeout calling "onTaskUpdate"` with every test in it passing. test-support/drive.ts
    // yields with setImmediate for exactly that, and cannot help a file that fakes it.
    // What this file actually needs faked is the clock the heartbeats run on, which is
    // setTimeout, setInterval and Date; setImmediate is not one of them.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    config = lockstepConfig();
    runtime = buildBackend(config, { rootSeed: 11, startCondition: 'loitering', revision: 'test', dirty: false }, validator);
    asked = [];
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

  /** The inventory the backend is actually serving, read the way the panel reads it. */
  async function inventory(): Promise<CoverageHolding[]> {
    const response = await realFetchThroughSeam(config.shell.endpoints.holdings);
    return (response as { holdings: CoverageHolding[] }).holdings;
  }

  async function realFetchThroughSeam(path: string): Promise<unknown> {
    const response = await fetch(path);
    return response.json();
  }

  async function mounted(branchId = 'nowcast'): Promise<void> {
    render(<DataPanel {...panelProps()} />);
    await act(async () => {
      await settle(() => document.querySelector(`[data-branch="${branchId}"]`) !== null);
    });
    await openBranch(branchId);
  }

  /** Open a branch the way a reader does, and wait for it to have drawn. */
  async function openBranch(branchId: string): Promise<void> {
    const button = document.querySelector<HTMLElement>(`[data-branch="${branchId}"]`);
    if (!button) throw new Error(`no '${branchId}' branch in the tree`);
    await act(async () => {
      fireEvent.click(button);
      await settle(
        () =>
          document.querySelector('[data-holding]') !== null ||
          screen.queryByTestId('branch-empty') !== null ||
          screen.queryByTestId('branch-refusal') !== null,
      );
    });
  }

  it('SC-03: every holding is a keyboard stop in publication order, announcing what the master declares', async () => {
    await mounted();
    const held = await inventory();
    const reachable: string[] = [];
    // Walked branch by branch, because a branch draws one era. The claim is unchanged:
    // every holding the store reports is reachable, not a subset the display chose.
    for (const branch of BRANCHES.filter((candidate) => candidate.kind === 'coverage')) {
      await openBranch(branch.id);
      const drawn = [...document.querySelectorAll('[data-holding]')] as HTMLElement[];
      const ofEra = held.filter((holding) => holding.era === branch.era);
      expect(drawn.map((bar) => bar.getAttribute('data-holding')).sort()).toEqual(
        ofEra.map((holding) => holding.holding_id).sort(),
      );
      // Each is a button, so it is a keyboard stop because the platform made it one.
      expect(drawn.every((bar) => bar.tagName === 'BUTTON')).toBe(true);
      // In publication order, which is the order the store's history happened in.
      const byTick = [...ofEra].sort((a, b) => a.published_at.tick - b.published_at.tick);
      expect(drawn.map((bar) => bar.getAttribute('data-holding'))).toEqual(
        byTick.map((holding) => holding.holding_id),
      );
      reachable.push(...drawn.map((bar) => bar.getAttribute('data-holding') ?? ''));
    }
    expect(reachable.sort()).toEqual(held.map((holding) => holding.holding_id).sort());
    // And each announces every fact `announce.ts` derives from the master — the bound
    // that `parity.test.ts` holds to `coverage-holding.schema.json` itself.
    for (const holding of held) {
      const branch = BRANCHES.find((candidate) => candidate.era === holding.era);
      if (!branch) throw new Error(`no branch draws the '${holding.era}' era`);
      await openBranch(branch.id);
      const bar = document.querySelector(`[data-holding="${holding.holding_id}"]`);
      const label = bar?.getAttribute('aria-label') ?? '';
      for (const entry of announceHolding(holding)) {
        expect(label, `'${entry.property}' was not announced for ${holding.holding_id}`).toContain(
          entry.text,
        );
      }
    }
  });

  it('FR-69: the panel states the scale it is showing rather than leaving it to be inferred', async () => {
    await mounted();
    const scale = screen.getByTestId('timeline-scale').textContent ?? '';
    expect(scale).toMatch(/logarithmic in elapsed simulation time|one instant/);
    // The axis labels the instants the mapping falls on, so a reader converts by reading
    // rather than by trusting the shape of a non-linear scale. Date and minute, not the
    // full wire instant: four of those across one axis print over each other.
    expect(screen.getByTestId('timeline-axis').textContent).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  });

  it('FR-46: a refused inventory states the refusal and draws no timeline', async () => {
    const misconfigured = lockstepConfig();
    misconfigured.shell.endpoints.holdings = '/api/not-a-cleared-prefix/holdings';
    const params: PanelParams = {
      config: misconfigured.shell,
      client: runtime.transport.connect('shell-test', misconfigured.shell.role),
      validator,
      manifest: runtime.manifest,
      address: noAddress,
    };
    render(<DataPanel {...({ params } as unknown as IDockviewPanelProps<PanelParams>)} />);
    await act(async () => {
      await settle(() => (screen.getByTestId('data-counts').textContent ?? '').includes('not-a-cleared-prefix'));
    });
    // The release gate's own refusal, carried through rather than replaced by a status
    // code: it names the path it would not clear, which is the useful half (FR-27, FR-06).
    expect(screen.getByTestId('data-counts').textContent).toMatch(
      /the coverage inventory: .*not-a-cleared-prefix/,
    );
    // An empty timeline is a claim the shell is not entitled to make, so none is drawn —
    // and the branch says why where the timeline would have been.
    await openBranch('archive');
    expect(screen.queryByTestId('holdings-timeline')).toBeNull();
    expect(screen.getByTestId('branch-refusal').textContent).toMatch(/the coverage inventory/);
  });

  it('SC-05: an instance whose validity has not elapsed is refused with its reason', async () => {
    // Watch for the announcement rather than guessing a tick count: the loop turns when
    // the world has diverged enough for it to, which is not a number this test knows.
    const watcher = runtime.transport.connect('run-watch', config.shell.role);
    let published = false;
    watcher.subscribe(config.shell.topics.run_published, () => {
      published = true;
    });
    await mounted('forecast');
    // Turn the loop until it publishes, then select the instance while the run is still
    // inside the validity it forecasts — the common case, and the one the panel must
    // refuse rather than compare against a truth that has not happened.
    await act(async () => {
      await driveUntil(runtime.clock, () => published, 3000);
      await settle(() => document.querySelector('[data-era="instance"]') !== null);
    });
    if (!published) throw new Error('no run published in 3000 ticks; the loop is not turning');
    const instance = document.querySelector<HTMLElement>('[data-holding][data-era="instance"]');
    if (!instance) throw new Error('the loop published no forecast instance to select');
    await act(async () => {
      fireEvent.click(instance);
      await settle(() => screen.queryByTestId('comparison') !== null);
    });
    const comparison = screen.getByTestId('comparison');
    expect(comparison.getAttribute('data-offered')).toBe('false');
    // Named, not silent: "no comparison is offered" and "no comparison is possible, and
    // here is why" are different statements and a reader is owed the second.
    expect(screen.getByTestId('comparison-refusal').textContent).toMatch(
      /validity has not elapsed|no now-cast holding covers|forecasts .* which the run has not reached/,
    );
  });

  it('SC-04: the three URLs on screen return the three documents the picture was drawn from', async () => {
    const watcher = runtime.transport.connect('run-watch', config.shell.role);
    let published = false;
    watcher.subscribe(config.shell.topics.run_published, () => {
      published = true;
    });
    await mounted('forecast');
    // Turn the loop until a run publishes, then keep turning until the panel offers the
    // comparison — which happens when the instance's validity has elapsed and a now-cast
    // covering the instant it forecast exists.
    let comparable: HTMLElement | undefined;
    await act(async () => {
      await driveUntil(runtime.clock, () => published, 6000);
      await settle(() => document.querySelector('[data-era="instance"]') !== null);
    });
    if (!published) throw new Error('no run published; the loop is not turning');
    for (let round = 0; round < 40 && !comparable; round++) {
      await act(async () => {
        await driveTicks(runtime.clock, 200);
        await settle(() => false, 200);
      });
      for (const bar of [...document.querySelectorAll('[data-holding][data-era="instance"]')]) {
        await act(async () => {
          fireEvent.click(bar as HTMLElement);
          await settle(() => screen.queryByTestId('comparison') !== null);
        });
        if (screen.getByTestId('comparison').getAttribute('data-offered') === 'true') {
          comparable = bar as HTMLElement;
          break;
        }
      }
    }
    if (!comparable) {
      throw new Error(
        `no instance became comparable; the last refusal was: ${screen.queryByTestId('comparison-refusal')?.textContent}`,
      );
    }

    // Ask the three queries, through the control a reader would use.
    await act(async () => {
      fireEvent.click(screen.getByTestId('comparison-run'));
      await settle(() => screen.queryByTestId('comparison-urls') !== null);
    });
    const urls = [...document.querySelectorAll('[data-comparison-url]')].map(
      (node) => node.textContent ?? '',
    );
    expect(urls).toHaveLength(3);
    // The check SC-04 asks for, and the reason the URLs are constitutive of the display
    // rather than a convenience: fetched, they return the three documents the picture
    // was drawn from. Checked by test, not by eye.
    for (const url of urls) {
      const response = await fetch(url);
      expect(response.ok, `${url} did not answer`).toBe(true);
      const body = (await response.json()) as unknown;
      expect(validator.validate('coveragejson', body).ok, `${url} was refused by its master`).toBe(true);
    }
    // The three are genuinely three different questions: the instance, the truth, and the
    // instance's own initial step. Two identical URLs would be a picture of one document
    // differenced against itself.
    expect(new Set(urls).size).toBe(3);

    // And Constitution IX's obligation is on screen: two differences, one shared scale,
    // and a plain statement of which is closer.
    expect(screen.getByTestId('difference-forecast')).toBeTruthy();
    expect(screen.getByTestId('difference-persistence')).toBeTruthy();
    expect(screen.getByTestId('comparison-verdict').textContent).toMatch(
      /closer to the truth than/,
    );
    // The derived figures are labelled derived, distinctly from the other three kinds.
    expect(document.querySelectorAll('[data-figure-kind="derived"]').length).toBeGreaterThan(0);
    // Telemetry's own figure is shown or its absence is stated; it is never recomputed.
    expect(screen.getByTestId('comparison-telemetry').textContent).toMatch(
      /Telemetry|telemetry/,
    );
  });

  it('a holding that is not an instance is refused by name rather than offered a comparison', async () => {
    await mounted('archive');
    const archive = document.querySelector<HTMLElement>('[data-holding][data-era="archive"]');
    if (!archive) throw new Error('the store published no archive holding');
    await act(async () => {
      fireEvent.click(archive);
      await settle(() => screen.queryByTestId('comparison') !== null);
    });
    expect(screen.getByTestId('comparison-refusal').textContent).toMatch(
      /is a archive holding, not a forecast instance/,
    );
    // And the manifest is still opened whole, which is FR-46 and is unchanged.
    expect(screen.getByTestId('manifest-json').textContent).toMatch(/"analytic_form_version"/);
  });

  it('FR-75: the tour covers every region the panel declares, and no region it does not', () => {
    expect(uncoveredSubjects('data', DATA_REGIONS, DATA_TOUR_STEPS)).toEqual([]);
    expect(DATA_REGIONS.length).toBeGreaterThan(0);
  });
});
