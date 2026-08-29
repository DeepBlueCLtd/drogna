// @vitest-environment jsdom
/**
 * Background, under the condition it must survive: nothing running.
 *
 * FR-004 says no explainer reads run state, subscribes to the broker, or issues a
 * request across the seam, and that the tab renders identically with every component
 * stopped. So this file starts nothing. It hands the panel a client whose every
 * method throws and a fetch that throws, walks all eleven explainers end to end, and
 * reports anything either trap caught.
 *
 * Every absence asserted here is also watched being found. The planted faults live
 * permanently in `fixtures/planted.tsx` and are run through the same audits, because
 * an assertion over markup otherwise passes by not finding what it did not look for.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { IDockviewPanelProps } from 'dockview-react';
import runConfigDocument from '../../../config/run.json';
import type { PanelParams } from '../../shell/Shell.js';
import { BackgroundPanel } from './BackgroundPanel.js';
import { Rail, RAIL_WIDTH_THRESHOLD } from './Rail.js';
import { Spine } from './Spine.js';
import { Figure } from './layout.js';
import { COURSE } from './registry.js';
import { positionFromRest, restForPosition } from './address.js';
import { VALUE_AXES, stepCount, type Explainer } from './model.js';
import { axisWithoutReason, noValuePanel, WiredPanel } from './fixtures/planted.js';

afterEach(cleanup);

/* ------------------------------------------------------------------ *
 * The traps: what the running system would have been reached through. *
 * ------------------------------------------------------------------ */

