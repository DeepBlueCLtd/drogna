/**
 * The flow chart's pulses (SRD-v2 FR-57): which wires a message ran down, and for how
 * long the picture says so.
 *
 * graph.ts has carried the sentence *"a topic edge carries traffic and can pulse; a
 * port edge never can"* since feature 113, and until now nothing pulsed. This is that
 * sentence made true. Three things it deliberately does not do:
 *
 * - **It does not claim to know who sent a message.** The seam hands a subscriber a
 *   topic and a payload and nothing else (seam/transport.ts), so what lights is every
 *   wire the topology says carries that topic. For all but a couple of the topics that
 *   is exactly one wire; where a topic has two publishers it is both of theirs, and the
 *   panel names those topics on screen — from `topicsWithSeveralSenders` below, not
 *   from a list here — rather than letting a reader assume a precision the broker never
 *   offered.
 * - **It does not re-render React.** A message crossing the broker writes one
 *   attribute on one path element. The alternative — a piece of state per message —
 *   redraws twenty faces and fifty wires for a light that lasts a second or two, and at
 *   an accelerated rate it does that dozens of times a second.
 * - **It does not time anything itself.** The fade is a CSS animation whose duration
 *   is the declared `fade_ms`, and going out again is the panel's existing sweep, which
 *   tells this module how many of its beats a light must be given rather than being
 *   asked how long a beat is. So there is no timer here, no `Date.now`, and nothing to
 *   keep in step with the clock.
 *
 * Above `hold_above_rate` the light is *held* rather than re-lit: a highlight
 * restarted dozens of times a second is a flicker, and a flicker says less than a
 * steady light does. Which of the two is in force comes from the rate the clock
 * reports about itself, so the picture changes when the clock does.
 */
import { topicMatchesFilter } from '../messages/topic-match.js';
import type { FlowEdge } from './graph.js';

/**
 * A wire's identity, and the one place its shape is decided. Unique because buildFlow
 * admits one edge per (publisher, subscriber, topic); the `from->to` attribute the
 * canvas already carried is not, because two topics may join the same pair.
 */
export function edgeKey(edge: { from: string; to: string; label: string }): string {
  return `${edge.from}->${edge.to}:${edge.label}`;
}

/**
 * Which wires carry a topic. Ports are excluded by kind rather than by name: a
 * coupling carries no broker traffic, so no message can ever have crossed one.
 */
export function edgesCarrying(edges: readonly FlowEdge[], topic: string): string[] {
  return edges
    .filter((edge) => edge.kind === 'topic' && topicMatchesFilter(edge.label, topic))
    .map(edgeKey);
}

/**
 * The topics more than one component publishes, and therefore the topics whose lights
 * are an honest approximation rather than the truth: a message on one of these lights
 * every publisher's wire, because the seam never said which of them sent it. Derived
 * from the edge set rather than listed, so the panel's sentence about it cannot go
 * stale behind a change to the wiring.
 */
export function topicsWithSeveralSenders(edges: readonly FlowEdge[]): string[] {
  const senders = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.kind !== 'topic') continue;
    const known = senders.get(edge.label) ?? new Set<string>();
    known.add(edge.from);
    senders.set(edge.label, known);
  }
  return [...senders.entries()].filter(([, from]) => from.size > 1).map(([topic]) => topic);
}

/**
 * How many beats of a sweep a fading light must be given, for a declared fade and a
 * declared sweep. Here rather than at the call site so the rule is one thing that can
 * be held by a test, and so the two numbers meet in one place.
 *
 * A fade shorter than a sweep still gets one beat: a light is never put out on the same
 * beat it was lit, or a message that arrived just before a sweep would never be seen at
 * all. The extra beat is for the fade and the sweep being unsynchronised host timers —
 * the sweep that ought to be the last one can arrive a few milliseconds early, and a
 * fade cut off does not end gently (see `settle`).
 */
export function lingerSweeps(fadeMs: number, sweepMs: number): number {
  return Math.max(1, Math.ceil(fadeMs / sweepMs)) + 1;
}

/**
 * How a lit wire is lit. `fading` is the ordinary case, a light per message dying over
 * the declared window; `held` is what an accelerated clock gets, a light that stays on
 * while traffic runs down the wire. Which one is in force is the clock's business and
 * arrives as an argument — this module decides nothing about time.
 */
export type PulseKind = 'fading' | 'held';

