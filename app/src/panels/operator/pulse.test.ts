// @vitest-environment jsdom
/**
 * The wires' lights, held against the real edge set rather than a fixture: the
 * expectations below are computed from `contracts/topology.json` and the shell
 * document, so a change to the wiring moves the assertion with it rather than
 * leaving a green test that describes last month's picture.
 */
import { describe, expect, it } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun } from '../../generated/types.js';
import { topology } from '../../generated/topology.js';
import { buildFlow, type FlowEdge } from './graph.js';
import { PulseBoard, edgeKey, edgesCarrying, lingerSweeps, topicsWithSeveralSenders } from './pulse.js';

const config = runConfigDocument as ConfigRun;
const flow = buildFlow(config.shell, topology);

/** A wire in the document, as the canvas draws it, so the board writes on real DOM. */
function wire(key: string): SVGElement {
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  element.setAttribute('data-flow-pulse', key);
  document.body.append(element);
  return element;
}

describe('which wires a message runs down', () => {
  it('lights the wires the topology says carry the topic, and no others', () => {
    const topic = 'obs/platform-a/temperature-050m';
    const lit = edgesCarrying(flow.edges, topic);
    expect(lit.length).toBeGreaterThan(0);
    // Derived from the same master the picture is: every wire whose label matches, and
    // nothing else. A wire lit for a topic it does not carry is the picture lying.
    const expected = flow.edges
      .filter((edge) => edge.kind === 'topic' && edge.label === topic)
      .map(edgeKey);
    expect(lit.sort()).toEqual(expected.sort());
  });

  it('a wildcard subscription lights the wire that carries the wildcard', () => {
    // obs/ownship/+ is drawn as one wire per subscriber, and a concrete ownship
    // reading is what actually crosses it.
    const lit = edgesCarrying(flow.edges, 'obs/ownship/depth');
    expect(lit.length).toBeGreaterThan(0);
    expect(lit.every((key) => key.endsWith(':obs/ownship/+'))).toBe(true);
  });

  it('a port never lights, whatever crosses the broker', () => {
    const ports = flow.edges.filter((edge) => edge.kind === 'port');
    expect(ports.length).toBeGreaterThan(0);
    const everyTopic = topology.topics.map((entry) => entry.topic);
    const everLit = new Set(everyTopic.flatMap((topic) => edgesCarrying(flow.edges, topic)));
    // Not "no port lit in this run" — no port can ever light, over every topic the
    // topology knows. A coupling carries no broker traffic; a light on one would be
    // the picture inventing traffic that does not exist.
    for (const port of ports) expect(everLit.has(edgeKey(port))).toBe(false);
  });

  it('and it is the kind that excludes it, not the shape of its label', () => {
    // The check above passes against today's picture for a reason that is nearly an
    // accident: every declared port is labelled in prose, so no topic could match one
    // anyway. Planted here is the port that would slip through — labelled exactly like
    // the topic beside it — because a check that cannot fail is not a check.
    const port: FlowEdge = {
      from: 'env-generator',
      to: 'sensors',
      kind: 'port',
      label: 'obs/platform-a/temperature-050m',
    };
    const wire: FlowEdge = { ...port, from: 'sensors', to: 'ingest', kind: 'topic' };
    expect(edgesCarrying([port, wire], 'obs/platform-a/temperature-050m')).toEqual([edgeKey(wire)]);
  });

  it('reports how many wires a message lit, and most messages light none', () => {
    // The figure the panel needs to tell a dark picture from a broken one. Every topic
    // the wiring declares is put through it, and the ones that light nothing are named
    // by the two lists that already exist rather than by a list here — this is the fact
    // that made the chart look asleep at real time, so it is pinned rather than assumed.
    const board = new PulseBoard(flow.edges, 3);
    const dark = topology.topics
      .map((entry) => entry.topic)
      .filter((topic) => board.mark(topic, 'fading') === 0);
    const accountedFor = new Set([...flow.suppressed, ...flow.topicsTerminal]);
    for (const topic of dark) expect(accountedFor.has(topic)).toBe(true);
    // Not a vacuous pass: something does light, and something does not.
    expect(dark.length).toBeGreaterThan(0);
    expect(dark.length).toBeLessThan(topology.topics.length);
    // The one that crosses on every tick at real time, and draws nothing: the platform
    // reports its state to this display and to nothing else in the picture.
    expect(dark).toContain('ctl/platform/state');
  });

  it('names the topics whose lights are an approximation, from the wiring', () => {
    // The panel says this sentence on screen, so the list had better be the wiring's
    // and not a phrase someone typed. Recomputed here from the topology itself.
    const fromTopology = topology.topics
      // The plane is not drawn as edges, so it has no lights to approximate: every
      // component publishes a heartbeat, and a suppressed filter draws no wire at all.
      .filter((entry) => !flow.suppressed.includes(entry.topic))
      .filter((entry) => {
        const senders = entry.publishers.filter(
          (publisher) =>
            config.shell.components.some((component) => component.id === publisher) &&
            entry.subscribers.some(
              (subscriber) =>
                subscriber !== publisher &&
                config.shell.components.some((component) => component.id === subscriber),
            ),
        );
        return senders.length > 1;
      })
      .map((entry) => entry.topic);
    expect(topicsWithSeveralSenders(flow.edges).sort()).toEqual(fromTopology.sort());
  });
});

