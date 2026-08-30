// @vitest-environment jsdom
/**
 * The Intro walkthrough (feature 116, FR-76 to FR-79).
 *
 * Three things are held here, and each is watched failing rather than trusted:
 *
 * - **the picture is held to the declaration**. `storyboardFindings` is run against the
 *   real configuration, and then against seven mutilated copies of it. The drawing is
 *   deliberately a *subset* — thirteen of twenty components — so the check that matters
 *   most is the one for a component that is in neither the drawing nor the recorded
 *   omissions: that is how the next component to land gets named rather than going
 *   quietly missing;
 * - **it grows, and only under the reader**. What is on the canvas is what the steps so
 *   far revealed, arrow keys move, and a wire is drawn only when both its ends are
 *   there;
 * - **it is inert, and claims nothing about the run**. The panel is rendered with a
 *   client whose every method throws and a fetch that throws. It draws the wiring.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { IDockviewPanelProps } from 'dockview-react';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun, ConfigShell, RunManifest } from '../../generated/types.js';
import type { PanelParams } from '../../shell/Shell.js';
import { IntroPanel } from './IntroPanel.js';
import {
  LOOP_REGION,
  NOT_DRAWN,
  PLANE_ROW,
  STORYBOARD,
  nodesOf,
  storyboardFindings,
  type Beat,
} from './storyboard.js';
import { METRICS, collapse, place, region, route } from './geometry.js';
import { restForStep, stepFromRest } from './address.js';

afterEach(cleanup);

const config = runConfigDocument as unknown as ConfigRun;
const shell: ConfigShell = config.shell;

const manifest = {
  run_id: 'run-intro-test',
  root_seed: 7,
} as unknown as RunManifest;

/** The storyboard with one node moved, for the planted-violation tests. */
function moved(component: string, place: { col: number; row: number }): Beat[] {
  return STORYBOARD.map((beat) => ({
    ...beat,
    reveals: beat.reveals.map((node) => (node.component === component ? { ...node, place } : node)),
  }));
}

/**
 * The panel with nothing running. The configuration and the manifest are handed over
 * because the tab genuinely states what they declare (FR-01's run identity); everything
 * that would reach the *running system* throws instead.
 */
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

function nodes(): string[] {
  return [...document.querySelectorAll('[data-intro-node]')].map(
    (node) => node.getAttribute('data-intro-node') ?? '',
  );
}

function wires(): string[] {
  return [...document.querySelectorAll('[data-intro-wire]')].map(
    (wire) => wire.getAttribute('data-intro-wire') ?? '',
  );
}

function stage(): HTMLElement {
  const found = document.querySelector<HTMLElement>('.intro-stage');
  if (!found) throw new Error('the panel rendered no stage');
  return found;
}

function press(key: string, target: HTMLElement | Document = stage()): void {
  act(() => {
    fireEvent.keyDown(target, { key });
  });
}

