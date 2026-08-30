// @vitest-environment jsdom
/**
 * The Intro walkthrough (feature 119, FR-86 to FR-90).
 *
 * What is worth holding here changed with the redraw. The earlier passes drew declared
 * components, so the tests held the picture to the declaration. This one draws six roles
 * and names no component, so there is nothing to hold it to — and what has to be checked
 * instead is that it stays *honest about being an illustration* and *inert*:
 *
 * - **it says what it is.** The frame calls the motion an illustration on a fixed cycle,
 *   every sample the inspector opens carries its own caveat, and Messages is linked as
 *   the place the real traffic is. A schematic that reads as a readout is the fault this
 *   whole design has to avoid, and it is the one a test can actually catch;
 * - **it grows, and only under the reader.** Roles and channels appear as their steps
 *   arrive, arrow keys move it, and a channel is never drawn before both its ends;
 * - **it is inert, and reads no clock.** Rendered with a client whose every method throws
 *   and a fetch that throws. No timer is set: the motion is CSS, which is what keeps
 *   Constitution I out of it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IDockviewPanelProps } from 'dockview-react';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun, ConfigShell, RunManifest } from '../../generated/types.js';
import type { PanelParams } from '../../shell/Shell.js';
import { IntroPanel } from './IntroPanel.js';
import { BEATS, CHANNELS, ROLES, shownAt } from './roles.js';
import { restForStep, stepFromRest } from './address.js';

afterEach(cleanup);

const shell: ConfigShell = (runConfigDocument as unknown as ConfigRun).shell;
const manifest = { run_id: 'run-intro-test', root_seed: 7 } as unknown as RunManifest;

function panelProps(rest?: string): {
  props: IDockviewPanelProps<PanelParams>;
  reached: string[];
  written: (string | undefined)[];
} {
  const reached: string[] = [];
  const written: (string | undefined)[] = [];
  const refuse = (what: string) => () => {
    reached.push(what);
    throw new Error(`Intro reached the running system: ${what}`);
  };
  const params = {
    config: shell,
    client: {
      publish: refuse('client.publish'),
      subscribe: refuse('client.subscribe'),
      close: refuse('client.close'),
    },
    get validator() {
      reached.push('params.validator');
      throw new Error('Intro read the seam validator');
    },
    manifest,
    address: {
      names: () => true,
      current: () => rest,
      write: (next: string | undefined) => written.push(next),
      onChange: () => () => {},
    },
  };
  return { props: { params } as unknown as IDockviewPanelProps<PanelParams>, reached, written };
}

const roles = () =>
  [...document.querySelectorAll('[data-intro-role]')].map((n) => n.getAttribute('data-intro-role'));
const chans = () =>
  [...document.querySelectorAll('[data-intro-channel]')].map((n) =>
    n.getAttribute('data-intro-channel'),
  );
const stage = (): HTMLElement => {
  const found = document.querySelector<HTMLElement>('.intro-panel');
  if (!found) throw new Error('the panel rendered no root');
  return found;
};
const press = (key: string, target: HTMLElement | Document = stage()) =>
  act(() => {
    fireEvent.keyDown(target, { key });
  });

describe('it says what it is (FR-90)', () => {
  it('calls the motion an illustration, in the frame, before anyone reads it as a readout', () => {
    // The whole risk of a schematic that moves: a reader takes it for a report of the
    // run. The frame is where that is headed off, so the frame is what is asserted.
    render(<IntroPanel {...panelProps().props} />);
    const frame = document.querySelector('.intro-frame');
    expect(frame?.textContent).toMatch(/illustration on a fixed cycle/i);
    expect(frame?.textContent).toMatch(/whether or not anything is running/i);
    // And it says where the real thing is, rather than leaving the reader with only this.
    expect(frame?.querySelector('a')?.getAttribute('href')).toBe('#/view/messages');
  });

  it('carries a caveat on every sample the inspector can open', () => {
    // Not "on the one we remembered": every channel's sample, enumerated.
    for (const channel of Object.values(CHANNELS)) {
      expect(channel.sample.caveat, `${channel.id} opens with no caveat`).toMatch(
        /not a value this run produced/i,
      );
    }
    render(<IntroPanel {...panelProps().props} />);
    press('End');
    const mark = document.querySelector<HTMLElement>('[data-intro-mark]');
    if (!mark) throw new Error('no message is crossing anything');
    act(() => mark.click());
    expect(screen.getByTestId('intro-inspector').textContent).toMatch(
      /not a value this run produced/i,
    );
  });

  it('names no component anywhere a reader can see', () => {
    // The bargain of the redraw: an abstract picture cannot go stale when a component
    // lands, and this is what that claim costs — no declared id or label may appear.
    render(<IntroPanel {...panelProps().props} />);
    press('End');
    const drawn = document.querySelector('[data-testid="intro-flow"]')?.textContent ?? '';
    for (const component of shell.components) {
      expect(drawn, `the drawing names the component '${component.id}'`).not.toContain(
        component.id,
      );
      expect(drawn, `the drawing names '${component.label}'`).not.toContain(component.label);
    }
  });
});

describe('it grows, under the reader (FR-86)', () => {
  it('brings in each step’s roles and channels, and nothing ahead of them', () => {
    render(<IntroPanel {...panelProps().props} />);
    expect(roles()).toEqual(BEATS[0].roles);
    expect(chans()).toEqual([]);

    for (let step = 2; step <= BEATS.length; step += 1) {
      press('ArrowRight');
      const expected = shownAt(step);
      expect(new Set(roles())).toEqual(expected.roles);
      expect(new Set(chans())).toEqual(expected.channels);
    }
    // The end is the end.
    press('ArrowRight');
    expect(roles()).toHaveLength(ROLES.length);
  });

  it('never draws a channel before both the parts it runs between', () => {
    // A channel with one end missing is a claim about something that is not there.
    const ends: Record<string, readonly [string, string]> = {
      obs: ['measured', 'tested'],
      div: ['tested', 'ran'],
      pub: ['ran', 'believed'],
      ann: ['believed', 'told'],
      req: ['told', 'answered'],
      res: ['told', 'answered'],
    };
    for (let step = 1; step <= BEATS.length; step += 1) {
      const at = shownAt(step);
      for (const channel of at.channels) {
        const [from, to] = ends[channel];
        expect(at.roles.has(from), `${channel} drawn without ${from} at step ${step}`).toBe(true);
        expect(at.roles.has(to), `${channel} drawn without ${to} at step ${step}`).toBe(true);
      }
    }
  });

  it('walks on the arrow keys having clicked nothing, and goes back', () => {
    render(<IntroPanel {...panelProps().props} />);
    expect(document.activeElement).toBe(document.body);
    press('ArrowRight', document.body);
    expect(screen.getByTestId('intro-position').textContent).toBe(`step 2 of ${BEATS.length}`);
    press('ArrowLeft', document.body);
    expect(screen.getByTestId('intro-position').textContent).toBe(`step 1 of ${BEATS.length}`);
    press('End');
    expect(screen.getByTestId('intro-position').textContent).toBe(
      `step ${BEATS.length} of ${BEATS.length}`,
    );
  });

  it('opens where the address says, and writes the step name back', () => {
    expect(stepFromRest(BEATS, 'told')).toBe(
      BEATS.findIndex((beat) => beat.id === 'told') + 1,
    );
    // A role id names the step that brings it in.
    expect(stepFromRest(BEATS, 'answered')).toBe(
      BEATS.findIndex((beat) => beat.roles.includes('answered')) + 1,
    );
    expect(stepFromRest(BEATS, 'no-such-step')).toBe(1);
    expect(restForStep(BEATS, 2)).toBe(BEATS[1].id);

    const { props, written } = panelProps('ran');
    render(<IntroPanel {...props} />);
    expect(roles()).toContain('ran');
    expect(written.at(-1)).toBe('ran');
  });
});

describe('it holds at any width (FR-86)', () => {
  it('lays the lanes out as a flow that wraps, not a row that overflows', () => {
    // Watched failing on an iPad: seven parts would not sit side by side, the lane
    // overflowed its column, and the last of them was painted over by the narration
    // beside it. jsdom lays nothing out, so what is checked is the property that makes
    // the overflow impossible — the lane wraps, and its parts may shrink.
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'intro.css'), 'utf8');
    const rule = (selector: string) => {
      const found = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(css);
      if (!found) throw new Error(`${selector} declares nothing`);
      return found[1];
    };
    expect(rule('.intro-lane')).toMatch(/flex-wrap:\s*wrap/);
    // A part with a fixed basis cannot give ground, which is what forced the overflow.
    expect(rule('.intro-role')).not.toMatch(/flex:\s*0\s+0/);
    expect(rule('.intro-chan')).not.toMatch(/flex:\s*0\s+0/);
  });
});

describe('it is inert, and reads no clock (FR-89)', () => {
  it('draws every step with nothing running and nothing answering', () => {
    const realFetch = globalThis.fetch;
    const reachedFetch: string[] = [];
    globalThis.fetch = (() => {
      reachedFetch.push('fetch');
      throw new Error('Intro crossed the seam');
    }) as unknown as typeof globalThis.fetch;
    try {
      const { props, reached } = panelProps();
      render(<IntroPanel {...props} />);
      for (let step = 2; step <= BEATS.length; step += 1) {
        press('ArrowRight');
        expect(
          document.querySelector('.intro-narration')?.textContent?.trim().length ?? 0,
        ).toBeGreaterThan(40);
      }
      expect(reached).toEqual([]);
      expect(reachedFetch).toEqual([]);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('sets no timer: the motion is CSS, so Constitution I is never engaged', () => {
    // The fault this guards: reaching for setInterval or requestAnimationFrame to drive
    // the animation, which would need a wallclock exemption spent on decoration. The gate
    // catches that in source; this catches it in behaviour, including from a library.
    vi.useFakeTimers();
    const timer = vi.spyOn(globalThis, 'setInterval');
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    const frame = vi.spyOn(globalThis, 'requestAnimationFrame');
    try {
      render(<IntroPanel {...panelProps().props} />);
      press('End');
      act(() => vi.advanceTimersByTime(5000));
      expect(timer).not.toHaveBeenCalled();
      expect(timeout).not.toHaveBeenCalled();
      expect(frame).not.toHaveBeenCalled();
    } finally {
      timer.mockRestore();
      timeout.mockRestore();
      frame.mockRestore();
      vi.useRealTimers();
    }
  });

  it('states the synthetic-throughout disclaimer and the run identity (FR-01)', () => {
    render(<IntroPanel {...panelProps().props} />);
    expect(screen.getByText(/deliberately\s+fake/)).toBeTruthy();
    expect(screen.getByText(manifest.run_id)).toBeTruthy();
  });
});
