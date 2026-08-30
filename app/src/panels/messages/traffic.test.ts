/**
 * The traffic display's pure half (feature 114, FR-66).
 *
 * The properties worth asserting are the ones a picture cannot show: that a declared
 * namespace is drawn whether or not it has been heard from, that an undeclared one
 * appears the moment a message lands on it, and that every mark's place is measured
 * against the newest message *anywhere* — which is what makes a stopped sensor drain its
 * lane while the clock lane goes on beating.
 */
import { describe, expect, it } from 'vitest';
import {
  declaredNamespaces,
  declaredTopics,
  laneIdFor,
  laneParts,
  lanesFor,
  markOffset,
  namespaceOf,
  newestSeqOf,
  underFilter,
  type TrafficMark,
} from './traffic.js';

/** The places the artefact declares, in these tests: everything but the rogue topics. */
const PLACES = declaredTopics([
  { topic: 'obs/a' },
  { topic: 'ctl/clock' },
  { topic: 'ctl/c' },
  { topic: 'adv/advisories' },
  { topic: 'obs/+/+' },
]);

function mark(seq: number, topic: string, refused = false): TrafficMark {
  return { seq, topic, lane: laneIdFor(topic, PLACES), refused };
}

describe('the traffic display’s lanes', () => {
  it('reads a topic’s namespace as its first segment, and never guesses at one', () => {
    expect(namespaceOf('obs/platform-a/temperature-050m')).toBe('obs');
    expect(namespaceOf('solitary')).toBe('solitary');
  });

  it('takes its lanes from the artefact’s own namespace field, sorted and unique', () => {
    expect(
      declaredNamespaces([
        { namespace: 'obs' },
        { namespace: 'ctl' },
        { namespace: 'obs' },
        { namespace: 'adv' },
      ]),
    ).toEqual(['adv', 'ctl', 'obs']);
  });

  it('counts only concrete topics as places: a wildcard entry is a permission', () => {
    // The topic tree has drawn that distinction since 103; the two displays read the
    // same statement rather than each deciding for itself.
    expect(PLACES.has('obs/+/+')).toBe(false);
    expect(PLACES.has('obs/a')).toBe(true);
  });

  it('draws a declared namespace that has been quiet, rather than omitting it', () => {
    // An absent lane would say the topology does not name the namespace, which is a
    // different claim from "nothing has arrived on it".
    const lanes = lanesFor(['adv', 'ctl', 'obs'], [mark(1, 'ctl/clock')], 10);
    expect(lanes.map((lane) => lane.namespace)).toEqual(['adv', 'ctl', 'obs']);
    expect(lanes.find((lane) => lane.namespace === 'adv')?.marks).toEqual([]);
  });

  it('grows an undeclared lane when a topic no entry declares arrives (FR-24’s rule)', () => {
    // The realistic fault: a topic nobody declared, inside a namespace somebody did.
    // The broker's role rules make a wholly new first segment unpublishable, so this is
    // the shape the finding actually takes.
    const lanes = lanesFor(['ctl', 'obs'], [mark(1, 'ctl/clock'), mark(2, 'obs/platform-a/mystery', true)], 10);
    expect(lanes.map((lane) => `${lane.namespace}:${lane.declared}`)).toEqual([
      'ctl:true',
      'obs:true',
      'obs:false',
    ]);
    expect(lanes[2].marks.map((entry) => entry.topic)).toEqual(['obs/platform-a/mystery']);
  });

  it('does not draw an undeclared lane before anything has landed in one', () => {
    // A lane drawn ahead of the finding it reports would be an invention.
    const lanes = lanesFor(['ctl', 'obs'], [mark(1, 'ctl/clock')], 10);
    expect(lanes.every((lane) => lane.declared)).toBe(true);
  });

  it('reads a lane id back to the namespace and the declaredness that made it', () => {
    expect(laneParts('obs')).toEqual({ namespace: 'obs', declared: true });
    expect(laneParts(laneIdFor('obs/nope', PLACES))).toEqual({ namespace: 'obs', declared: false });
  });

  it('places every mark against the newest message anywhere, so a quiet lane drains', () => {
    const marks = [mark(1, 'obs/a'), mark(2, 'ctl/clock'), mark(3, 'ctl/clock')];
    // The observation stopped at seq 1; two clock samples later it is two back.
    expect(markOffset(marks[0], newestSeqOf(marks), 4)).toBeCloseTo(0.5);
    expect(markOffset(marks[2], newestSeqOf(marks), 4)).toBe(1);
  });

  it('drops a mark once it has aged past the window, and draws nothing for it', () => {
    const marks = [mark(1, 'obs/a'), mark(2, 'ctl/c'), mark(3, 'ctl/c'), mark(4, 'ctl/c')];
    expect(markOffset(marks[0], 4, 2)).toBeLessThan(0);
    const lanes = lanesFor(['ctl', 'obs'], marks, 2);
    expect(lanes.find((lane) => lane.namespace === 'obs')?.marks).toEqual([]);
  });

  it('keeps a refused mark as refused, so the display and the count agree', () => {
    const lanes = lanesFor(['obs'], [mark(1, 'obs/a', true)], 10);
    expect(lanes[0].marks[0].refused).toBe(true);
  });

  it('filters to a subtree, covering the node itself and everything beneath it', () => {
    expect(underFilter('obs', 'obs')).toBe(true);
    expect(underFilter('obs/ocean/temperature', 'obs')).toBe(true);
    expect(underFilter('observations/x', 'obs')).toBe(false);
    expect(underFilter('ctl/clock', undefined)).toBe(true);
  });

  it('reads a filtered lane against the unfiltered newest, so filtering does not shift marks', () => {
    // Otherwise selecting a quiet node would slide its old marks to the right edge and
    // read as fresh traffic on a subtree that has gone silent.
    const marks = [mark(1, 'obs/a'), mark(2, 'ctl/c'), mark(3, 'ctl/c')];
    const lanes = lanesFor(['ctl', 'obs'], marks, 4, 'obs');
    const obs = lanes.find((lane) => lane.namespace === 'obs');
    expect(obs?.marks).toHaveLength(1);
    expect(markOffset(obs?.marks[0] ?? marks[0], newestSeqOf(marks), 4)).toBeCloseTo(0.5);
  });

  it('is empty when nothing has arrived, and says nothing else', () => {
    const lanes = lanesFor(['ctl', 'obs'], [], 10);
    expect(lanes.every((lane) => lane.marks.length === 0)).toBe(true);
    expect(newestSeqOf([])).toBe(0);
  });
});
