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
 * Selecting a node also **opens it where it stands**. A resting card is a glance —
 * 208 by 116 is enough for a name, a state and an instrument the size of a postage
 * stamp — and it was never enough to read a figure off or to move a slider in. The
 * account that used to open in a drawer below the chart now opens in the node itself,
 * and the chart reflows around it (layout.ts): the reader's eye does not leave the
 * component it asked about, and the wires it is arguing with stay attached to it while
 * they read.
 *
 * The consequence for the markup is the reason this is a re-implementation rather than
 * a stylesheet change: a resting node is one button, and an open node cannot be, since
 * a button may not contain the sliders and buttons the account carries. So an open node
 * is a section with a heading and its own close control, and the two are different
 * elements — not one element with a class on it.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import type { FlowEdge, FlowNode } from './graph.js';
import { METRICS, layout, routeAll, type LayoutMetrics, type Routed } from './layout.js';

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
  /**
   * The open node's account, drawn in the node itself. Given separately from
   * `renderNode` because it is not the resting card at a larger size: it is the
   * component's full account, and it carries controls.
   */
  readonly renderExpanded: (node: FlowNode) => ReactNode;
  /** The state of a node, for the attributes a test and a stylesheet read. */
  readonly stateOf: (id: string) => { lit: boolean; word: string };
  /** The geometry to place against; a phone is given a different expanded box. */
  readonly metrics?: LayoutMetrics;
}

export function FlowCanvas({
  nodes,
  edges,
  bandOrder,
  bandCaption,
  selected,
  onSelect,
  renderNode,
  renderExpanded,
  stateOf,
  metrics = METRICS,
}: FlowCanvasProps) {
  const placed = layout(nodes, bandOrder, metrics, selected);
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
   * Where the keyboard goes when a node opens and when it closes. Opening a node
   * replaces the button that was focused with a section, so without this the focus ring
   * lands back on the document and a keyboard reader is returned to the top of the tab —
   * which is the same bug as losing your place, dressed as an animation.
   */
  const openRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const previous = useRef<string | undefined>(undefined);
  useEffect(() => {
    const was = previous.current;
    previous.current = selected;
    if (was === selected) return;
    if (selected !== undefined) {
      openRef.current?.focus();
      // The canvas pans, so an open card can sit half off the side of a phone. Bring
      // its leading edge in: focusing alone scrolls by the least it can get away with,
      // which on a 390-pixel screen left the controls over the edge.
      openRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'start' });
      return;
    }
    // Closed: back to the node it was, not to nowhere.
    rootRef.current?.querySelector<HTMLElement>(`button[data-flow-node="${was}"]`)?.focus();
  }, [selected]);

  return (
    <div className="flow-canvas-scroll" ref={rootRef}>
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
            <text key={band.band} x={metrics.padding} y={band.y + 12} className="flow-band-caption-text">
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
          const { lit, word } = stateOf(node.id);
          return (
            <div
              key={node.id}
              className="flow-node-slot"
              data-expanded={at.expanded}
              style={{ left: at.x, top: at.y, width: at.width, height: at.height }}
            >
              {at.expanded ? (
                <section
                  className="flow-node flow-node-open"
                  data-flow-node={node.id}
                  data-lit={lit}
                  data-state={word}
                  aria-label={`${node.label}, open`}
                  ref={openRef}
                  tabIndex={-1}
                >
                  {renderExpanded(node)}
                </section>
              ) : (
                <button
                  type="button"
                  className="flow-node"
                  data-flow-node={node.id}
                  data-lit={lit}
                  data-state={word}
                  aria-pressed={false}
                  aria-expanded={false}
                  onClick={() => onSelect(node.id)}
                >
                  {renderNode(node)}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
