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
 *
 * **The move is drawn, not jumped.** Opening a node rearranges most of the chart at
 * once, and a picture that rearranged between two frames left the reader hunting for
 * which card had grown — the author's report, and the reason this was reversed from
 * "deliberately not done". So the canvas holds a placement of its own and walks it to
 * the new one over a fifth of a second, re-routing the wires from the interpolated boxes
 * on every frame: the eye follows the card that grows and the neighbours that give way,
 * which is exactly the information that was missing.
 *
 * It is a JavaScript tween rather than a CSS transition because the wires are computed
 * from where the nodes are. A transition would glide the nodes and leave fifty edges
 * pointing at where those nodes used to be until it finished.
 *
 * Nothing moves for a reader who has asked for that (FR-016): with reduced motion the
 * new placement is committed on the same frame, and the picture is exactly the one this
 * file drew before the animation existed.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FlowEdge, FlowNode } from './graph.js';
import {
  METRICS,
  layout,
  routeAll,
  tween,
  type Layout,
  type LayoutMetrics,
  type Routed,
} from './layout.js';

/**
 * How long the chart takes to rearrange, in milliseconds of host time.
 *
 * Long enough for the eye to follow one card out of twenty — under about 150ms a move
 * reads as a jump — and short enough that a reader who knows where they are going is
 * not waiting for the picture to catch up.
 */
const REARRANGE_MS = 200;

/** Slow at both ends, quickest in the middle: the movement of something with mass. */
function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * Whether this reader has asked the platform for less movement. Answered by the
 * platform, never assumed: where `matchMedia` is not there to ask — a test environment,
 * an old engine — the answer is no, and the animation is the one every other reader
 * gets rather than a silent downgrade for everybody.
 */
function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

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
  /**
   * How the reader arrived at the open card, which decides where the keyboard goes.
   * Arriving by clicking a node puts it on the card; arriving by an arrow inside the
   * previous card puts it on the same arrow in this one, because the card that arrow was
   * in has left the document and a reader stepping through should be able to keep
   * pressing.
   */
  readonly openFocus?: 'card' | 'step-previous' | 'step-next';
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
  openFocus = 'card',
}: FlowCanvasProps) {
  // Where the chart is going. Recomputed only when something that decides geometry
  // changes, so the frame loop below has a stable thing to walk towards.
  const target = useMemo(
    () => layout(nodes, bandOrder, metrics, selected),
    [nodes, bandOrder, metrics, selected],
  );
  // Where it is being drawn right now. Equal to the target except while it is moving.
  const [placed, setPlaced] = useState<Layout>(target);
  const drawn = useRef<Layout>(target);
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

  /**
   * Walk the drawn placement to the target one. An animation already running is
   * retargeted rather than restarted — a reader who opens a second node while the first
   * is still moving gets one continuous rearrangement from wherever the picture had got
   * to, not a jump back to the start.
   */
  useEffect(() => {
    const from = drawn.current;
    if (from === target) return;
    const commit = (frame: Layout) => {
      drawn.current = frame;
      setPlaced(frame);
    };
    /**
     * Once it has stopped moving, and only then: a card that is off the side of the
     * canvas is brought in, by the least that makes it whole. Scrolling to a box that
     * is still growing aims at the wrong place — on a phone the card ended up half off
     * the screen, and on a desktop, where nothing needed to move at all, the whole
     * chart was dragged sideways.
     */
    const settle = () => {
      if (selected === undefined) return;
      openRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    };
    if (prefersReducedMotion() || globalThis.requestAnimationFrame === undefined) {
      commit(target);
      settle();
      return;
    }
    let handle = 0;
    let started: number | undefined;
    const step = (now: number) => {
      started ??= now;
      const t = Math.min(1, (now - started) / REARRANGE_MS);
      commit(t >= 1 ? target : tween(from, target, ease(t)));
      if (t >= 1) settle();
      // harness:allow-wallclock the chart's own rearrangement, drawn frame by frame; nothing derived from it leaves the render path (ADR-0007's rule 3)
      if (t < 1) handle = requestAnimationFrame(step);
    };
    // harness:allow-wallclock as above: one frame of a layout transition, never a simulation time
    handle = requestAnimationFrame(step);
    return () => cancelAnimationFrame(handle);
  }, [target]);
  useEffect(() => {
    const was = previous.current;
    previous.current = selected;
    if (was === selected) return;
    if (selected !== undefined) {
      const arrow =
        openFocus === 'card'
          ? null
          : openRef.current?.querySelector<HTMLElement>(
              `[data-step="${openFocus === 'step-next' ? 'next' : 'previous'}"]`,
            );
      // Without `preventScroll` the browser brings the target into view *now*, while the
      // card is still the size of a resting node, and it then grows back off the edge of
      // a phone. Bringing it in is worth doing and is done once it has stopped moving,
      // at the end of the rearrangement below.
      (arrow ?? openRef.current)?.focus({ preventScroll: true });
      return;
    }
    // Closed: back to the node it was, not to nowhere.
    rootRef.current?.querySelector<HTMLElement>(`button[data-flow-node="${was}"]`)?.focus();
  }, [selected, openFocus]);

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
          // What is *in* the node follows the selection immediately; only its box is
          // animated. A card whose content waited for the first frame would mean a
          // click with nothing behind it, and on a slow frame that is a click that
          // appears to have missed.
          const open = node.id === selected;
          return (
            <div
              key={node.id}
              className="flow-node-slot"
              data-expanded={open}
              style={{ left: at.x, top: at.y, width: at.width, height: at.height }}
            >
              {open ? (
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
