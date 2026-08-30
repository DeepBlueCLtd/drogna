/**
 * The traffic display's pure half (feature 114, FR-66).
 *
 * Lanes are the declared top-level namespaces of the derived topology artefact —
 * structure, on FR-24's rule — and marks are received messages and nothing else.
 *
 * **Nothing here reads a clock, and that is the design rather than an accident.** A mark
 * is placed by its position in the receive order, not by how long ago it arrived, so the
 * display advances when — and only when — a message arrives. FR-66 forbids animation
 * while the broker is silent, because a display that keeps moving with nothing arriving
 * is asserting traffic that does not exist (Constitution VII), and the cheapest way to
 * be unable to do that is to hold no time at all.
 *
 * The consequence is worth stating because it is the thing a reader sees: a quiet lane
 * does not freeze in place while a busy one moves. Every mark's offset is measured
 * against the newest message *anywhere*, so stopping the sensors drains the observation
 * lane rightward-to-empty as the clock lane goes on beating — which is SC-01 watched
 * rather than read off a counter.
 *
 * **What "undeclared" means here, and why it is a topic and not a namespace.** The first
 * draft split lanes by namespace alone and treated a namespace no entry declares as the
 * finding. That fault cannot happen: the broker's role rules confine every publisher to
 * declared prefixes, so a wholly new first segment is refused at the seam and never
 * reaches a subscriber. The fault that *can* happen — and that the topic tree has always
 * drawn — is a topic nobody declared inside a namespace somebody did:
 * `obs/platform-a/mystery`. So a mark's lane is its namespace when the artefact declares
 * its topic, and an *undeclared* lane beside that namespace when it does not. One rule
 * covers a rogue namespace too, if the broker ever admits one.
 */

/** One received message, as the display holds it. */
export interface TrafficMark {
  /** Position in the receive order, from 1. The display's only ordinate. */
  readonly seq: number;
  readonly topic: string;
  /** Which lane it lands in: `laneIdFor`'s answer. */
  readonly lane: string;
  /** Refused by the master its topic declares, or by there being no master. */
  readonly refused: boolean;
}

export interface TrafficLane {
  /** The lane's identity, and what the display keys marks by. */
  readonly id: string;
  /** The namespace this lane belongs to, declared or not. */
  readonly namespace: string;
  /** Whether the topology artefact declares the topics that land here. */
  readonly declared: boolean;
  /** The marks still inside the window, oldest first. */
  readonly marks: readonly TrafficMark[];
}

/** The suffix that makes an undeclared lane's id distinct from its namespace's. */
const UNDECLARED = '—undeclared';

/** A topic's namespace. The first segment, and never a guess when there is not one. */
export function namespaceOf(topic: string): string {
  const first = topic.split('/')[0];
  return first.length > 0 ? first : topic;
}

/**
 * The topics the artefact declares as *places*. Entries carrying a wildcard are
 * permissions rather than places — the topic tree has drawn that distinction since
 * feature 103, and the two displays read the same statement so they cannot disagree.
 */
export function declaredTopics(
  topics: readonly { readonly topic: string }[],
): ReadonlySet<string> {
  return new Set(
    topics.map((entry) => entry.topic).filter((topic) => !topic.includes('#') && !topic.includes('+')),
  );
}

/**
 * The declared lanes, in a stable order. Taken from the artefact's own `namespace`
 * field rather than re-split from the topic, so the display and the tree agree about
 * what a namespace is by reading the same statement.
 */
export function declaredNamespaces(
  topics: readonly { readonly namespace: string }[],
): readonly string[] {
  return [...new Set(topics.map((entry) => entry.namespace))].sort((a, b) => a.localeCompare(b));
}

/** Which lane a received topic lands in, given what the artefact declares. */
export function laneIdFor(topic: string, declared: ReadonlySet<string>): string {
  const namespace = namespaceOf(topic);
  return declared.has(topic) ? namespace : `${namespace}${UNDECLARED}`;
}

/** A lane id read back: which namespace it belongs to, and whether it is the declared one. */
export function laneParts(id: string): { namespace: string; declared: boolean } {
  return id.endsWith(UNDECLARED)
    ? { namespace: id.slice(0, -UNDECLARED.length), declared: false }
    : { namespace: id, declared: true };
}

/**
 * Where a mark sits along its lane, as a fraction from 0 (about to leave) to 1 (newest).
 * Outside [0, 1] the mark has aged out of the window and is not drawn.
 */
export function markOffset(mark: TrafficMark, newestSeq: number, window: number): number {
  if (window <= 0) return 1;
  return 1 - (newestSeq - mark.seq) / window;
}

/**
 * The lanes to draw: every declared namespace, whether or not it has been heard from,
 * plus an undeclared lane for each namespace that has received a topic the artefact does
 * not declare. A declared namespace that has been quiet is drawn empty — it is never
 * absent, because its absence would say the topology does not name it. An undeclared
 * lane, by contrast, exists only because something arrived on it: it is a finding, and a
 * finding drawn before it has happened is an invention.
 */
export function lanesFor(
  namespaces: readonly string[],
  marks: readonly TrafficMark[],
  window: number,
  filter?: string,
): readonly TrafficLane[] {
  // The window is measured against the newest message anywhere, filtered or not: a
  // filter narrows what is drawn, never where the drawn marks sit. Otherwise selecting a
  // node that has gone quiet would slide its stale marks to the right edge and read as
  // fresh traffic on a subtree with none.
  const newestSeq = newestSeqOf(marks);
  const inWindow = marks.filter(
    (mark) => underFilter(mark.topic, filter) && markOffset(mark, newestSeq, window) >= 0,
  );
  const extra = [...new Set(inWindow.map((mark) => mark.lane))]
    .filter((id) => !namespaces.includes(id))
    .sort((a, b) => a.localeCompare(b));
  return [...namespaces, ...extra].map((id) => ({
    id,
    ...laneParts(id),
    marks: inWindow.filter((mark) => mark.lane === id),
  }));
}

/**
 * Whether a topic is inside the tree's current selection. A filter is a path, so it
 * covers the node itself and everything beneath it; no filter covers everything.
 */
export function underFilter(topic: string, filter: string | undefined): boolean {
  if (!filter) return true;
  return topic === filter || topic.startsWith(`${filter}/`);
}

/** The newest sequence number in a set of marks, or 0 when there are none. */
export function newestSeqOf(marks: readonly TrafficMark[]): number {
  return marks.length > 0 ? marks[marks.length - 1].seq : 0;
}