function underNothingRunning(draw: (props: IDockviewPanelProps<PanelParams>) => void): string[] {
  const reached: string[] = [];
  const refuse = (what: string) => () => {
    reached.push(what);
    throw new Error(`Background reached the running system: ${what}`);
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = refuse('fetch') as unknown as typeof globalThis.fetch;
  // No component is started, and the client is not a stub that quietly answers: every
  // method on it is a fault that names itself.
  const client = {
    publish: refuse('client.publish'),
    subscribe: refuse('client.subscribe'),
    close: refuse('client.close'),
  };
  const params = {
    get config() {
      reached.push('params.config');
      throw new Error('Background read the run configuration');
    },
    client,
    get validator() {
      reached.push('params.validator');
      throw new Error('Background read the seam validator');
    },
    get manifest() {
      reached.push('params.manifest');
      throw new Error('Background read the run manifest');
    },
    address: { current: () => undefined, write: () => {}, onChange: () => () => {} },
  };
  try {
    draw({ params } as unknown as IDockviewPanelProps<PanelParams>);
  } catch (fault) {
    reached.push(`threw: ${(fault as Error).message}`);
  } finally {
    globalThis.fetch = realFetch;
  }
  return reached;
}

describe('Background is inert (FR-004, SC-001, SC-002)', () => {
  it('renders and traverses all eleven explainers with every component stopped', () => {
    const reached = underNothingRunning((props) => {
      render(<BackgroundPanel {...props} />);
      for (const explainer of COURSE) {
        act(() => {
          (document.querySelector(`button[data-explainer="${explainer.id}"]`) as HTMLElement).click();
        });
        const total = stepCount(explainer);
        for (let step = 1; step <= total; step += 1) {
          const stage = document.querySelector('.bg-stage');
          expect(stage?.getAttribute('data-explainer')).toBe(explainer.id);
          expect(stage?.getAttribute('data-step')).toBe(String(step));
          // Something is rendered at every step: never a blank, never an error.
          expect(stage?.textContent?.trim().length ?? 0).toBeGreaterThan(20);
          if (step < total) act(() => screen.getByText('next →').click());
        }
        // The spine's last step is the Consequences panel, reached by advancing alone
        // and touching no diagram (FR-017, FR-020).
        expect(screen.getByTestId('value-panel')).toBeTruthy();
      }
    });
    expect(reached).toEqual([]);
  });

  it('the traps report a panel that does reach for the running system', () => {
    // Watched failing. The gate cannot see this call — it is a call, not an import —
    // which is why the runtime half of SC-002 exists at all.
    const reached = underNothingRunning(() => render(<WiredPanel />));
    expect(reached).toContain('fetch');
  });
});

/* ------------------------------------------------------------------ *
 * SC-007: the value panel invariant.                                  *
 * ------------------------------------------------------------------ */

/** Renders an explainer's final step and reports every way it breaks FR-008/FR-020. */
function auditValuePanel(explainer: Explainer): string[] {
  const faults: string[] = [];
  render(<Spine explainer={explainer} step={stepCount(explainer)} onStep={() => {}} onView={() => {}} />);
  const panel = document.querySelector('[data-testid="value-panel"]');
  if (!panel) {
    cleanup();
    return [`${explainer.id}: no Consequences panel at the end of the spine (FR-020)`];
  }
  const axes = [...panel.querySelectorAll('[data-axis]')];
  const order = axes.map((axis) => axis.getAttribute('data-axis'));
  if (order.join('|') !== VALUE_AXES.join('|')) {
    faults.push(`${explainer.id}: axes are ${order.join(', ')} (FR-008)`);
  }
  for (const axis of axes) {
    const name = axis.getAttribute('data-axis');
    if (axis.getAttribute('data-axis-state') === 'omitted') {
      const reason = axis.querySelector('[data-omitted-reason]')?.getAttribute('data-omitted-reason');
      if (!reason?.trim()) faults.push(`${explainer.id}: '${name}' is omitted without a reason (FR-008)`);
    } else if ((axis.querySelector('p')?.textContent ?? '').trim().length < 20) {
      faults.push(`${explainer.id}: '${name}' is padded rather than filled (FR-008)`);
    }
  }
  cleanup();
  return faults;
}

describe('every explainer closes on the same three axes (FR-008, FR-020, SC-007)', () => {
  it('finds no fault in the course, enumerated from the registry and not from a list here', () => {
    // Enumerating from COURSE is half of what makes this sound: a twelfth explainer
    // comes under test by joining the course, with no edit here.
    expect(COURSE.flatMap(auditValuePanel)).toEqual([]);
    expect(COURSE.length).toBeGreaterThan(1);
  });

  it('reports an explainer that omits its Consequences panel', () => {
    expect(auditValuePanel(noValuePanel).join('\n')).toMatch(/no Consequences panel/);
  });

  it('reports an axis omitted in silence', () => {
    expect(auditValuePanel(axisWithoutReason).join('\n')).toMatch(/omitted without a reason/);
  });

  it('marks every through-life-cost claim as argued rather than measured (FR-009)', () => {
    for (const explainer of COURSE) {
      const cost = explainer.value?.['through-life cost'];
      if (cost?.kind === 'filled') {
        expect(`${explainer.id}: ${String(cost.qualitative)}`).toBe(`${explainer.id}: true`);
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * The course's own promises.                                          *
 * ------------------------------------------------------------------ */

describe('the course', () => {
  it('carries the eleven explainers in order, each with a distinct id (FR-002)', () => {
    expect(COURSE.map((explainer) => explainer.id)).toEqual([
      'why-a-standard',
      'points-and-fields',
      'netcdf',
      'holdings',
      'sensorthings',
      'edr',
      'pygeoapi',
      'mqtt',
      'cqrs',
      'control-loop',
      'boundary',
    ]);
  });

  it('gives every step something to say, and every drawing a stated width and label', () => {
    for (const explainer of COURSE) {
      for (const [index, step] of explainer.steps.entries()) {
        const where = `${explainer.id}/${index + 1}`;
        expect(`${where}: ${step.title}`).toMatch(/\S/);
        expect(`${where}: ${step.prose.length}`).not.toBe(`${where}: 0`);
        if (step.figure) {
          // FR-024 needs a real number to compare a width against, and a reader who
          // is not looking at the drawing needs the label.
          expect(`${where}: ${step.figure.minWidth > 0}`).toBe(`${where}: true`);
          expect(`${where}: ${step.figure.label}`).toMatch(/\S\s\S/);
        }
      }
    }
  });

  it('links only to views the shell actually serves (FR-005)', () => {
    // A claim about drogna links to the live view rather than depicting it, so a link
    // that names a view nobody serves is a dead end where the evidence should be. The
    // panel itself never reads the configuration — that is what the inertness gate is
    // for — so the check lives here, where a test may read both sides.
    const served = new Set(runConfigDocument.shell.views.map((view) => view.id));
    for (const explainer of COURSE) {
      for (const [index, step] of explainer.steps.entries()) {
        if (!step.liveView) continue;
        expect(`${explainer.id}/${index + 1} → ${step.liveView.view}`).toBe(
          `${explainer.id}/${index + 1} → ${served.has(step.liveView.view) ? step.liveView.view : 'a view the shell serves'}`,
        );
      }
    }
    // And the links exist at all: FR-005 is not satisfied by never making a claim.
    expect(COURSE.flatMap((explainer) => explainer.steps.filter((step) => step.liveView)).length)
      .toBeGreaterThan(4);
  });

  it('states no URL that looks pasteable into this page (FR-022)', () => {
    // Illustrative URLs are artwork about a standard against a fictional host. A path
    // this application serves, drawn inside an explainer, invites a viewer to try it.
    const drawn = JSON.stringify(
      COURSE.map((explainer) => explainer.steps.map((step) => [step.title, step.prose, step.note, step.play])),
    );
    expect(drawn).not.toMatch(/\/api\//);
  });
});

describe('the address (FR-003, SC-003)', () => {
  it('round-trips every step of every explainer', () => {
    for (const explainer of COURSE) {
      for (let step = 1; step <= stepCount(explainer); step += 1) {
        const rest = restForPosition({ explainerId: explainer.id, step });
        expect(positionFromRest(COURSE, rest)).toEqual({ explainerId: explainer.id, step });
      }
    }
  });

  it('falls back to a first step rather than erroring or blanking', () => {
    const first = { explainerId: COURSE[0].id, step: 1 };
    expect(positionFromRest(COURSE, undefined)).toEqual(first);
    expect(positionFromRest(COURSE, '')).toEqual(first);
    expect(positionFromRest(COURSE, 'no-such-explainer/2')).toEqual(first);
    expect(positionFromRest(COURSE, 'mqtt/0')).toEqual({ explainerId: 'mqtt', step: 1 });
    expect(positionFromRest(COURSE, 'mqtt/999')).toEqual({ explainerId: 'mqtt', step: 1 });
    expect(positionFromRest(COURSE, 'mqtt/three')).toEqual({ explainerId: 'mqtt', step: 1 });
    expect(positionFromRest(COURSE, 'mqtt')).toEqual({ explainerId: 'mqtt', step: 1 });
  });
});

describe('the course is traversable without a pointer (FR-014, SC-006)', () => {
  it('advances and retreats on the arrow keys', () => {
    render(<Spine explainer={COURSE[0]} step={1} onStep={() => {}} onView={() => {}} />);
    const stage = document.querySelector('.bg-stage') as HTMLElement;
    // The spine's controls are buttons, so tab order and activation come from the
    // platform rather than from a keyboard handler that could disagree with the mouse.
    expect([...stage.querySelectorAll('button')].length).toBeGreaterThan(1);
    cleanup();

    let step = 1;
    const { rerender } = render(
      <Spine explainer={COURSE[0]} step={step} onStep={(next) => (step = next)} onView={() => {}} />,
    );
    act(() => {
      (document.querySelector('.bg-stage') as HTMLElement).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
    });
    expect(step).toBe(2);
    rerender(<Spine explainer={COURSE[0]} step={2} onStep={(next) => (step = next)} onView={() => {}} />);
    act(() => {
      (document.querySelector('.bg-stage') as HTMLElement).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
      );
    });
    expect(step).toBe(1);
  });
});

describe('the narrow panel (FR-021, FR-024)', () => {
  it('withdraws a drawing on its own measurement, not only on a width it was handed', () => {
    // The gap this closes: every other test here supplies `width`, so none of them
    // exercised the measuring path — and that path was broken. Figure measured the
    // element it could unmount, the observer read the withdrawn figure as zero width,
    // and the floor never appeared at all while every test of it passed.
    const measured: HTMLElement[] = [];
    class WidthObserver {
      constructor(private readonly notify: () => void) {}
      observe(element: HTMLElement) {
        measured.push(element);
        this.notify();
      }
      unobserve() {}
      disconnect() {}
    }
    const realObserver = globalThis.ResizeObserver;
    const realWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    // jsdom lays nothing out, so clientWidth is always 0 and 0 means "unknown".
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 200 });
    globalThis.ResizeObserver = WidthObserver as unknown as typeof ResizeObserver;
    try {
      render(
        <Figure
          figure={{ minWidth: 360, label: 'a drawing', draw: () => <svg /> }}
          context={{ poke: undefined, onPoke: () => {} }}
        />,
      );
      expect(screen.getByTestId('figure-floor').textContent).toMatch(/needs about 360px/);
      // And it stays withdrawn: the measured element is the column, which is still
      // there, so the measurement cannot be undone by acting on it.
      expect(measured).toHaveLength(1);
      expect((measured[0] as HTMLElement).className).toBe('bg-figure-column');
      expect(document.querySelector('.bg-figure-column')).not.toBeNull();
    } finally {
      globalThis.ResizeObserver = realObserver;
      // clientWidth is defined on Element.prototype, not on HTMLElement's, so there is
      // no own descriptor to put back — the shadowing property has to be removed, or it
      // leaks a 200px layout into every test that runs after this one. It did.
      if (realWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', realWidth);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
    }
  });

  it('replaces a drawing it cannot render legibly with the width it wants', () => {
    const figure = { minWidth: 360, label: 'a drawing', draw: () => <svg /> };
    render(<Figure figure={figure} width={240} context={{ poke: undefined, onPoke: () => {} }} />);
    expect(screen.getByTestId('figure-floor').textContent).toMatch(/needs about 360px/);
    cleanup();
    // An unmeasured width is not evidence of a narrow one: the drawing is drawn.
    render(<Figure figure={figure} width={undefined} context={{ poke: undefined, onPoke: () => {} }} />);
    expect(document.querySelector('[data-testid="figure-floor"]')).toBeNull();
  });

  it('collapses the rail to a dropdown that still names every explainer and its length', () => {
    render(<Rail course={COURSE} current="mqtt" onSelect={() => {}} width={RAIL_WIDTH_THRESHOLD - 1} />);
    const options = [...document.querySelectorAll('option')];
    expect(options).toHaveLength(COURSE.length);
    expect(options.map((option) => option.value)).toEqual(COURSE.map((explainer) => explainer.id));
    expect(options[7].textContent).toMatch(/8 · MQTT · \d+ steps/);
    cleanup();
    render(<Rail course={COURSE} current="mqtt" onSelect={() => {}} width={RAIL_WIDTH_THRESHOLD + 1} />);
    expect(document.querySelector('.bg-rail')?.getAttribute('data-collapsed')).toBe('false');
    // Wide, the rail shows the length beside every explainer (FR-021).
    expect(document.querySelectorAll('.bg-rail-length')).toHaveLength(COURSE.length);
  });
});
