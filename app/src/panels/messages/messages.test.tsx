// @vitest-environment jsdom
/**
 * Messages against a live backend (feature 115, FR-71 to FR-73). Nothing here is mocked
 * below the seam: the runtime is provisioned as the bootstrap provisions it and every
 * assertion reads what a real message actually caused.
 *
 * The load-bearing test is **SC-02: silence is still**. FR-71 forbids motion while the
 * broker is silent, because a display that keeps moving with nothing arriving is
 * asserting traffic that does not exist (Constitution VII). Two things could break that
 * and only one of them is visible in the markup, so both are checked:
 *
 *   - the panel's rendered tree must be identical across a long stretch of host time
 *     with the harness stopped; and
 *   - the stylesheet that owns every traffic rule must declare no animation and no
 *     keyframes, because a CSS animation is motion the DOM cannot see — a check that
 *     watched only the markup would pass while the page pulsed away at a dead harness.
 *
 * Both were planted before they were trusted: a sweep interval was added to
 * `TrafficDisplay`, the first was watched failing, and it was reverted; a keyframe
 * animation was added to `.traffic-mark`, the second was watched failing, and it was
 * reverted. Said here and in the commit message, because a check that has never been
 * seen to fail is worth nothing (CLAUDE.md, lesson 2).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDockviewPanelProps } from 'dockview-react';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { buildBackend, type BackendRuntime } from '../../backend/runtime/runtime.js';
import type { PanelParams } from '../../shell/Shell.js';
import { MessagesPanel, MESSAGES_REGIONS } from './MessagesPanel.js';
import { MESSAGES_TOUR_STEPS } from '../../shell/walkthrough/tour.js';
import { uncoveredSubjects } from '../../shell/walkthrough/tour.js';

const validator = createSeamValidator();
const here = dirname(fileURLToPath(import.meta.url));

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

describe('the Messages tab (feature 115)', { timeout: 120_000 }, () => {
  let config: ConfigRun;
  let runtime: BackendRuntime;

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
    vi.useFakeTimers();
    config = lockstepConfig();
    runtime = buildBackend(config, { rootSeed: 7, startCondition: 'loitering', revision: 'test', dirty: false }, validator);
  });

  afterEach(() => {
    cleanup();
    runtime.stop();
    vi.useRealTimers();
  });

  it('draws a lane per declared namespace, and marks only messages that arrived', () => {
    render(<MessagesPanel {...panelProps()} />);
    const lanes = () => [...document.querySelectorAll('[data-lane]')];
    // Structure from the first frame: the declared namespaces, all of them empty.
    expect(lanes().length).toBeGreaterThan(0);
    expect(lanes().every((lane) => lane.getAttribute('data-marks') === '0')).toBe(true);
    // Traffic: heartbeats on their cadence, then a sampling tick for observations.
    act(() => vi.advanceTimersByTime(2100));
    act(() => {
      for (let index = 0; index < 30; index++) runtime.clock.tickOnce();
    });
    const drawn = lanes().filter((lane) => Number(lane.getAttribute('data-marks')) > 0);
    expect(drawn.map((lane) => lane.getAttribute('data-lane')).sort()).toContain('ctl');
    expect(drawn.map((lane) => lane.getAttribute('data-lane')).sort()).toContain('obs');
  });

  it('draws a topic no entry declares in an undeclared lane — a finding, never a silence', () => {
    render(<MessagesPanel {...panelProps()} />);
    // The realistic fault, and the one the topic tree has always drawn: a topic nobody
    // declared inside a namespace somebody did. A wholly new first segment cannot be
    // published at all — the broker's role rules refuse it at the seam.
    const rogue = runtime.transport.connect('rogue', 'sensors');
    act(() => rogue.publish('obs/platform-a/mystery', { not: 'declared' }));
    const lanes = [...document.querySelectorAll('[data-namespace="obs"]')];
    const undeclared = lanes.find((lane) => lane.getAttribute('data-declared') === 'false');
    expect(undeclared).toBeDefined();
    expect(undeclared?.getAttribute('data-marks')).toBe('1');
    // And the mark on it is refused: the payload fails the master its topic declares.
    expect(undeclared?.querySelector('[data-refused="true"]')).not.toBeNull();
    // The declared lane beside it is untouched: the finding does not contaminate it.
    expect(lanes.find((lane) => lane.getAttribute('data-declared') === 'true')).toBeDefined();
  });

  it('SC-02: with the broker silent nothing in the panel moves', () => {
    render(<MessagesPanel {...panelProps()} />);
    act(() => vi.advanceTimersByTime(2100));
    act(() => {
      for (let index = 0; index < 20; index++) runtime.clock.tickOnce();
    });
    const panel = () => document.querySelector('.messages-panel')?.innerHTML ?? '';
    expect(panel()).toContain('traffic-mark');
    runtime.stop();
    // Let every pulse and decay in the panel settle after the last arrival.
    act(() => vi.advanceTimersByTime(2000));
    const settled = panel();
    // Half a minute of host time with nothing arriving. A display that animates on its
    // own has thirty seconds to prove it here.
    act(() => vi.advanceTimersByTime(30_000));
    expect(panel()).toBe(settled);
  });

  it('SC-02: the stylesheet that owns the traffic display declares no animation', () => {
    // A CSS animation is motion the markup cannot see, so the check above cannot find
    // one. The bound is the file on disk rather than a rule remembered here.
    const stylesheet = readFileSync(join(here, 'messages.css'), 'utf8');
    const rules = stylesheet.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(rules).not.toMatch(/@keyframes/);
    expect(rules).not.toMatch(/\banimation\s*:/);
    expect(rules).not.toMatch(/\btransition\s*:/);
  });

  it('FR-23: everything received is validated and counted, the suppressed kinds included', () => {
    render(<MessagesPanel {...panelProps()} />);
    act(() => vi.advanceTimersByTime(2100));
    const counter = () => screen.getByTestId('refusal-counter').textContent ?? '';
    const received = () => Number(/^(\d+) received/.exec(counter())?.[1]);
    expect(counter()).toMatch(/\d+ received · 0 refused by their schema/);
    const before = received();
    expect(before).toBeGreaterThan(0);
    // Heartbeats are hidden from the list and are drawn and counted regardless: the
    // count does not move when the toggle does.
    expect([...document.querySelectorAll('.message-topic')].map((cell) => cell.textContent)).not.toContain(
      config.shell.topics.heartbeat,
    );
    act(() => screen.getByLabelText('show heartbeats').click());
    expect([...document.querySelectorAll('.message-topic')].map((cell) => cell.textContent)).toContain(
      config.shell.topics.heartbeat,
    );
    expect(received()).toBe(before);
  });

  it('FR-72: selecting a tree node filters the traffic display and the list', () => {
    render(<MessagesPanel {...panelProps()} />);
    act(() => vi.advanceTimersByTime(2100));
    act(() => {
      for (let index = 0; index < 30; index++) runtime.clock.tickOnce();
    });
    const marksOn = (namespace: string) =>
      Number(document.querySelector(`[data-lane="${namespace}"]`)?.getAttribute('data-marks'));
    expect(marksOn('ctl')).toBeGreaterThan(0);
    expect(marksOn('obs')).toBeGreaterThan(0);
    const obsNode = document.querySelector<HTMLElement>('[data-topic-path="obs"]');
    if (!obsNode) throw new Error('the tree drew no obs node to select');
    act(() => fireEvent.click(obsNode));
    expect(screen.getByTestId('tree-filter').textContent).toContain('obs');
    expect(marksOn('obs')).toBeGreaterThan(0);
    expect(marksOn('ctl')).toBe(0);
    // Choosing it again clears the filter rather than trapping the reader in a subtree.
    const again = document.querySelector<HTMLElement>('[data-topic-path="obs"]');
    if (!again) throw new Error('the obs node vanished while it was selected');
    act(() => fireEvent.click(again));
    expect(screen.queryByTestId('tree-filter')).toBeNull();
    expect(marksOn('ctl')).toBeGreaterThan(0);
  });

  it('FR-73: the inspector reads a payload against its master, and the raw wire stays reachable', () => {
    render(<MessagesPanel {...panelProps()} />);
    act(() => vi.advanceTimersByTime(2100));
    act(() => screen.getByLabelText('show heartbeats').click());
    const row = document.querySelector<HTMLElement>('.messages-list tbody tr');
    if (!row) throw new Error('no message reached the list to inspect');
    act(() => fireEvent.click(row));
    const fields = screen.getByTestId('inspect-fields');
    // The master's field names, not a blob.
    expect(fields.querySelector('[data-field="/component"]')).not.toBeNull();
    expect(fields.querySelector('[data-field="/sim_time"]')).not.toBeNull();
    // The wire document is one control away, for every message.
    act(() => fireEvent.click(screen.getByText('show the raw wire document')));
    expect(screen.getByTestId('inspect-raw').textContent).toContain('"component"');
  });

  it('FR-73: a refused payload is marked on its fields, and the wire document stays reachable', () => {
    render(<MessagesPanel {...panelProps()} />);
    const rogue = runtime.transport.connect('rogue', 'sensors');
    act(() => rogue.publish('obs/platform-a/mystery', { not: 'declared' }));
    const row = document.querySelector<HTMLElement>('.messages-list tbody tr');
    if (!row) throw new Error('the rogue message did not reach the list');
    act(() => fireEvent.click(row));
    // The topic matches the schema map's `obs/#` entry, so the observation master IS
    // the one its topic declares — and this payload fails it. The refusal is stated,
    // the fields are drawn against the master, and the extra key is shown rather than
    // dropped.
    expect(screen.getByTestId('inspect-fields')).toBeTruthy();
    expect(screen.getByTestId('inspector-refusal').textContent).toMatch(
      /must have required property/,
    );
    expect(document.querySelector('[data-field="/not"]')).not.toBeNull();
    act(() => fireEvent.click(screen.getByText('show the raw wire document')));
    expect(screen.getByTestId('inspect-raw').textContent).toContain('"not"');
  });

  it('FR-75: the tour covers every region the panel declares, and no region it does not', () => {
    // The bound is the panel's own declared region list, read from the module rather
    // than typed here: a fifth region cannot arrive unstepped.
    expect(
      uncoveredSubjects('messages', MESSAGES_REGIONS, MESSAGES_TOUR_STEPS),
    ).toEqual([]);
    expect(MESSAGES_REGIONS.length).toBeGreaterThan(0);
  });
});
