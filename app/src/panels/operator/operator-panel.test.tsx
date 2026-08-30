// @vitest-environment jsdom
/**
 * The Operator flow chart against a genuine backend (SRD-v2 FR-57 to FR-59). Nothing
 * below the seam is mocked: what the assertions read is what a heartbeat, a clock
 * sample or a genuine command actually caused.
 *
 * The consequence chain is the reason this tab was redrawn, so it is the test that
 * matters most here: stop the platform, and the picture shows the cost of it two nodes
 * along — the sensors' own sentence changes, and the ocean rows stop.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDockviewPanelProps } from 'dockview-react';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { buildBackend, type BackendRuntime } from '../../backend/runtime/runtime.js';
import { createSeamFetch } from '../../seam/http.js';
import { topology } from '../../generated/topology.js';
import type { PanelParams } from '../../shell/Shell.js';
import { OperatorPanel } from './OperatorPanel.js';
import { buildFlow } from './graph.js';
import { componentsWithoutFaces } from './faces.js';

const validator = createSeamValidator();
const realFetch = globalThis.fetch;

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

describe('the Operator flow chart (feature 113)', () => {
  let config: ConfigRun;
  let runtime: BackendRuntime;

  beforeEach(() => {
    vi.useFakeTimers();
    config = lockstepConfig();
    runtime = buildBackend(config, { rootSeed: 41, revision: 'test', dirty: false }, validator);
    // The seam shim, exactly as the bootstrap installs it: seam paths answered by the
    // backend, everything else passed through.
    vi.stubGlobal('fetch', createSeamFetch(config.boundary.api_prefix, runtime.httpBackend, realFetch));
  });

  afterEach(() => {
    runtime.stop();
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('draws every declared component, and nothing that is not one', async () => {
    render(<OperatorPanel {...panelProps(config, runtime)} />);
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    const drawn = [...document.querySelectorAll('[data-flow-node]')].map(
      (node) => node.getAttribute('data-flow-node'),
    );
    expect(drawn.sort()).toEqual(config.shell.components.map((c) => c.id).sort());
    // And the picture agrees with the wiring, which is the gate's claim held here too.
    const flow = buildFlow(config.shell, topology);
    expect(flow.edges.length).toBeGreaterThan(config.shell.components.length);
    expect(flow.suppressed).toEqual(['ctl/clock', 'ctl/heartbeat']);
  });

  it('lights only from heartbeats, and names the two suppressed namespaces on screen', async () => {
    render(<OperatorPanel {...panelProps(config, runtime)} />);
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    expect(document.querySelectorAll('[data-lit="true"]').length).toBe(
      config.shell.components.length,
    );
    expect(screen.getByText(/drawn as the plane, not as edges/)).toBeTruthy();

    // Silence darkens it, and nothing else can.
    runtime.stop();
    await act(async () => {
      vi.advanceTimersByTime(9000);
    });
    expect(document.querySelectorAll('[data-lit="true"]').length).toBe(0);
  });

  it('the list view carries the same components and the same controls', async () => {
    render(<OperatorPanel {...panelProps(config, runtime)} />);
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('view-toggle'));
    });
    const rows = [...document.querySelectorAll('[data-operator-component]')].map((row) =>
      row.getAttribute('data-operator-component'),
    );
    // One shared source, asserted as one — not two lists that happen to agree today.
    expect(rows).toEqual(buildFlow(config.shell, topology).nodes.map((node) => node.id));
    // Protection reads the same in both views, in the surface's own word.
    const clockRow = document.querySelector('[data-operator-component="clock"]');
    expect(within(clockRow as HTMLElement).getByText('protected')).toBeTruthy();
  });

  it('FR-68: the list carries the two facts the System tab carried alone, as declared figures', async () => {
    render(<OperatorPanel {...panelProps(config, runtime)} />);
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('view-toggle'));
    });
    // The bound is the configuration, not a count typed here: a component added to the
    // shell document and not to this table fails this rather than sliding past.
    for (const component of config.shell.components) {
      const row = document.querySelector(`[data-operator-component="${component.id}"]`);
      expect(row?.querySelector(`[data-declared-beat="${component.beat}"]`)).not.toBeNull();
      expect(
        row?.querySelector(
          `[data-declared-window="${config.shell.liveness.default_window_seconds}"]`,
        ),
      ).not.toBeNull();
    }
    // Both are drawn as declared figures — configuration, typographically apart from
    // reported and observed (FR-57). A figure may not change kind between states, which
    // is why a component's own reported window is drawn beside this one and never in it.
    const clockRow = document.querySelector('[data-operator-component="clock"]') as HTMLElement;
    expect(clockRow.querySelectorAll('.flow-figure-declared').length).toBe(2);
  });

  it('FR-68: the legend names the six states, and carries the claim the System footnote made', async () => {
    render(<OperatorPanel {...panelProps(config, runtime)} />);
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    const legend = screen.getByTestId('flow-legend');
    // The six states a node can be in, each named rather than only coloured.
    expect([...legend.querySelectorAll('[data-legend-state]')].map((entry) =>
      entry.getAttribute('data-legend-state'),
    )).toEqual(['ok', 'starting', 'degraded', 'stalled', 'silent', 'unheard']);
    // The true statement the withdrawn tab's footnote carried and nothing else did.
    expect(legend.textContent).toContain('has not run yet, or has stopped');
    expect(legend.textContent).toContain('only the silence');
  });

  it('FR-70: the panel carries its own help control, and it is the component tour', async () => {
    render(<OperatorPanel {...panelProps(config, runtime)} />);
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    const button = screen.getByTestId('help-button');
    expect(button.getAttribute('aria-label')).toContain('The system, component by component');
  });

  it('a refused command is surfaced verbatim, in the words the surface used', async () => {
    render(<OperatorPanel {...panelProps(config, runtime)} />);
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('view-toggle'));
    });
    // The clock is protected: its row offers no control, so the refusal is provoked
    // through the seam exactly as the surface would answer it.
    const response = await fetch(`${config.operator.http.command_prefix}/clock/stop`, {
      method: 'POST',
    });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { refused: string }).refused).toMatch(
      /'clock' is protected from the operator plane by rule/,
    );
  });

  it('stop the platform, and the picture shows what it cost two nodes along (SC-001)', async () => {
    render(<OperatorPanel {...panelProps(config, runtime)} />);
    await act(async () => {
      vi.advanceTimersByTime(2100);
      for (let i = 0; i < 90; i++) runtime.clock.tickOnce();
    });

    const sensorsNode = () => document.querySelector('[data-flow-node="sensors"]');
    expect(sensorsNode()?.textContent).toContain('sampling where ownship reported');
    const oceanRows = () =>
      runtime.observationStore.byDatastream(config.sensors.platform.thing_id, 'temperature-050m').length;
    const before = oceanRows();
    expect(before).toBeGreaterThan(0);

    // The cause, applied at the node that owns it.
    await act(async () => {
      await fetch(`${config.operator.http.command_prefix}/platform/stop`, { method: 'POST' });
    });
    await act(async () => {
      for (let i = 0; i < 200; i++) runtime.clock.tickOnce();
      vi.advanceTimersByTime(9000);
    });

    // The platform darkens because its heartbeats ceased, not because the command said so.
    expect(document.querySelector('[data-flow-node="platform"]')?.getAttribute('data-lit')).toBe('false');
    // And two nodes along, the consequence is on the sensors' own face — drawn from
    // the position age they report, not parsed out of a sentence.
    expect(sensorsNode()?.textContent).toContain('ticks old');
    // The ocean sampling stopped: one more sample at most, then nothing.
    expect(oceanRows()).toBeLessThanOrEqual(before + 1);
  });

  it('the platform’s face shows demanded against current, and names the binding limit (SC-002)', async () => {
    render(<OperatorPanel {...panelProps(config, runtime)} />);
    await act(async () => {
      vi.advanceTimersByTime(2100);
      runtime.clock.tickOnce();
    });
    await act(async () => {
      fireEvent.click(document.querySelector('[data-flow-node="platform"]') as HTMLElement);
    });
    const drawer = () => screen.getByTestId('flow-drawer');
    expect(drawer().getAttribute('data-drawer-component')).toBe('platform');
    // The instrument is on the node AND at full size in the drawer, so assertions
    // scope to one of them rather than matching both.
    const binding = () => within(drawer()).getByTestId('platform-binding');
    // No demand yet: the face says so rather than showing a demand equal to current.
    expect(binding().textContent).toContain('no demand heard');

    // A demand that cannot be reached: applied to the limit, and the shortfall stated.
    await act(async () => {
      await fetch(config.shell.endpoints.platform_demand, {
        method: 'POST',
        body: JSON.stringify({ course_degrees: 270, speed_m_per_s: 12 }),
      });
      for (let i = 0; i < 5; i++) runtime.clock.tickOnce();
    });
    expect(binding().textContent).toMatch(/binding: turn rate/);
    expect(within(drawer()).getByTestId('platform-shortfall').textContent).toMatch(/demanded 12 m\/s/);

    // Turn all the way: the limit stops binding when the platform gets there.
    await act(async () => {
      for (let i = 0; i < 400; i++) runtime.clock.tickOnce();
    });
    expect(binding().textContent).not.toMatch(/turn rate/);
  });

  it('a heartbeat with no detail is not an absent heartbeat', async () => {
    render(<OperatorPanel {...panelProps(config, runtime)} />);
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    // The clock, the broker and the release gate publish no detail line. Reading that
    // as "no heartbeat has ever arrived" was the display inventing a silence that had
    // not happened — found by looking at the running page, and held here in the
    // drawer, which is where the detail sentence now lives.
    const clock = document.querySelector('[data-flow-node="clock"]');
    expect(clock?.getAttribute('data-lit')).toBe('true');
    await act(async () => {
      fireEvent.click(clock as HTMLElement);
    });
    const drawer = screen.getByTestId('flow-drawer');
    expect(drawer.textContent).not.toContain('no heartbeat has ever arrived');
    expect(drawer.textContent).toContain('beating, and saying nothing beyond that');
    // A component that has genuinely reported something draws it instead. The
    // platform has not published state yet at this point, and its face says exactly
    // that rather than drawing a dial at zero.
    expect(document.querySelector('[data-flow-node="platform"]')?.textContent).toContain(
      'nothing heard from the platform yet',
    );
    await act(async () => {
      runtime.clock.tickOnce();
    });
    // Now it draws its own instrument: speed and depth against their declared
    // maxima, with no demanded mark because nothing has demanded anything.
    const platform = document.querySelector('[data-flow-node="platform"]');
    expect(platform?.textContent).toContain('speed');
    expect(platform?.textContent).toContain('depth');
    expect(platform?.querySelector('.face-dial')).toBeTruthy();
    expect(platform?.querySelector('.face-tape-demanded')).toBeNull();
  });

  it('every component wears a face of its own — none falls back to a blank', async () => {
    render(<OperatorPanel {...panelProps(config, runtime)} />);
    await act(async () => {
      vi.advanceTimersByTime(2100);
      for (let i = 0; i < 40; i++) runtime.clock.tickOnce();
      vi.advanceTimersByTime(2100);
    });
    // Twenty components, twenty bespoke instruments. The first cut of this panel drew
    // the same card twenty times, which told a reader nothing the table had not.
    expect(componentsWithoutFaces(config.shell.components.map((c) => c.id))).toEqual([]);
    for (const component of config.shell.components) {
      const node = document.querySelector(`[data-flow-node="${component.id}"]`);
      expect(node, component.id).toBeTruthy();
      // Something beyond the chrome: a figure, a bar, or the honest statement that
      // the component has reported nothing countable yet.
      expect(node?.querySelector('.flow-node-face')?.children.length, component.id).toBeGreaterThan(0);
    }
  });

  it('draws the wires between the components, derived from the topology', async () => {
    render(<OperatorPanel {...panelProps(config, runtime)} />);
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    const drawn = [...document.querySelectorAll('[data-flow-edge]')];
    // One drawn path per derived edge: the picture is the wiring, not a sketch of it.
    expect(drawn.length).toBe(buildFlow(config.shell, topology).edges.length);
    // Ports are drawn dashed, because they carry no broker traffic and can never pulse.
    const ports = drawn.filter((edge) => edge.getAttribute('data-edge-kind') === 'port');
    expect(ports.length).toBeGreaterThan(0);
    for (const port of ports) expect(port.getAttribute('stroke-dasharray')).toBeTruthy();
    // And every path actually has geometry, rather than being an empty element.
    for (const edge of drawn) expect(edge.getAttribute('d')?.length ?? 0).toBeGreaterThan(10);
  });

  it('selecting a node dims the wires that do not touch it', async () => {
    render(<OperatorPanel {...panelProps(config, runtime)} />);
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    await act(async () => {
      fireEvent.click(document.querySelector('[data-flow-node="scheduler"]') as HTMLElement);
    });
    const opacityOf = (edge: Element) => Number(edge.getAttribute('opacity'));
    const touching = [...document.querySelectorAll('[data-flow-edge*="scheduler"]')];
    const others = [...document.querySelectorAll('[data-flow-edge]')].filter(
      (edge) => !(edge.getAttribute('data-flow-edge') ?? '').includes('scheduler'),
    );
    expect(touching.length).toBeGreaterThan(0);
    expect(others.length).toBeGreaterThan(0);
    // With fifty wires over twenty components, a picture that shouted equally
    // everywhere would say nothing.
    expect(Math.min(...touching.map(opacityOf))).toBeGreaterThan(Math.max(...others.map(opacityOf)));
  });

  it('an empty series says it is empty rather than drawing a flat line at zero', async () => {
    render(<OperatorPanel {...panelProps(config, runtime)} />);
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    // Nothing has been scored yet, so the monitor's face has nothing to draw and says
    // so — the one thing a zero-height line would quietly claim it did have.
    await act(async () => {
      fireEvent.click(document.querySelector('[data-flow-node="monitor"]') as HTMLElement);
    });
    expect(screen.getByTestId('flow-drawer').textContent).toContain('no residual has been reported yet');
  });

  /**
   * Feature 116: the node opens where it stands. The tab was sent back because a
   * 208×116 card could be glanced at and not read — the instrument was legible only as
   * a shape, and a slider in it was not usable at all. What is held here is the
   * behaviour that answers it, and specifically the part a stylesheet could not have
   * done: the account is *in the node*, and the chart moves aside rather than covering
   * what the reader was looking at.
   */
  describe('opening a node where it stands (feature 116)', () => {
    /** The absolutely-positioned slot the canvas places a node in. */
    const slotOf = (id: string) =>
      document.querySelector(`[data-flow-node="${id}"]`)?.closest('.flow-node-slot') as HTMLElement;
    const boxOf = (id: string) => ({
      width: Number.parseFloat(slotOf(id).style.width),
      height: Number.parseFloat(slotOf(id).style.height),
      left: Number.parseFloat(slotOf(id).style.left),
      top: Number.parseFloat(slotOf(id).style.top),
    });
    const open = async (id: string) => {
      await act(async () => {
        fireEvent.click(document.querySelector(`[data-flow-node="${id}"]`) as HTMLElement);
      });
    };

    it('opens the account inside the node itself, not somewhere the reader has to go and find', async () => {
      render(<OperatorPanel {...panelProps(config, runtime)} />);
      await act(async () => {
        vi.advanceTimersByTime(2100);
      });
      expect(screen.queryByTestId('flow-drawer')).toBeNull();
      await open('monitor');
      const drawer = screen.getByTestId('flow-drawer');
      expect(drawer.getAttribute('data-drawer-where')).toBe('in-place');
      // Inside the node it belongs to — the assertion the old drawer could not have
      // passed, since it hung below the whole chart.
      expect(document.querySelector('[data-flow-node="monitor"]')?.contains(drawer)).toBe(true);
      // And its controls came with it: this is the reason the node stopped being a
      // button, because a button may not contain one.
      expect(drawer.querySelector('[data-tunable="drift-threshold"]')).toBeTruthy();
    });

    it('gives the open node room, and the rest of the picture moves out of its way', async () => {
      render(<OperatorPanel {...panelProps(config, runtime)} />);
      await act(async () => {
        vi.advanceTimersByTime(2100);
      });
      const flow = buildFlow(config.shell, topology);
      const opened = 'monitor';
      const band = flow.nodes.find((node) => node.id === opened)?.band;
      // A node after it in the same band, and one in a band below: the two directions
      // the reflow has to work in.
      const rank = flow.nodes.find((node) => node.id === opened)?.rank ?? 0;
      const along = flow.nodes.find((node) => node.band === band && node.rank > rank);
      const below = flow.nodes.find((node) => node.band !== band && node.rank === 0);
      if (!along || !below) throw new Error('the chart has no neighbour to be moved aside');

      const restingOpen = boxOf(opened);
      const restingAlong = boxOf(along.id);
      const restingBelow = boxOf(below.id);
      const canvas = () => document.querySelector('[data-testid="flow-chart"]') as HTMLElement;
      // Height, not width: the band a node opens in may not be the widest band, but
      // every band below it moves down, so the canvas always gets taller.
      const restingCanvas = Number.parseFloat(canvas().style.height);

      await open(opened);
      expect(boxOf(opened).width).toBeGreaterThan(restingOpen.width);
      expect(boxOf(opened).height).toBeGreaterThan(restingOpen.height);
      // Moved along, not covered: the neighbour's left edge is past the open node's
      // right edge, and it is still the same size it was.
      expect(boxOf(along.id).left).toBeGreaterThanOrEqual(boxOf(opened).left + boxOf(opened).width);
      expect(boxOf(along.id).width).toBe(restingAlong.width);
      expect(boxOf(along.id).left).toBeGreaterThan(restingAlong.left);
      // And the canvas grew to hold it rather than clipping it.
      expect(Number.parseFloat(canvas().style.height)).toBeGreaterThan(restingCanvas);
      expect(boxOf(below.id).top).toBeGreaterThan(restingBelow.top);
      expect(boxOf(below.id).left).toBe(restingBelow.left);

      // Closing puts everything back where the reader learned it was.
      await act(async () => {
        fireEvent.click(screen.getByTestId('drawer-close'));
      });
      expect(boxOf(opened)).toEqual(restingOpen);
      expect(boxOf(along.id)).toEqual(restingAlong);
      expect(boxOf(below.id)).toEqual(restingBelow);
      expect(screen.queryByTestId('flow-drawer')).toBeNull();
    });

    it('leaves the keyboard on the node it opened, and back on it when it closes', async () => {
      render(<OperatorPanel {...panelProps(config, runtime)} />);
      await act(async () => {
        vi.advanceTimersByTime(2100);
      });
      await open('scheduler');
      // The button that was focused no longer exists; without this the focus ring falls
      // to the document and a keyboard reader is returned to the top of the tab.
      expect(document.activeElement?.getAttribute('data-flow-node')).toBe('scheduler');
      await act(async () => {
        fireEvent.click(screen.getByTestId('drawer-close'));
      });
      expect(document.activeElement?.getAttribute('data-flow-node')).toBe('scheduler');
      expect(document.activeElement?.tagName).toBe('BUTTON');
    });

    it('opens it below the table in the list view, which has nowhere to expand into', async () => {
      render(<OperatorPanel {...panelProps(config, runtime)} />);
      await act(async () => {
        vi.advanceTimersByTime(2100);
      });
      await act(async () => {
        fireEvent.click(screen.getByTestId('view-toggle'));
      });
      await act(async () => {
        fireEvent.click(
          document.querySelector('[data-operator-component="monitor"] .link-button') as HTMLElement,
        );
      });
      const drawer = screen.getByTestId('flow-drawer');
      expect(drawer.getAttribute('data-drawer-where')).toBe('below');
      // Same account, same controls: the list carries everything the chart does (FR-015).
      expect(drawer.getAttribute('data-drawer-component')).toBe('monitor');
      expect(drawer.querySelector('[data-tunable="drift-threshold"]')).toBeTruthy();
    });
  });

  /**
   * Feature 114: the controls. Nothing below asserts what a control *said* it did —
   * every assertion is either about a component's own reported state or about the
   * refusal the surface published, because a panel that could be believed on its own
   * word is the failure mode this tab exists to avoid.
   */
  describe('the controls, at the node that owns them (feature 114)', () => {
    const drawerFor = async (id: string) => {
      await act(async () => {
        fireEvent.click(document.querySelector(`[data-flow-node="${id}"]`) as HTMLElement);
      });
      return screen.getByTestId('flow-drawer');
    };

    it('marks exactly the nodes the surface says take controls, and no others', async () => {
      render(<OperatorPanel {...panelProps(config, runtime)} />);
      await act(async () => {
        vi.advanceTimersByTime(2100);
      });
      const marked = [...document.querySelectorAll('[data-has-controls]')]
        .map((mark) => mark.getAttribute('data-has-controls'))
        .sort();
      // The set is the surface's, not this panel's: the same declarations it enforces
      // against, fetched over the seam.
      const offered = [
        ...new Set([
          config.operator.demand.target,
          ...config.operator.tunables.map((tunable) => tunable.target),
          ...config.operator.events.map((event) => event.target),
        ]),
      ].sort();
      expect(marked).toEqual(offered);
      expect(marked.length).toBeGreaterThan(0);
      expect(screen.getByText(new RegExp(`${offered.length} components take controls`))).toBeTruthy();
    });

    it('a tuning set here changes what the monitor reports it is scoring against', async () => {
      render(<OperatorPanel {...panelProps(config, runtime)} />);
      await act(async () => {
        vi.advanceTimersByTime(2100);
      });
      const drawer = await drawerFor('monitor');
      const inForce = () =>
        drawer.querySelector('[data-tuning-in-force="drift-threshold"]')?.textContent ?? '';
      // What the monitor reported, before anything was asked of it.
      expect(inForce()).toContain(String(config.monitor.threshold_m_per_s));

      const slider = drawer.querySelector('[data-tunable="drift-threshold"] input[type="range"]');
      await act(async () => {
        fireEvent.change(slider as HTMLElement, { target: { value: '0.5' } });
      });
      // Dragging asks for nothing: the in-force figure has not moved, because the
      // monitor has not been told anything.
      expect(inForce()).toContain(String(config.monitor.threshold_m_per_s));

      await act(async () => {
        fireEvent.click(drawer.querySelector('[data-tuning-send="drift-threshold"]') as HTMLElement);
      });
      await act(async () => {
        vi.advanceTimersByTime(2100);
      });
      // And now it has moved — in the monitor's own heartbeat, which is the only
      // place this panel reads it from.
      expect(inForce()).toContain('0.5');
      expect(runtime.monitor.threshold()).toBe(0.5);
    });

    it('a tuning outside the bound is refused in the surface’s words, and changes nothing', async () => {
      render(<OperatorPanel {...panelProps(config, runtime)} />);
      await act(async () => {
        vi.advanceTimersByTime(2100);
      });
      const drawer = await drawerFor('monitor');
      // Typed rather than dragged: the slider cannot leave the bound, and the entry
      // beside it can — which is exactly why the surface enforces the bound and the
      // panel does not.
      await act(async () => {
        fireEvent.change(drawer.querySelector('.flow-tuner-entry') as HTMLElement, {
          target: { value: '40' },
        });
      });
      await act(async () => {
        fireEvent.click(drawer.querySelector('[data-tuning-send="drift-threshold"]') as HTMLElement);
      });
      expect(screen.getByTestId('command-refusal').textContent).toMatch(
        /outside the declared bound for drift threshold/,
      );
      expect(runtime.monitor.threshold()).toBe(config.monitor.threshold_m_per_s);
    });

    it('a preset demands only what it names, and the platform is left holding the rest', async () => {
      render(<OperatorPanel {...panelProps(config, runtime)} />);
      await act(async () => {
        vi.advanceTimersByTime(2100);
        for (let i = 0; i < 20; i++) runtime.clock.tickOnce();
      });
      const drawer = await drawerFor('platform');
      // The sliders are bounded by what the platform reported, not by a number here.
      const speed = drawer.querySelector('[data-demand-field="speed"] input[type="range"]');
      expect(speed?.getAttribute('max')).toBe(String(config.platform.limits.maximum_speed_m_per_s));
      const courseBefore = runtime.platform.state().current.course_degrees;

      await act(async () => {
        fireEvent.click(drawer.querySelector('[data-demand-preset="all-stop"]') as HTMLElement);
      });
      await act(async () => {
        runtime.clock.tickOnce();
      });
      const demanded = runtime.platform.state().demanded;
      expect(demanded?.speed_m_per_s).toBe(0);
      // Nothing was said about the course, so the platform holds the one it had:
      // the preset named a speed and the platform did the rest of the deciding.
      expect(demanded?.course_degrees).toBeCloseTo(courseBefore, 6);
      expect(within(drawer).getByTestId('demand-said').textContent).toMatch(/published, not applied/);
    });

    it('a prompted run is answered by the scheduler, in the scheduler’s drawer', async () => {
      render(<OperatorPanel {...panelProps(config, runtime)} />);
      await act(async () => {
        vi.advanceTimersByTime(2100);
      });
      const drawer = await drawerFor('scheduler');
      expect(drawer.querySelector('[data-testid="scheduler-decision"]')).toBeNull();

      await act(async () => {
        fireEvent.click(
          drawer.querySelector(`[data-event-send="${config.scheduler.prompt_event}"]`) as HTMLElement,
        );
      });
      // The decision arrived on the telemetry topic, from the scheduler. The panel
      // draws what it heard; the button's own answer said only that it published.
      const decision = within(screen.getByTestId('flow-drawer')).getByTestId('scheduler-decision');
      expect(decision.textContent).toMatch(/accepted/);
      expect(decision.textContent).toMatch(/operator prompt/);

      // Asked again inside the minimum interval, the scheduler declines — and the
      // panel shows the decline as the ordinary outcome it is.
      await act(async () => {
        fireEvent.click(
          screen
            .getByTestId('flow-drawer')
            .querySelector(`[data-event-send="${config.scheduler.prompt_event}"]`) as HTMLElement,
        );
      });
      expect(
        within(screen.getByTestId('flow-drawer')).getByTestId('scheduler-decision').textContent,
      ).toMatch(/minimum-interval/);
    });

    it('a prompted now-cast lands a holding, and the coverage stack draws it', async () => {
      render(<OperatorPanel {...panelProps(config, runtime)} />);
      await act(async () => {
        vi.advanceTimersByTime(2100);
        for (let i = 0; i < 5; i++) runtime.clock.tickOnce();
      });
      const stack = () =>
        document.querySelector('[data-flow-node="coverage-store"] [data-testid="holding-stack"]');
      // Provisioning published an archive and a first now-cast, and the store serves
      // their sizes: the stack drew nothing at all before this was fixed, because the
      // panel was reading a byte length off an announcement that has never carried one.
      const before = stack()?.children.length ?? 0;
      expect(before).toBeGreaterThan(0);
      const nowcastId = () =>
        runtime.store.holdings().find((holding) => holding.era === 'nowcast')?.holding_id;
      const idBefore = nowcastId();
      expect(idBefore).toBeDefined();

      const drawer = await drawerFor('env-generator');
      await act(async () => {
        fireEvent.click(
          drawer.querySelector(`[data-event-send="${config.env_generator.prompt_event}"]`) as HTMLElement,
        );
      });
      await act(async () => {
        vi.advanceTimersByTime(2100);
      });
      // A genuine new now-cast, superseding the one before it rather than piling up
      // beside it: there is one now-cast at a time, which is why the stack keeps its
      // height and changes its content.
      expect(nowcastId()).toBeDefined();
      expect(nowcastId()).not.toBe(idBefore);
      expect(stack()?.children.length ?? 0).toBe(before);

      // A forecast instance DOES accumulate, so asking the scheduler for a run is
      // what proves the stack follows the store after the page has loaded rather
      // than only at load. Planting against the announcement path is what showed
      // the now-cast alone could not prove it: one now-cast supersedes another, so
      // the picture looked the same either way.
      const scheduler = await drawerFor('scheduler');
      await act(async () => {
        fireEvent.click(
          scheduler.querySelector(`[data-event-send="${config.scheduler.prompt_event}"]`) as HTMLElement,
        );
      });
      await act(async () => {
        vi.advanceTimersByTime(2100);
      });
      expect(runtime.store.holdings().length).toBeGreaterThan(before);
      expect(stack()?.children.length ?? 0).toBeGreaterThan(before);
    });

    it('a prompted fault is drawn as a fault somebody asked for, at both ends of the seam', async () => {
      render(<OperatorPanel {...panelProps(config, runtime)} />);
      await act(async () => {
        vi.advanceTimersByTime(2100);
        for (let i = 0; i < 90; i++) runtime.clock.tickOnce();
      });
      const drawer = await drawerFor('sensors');
      const refusedBefore = runtime.ingest.refused;
      await act(async () => {
        fireEvent.click(
          drawer.querySelector(`[data-event-send="${config.sensors.fault_event}"]`) as HTMLElement,
        );
      });
      await act(async () => {
        vi.advanceTimersByTime(2100);
      });
      // The seam refused it — that is the component's answer, not the button's.
      expect(runtime.ingest.refused).toBe(refusedBefore + 1);
      // The picture survived it. This is half the reason the fault control is worth
      // having: the first malformed sample put a string where a result belonged, the
      // sensors' spark called toFixed on it, and the flow chart went down — found by
      // driving the built page, never by a test. Now the panel draws only from
      // messages that pass their master, and says how many it refused.
      expect(document.querySelectorAll('[data-flow-node]').length).toBe(
        config.shell.components.length,
      );
      expect(screen.getByText(/message\(s\) refused by their master and not drawn/)).toBeTruthy();
      // And the sensors' own face says the fault was asked for, so nobody reads it as
      // an instrument that has started lying by itself.
      expect(
        document.querySelector('[data-flow-node="sensors"] [data-testid="sensors-faults"]')?.textContent,
      ).toMatch(/published on request/);
      // Two nodes along, the ingest's own figures moved.
      expect(document.querySelector('[data-flow-node="ingest"]')?.textContent).toContain('refused');
    });

    it('the burst step advances the clock by the number the surface declared', async () => {
      render(<OperatorPanel {...panelProps(config, runtime)} />);
      await act(async () => {
        vi.advanceTimersByTime(2100);
      });
      const before = runtime.clock.currentTick();
      await act(async () => {
        fireEvent.click(screen.getByTestId('step-burst-button'));
      });
      expect(runtime.clock.currentTick()).toBe(before + config.operator.step.maximum_ticks);
    });
  });
});
