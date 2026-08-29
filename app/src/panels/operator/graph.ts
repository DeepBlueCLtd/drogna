/**
 * The Operator flow chart's graph, derived rather than drawn (SRD-v2 FR-52).
 *
 * A picture of the wiring maintained separately from the wiring goes stale, and
 * nothing tells you when. So nothing here is authored:
 *
 * - **nodes** are the shell's declared components, with the band and rank they
 *   declare. Structure from declaration, illumination from heartbeats, and the two
 *   never mix (Constitution VII);
 * - **topic edges** come from `contracts/topology.json` — an edge exists where one
 *   role's publish rules and another's subscribe rules overlap on a filter;
 * - **port edges** are the couplings that carry no broker traffic at all: the
 *   world-sampler port and the store interfaces. They are declared beside the
 *   components because they cannot be derived from a topology of topics, and without
 *   them the environment generator — which publishes nothing but heartbeats — sits
 *   isolated in a picture of a system it is the source of.
 *
 * Two filters are suppressed and named: every component hears the clock and publishes
 * heartbeats, so drawing them is forty edges that hide the ones carrying meaning.
 * They are the plane the flow runs on, and `suppressed` returns them for the panel to
 * say so on screen.
 *
 * The gate reads this module too (scripts/gates/check-flow-completeness.ts), which is
 * what makes "derived" a fact rather than an intention.
 */
import type { ConfigShell, Topology } from '../../generated/types.js';

export type Band = 'plane' | 'loop' | 'path' | 'downstream';

export interface FlowNode {
  readonly id: string;
  readonly label: string;
  readonly beat: number;
  readonly band: Band;
  readonly rank: number;
}

export interface FlowEdge {
  readonly from: string;
  readonly to: string;
  /** A topic edge carries traffic and can pulse; a port edge never can. */
  readonly kind: 'topic' | 'port';
  /** The topic filter, or the port's declared label. */
  readonly label: string;
}

export interface Flow {
  readonly nodes: readonly FlowNode[];
  readonly edges: readonly FlowEdge[];
  /** Topic filters drawn as the plane rather than as edges, for the panel to name. */
  readonly suppressed: readonly string[];
  /**
   * Topics that genuinely produced an edge. Not "every topic we looked at" — that was
   * the first version, and a planted topic sailed past it, because a list that counts
   * everything can never report anything missing.
   */
  readonly topicsDrawn: readonly string[];
  /**
   * Topics that legitimately draw no edge because the only thing listening is the
   * shell: an announcement to the reader, like cov/holdings. Reported rather than
   * silently tolerated, so the panel can say the picture ends there.
   */
  readonly topicsTerminal: readonly string[];
}

/** Bands in the order they are drawn, top to bottom. */
export const BANDS: readonly Band[] = ['loop', 'path', 'downstream', 'plane'];

export function buildFlow(shell: ConfigShell, topology: Topology): Flow {
  const declared = new Map(shell.components.map((component) => [component.id, component]));
  const nodes: FlowNode[] = shell.components
    .map((component) => ({
      id: component.id,
      label: component.label,
      beat: component.beat,
      band: component.band as Band,
      rank: component.rank,
    }))
    .sort((a, b) => BANDS.indexOf(a.band) - BANDS.indexOf(b.band) || a.rank - b.rank);

  const suppressed = shell.flow.suppressed_filters;
  const edges: FlowEdge[] = [];
  const topicsDrawn: string[] = [];
  const seen = new Set<string>();

  const topicsTerminal: string[] = [];
  for (const entry of topology.topics) {
    if (suppressed.includes(entry.topic)) continue;
    const before = edges.length;
    for (const publisher of entry.publishers) {
      for (const subscriber of entry.subscribers) {
        // The shell is the thing doing the drawing, not a node in the picture; it
        // subscribes to everything, and an edge into it from every publisher would be
        // the diagram drawing its own reader.
        if (!declared.has(publisher) || !declared.has(subscriber)) continue;
        if (publisher === subscriber) continue;
        const key = `${publisher}->${subscriber}:${entry.topic}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ from: publisher, to: subscriber, kind: 'topic', label: entry.topic });
      }
    }
    if (edges.length > before) {
      topicsDrawn.push(entry.topic);
    } else if (entry.subscribers.includes(shell.id)) {
      // Nothing in the picture hears it, but the reader does: an announcement, and the
      // picture ends at the edge of itself rather than in a wire that goes nowhere.
      topicsTerminal.push(entry.topic);
    }
  }

  for (const port of shell.flow.ports) {
    edges.push({ from: port.from, to: port.to, kind: 'port', label: port.label });
  }

  return { nodes, edges, suppressed, topicsDrawn, topicsTerminal };
}

/**
 * What the picture is missing, if anything. Returned as sentences rather than a
 * boolean because a gate that says "incomplete" tells nobody what to do about it.
 */
export function completenessFindings(shell: ConfigShell, topology: Topology): string[] {
  const flow = buildFlow(shell, topology);
  const findings: string[] = [];
  const drawn = new Set(flow.nodes.map((node) => node.id));

  for (const component of topology.components) {
    if (component.id === shell.id) continue;
    if (!drawn.has(component.id)) {
      findings.push(
        `component '${component.id}' runs in the topology but has no node in the flow chart: add it to shell.components with a band and a rank, or say why it is not a component`,
      );
    }
  }
  for (const node of flow.nodes) {
    if (!topology.components.some((component) => component.id === node.id)) {
      findings.push(
        `the flow chart draws '${node.id}', which the topology does not know: a node for something that does not run is exactly what Constitution VII forbids`,
      );
    }
  }

  const accountedFor = new Set([...flow.topicsDrawn, ...flow.topicsTerminal, ...flow.suppressed]);
  for (const entry of topology.topics) {
    if (accountedFor.has(entry.topic)) continue;
    findings.push(
      `topic '${entry.topic}' is published by ${entry.publishers.join(', ') || 'nothing'} and nothing in the picture hears it: either a wire that goes nowhere, or an edge the flow chart cannot draw — name it in shell.flow.suppressed_filters if it is deliberate`,
    );
  }

  const known = new Set(flow.nodes.map((node) => node.id));
  for (const port of shell.flow.ports) {
    for (const end of [port.from, port.to]) {
      if (!known.has(end)) {
        findings.push(`declared port edge names '${end}', which is not a declared component`);
      }
    }
  }

  const places = new Map<string, string>();
  for (const node of flow.nodes) {
    const place = `${node.band}:${node.rank}`;
    const taken = places.get(place);
    if (taken) {
      findings.push(
        `'${node.id}' and '${taken}' both declare ${place}: two nodes in one place is a layout that cannot be read`,
      );
    }
    places.set(place, node.id);
  }
  return findings;
}
