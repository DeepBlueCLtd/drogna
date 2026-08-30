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
import { createPanelAddress } from '../../shell/views.js';
import { BackgroundPanel } from './BackgroundPanel.js';
import { Rail, RAIL_WIDTH_THRESHOLD } from './Rail.js';
import { Spine } from './Spine.js';
import { Figure } from './layout.js';
import { COURSE } from './registry.js';
import { advance, positionFromRest, restForPosition } from './address.js';
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
    address: {
      names: () => true,
      current: () => undefined,
      write: () => {},
      onChange: () => () => {},
    },
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

  it('omits an axis rarely, and never twice for the same reason (FR-008, spec Q2)', () => {
    // Q2 asked what it means when an axis keeps coming up empty, and set the threshold
    // at two: "if two or more explainers omit the same axis, the axis is wrong, not the
    // explainers". Building the course moved it to three, and the reasoning is in
    // spec.md rather than here — in short, the frame widened after the rule was
    // written, and "not a standard, so no interoperability claim" became a correct
    // answer rather than a symptom.
    //
    // The count is the weaker half of this check. The stronger half is distinctness: an
    // axis that is genuinely wrong gets omitted with the *same* excuse each time, and
    // that is what a boilerplate reason looks like from the outside.
    const OMISSION_CEILING = 2;
    const faults: string[] = [];
    for (const axis of VALUE_AXES) {
      const omitted = COURSE.filter((explainer) => explainer.value?.[axis]?.kind === 'omitted');
      if (omitted.length > OMISSION_CEILING) {
        faults.push(
          `${axis}: omitted by ${omitted.length} explainers (${omitted.map((e) => e.id).join(', ')}) — past ${OMISSION_CEILING} the axis is wrong, not the explainers (spec Q2)`,
        );
      }
      const reasons = omitted.map((explainer) => {
        const content = explainer.value?.[axis];
        return content?.kind === 'omitted' ? content.reason.trim().toLowerCase() : '';
      });
      if (new Set(reasons).size !== reasons.length) {
        faults.push(`${axis}: two explainers omit it for the same reason, which is what a wrong axis looks like`);
      }
    }
    expect(faults).toEqual([]);
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

/* ------------------------------------------------------------------ *
 * FR-014: the course walked by keyboard alone.                        *
 * ------------------------------------------------------------------ */

/** Mounts the panel on a real address, as the shell mounts it. */
function mountCourse(hash: string): void {
  window.location.hash = hash;
  render(
    <BackgroundPanel
      params={{ address: createPanelAddress('background') } as unknown as PanelParams}
    />,
  );
}

/** Where the course is, read from the stage rather than from the component's state. */
function at(): string {
  const stage = document.querySelector('.bg-stage');
  return `${stage?.getAttribute('data-explainer')}/${stage?.getAttribute('data-step')}`;
}

function press(key: string, from: Element = document.body): void {
  act(() => {
    from.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

describe('the course is traversable without a pointer (FR-014, SC-006)', () => {
  it('steps within an explainer and across the join between two', () => {
    const first = COURSE[0];
    const second = COURSE[1];
    const last = COURSE[COURSE.length - 1];
    expect(advance(COURSE, { explainerId: first.id, step: 1 }, 1)).toEqual({
      explainerId: first.id,
      step: 2,
    });
    // Past the last step of an explainer — its Consequences panel — is the next
    // explainer's first step, and back from a first step is the previous explainer's
    // last. The bounds come from stepCount rather than from a number typed here, so a
    // twelfth explainer or a new step needs no edit.
    expect(advance(COURSE, { explainerId: first.id, step: stepCount(first) }, 1)).toEqual({
      explainerId: second.id,
      step: 1,
    });
    expect(advance(COURSE, { explainerId: second.id, step: 1 }, -1)).toEqual({
      explainerId: first.id,
      step: stepCount(first),
    });
    // The two ends of the course, where there is nowhere to go.
    expect(advance(COURSE, { explainerId: first.id, step: 1 }, -1)).toBeUndefined();
    expect(advance(COURSE, { explainerId: last.id, step: stepCount(last) }, 1)).toBeUndefined();
  });

  it('walks every step of the whole course on the arrow keys, having clicked nothing', () => {
    // Nothing is focused and nothing has been clicked, which is the state a viewer who
    // has just opened the tab is in — and the state in which a handler hung on the
    // stage saw no keys at all.
    mountCourse('#/view/background');
    const visited: string[] = [at()];
    const total = COURSE.reduce((sum, explainer) => sum + stepCount(explainer), 0);
    for (let key = 1; key < total; key += 1) {
      press('ArrowRight');
      visited.push(at());
    }
    expect(visited).toEqual(
      COURSE.flatMap((explainer) =>
        Array.from({ length: stepCount(explainer) }, (_, index) => `${explainer.id}/${index + 1}`),
      ),
    );
    // At the end of the course the key does nothing rather than wrapping or erroring.
    press('ArrowRight');
    expect(at()).toBe(`${COURSE[COURSE.length - 1].id}/${stepCount(COURSE[COURSE.length - 1])}`);
    // And the walk is reversible, back across the same join.
    press('ArrowLeft');
    press('ArrowLeft');
    expect(at()).toBe(`${COURSE[COURSE.length - 1].id}/${stepCount(COURSE[COURSE.length - 1]) - 2}`);
  });

  it('writes each position into the address, so any of them can be linked', () => {
    mountCourse('#/view/background/mqtt/2');
    expect(at()).toBe('mqtt/2');
    press('ArrowLeft');
    expect(window.location.hash).toBe('#/view/background/mqtt/1');
    press('ArrowLeft');
    // Across the join, the address names the previous explainer's Consequences panel.
    const before = COURSE[COURSE.findIndex((explainer) => explainer.id === 'mqtt') - 1];
    expect(window.location.hash).toBe(`#/view/background/${before.id}/${stepCount(before)}`);
  });

  it('leaves the arrow keys to a control that spends them itself', () => {
    // The rail collapses to a <select> at a narrow width, and it is the only navigation
    // surface a narrow viewer has. Taking its arrows would make it unusable by keyboard
    // — so this is the real collapsed panel, measured narrow, not a stand-in element.
    const realObserver = globalThis.ResizeObserver;
    const realWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    class WidthObserver {
      constructor(private readonly notify: () => void) {}
      observe() {
        this.notify();
      }
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => RAIL_WIDTH_THRESHOLD - 1,
    });
    globalThis.ResizeObserver = WidthObserver as unknown as typeof ResizeObserver;
    try {
      mountCourse('#/view/background/mqtt/2');
      const select = document.querySelector('.bg-rail-collapsed select') as HTMLElement;
      expect(select).not.toBeNull();
      press('ArrowRight', select);
      expect(at()).toBe('mqtt/2');
      // The positive control, in the same panel and the same render: a key from
      // anywhere that is not such a control does move the course. Without it this
      // assertion would pass just as well against a panel that answers no keys at all.
      press('ArrowRight', document.querySelector('.bg-next') as HTMLElement);
      expect(at()).toBe('mqtt/3');
    } finally {
      globalThis.ResizeObserver = realObserver;
      if (realWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', realWidth);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
    }
  });

  it('does not walk itself while the address names another view', () => {
    // Every panel stays mounted when another is shown, so a Background that answered
    // keys unconditionally would step through the course unseen while the viewer was
    // on the Map — and their place would have moved when they came back.
    mountCourse('#/view/map');
    expect(at()).toBe(`${COURSE[0].id}/1`);
    press('ArrowRight');
    expect(at()).toBe(`${COURSE[0].id}/1`);
    // Focus inside another panel is that panel's business even when the address does
    // name Background: the dock can show two panels at once.
    window.location.hash = '#/view/background';
    const elsewhere = document.body.appendChild(document.createElement('div'));
    elsewhere.className = 'panel';
    press('ArrowRight', elsewhere.appendChild(document.createElement('button')));
    expect(at()).toBe(`${COURSE[0].id}/1`);
    elsewhere.remove();
    // The same key, once the guard has nothing to hold it back.
    press('ArrowRight');
    expect(at()).toBe(`${COURSE[0].id}/2`);
  });

  it('keeps the spine on buttons, so the platform supplies tab order and activation', () => {
    render(<Spine explainer={COURSE[0]} step={1} onStep={() => {}} onView={() => {}} />);
    const stage = document.querySelector('.bg-stage') as HTMLElement;
    expect([...stage.querySelectorAll('button')].length).toBeGreaterThan(1);
    // The buttons stay bounded by the explainer they count: "step N of M" sits beside
    // them, and previous is refused at the first step. Crossing is the arrow keys' job.
    expect((stage.querySelector('.bg-spine button') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('spine-position').textContent).toBe(
      `step 1 of ${stepCount(COURSE[0])}`,
    );
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

  it('pans a drawing it cannot widen, instead of advice that cannot be taken (112 FR-019)', () => {
    // The fault this closes: "widen the panel" is sound advice to a viewer with a window
    // to widen and an instruction that cannot be followed on a phone — a claim the tab
    // makes that stops being true. Where the column already has the viewport there is
    // nowhere to widen to, so the drawing is rendered at its own minimum inside a frame
    // that scrolls: full size, labels intact, panned rather than shrunk.
    const figure = { minWidth: 480, label: 'a drawing', draw: () => <svg /> };
    const realInner = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    try {
      render(<Figure figure={figure} width={366} context={{ poke: undefined, onPoke: () => {} }} />);
      expect(screen.getByTestId('figure-pan')).toBeTruthy();
      expect(document.querySelector('[data-testid="figure-floor"]')).toBeNull();
      expect(document.body.textContent).not.toMatch(/Widen the panel/);
      // At its own minimum, not at the width that could not hold it.
      expect(
        (document.querySelector('.bg-figure-pan-inner') as HTMLElement).style.minWidth,
      ).toBe('480px');
      cleanup();

      // And where there *is* a wider width to be had, the advice is unchanged, because
      // there it can be taken.
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
      render(<Figure figure={figure} width={366} context={{ poke: undefined, onPoke: () => {} }} />);
      expect(screen.getByTestId('figure-floor').textContent).toMatch(/needs about 480px/);
      expect(document.querySelector('[data-testid="figure-pan"]')).toBeNull();
    } finally {
      if (realInner) Object.defineProperty(window, 'innerWidth', realInner);
    }
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
