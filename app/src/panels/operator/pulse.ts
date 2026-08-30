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
 *   redraws twenty faces and fifty wires for a light that lasts half a second, and at
 *   an accelerated rate it does that dozens of times a second.
 * - **It does not time anything itself.** The fade is a CSS animation whose duration
 *   is the declared `fade_ms`, and going out again is the panel's existing sweep:
 *   a wire that carried nothing since the last sweep is cleared. So there is no timer
 *   here, no `Date.now`, and nothing to keep in step with the clock.
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
  /** Which wires carried something since the last sweep. */
  private readonly marked = new Set<string>();
  /**
   * Which keyframe name each wire is animating under. A CSS animation restarts when
   * its name changes and not when the same value is written again, so a wire that
   * pulses twice inside one fade alternates between two identical keyframe sets. The
   * alternative is forcing a reflow, which is a layout the picture does not need.
   */
  private readonly turn = new Map<string, 'a' | 'b'>();

  constructor(private readonly edges: readonly FlowEdge[]) {}

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
      this.marked.add(key);
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
   * A wire that carried nothing since the last sweep goes out. Called from the panel's
   * existing one-second sweep rather than from a timer of its own: a fade has already
   * finished by the time a sweep reaches it, and a held light going out one sweep
   * after the traffic stopped is the display being late, not the display lying.
   */
  settle(): void {
    for (const [key, element] of this.elements) {
      if (this.marked.has(key)) continue;
      element.removeAttribute('data-pulse');
      element.removeAttribute('data-pulse-turn');
    }
    this.marked.clear();
  }

  private carrying(topic: string): readonly string[] {
    const known = this.carried.get(topic);
    if (known) return known;
    const resolved = edgesCarrying(this.edges, topic);
    this.carried.set(topic, resolved);
    return resolved;
  }
}
