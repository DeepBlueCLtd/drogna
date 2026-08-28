/**
 * The matrix's two sources, derived separately and never mixed.
 *
 * **Structure** comes from the generated artefact and from nothing else: which cells
 * carry a may-publish or may-subscribe mark, which region is forbidden, which components
 * name a topic in their own source. Every function over structure takes the artefact as
 * an argument, so a structural mark that traces to a value written in client source has
 * nowhere to come from (FR-007, SC-004).
 *
 * **Lighting** comes from the loop state's buffers — traffic genuinely received on this
 * page's own subscription — and from nothing else. Lighting is per topic, deliberately:
 * MQTT does not tell a subscriber who published, so a cell-level claim of "this component
 * sent this" would be a guess dressed as an observation. The artefact's `named_by` layer
 * is what narrows a lit topic to the components the traffic will have come from, and the
 * display says that instead of pretending to know (Constitution VII).
 *
 * Traffic on a topic no artefact row matches is not dropped: it is reported as
 * undeclared, because the tree is the authority and the artefact is a claim about it, and
 * a live contradiction is surfaced rather than hidden (FR-012).
 */
import type { Buffers } from "../data/buffers";
import type { DrognaBrokerTopology, TopicEntry } from "../generated/messages/topology";

/**
 * Whether an MQTT topic filter matches a topic.
 *
 * The two wildcards mosquitto grants: `+` matches exactly one level, `#` matches the rest
 * and is only meaningful last. The topic being matched may itself be one of the
 * artefact's filter-spelled entries (`obs/#`), whose own wildcard is absorbed by the
 * rule's, which is the containment that matters here.
 */
export function filterMatches(filter: string, topic: string): boolean {
  const filterLevels = filter.split("/");
  const topicLevels = topic.split("/");
  for (let level = 0; level < filterLevels.length; level += 1) {
    const expected = filterLevels[level];
    if (expected === "#") {
      return level === filterLevels.length - 1;
    }
    if (level >= topicLevels.length) {
      return false;
    }
    if (expected !== "+" && expected !== topicLevels[level]) {
      return false;
    }
  }
  return topicLevels.length === filterLevels.length;
}

/** One cell's structural facts, every one read from the artefact. */
export interface MatrixCell {
  readonly component: string;
  /** The broker would accept a publish from this component on this topic. */
  readonly mayPublish: boolean;
  /** The broker would accept a subscription from this component covering this topic. */
  readonly maySubscribe: boolean;
  /** This component's own source names the topic — the artefact's narrowing layer. */
  readonly namesIt: boolean;
  /** Neither direction is permitted: the access control list's default refusal. */
  readonly forbidden: boolean;
}

export interface MatrixRow {
  readonly topic: TopicEntry;
  readonly cells: readonly MatrixCell[];
}

/** The matrix's structure: topics against components, entirely from the artefact. */
export function matrixRows(topology: DrognaBrokerTopology): readonly MatrixRow[] {
  const components = topology.components.map((component) => component.id);
  return topology.topics.map((topic) => ({
    topic,
    cells: components.map((component) => {
      const mayPublish = topic.publishers.includes(component);
      const maySubscribe = topic.subscribers.includes(component);
      return {
        component,
        mayPublish,
        maySubscribe,
        namesIt: topic.named_by.some((site) => site.component === component),
        forbidden: !mayPublish && !maySubscribe,
      };
    }),
  }));
}

/** What has genuinely arrived against one artefact row since the page loaded. */
export interface RowTraffic {
  /** Messages received on topics this row's filter covers. */
  readonly received: number;
  /** The concrete topics heard, in first-seen order — `obs/#` covers many. */
  readonly topics: readonly string[];
  /** The most recently heard concrete topic, for the inspector to open on. */
  readonly lastTopic: string | null;
}

const QUIET: RowTraffic = { received: 0, topics: [], lastTopic: null };

/** Received traffic no artefact row covers: surfaced, never dropped (FR-012). */
export interface UndeclaredTraffic {
  readonly topic: string;
  readonly received: number;
}

export interface MatrixTraffic {
  readonly byRowTopic: ReadonlyMap<string, RowTraffic>;
  readonly undeclared: readonly UndeclaredTraffic[];
}

/**
 * Fold what the buffers hold onto the artefact's rows.
 *
 * The buffers are the loop state's own record of arrivals — the only entry to them is a
 * received message — so a row here can light only because traffic genuinely arrived. A
 * heard topic matches a row by the row's own filter spelling; one heard topic matching no
 * row is the artefact being behind the tree, and it is returned as undeclared rather
 * than swallowed.
 */
export function matrixTraffic(topology: DrognaBrokerTopology, buffers: Buffers): MatrixTraffic {
  const byRowTopic = new Map<string, RowTraffic>();
  const undeclared: UndeclaredTraffic[] = [];
  for (const [heard, buffer] of buffers.byTopic) {
    if (buffer.received === 0) {
      continue;
    }
    const row = topology.topics.find(
      (topic) => topic.topic === heard || filterMatches(topic.topic, heard),
    );
    if (row === undefined) {
      undeclared.push({ topic: heard, received: buffer.received });
      continue;
    }
    const existing = byRowTopic.get(row.topic) ?? QUIET;
    byRowTopic.set(row.topic, {
      received: existing.received + buffer.received,
      topics: existing.topics.includes(heard) ? existing.topics : [...existing.topics, heard],
      lastTopic: heard,
    });
  }
  return { byRowTopic, undeclared: undeclared.sort((a, b) => a.topic.localeCompare(b.topic)) };
}

/** Traffic against a row, or the quiet record, for a display that must not invent one. */
export function trafficFor(traffic: MatrixTraffic, rowTopic: string): RowTraffic {
  return traffic.byRowTopic.get(rowTopic) ?? QUIET;
}