describe('what a lit wire says', () => {
  const edges: readonly FlowEdge[] = [
    { from: 'sensors', to: 'ingest', kind: 'topic', label: 'obs/#' },
    { from: 'env-generator', to: 'sensors', kind: 'port', label: 'world-sampler port' },
  ];
  const key = edgeKey(edges[0]);
  /**
   * The beats a fading light gets, worked out the way the panel works it out and from
   * the fade the shell document declares — not a number typed here, which would agree
   * with the configuration only until somebody changed it. The sweep is the panel's
   * one-second beat.
   */
  const LINGER = lingerSweeps(config.shell.flow.pulse.fade_ms, 1000);

  it('a message lights the wire, and a second message inside the fade lights it again', () => {
    const board = new PulseBoard(edges, LINGER);
    const element = wire(key);
    board.attach(key, element);

    board.mark('obs/platform-a/salinity-050m', 'fading');
    expect(element.getAttribute('data-pulse')).toBe('fading');
    const first = element.getAttribute('data-pulse-turn');
    expect(first).toBeTruthy();

    // The restart. Writing 'fading' over 'fading' changes no computed animation and
    // the second message would be invisible — a wire carrying a stream would light
    // once and then look idle. The alternating keyframe name is what prevents it, so
    // it is asserted rather than assumed.
    board.mark('obs/platform-a/salinity-050m', 'fading');
    expect(element.getAttribute('data-pulse')).toBe('fading');
    expect(element.getAttribute('data-pulse-turn')).not.toBe(first);
  });

  it('an accelerated clock holds the light on instead of restarting it', () => {
    const board = new PulseBoard(edges, LINGER);
    const element = wire(key);
    board.attach(key, element);

    board.mark('obs/a/b', 'held');
    expect(element.getAttribute('data-pulse')).toBe('held');
    // No keyframe: a held light is not animating, which is the whole point of it.
    expect(element.getAttribute('data-pulse-turn')).toBeNull();

    board.mark('obs/a/b', 'held');
    expect(element.getAttribute('data-pulse')).toBe('held');
    expect(element.getAttribute('data-pulse-turn')).toBeNull();
  });

  it('a held light goes out on the sweep that finds the wire quiet, and not before', () => {
    const board = new PulseBoard(edges, LINGER);
    const element = wire(key);
    board.attach(key, element);

    board.mark('obs/a/b', 'held');
    board.settle();
    // Marked inside the beat that just closed: still lit. A light cleared on the sweep
    // that follows the message it announced is a light nobody sees.
    expect(element.getAttribute('data-pulse')).toBe('held');

    board.settle();
    expect(element.hasAttribute('data-pulse')).toBe(false);
    expect(element.hasAttribute('data-pulse-turn')).toBe(false);
  });

  it('a fading light is given the beats its fade needs, and goes out after them', () => {
    const board = new PulseBoard(edges, LINGER);
    const element = wire(key);
    board.attach(key, element);

    board.mark('obs/a/b', 'fading');
    // The fade outlasts a sweep now, and the attribute is what runs it: taken away
    // mid-fade the light does not finish fading, it vanishes at whatever opacity it had
    // reached. So it survives every beat it was owed — this is the assertion that the
    // 2 s fade and the 1 s sweep were reconciled rather than left to collide.
    for (let beat = 0; beat < LINGER; beat++) {
      board.settle();
      expect(element.getAttribute('data-pulse')).toBe('fading');
    }
    board.settle();
    expect(element.hasAttribute('data-pulse')).toBe(false);
  });

  it('the beats a fade is given outlast the fade itself', () => {
    // The property that matters, stated against the two declared numbers rather than
    // against the count: whatever the fade is set to, the light survives long enough
    // for it to finish. At 500 ms this was true without anybody arranging it; at 2 s it
    // is true because the linger is derived.
    const sweepMs = 1000;
    expect(lingerSweeps(config.shell.flow.pulse.fade_ms, sweepMs) * sweepMs).toBeGreaterThan(
      config.shell.flow.pulse.fade_ms,
    );
    // And it holds for fades either side of a sweep, not just today's.
    for (const fadeMs of [1, 250, 500, 999, 1000, 1001, 2000, 5500]) {
      expect(lingerSweeps(fadeMs, sweepMs) * sweepMs).toBeGreaterThan(fadeMs);
    }
  });

  it('a fresh message renews the beats, so a busy wire is never cut off', () => {
    const board = new PulseBoard(edges, LINGER);
    const element = wire(key);
    board.attach(key, element);

    board.mark('obs/a/b', 'fading');
    for (let beat = 0; beat < LINGER * 2; beat++) {
      board.settle();
      board.mark('obs/a/b', 'fading');
    }
    board.settle();
    expect(element.getAttribute('data-pulse')).toBe('fading');
  });

  it('writes nothing on a wire nobody is drawing', () => {
    const board = new PulseBoard(edges, LINGER);
    const element = wire(key);
    board.attach(key, element);
    board.attach(key, null);
    board.mark('obs/a/b', 'fading');
    expect(element.hasAttribute('data-pulse')).toBe(false);
  });
});