/**
 * The wires, and what each of them is currently saying.
 *
 * Held outside React on purpose (see the note above). Everything it writes is an
 * attribute a stylesheet reads and a test can query — nothing here computes a colour,
 * a width or an opacity, because a second opinion about the palette is how the
 * greyscale proof stops meaning anything.
 */
export class PulseBoard {
  private readonly elements = new Map<string, SVGElement>();
  /** Memoised: the topics are a fixed couple of dozen strings, matched once each. */
  private readonly carried = new Map<string, readonly string[]>();
  /**
   * How many more sweeps each lit wire is owed before it may be put out. A held light
   * is owed one — it means "traffic is running down this wire", and the first quiet
   * sweep makes that false. A fading light is owed enough of them that its fade cannot
   * still be running, which is `lingerSweeps` and is why that number exists: with a
   * fade longer than a sweep, clearing on the first quiet beat would take the attribute
   * off mid-animation and snap the light out at whatever opacity it had reached.
   */
  private readonly owed = new Map<string, number>();
  /**
   * Which keyframe name each wire is animating under. A CSS animation restarts when
   * its name changes and not when the same value is written again, so a wire that
   * pulses twice inside one fade alternates between two identical keyframe sets. The
   * alternative is forcing a reflow, which is a layout the picture does not need.
   */
  private readonly turn = new Map<string, 'a' | 'b'>();

  /**
   * `linger` is how many beats of the caller's sweep a fading light is given, from
   * `lingerSweeps` above. It arrives as a number because the caller owns the sweep:
   * this module knows what a light means and nothing about how long anything takes.
   */
  constructor(
    private readonly edges: readonly FlowEdge[],
    private readonly linger: number,
  ) {}

  /** The canvas hands over each drawn wire, and takes it back when it unmounts. */
  attach(key: string, element: SVGElement | null): void {
    if (element) this.elements.set(key, element);
    else this.elements.delete(key);
  }

  /**
   * A message crossed the broker on `topic`, and the wires that carry it light. Which
   * kind of light is the clock's verdict, not this module's.
   */
  mark(topic: string, kind: PulseKind): void {
    for (const key of this.carrying(topic)) {
      this.owed.set(key, kind === 'held' ? 1 : this.linger);
      const element = this.elements.get(key);
      if (!element) continue;
      if (kind === 'held') {
        // Written only when it changes: at an accelerated rate this is the hot path,
        // and the whole point of holding is not to touch the wire dozens of times.
        if (element.getAttribute('data-pulse') !== 'held') {
          element.setAttribute('data-pulse', 'held');
          element.removeAttribute('data-pulse-turn');
        }
        continue;
      }
      const next = this.turn.get(key) === 'a' ? 'b' : 'a';
      this.turn.set(key, next);
      element.setAttribute('data-pulse', 'fading');
      element.setAttribute('data-pulse-turn', next);
    }
  }

  /**
   * One beat of the caller's sweep: a wire that has run out of the beats it was owed
   * goes out. Called from the panel's existing sweep rather than from a timer of its
   * own — one beat darkens a component whose liveness window lapsed and a wire whose
   * traffic stopped, and both are the same statement: nothing arrived.
   *
   * A held light going out a beat after the traffic stopped is the display being late,
   * not the display lying. A fading light is owed more beats than that, and the reason
   * is worth stating: the fade is a CSS animation with `forwards`, so removing the
   * attribute mid-fade does not end the fade gently — it takes the animation away and
   * the light snaps back to invisible from wherever it had got to. Before the fade was
   * lengthened this could not happen, because every fade was over before the sweep that
   * followed the sweep it began in.
   */
  settle(): void {
    // Over what is owed rather than over what is drawn: a wire that lit and then left
    // the document — the list view, a re-render — would otherwise keep its debt for
    // ever and be handed it back if it returned.
    for (const [key, left] of this.owed) {
      if (left > 0) {
        this.owed.set(key, left - 1);
        continue;
      }
      this.owed.delete(key);
      const element = this.elements.get(key);
      element?.removeAttribute('data-pulse');
      element?.removeAttribute('data-pulse-turn');
    }
  }

  private carrying(topic: string): readonly string[] {
    const known = this.carried.get(topic);
    if (known) return known;
    const resolved = edgesCarrying(this.edges, topic);
    this.carried.set(topic, resolved);
    return resolved;
  }
}
