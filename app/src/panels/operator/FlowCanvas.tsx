/**
 * The flow chart's canvas (SRD-v2 FR-52): the nodes, and **the wires between them**.
 *
 * Edges are drawn in one SVG layer behind absolutely-positioned nodes, rather than
 * with the nodes inside the SVG. The faces are real DOM that way — focusable,
 * readable by assistive technology, and testable by query rather than by pixel.
 *
 * Selecting a node dims every wire that does not touch it. With fifty edges over
 * twenty components a picture that shouted equally everywhere would say nothing;
 * this is how a reader asks "what does this one talk to?" and gets an answer.
 */
import type { ReactNode } from 'react';
import type { FlowEdge, FlowNode } from './graph.js';
import { METRICS, layout, routeAll, type Routed } from './layout.js';

const HUE: Record<string, string> = {
  topic: 'var(--flow-ctl)',
  port: 'var(--flow-dim)',
};

export interface FlowCanvasProps {
  readonly nodes: readonly FlowNode[];
  readonly edges: readonly FlowEdge[];
  readonly bandOrder: readonly string[];
  readonly bandCaption: (band: string) => string;
  readonly selected: string | undefined;
  readonly onSelect: (id: string) => void;
  readonly renderNode: (node: FlowNode) => ReactNode;
  /** The state of a node, for the attributes a test and a stylesheet read. */
  readonly stateOf: (id: string) => { lit: boolean; word: string };
}

export function FlowCanvas({
  nodes,
  edges,
  bandOrder,
  bandCaption,
  selected,
  onSelect,
  renderNode,
  stateOf,
}: FlowCanvasProps) {
  const placed = layout(nodes, bandOrder, METRICS);
  const routed = routeAll(edges, placed.placed);
  const positionOf = new Map(placed.placed.map((node) => [node.id, node]));
  const touches = (edge: Routed) => edge.from === selected || edge.to === selected;
  /**
   * Fifty wires over twenty components. Drawn at full strength all at once they are a
   * scribble that says nothing, so the resting state is quiet enough to read the shape
   * through, and selecting a node brings its own wires forward and pushes the rest
   * back. The picture answers "what does this one talk to?" rather than shouting.
   */
  const strength = (edge: Routed) => {
    if (selected === undefined) return { opacity: 0.32, width: 1.2 };
    return touches(edge) ? { opacity: 1, width: 1.8 } : { opacity: 0.08, width: 1 };
  };

  return (
    <div className="flow-canvas-scroll">
      <div
        className="flow-canvas"
        style={{ width: placed.width, height: placed.height }}
        data-testid="flow-chart"
      >
        <svg
          className="flow-wires-layer"
          width={placed.width}
          height={placed.height}
          aria-hidden="true"
        >
          <defs>
            {Object.entries(HUE).map(([kind, hue]) => (
              <marker
                key={kind}
                id={`flow-arrow-${kind}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 9 5 L 0 9 z" fill={hue} />
              </marker>
            ))}
          </defs>
          {placed.bands.map((band) => (
            <text key={band.band} x={METRICS.padding} y={band.y + 12} className="flow-band-caption-text">
              {bandCaption(band.band).toUpperCase()}
            </text>
          ))}
          {routed.map((edge, index) => (
            <path
              key={`${edge.from}-${edge.to}-${edge.label}-${index}`}
              d={edge.d}
              fill="none"
              stroke={HUE[edge.kind]}
              strokeWidth={strength(edge).width}
              // A port carries no broker traffic and can never pulse, so it is never
              // drawn solid: the difference between a wire and a coupling is visible
              // without reading a legend.
              strokeDasharray={edge.kind === 'port' ? '5 4' : undefined}
              opacity={strength(edge).opacity}
              markerEnd={`url(#flow-arrow-${edge.kind})`}
              data-flow-edge={`${edge.from}->${edge.to}`}
              data-edge-kind={edge.kind}
            >
              <title>
                {edge.from} → {edge.to}: {edge.label}
                {edge.kind === 'port' ? ' (a port: no broker traffic crosses it)' : ''}
              </title>
            </path>
          ))}
        </svg>
        {nodes.map((node) => {
          const at = positionOf.get(node.id);
          if (!at) return null;
          return (
            <div
              key={node.id}
              className="flow-node-slot"
              style={{ left: at.x, top: at.y, width: at.width, height: at.height }}
            >
              <button
                type="button"
                className="flow-node"
                data-flow-node={node.id}
                data-lit={stateOf(node.id).lit}
                data-state={stateOf(node.id).word}
                aria-pressed={selected === node.id}
                onClick={() => onSelect(node.id)}
              >
                {renderNode(node)}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