describe('the drawing is held to the declaration (FR-77)', () => {
  it('draws a subset, records the rest, and accounts for every declared component', () => {
    expect(storyboardFindings(shell)).toEqual([]);
    const drawn = nodesOf().map((node) => node.component);
    // The two lists partition the declaration: nothing counted twice, nothing missed.
    expect(new Set(drawn).size).toBe(drawn.length);
    expect(drawn.length + NOT_DRAWN.length).toBe(shell.components.length);
  });

  it('names a component that is neither drawn nor recorded as left out', () => {
    // The fault the gate exists for: a component lands and nobody decides about it.
    const short = STORYBOARD.filter((beat) => beat.id !== 'drift');
    expect(storyboardFindings(shell, short).join('\n')).toMatch(
      /component 'monitor' is declared but the Intro drawing neither draws it nor records why it is left out/,
    );
    // And recording it is enough — the point is the decision, not the drawing.
    expect(
      storyboardFindings(shell, short, [...NOT_DRAWN, { component: 'monitor', reason: 'because' }]),
    ).toEqual([]);
  });

  it('names a node the configuration declares nothing for', () => {
    // Constitution VII applied to the drawing: a picture may not invent a component.
    const stranger: Beat[] = [
      ...STORYBOARD,
      {
        id: 'planted',
        title: 'x',
        prose: [],
        reveals: [{ component: 'adaptive-sampling', place: { col: 2, row: 3 } }],
      },
    ];
    expect(storyboardFindings(shell, stranger).join('\n')).toMatch(
      /node for 'adaptive-sampling', which the shell declares no component for/,
    );
  });

  it('names an omission with no reason, and one that is drawn anyway', () => {
    expect(storyboardFindings(shell, STORYBOARD, [...NOT_DRAWN, { component: 'monitor', reason: '' }]).join('\n')).toMatch(
      /is both drawn in the Intro drawing and listed as deliberately not drawn/,
    );
    const silent = NOT_DRAWN.map((omission) =>
      omission.component === 'offload' ? { ...omission, reason: '  ' } : omission,
    );
    expect(storyboardFindings(shell, STORYBOARD, silent).join('\n')).toMatch(
      /omits 'offload' with no reason given/,
    );
  });

  it('names two nodes claiming one cell', () => {
    expect(storyboardFindings(shell, moved('monitor', { col: 0, row: 0 })).join('\n')).toMatch(
      /both claim cell 0,0/,
    );
  });

  it('names a plane component outside the strip, and a stranger inside it', () => {
    // The strip is not decoration: it is where the components that declare themselves the
    // plane are drawn, and the two have to agree or the strip means nothing.
    expect(storyboardFindings(shell, moved('clock', { col: 2, row: 3 })).join('\n')).toMatch(
      /'clock' declares itself the plane and is drawn outside/,
    );
    expect(
      storyboardFindings(shell, moved('observation-store', { col: 0, row: PLANE_ROW })).join('\n'),
    ).toMatch(/'observation-store' is drawn in the Intro drawing's plane strip but declares band 'path'/);
  });

  it('names a node inside the loop band that is not part of the loop', () => {
    // The band claims the loop turns there. Everything inside it has to be the loop.
    expect(storyboardFindings(shell, moved('ingest', LOOP_REGION.from)).join('\n')).toMatch(
      /'ingest' is drawn inside the Intro drawing's loop band but declares band 'path'/,
    );
  });

  it('draws the loop as a ring: four corners, and the wires that close it', () => {
    const inLoop = nodesOf().filter(
      (node) =>
        node.place.col >= LOOP_REGION.from.col &&
        node.place.col <= LOOP_REGION.to.col &&
        node.place.row >= LOOP_REGION.from.row &&
        node.place.row <= LOOP_REGION.to.row,
    );
    expect(inLoop.map((node) => node.component).sort()).toEqual([
      'coverage-store',
      'model-runner',
      'monitor',
      'scheduler',
    ]);
    // Each occupies its own corner of the band: a ring drawn with two boxes in a row
    // would be a line.
    expect(new Set(inLoop.map((node) => `${node.place.col},${node.place.row}`)).size).toBe(4);
  });
});

describe('the geometry', () => {
  it('bows a hop along a row over the node between, and one down a column into the gutter', () => {
    const placed = place([
      { id: 'left', cell: { col: 0, row: 1 } },
      { id: 'middle', cell: { col: 1, row: 1 } },
      { id: 'right', cell: { col: 2, row: 1 } },
      { id: 'below', cell: { col: 0, row: 3 } },
    ]);
    const boxes = new Map(placed.boxes.map((box) => [box.id, box]));
    const left = boxes.get('left');
    const right = boxes.get('right');
    const middle = boxes.get('middle');
    const below = boxes.get('below');
    if (!left || !right || !middle || !below) throw new Error('the fixture lost a box');

    // Over the top: the corridor is above the row, so the wire cannot be read as
    // touching the node it passes.
    const along = route(left, right, { col: 0, row: 1 }, { col: 2, row: 1 });
    const ys = [...along.d.matchAll(/[-\d.]+ ([-\d.]+)/g)].map((match) => Number(match[1]));
    expect(Math.min(...ys)).toBeLessThan(middle.y);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);

    // Out to the left: the bow uses the gutter, and stays on the canvas.
    const down = route(below, left, { col: 0, row: 3 }, { col: 0, row: 1 });
    const xs = [...down.d.matchAll(/([-\d.]+) [-\d.]+/g)].map((match) => Number(match[1]));
    expect(Math.min(...xs)).toBeLessThan(left.x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
  });

  it('reserves the outside lane only for a node that declares it serves the outside', () => {
    const without = place([{ id: 'a', cell: { col: 0, row: 0 } }]);
    expect(without.outside).toBeUndefined();
    const serving = place([{ id: 'a', cell: { col: 0, row: 0 }, servesOutside: true }]);
    expect(serving.outside).toBeDefined();
    expect(serving.width).toBeGreaterThan(without.width + METRICS.outsideWidth - 1);
  });

  it('draws a band that encloses the cells it claims', () => {
    const band = region(LOOP_REGION.from, LOOP_REGION.to);
    const placed = place(
      nodesOf().map((node) => ({ id: node.component, cell: node.place })),
    );
    for (const node of nodesOf()) {
      const inLoop =
        node.place.col >= LOOP_REGION.from.col &&
        node.place.col <= LOOP_REGION.to.col &&
        node.place.row >= LOOP_REGION.from.row &&
        node.place.row <= LOOP_REGION.to.row;
      if (!inLoop) continue;
      const box = placed.boxes.find((candidate) => candidate.id === node.component);
      if (!box) throw new Error(`no box for ${node.component}`);
      expect(box.x).toBeGreaterThanOrEqual(band.x);
      expect(box.y).toBeGreaterThanOrEqual(band.y);
      expect(box.x + box.width).toBeLessThanOrEqual(band.x + band.width);
      expect(box.y + box.height).toBeLessThanOrEqual(band.y + band.height);
    }
  });

  it('collapses parallel wires into one, keeping every label', () => {
    const collapsed = collapse([
      { from: 'sensors', to: 'ingest', kind: 'topic', label: 'a' },
      { from: 'sensors', to: 'ingest', kind: 'topic', label: 'b' },
      { from: 'sensors', to: 'ingest', kind: 'port', label: 'a port' },
    ]);
    expect(collapsed).toHaveLength(2);
    expect(collapsed[0].labels).toEqual(['a', 'b']);
  });
});

describe('the walkthrough grows, under the reader (FR-76, FR-78)', () => {
  it('draws what the steps so far revealed, and nothing ahead of them', () => {
    const { props } = panelProps();
    render(<IntroPanel {...props} />);
    expect(nodes()).toEqual(STORYBOARD[0].reveals.map((node) => node.component));
    expect(screen.getByTestId('intro-position').textContent).toBe(`step 1 of ${STORYBOARD.length}`);

    for (let step = 2; step <= STORYBOARD.length; step += 1) {
      press('ArrowRight');
      expect(nodes()).toEqual(
        STORYBOARD.slice(0, step).flatMap((beat) => beat.reveals.map((node) => node.component)),
      );
      expect(
        document.querySelector('[data-testid="intro-diagram"]')?.getAttribute('data-step'),
      ).toBe(String(step));
    }
    // The end is the end: forward from the last step stays on the last step.
    press('ArrowRight');
    expect(nodes()).toHaveLength(nodesOf().length);
  });

  it('draws a wire only when both of its ends have been revealed', () => {
    const { props } = panelProps();
    render(<IntroPanel {...props} />);
    // The first step is one node and no wire: there is nothing yet for it to reach.
    expect(wires()).toEqual([]);

    press('ArrowRight');
    // The sampler port is a genuine declared coupling and is now drawable.
    expect(wires()).toContain('env-generator->sensors');
    expect(
      document
        .querySelector('[data-intro-wire="env-generator->sensors"]')
        ?.getAttribute('data-wire-kind'),
    ).toBe('port');

    press('End');
    const shown = new Set(nodes());
    for (const wire of wires()) {
      const [from, to] = wire.split('->');
      expect(shown.has(from) && shown.has(to)).toBe(true);
    }
    // And nothing reaching a component this drawing does not draw at all.
    const omitted = new Set(NOT_DRAWN.map((omission) => omission.component));
    for (const wire of wires()) {
      for (const end of wire.split('->')) expect(omitted.has(end)).toBe(false);
    }
  });

  it('walks on the arrow keys having clicked nothing', () => {
    // The fault this guards: a handler hung on the panel's own element never fires for a
    // viewer who has just opened the tab, because nothing inside it holds the focus. That
    // was the first version, and it made the arrow keys — the whole of what was asked for
    // — do nothing until you thought to click the drawing. The listener is on the
    // document, with the guards in `shell/arrow-keys.ts`.
    const { props } = panelProps();
    render(<IntroPanel {...props} />);
    expect(document.activeElement).toBe(document.body);
    press('ArrowRight', document.body);
    expect(screen.getByTestId('intro-position').textContent).toBe(`step 2 of ${STORYBOARD.length}`);
    press('ArrowLeft', document.body);
    expect(screen.getByTestId('intro-position').textContent).toBe(`step 1 of ${STORYBOARD.length}`);
  });

  it('leaves the arrow keys alone while the address names another view', () => {
    // Every panel stays mounted when another is shown, so a hidden Intro must not walk
    // itself while the viewer is on the Map.
    const { props } = panelProps();
    const params = props.params as unknown as { address: { names: () => boolean } };
    params.address.names = () => false;
    render(<IntroPanel {...props} />);
    press('ArrowRight', document.body);
    expect(screen.getByTestId('intro-position').textContent).toBe(`step 1 of ${STORYBOARD.length}`);
    // Focus inside this panel is still this panel's business, addressed or not.
    press('ArrowRight');
    expect(screen.getByTestId('intro-position').textContent).toBe(`step 2 of ${STORYBOARD.length}`);
  });

  it('leaves a port wire able to be dashed: no pathLength rescaling its dash', () => {
    // The fault this guards: `pathLength="1"` normalises the path's length, and
    // `stroke-dasharray` is then in that same space — so the port's `6 4` dash became a
    // six-unit dash on a one-unit path and every port rendered solid. The legend promises
    // that a dashed wire is a coupling carrying no traffic, and the drawing had quietly
    // stopped keeping it. Found in a screenshot of the running instance; no test and no
    // gate would have caught it, because the markup was correct and only its meaning was
    // wrong.
    const { props } = panelProps();
    render(<IntroPanel {...props} />);
    press('End');
    const ports = [...document.querySelectorAll('[data-wire-kind="port"]')];
    expect(ports.length).toBeGreaterThan(0);
    for (const port of ports) {
      expect(port.getAttribute('pathLength')).toBeNull();
      expect(port.getAttribute('class')).toContain('is-port');
    }
    // And no wire at all carries it: the draw animation works in user units instead.
    expect(document.querySelectorAll('[data-intro-wire][pathLength]')).toHaveLength(0);
  });

  it('bands the loop only once the ring closes', () => {
    const { props } = panelProps();
    render(<IntroPanel {...props} />);
    // A band around an incomplete ring would claim a loop that does not yet turn.
    expect(screen.queryByTestId('intro-loop-band')).toBeNull();
    press('End');
    expect(screen.getByTestId('intro-loop-band')).toBeTruthy();
  });

  it('goes back, jumps to the ends, and jumps to a part that is clicked', () => {
    const { props } = panelProps();
    render(<IntroPanel {...props} />);

    press('End');
    expect(nodes()).toHaveLength(nodesOf().length);

    press('ArrowLeft');
    expect(nodes()).toHaveLength(nodesOf().length - STORYBOARD[STORYBOARD.length - 1].reveals.length);

    // A node already drawn is a way back into its own step.
    act(() => {
      (document.querySelector('[data-intro-node="monitor"]') as HTMLElement).click();
    });
    const monitorStep = STORYBOARD.findIndex((beat) => beat.id === 'drift') + 1;
    expect(screen.getByTestId('intro-position').textContent).toBe(
      `step ${monitorStep} of ${STORYBOARD.length}`,
    );

    press('Home');
    expect(nodes()).toEqual(STORYBOARD[0].reveals.map((node) => node.component));
  });

  it('names the arrow out of the harness with the endpoints the shell declares', () => {
    const { props } = panelProps('interrogated');
    render(<IntroPanel {...props} />);
    const outside = screen.getByTestId('intro-outside');
    expect(outside.textContent).toContain(shell.endpoints.edr);
    expect(outside.textContent).toContain(shell.endpoints.sensorthings);
    expect(outside.textContent).toContain(shell.endpoints.features);
    // It is not a component, and is not offered as one.
    expect(outside.querySelector('button')).toBeNull();
  });

  it('records what it does not draw, with a reason for each', () => {
    // A curated picture that did not say what it left out would be claiming to be the
    // architecture. Every omission is on screen, and each carries its reason.
    const { props } = panelProps();
    render(<IntroPanel {...props} />);
    const omissions = screen.getByTestId('intro-omissions');
    expect(omissions.querySelectorAll('li')).toHaveLength(NOT_DRAWN.length);
    for (const omission of NOT_DRAWN) {
      const label = shell.components.find((component) => component.id === omission.component)?.label;
      expect(omissions.textContent).toContain(label);
      expect(omissions.textContent).toContain(omission.reason);
    }
  });
});

describe('the address names a step, not a number (FR-79)', () => {
  it('opens where the address says, and writes the step name back', () => {
    expect(stepFromRest(STORYBOARD, 'the-loop')).toBe(
      STORYBOARD.findIndex((beat) => beat.id === 'the-loop') + 1,
    );
    // A component id names the step that reveals it, so clicking a node and pasting an
    // address mean the same thing.
    expect(stepFromRest(STORYBOARD, 'model-runner')).toBe(
      STORYBOARD.findIndex((beat) => beat.id === 'the-loop') + 1,
    );
    // A remainder naming something the storyboard no longer has is a convenience that
    // failed, not a fault: the walkthrough opens at the beginning.
    expect(stepFromRest(STORYBOARD, 'no-such-step')).toBe(1);
    expect(stepFromRest(STORYBOARD, undefined)).toBe(1);
    expect(restForStep(STORYBOARD, 2)).toBe(STORYBOARD[1].id);

    const { props, written } = panelProps('drift');
    render(<IntroPanel {...props} />);
    expect(nodes()).toContain('monitor');
    expect(written.at(-1)).toBe('drift');

    press('ArrowRight');
    expect(written.at(-1)).toBe(STORYBOARD[STORYBOARD.findIndex((beat) => beat.id === 'drift') + 1].id);
  });
});

describe('the tab is inert, and says what it is (FR-01, FR-78)', () => {
  it('draws the whole walkthrough with nothing running and nothing answering', () => {
    const realFetch = globalThis.fetch;
    const reachedFetch: string[] = [];
    globalThis.fetch = (() => {
      reachedFetch.push('fetch');
      throw new Error('Intro crossed the seam');
    }) as unknown as typeof globalThis.fetch;
    try {
      const { props, reached } = panelProps();
      render(<IntroPanel {...props} />);
      for (let step = 2; step <= STORYBOARD.length; step += 1) {
        press('ArrowRight');
        // Something is said at every step: never a blank.
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

  it('states the synthetic-throughout disclaimer and the run identity (FR-01)', () => {
    const { props } = panelProps();
    render(<IntroPanel {...props} />);
    expect(screen.getByText(/deliberately\s+fake/)).toBeTruthy();
    expect(screen.getByText(manifest.run_id)).toBeTruthy();
  });

  it('makes no claim about liveness: no node reports a state', () => {
    // The fault this guards against is a drawing that looks like a readout. Nothing in
    // the drawing carries the operator surface's state vocabulary, and the panel says in
    // as many words where the live answer is.
    const { props } = panelProps();
    render(<IntroPanel {...props} />);
    press('End');
    const drawing = document.querySelector('[data-testid="intro-diagram"]');
    expect(drawing?.querySelectorAll('[data-component-state]')).toHaveLength(0);
    expect(drawing?.textContent).not.toMatch(/\b(unheard|lit|live|running|stopped)\b/i);
    expect(document.querySelector('.intro-foot')?.textContent).toMatch(
      /it is the wiring,\s*not the run/,
    );
  });
});
