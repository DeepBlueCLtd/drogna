/**
 * The flow chart's canvas (SRD-v2 FR-57): the nodes, and **the wires between them**.
 *
 * Edges are drawn in one SVG layer behind absolutely-positioned nodes, rather than
 * with the nodes inside the SVG. The faces are real DOM that way — focusable,
 * readable by assistive technology, and testable by query rather than by pixel.
 *
 * Selecting a node dims every wire that does not touch it. With fifty edges over
 * twenty components a picture that shouted equally everywhere would say nothing;
 * this is how a reader asks "what does this one talk to?" and gets an answer.
 *
 * A wire that carries a message lights (pulse.ts). The light is a *second* path lying
 * over the wire rather than a change to the wire itself, for two reasons: the resting
 * strengths below stay the one place a wire's weight is decided, and a light that
 * writes only its own opacity can be handed to CSS and to the board's attributes
 * without either of them arguing with React over the same property.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { FlowEdge, FlowNode } from './graph.js';
import { edgeKey, type PulseBoard } from './pulse.js';
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
  /** Where traffic lights the wires. Absent in a test that is not asking about it. */
  readonly pulses?: PulseBoard;
  /** The declared fade, handed to the stylesheet rather than typed into it. */
  readonly fadeMs: number;
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
  pulses,
  fadeMs,
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
  /**
   * A light is at full strength whatever the resting wire is doing — traffic is the
   * thing the reader came to see — except where they have selected a node, which is
   * them saying they want to read one part of the picture and not the rest.
   */
  const litStrength = (edge: Routed) =>
    selected === undefined || touches(edge) ? 1 : 0.12;

  return (
    <div className="flow-canvas-scroll">
      <div
        className="flow-canvas"
        style={
          { width: placed.width, height: placed.height, '--flow-pulse-fade': `${fadeMs}ms` } as CSSProperties
        }
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
            {/* The light reaches the arrowhead too: a wire whose head stays grey while
                its length brightens reads as a wire lighting up, not as something
                arriving somewhere. */}
            <marker
              id="flow-arrow-pulse"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--flow-pulse)" />
            </marker>
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
          {/* Over the wires, one light per wire that can carry traffic. Ports are not
              here at all: a coupling carries no broker traffic, so no message can ever
              have crossed one, and a light that could never fire is a light the reader
              would eventually read something into. */}
          <g className="flow-pulses">
            {routed
              .filter((edge) => edge.kind === 'topic')
              .map((edge) => (
                <g key={`pulse-${edgeKey(edge)}`} opacity={litStrength(edge)}>
                  <path
                    className="flow-pulse"
                    d={edge.d}
                    fill="none"
                    markerEnd="url(#flow-arrow-pulse)"
                    data-flow-pulse={edgeKey(edge)}
                    ref={(element) => {
                      pulses?.attach(edgeKey(edge), element);
                    }}
                  />
                </g>
              ))}
          </g>
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
