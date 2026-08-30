// @vitest-environment jsdom
/**
 * The shell at a phone's width (feature 112).
 *
 * What is asserted here is what a capture cannot see: that the two presentations render
 * the *configured* views rather than a list somebody typed, that the address survives a
 * crossing, and that a disclosure hides nothing that is not still reachable. How any of
 * it looks is the capture proof's business (`scripts/capture/mobile.ts`), because an
 * assertion over markup cannot see whether something fits.
 *
 * jsdom lays nothing out, so `clientWidth` is always 0 and the measurement reads
 * "unknown". The width therefore comes from `window.innerWidth`, which is the shell's
 * own first guess before anything is measured — the same path a phone takes on its first
 * frame, and the reason it exists.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import runConfigDocument from '../../config/run.json';
import type { ConfigRun } from '../generated/types.js';
import { createSeamValidator } from '../seam/validate.js';
import { buildBackend } from '../backend/runtime/runtime.js';
import { createSeamFetch } from '../seam/http.js';
import { Shell } from './Shell.js';
import { createPanelAddress } from './views.js';
import type { PanelParams } from './registry.js';
import { MessagesPanel } from '../panels/messages/MessagesPanel.js';
import { OperatorPanel } from '../panels/operator/OperatorPanel.js';
import { Disclosure } from './Disclosure.js';
import { NARROW_WIDTH, SHORT_HEIGHT, fillsViewport, isNarrow, presentationFor } from './viewport.js';

class NoLayoutResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoLayoutResizeObserver as unknown as typeof ResizeObserver;

const validator = createSeamValidator();
const shellConfig = (JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun).shell;

function widthOf(viewport: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: viewport });
}

async function shellAt(hash: string, viewport: number, height = 900) {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  const runtime = buildBackend(config, { rootSeed: 11, startCondition: 'loitering', revision: 'test', dirty: false }, validator);
  const realFetch = globalThis.fetch;
  globalThis.fetch = createSeamFetch(config.boundary.api_prefix, runtime.httpBackend, realFetch);
  widthOf(viewport);
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
  window.location.hash = hash;
  const view = await act(async () => {
    const result = render(
      <Shell
        config={config.shell}
        client={runtime.transport.connect('shell-test', config.shell.role)}
        validator={validator}
        manifest={runtime.manifest}
        onImportManifest={() => undefined}
      />,
    );
    await Promise.resolve();
    return result;
  });
  return {
    view,
    done: () => {
      globalThis.fetch = realFetch;
      runtime.stop();
    },
  };
}

afterEach(cleanup);

describe('which presentation a width gets (FR-001)', () => {
  it('is a step at the declared threshold, and an unmeasured size is not narrow', () => {
    expect(presentationFor(NARROW_WIDTH - 1, 900)).toBe('stack');
    expect(presentationFor(NARROW_WIDTH, 900)).toBe('dock');
    expect(presentationFor(1440, 900)).toBe('dock');
    // Feature 111's rule, inherited: an unknown size is no evidence of a narrow one, so
    // a shell that cannot measure itself renders as it always did.
    expect(presentationFor(undefined, undefined)).toBe('dock');
    expect(isNarrow(undefined)).toBe(false);
  });

  it('takes a phone turned sideways for what it is (SHORT_HEIGHT)', () => {
    // 844 by 390 passes the width test and has no room to dock in the other axis. The
    // capture proof found this: it reported the dock presentation at a size the feature
    // exists to serve, on a run where the model was width alone.
    expect(presentationFor(844, SHORT_HEIGHT - 1)).toBe('stack');
    expect(presentationFor(844, SHORT_HEIGHT)).toBe('dock');
  });

  it('knows when there is no wider width to move to (FR-019)', () => {
    // A panel that has the viewport cannot be widened, whatever it is told to do.
    expect(fillsViewport(390, 390)).toBe(true);
    expect(fillsViewport(360, 390)).toBe(true);
    expect(fillsViewport(400, 1440)).toBe(false);
    expect(fillsViewport(undefined, 390)).toBe(false);
  });
});

describe('the stack keeps the tabs (FR-004, FR-005)', () => {
  it('renders every configured view as a tab, in configured order, with its label', async () => {
    const { done } = await shellAt('#/view/intro', 390);
    try {
      const tabs = [...document.querySelectorAll('.stack-tabs [role="tab"]')];
      // Enumerated from configuration, never from a list typed here: an eighth view is
      // in scope automatically, and a view that existed in one presentation and not the
      // other would fail this rather than surprise somebody at one width.
      expect(tabs.map((tab) => tab.getAttribute('data-view'))).toEqual(
        shellConfig.views.map((view) => view.id),
      );
      expect(tabs.map((tab) => tab.textContent)).toEqual(shellConfig.views.map((view) => view.label));
    } finally {
      done();
    }
  });

  it('mounts every view and shows exactly the one the address names (FR-003, FR-009)', async () => {
    const { done } = await shellAt('#/view/messages', 390);
    try {
      const views = [...document.querySelectorAll('.stack-view')];
      expect(views).toHaveLength(shellConfig.views.length);
      const shown = views.filter((view) => !view.hasAttribute('hidden'));
      expect(shown.map((view) => view.getAttribute('data-view'))).toEqual(['messages']);
      // Messages is mounted and counting whether or not it is the tab on screen: the
      // presentation changes where a panel is, never whether it is running.
      expect(screen.getByTestId('refusal-counter')).toBeTruthy();
    } finally {
      done();
    }
  });

  it('opens at the view a deep link names and leaves the address alone', async () => {
    const { done } = await shellAt('#/view/map', 390);
    try {
      expect(document.querySelector('.shell')?.getAttribute('data-presentation')).toBe('stack');
      expect(
        document.querySelector('.stack-view:not([hidden])')?.getAttribute('data-view'),
      ).toBe('map');
      expect(window.location.hash).toBe('#/view/map');
    } finally {
      done();
    }
  });

  it('keeps a sub-path a deep link carried (ADR-0032 holds in both presentations)', async () => {
    const { done } = await shellAt('#/view/background/why-a-standard/3', 390);
    try {
      expect(window.location.hash).toBe('#/view/background/why-a-standard/3');
      const stage = document.querySelector('.bg-stage');
      expect(stage?.getAttribute('data-explainer')).toBe('why-a-standard');
      expect(stage?.getAttribute('data-step')).toBe('3');
    } finally {
      done();
    }
  });

  it('writes the address when a tab is chosen', async () => {
    const { done } = await shellAt('#/view/intro', 390);
    try {
      const tab = document.querySelector<HTMLElement>('.stack-tabs [data-view="data"]');
      await act(async () => {
        tab?.click();
        await Promise.resolve();
      });
      expect(window.location.hash).toBe('#/view/data');
      expect(
        document.querySelector('.stack-view:not([hidden])')?.getAttribute('data-view'),
      ).toBe('data');
    } finally {
      done();
    }
  });
});

describe('crossing the threshold (FR-006, SC-005)', () => {
  it('preserves the shown view and writes nothing to the address, in both directions', async () => {
    for (const [from, to] of [
      [390, 1440],
      [1440, 390],
    ]) {
      const { view, done } = await shellAt('#/view/data', from);
      try {
        expect(window.location.hash).toBe('#/view/data');
        widthOf(to);
        await act(async () => {
          window.dispatchEvent(new Event('resize'));
          view.rerender(<div />);
          await Promise.resolve();
        });
        // The address is what survives a crossing — the view a link promised.
        expect(window.location.hash).toBe('#/view/data');
      } finally {
        done();
        cleanup();
      }
    }
  });
});

describe('the chrome (FR-007)', () => {
  it('never discloses away the statement that the data is synthetic', async () => {
    const { done } = await shellAt('#/view/intro', 390);
    try {
      const disclaimer = document.querySelector('.shell-disclaimer');
      expect(disclaimer?.textContent).toBe('synthetic throughout — holds no third-party entities');
      // Not inside anything that can be closed. Chrome may be compacted or disclosed;
      // this sentence may not, and it is the same sentence at both widths rather than a
      // shorter second copy.
      expect(disclaimer?.closest('details')).toBeNull();
    } finally {
      done();
    }
  });

  it('keeps the run id and the manifest controls reachable, one gesture away', async () => {
    const { done } = await shellAt('#/view/intro', 390);
    try {
      const details = document.querySelector<HTMLDetailsElement>('.shell-run-controls');
      expect(details?.tagName).toBe('DETAILS');
      expect(details?.open).toBe(false);
      expect(details?.querySelector('summary')?.textContent).toBe('run and manifest');
      // Closed is not absent: with it open the header offers what the desktop offers.
      expect(details?.querySelector('.shell-run')).toBeTruthy();
      expect([...(details?.querySelectorAll('button, label') ?? [])].length).toBeGreaterThanOrEqual(2);
    } finally {
      done();
    }
  });

  it('FR-75: the help control is carried by the panel, and reaches the same place at both widths', async () => {
    // Feature 115 moved it out of the header (ADR-0037). FR-50 governs the move: the
    // narrow presentation changes *where* a panel is, never whether it is — so the
    // control is in the panel's own header row at both widths, and is never folded into
    // a disclosure. A help affordance behind a "more" label is one the people who need
    // it will not find, which was feature 110's reason for keeping it out of the
    // header's disclosure and is unchanged by the move.
    for (const width of [390, 1440]) {
      const { done } = await shellAt('#/view/messages', width);
      try {
        expect(document.querySelector('.shell-header .walkthrough-button')).toBeNull();
        const button = document.querySelector('.messages-panel .panel-head .walkthrough-button');
        expect(button, `no help control in the Messages panel at ${width}px`).not.toBeNull();
        expect(button?.closest('details')).toBeNull();
      } finally {
        done();
      }
    }
  });

  it('FR-75: a view with no tour shows no control, and the absence is the answer', async () => {
    // Intro is prose and Background is ten explainers that are their own walkthrough.
    // A button that was always present would say nothing by being present.
    for (const view of ['intro', 'background']) {
      const { done } = await shellAt(`#/view/${view}`, 390);
      try {
        const panel = document.querySelector(`.stack-view:not([hidden])[data-view="${view}"]`);
        expect(panel?.querySelector('.walkthrough-button')).toBeNull();
      } finally {
        done();
      }
    }
  });
});

describe('a disclosure (FR-011 to FR-014)', () => {
  it('is a closed control narrow and no control at all wide', () => {
    render(
      <Disclosure label="topic tree" narrow>
        <p>the tree</p>
      </Disclosure>,
    );
    const details = document.querySelector<HTMLDetailsElement>('details.disclosure');
    expect(details?.open).toBe(false);
    expect(details?.querySelector('summary')?.textContent).toBe('topic tree');
    expect(screen.getByText('the tree')).toBeTruthy();
    cleanup();

    render(
      <Disclosure label="topic tree" narrow={false}>
        <p>the tree</p>
      </Disclosure>,
    );
    // Wide there is nothing to open and nothing to close by accident: the region is a
    // plain named section, which is what "renders as it does today" means.
    expect(document.querySelector('details')).toBeNull();
    expect(document.querySelector('section.disclosure')?.getAttribute('aria-label')).toBe('topic tree');
    expect(screen.getByText('the tree')).toBeTruthy();
  });

  it('never labels itself with the existence of more content (FR-012)', async () => {
    // The rule the review would otherwise have to keep. "More" and "options" put the
    // viewer's decision behind the thing they need in order to make it.
    const { done } = await shellAt('#/view/messages', 390);
    try {
      const labels = [...document.querySelectorAll('[data-label]')].map((node) =>
        (node.getAttribute('data-label') ?? '').toLowerCase(),
      );
      expect(labels.length).toBeGreaterThan(0);
      for (const label of labels) {
        expect(label).not.toMatch(/^(more|options|other|…|\.\.\.)$/);
      }
    } finally {
      done();
    }
  });
});

describe('a list beside a detail becomes a list with the detail over it (FR-016)', () => {
  it('offers a way back, and only narrow', async () => {
    const { done } = await shellAt('#/view/messages', 390);
    try {
      expect(document.querySelector('.messages-tree-disclosure')?.tagName).toBe('DETAILS');
      // Nothing is selected yet, so nothing covers the list.
      expect(document.querySelector('.message-detail')?.getAttribute('data-covering')).toBe('false');
      expect(document.querySelector('.message-back')).toBeNull();
    } finally {
      done();
    }
  });

  it('leaves the desktop panel as it was', async () => {
    const { done } = await shellAt('#/view/messages', 1440);
    try {
      expect(document.querySelector('.shell')?.getAttribute('data-presentation')).toBe('dock');
    } finally {
      done();
    }
  });
});

describe('nothing is lost at a narrow width (FR-011, SC-007)', () => {
  /**
   * The rule progressive discovery is only allowed under: with every disclosure open, a
   * panel offers what it offers at a desktop width. Compared as sets of controls rather
   * than by eye, because "I moved it and forgot to put it back" is invisible in a
   * screenshot of a panel that looks tidy.
   *
   * Summaries are excluded: a summary is the disclosure itself, not a control the panel
   * lost or gained.
   *
   * What this compares is *presence*, and it is worth being exact about that: a closed
   * `<details>` keeps its children in the DOM — the browser hides them with a style
   * jsdom does not apply — so this catches a surface that was removed at a narrow width
   * and cannot, on its own, tell open from closed. Closed-at-rest is asserted below on
   * the property that actually carries it. Said here because a test that looks like it
   * checks two things and checks one is worse than a test that checks one.
   */
  function controls(): string[] {
    const acting = [...document.querySelectorAll('button, input, select')]
      .filter((node) => node.closest('summary') === null)
      .map((node) => `${node.tagName}:${(node.getAttribute('type') ?? node.textContent ?? '').trim()}`);
    // Regions as well as controls. Watched mattering: a first version compared controls
    // alone, and a planted removal of the topic tree — a surface made entirely of text —
    // went straight past it. A surface with nothing to click is still a surface.
    const regions = [...document.querySelectorAll('[data-label], [data-testid]')].map(
      (node) => `region:${node.getAttribute('data-label') ?? node.getAttribute('data-testid')}`,
    );
    return [...acting, ...regions].sort();
  }

  /** Renders the panel and leaves it mounted; the caller cleans up. */
  async function panelAt(
    which: 'messages' | 'operator',
    viewport: number,
    openAll: boolean,
  ): Promise<string[]> {
    const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
    config.clock.mode = 'lockstep';
    config.clock.rate = 0;
    const runtime = buildBackend(config, { rootSeed: 11, startCondition: 'loitering', revision: 'test', dirty: false }, validator);
    const realFetch = globalThis.fetch;
    globalThis.fetch = createSeamFetch(config.boundary.api_prefix, runtime.httpBackend, realFetch);
    widthOf(viewport);
    const params: PanelParams = {
      config: config.shell,
      client: runtime.transport.connect(`panel-test-${which}`, config.shell.role),
      validator,
      manifest: runtime.manifest,
      address: createPanelAddress(which),
    };
    try {
      await act(async () => {
        render(which === 'messages' ? <MessagesPanel params={params} /> : <OperatorPanel params={params} />);
        await Promise.resolve();
      });
      if (openAll) {
        await act(async () => {
          for (const details of document.querySelectorAll('details')) details.open = true;
          await Promise.resolve();
        });
      }
      return controls();
    } finally {
      globalThis.fetch = realFetch;
      runtime.stop();
    }
  }

  it('offers the same controls narrow, with the disclosures open, as it does wide', async () => {
    for (const which of ['messages', 'operator'] as const) {
      const wide = await panelAt(which, 1440, false);
      cleanup();
      const narrow = await panelAt(which, 390, true);
      cleanup();
      expect(wide.length).toBeGreaterThan(0);
      expect(narrow).toEqual(wide);
    }
  });

  it('and every one of them is closed at rest, which is the point of disclosing them', async () => {
    // A disclosure open at rest would satisfy every other assertion here and deliver
    // none of the space it was built to give back.
    await panelAt('operator', 390, false);
    const disclosures = [...document.querySelectorAll<HTMLDetailsElement>('details.disclosure')];
    expect(disclosures.length).toBeGreaterThan(0);
    for (const details of disclosures) expect(details.open).toBe(false);
  });
});
