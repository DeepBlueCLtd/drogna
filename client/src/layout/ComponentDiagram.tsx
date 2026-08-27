/**
 * The drawing.
 *
 * Eighteen boxes and the flow between them, with the control loop closed on itself. The
 * caption above it says what it is — a drawing of the intended architecture — so that a
 * dark box reads as "not heard from" rather than as "broken" or "imaginary". That
 * sentence is not decoration: without it the same picture makes a claim it cannot
 * support.
 *
 * Every box carries its state as a word and a mark as well as a fill, so the picture
 * survives greyscale (FR-024), and a stable test identifier, so capture and end-to-end
 * work can address it without depending on where it happens to sit (FR-022).
 */
import type { ComponentView } from "../liveness/view";
import { ILLUMINATION, statusWords } from "../ui/states";

import { COMPONENTS_BY_ID, EDGES, KIND_LEGEND } from "./components";
import type { ComponentNode } from "./components";
import { boxFor, CANVAS_HEIGHT, CANVAS_WIDTH, edgeGeometry, NODE_HEIGHT, NODE_WIDTH } from "./geometry";

export const LAYOUT_CAPTION =
  "This is a drawing of the intended architecture, not a picture of what is running. " +
  "A box is a component drogna means to have; it is lit only while a heartbeat from it " +
  "has arrived inside the window that heartbeat declares. Every other box is dark " +
  "because nothing has been heard from it, which on the first day is most of them.";

/**
 * The two lines under a box: what the component reported, and when it said so.
 *
 * "When" is the simulation time the heartbeat carried, not a host duration since it
 * arrived. FR-009 is explicit that host time may drive illumination and nothing else,
 * and an age ticking upwards is the obvious way to break that without noticing: it makes
 * the rendered output differ frame to frame, so two captures of the same pinned state
 * would never be identical (SC-009). The elapsed figure remains in the view model, where
 * liveness reasons about it; it is simply not drawn.
 */
function nodeLines(view: ComponentView): readonly string[] {
  const lines: string[] = [];
  if (view.reported !== null) {
    lines.push(statusWords(view.reported.status));
    lines.push(`at ${view.reported.simTime}`);
  }
  return lines;
}

function NodeBox({ view }: { view: ComponentView }): JSX.Element {
  const node = view.node as ComponentNode;
  const box = boxFor(node);
  const appearance = ILLUMINATION[view.illumination];
  const lines = nodeLines(view);
  return (
    <g
      className={`node ${appearance.className} kind-${node.kind}`}
      data-testid={`component-node-${node.id}`}
      data-illumination={view.illumination}
      data-kind={node.kind}
    >
      <rect
        x={box.x}
        y={box.y}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={node.kind === "bespoke" ? 4 : 22}
      />
      <text className="node-reference" x={box.x + 12} y={box.y + 20}>
        {node.reference}
      </text>
      <text className="node-mark" x={box.x + NODE_WIDTH - 12} y={box.y + 20} textAnchor="end">
        {appearance.glyph}
      </text>
      <text className="node-name" x={box.x + 12} y={box.y + 42}>
        {node.name}
      </text>
      <text className="node-state" x={box.x + 12} y={box.y + 62}>
        {appearance.label}
      </text>
      <text className="node-detail" x={box.x + 12} y={box.y + 78}>
        {lines.join(" · ")}
      </text>
      <title>
        {`${node.reference} ${node.name}. ${node.responsibility}. ${appearance.label}.`}
      </title>
    </g>
  );
}

export interface ComponentDiagramProps {
  readonly views: readonly ComponentView[];
}

export function ComponentDiagram({ views }: ComponentDiagramProps): JSX.Element {
  const placed = views.filter((view) => view.node !== null);
  return (
    <figure className="diagram" data-testid="component-diagram">
      <figcaption data-testid="layout-disclaimer">{LAYOUT_CAPTION}</figcaption>
      <svg
        viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
        role="img"
        aria-label="The drogna component layout, with each component lit only if heard from"
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
          <pattern id="unknown" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M 0 8 L 8 0" strokeWidth="1.5" />
          </pattern>
        </defs>
        <g className="edges">
          {EDGES.map((edge) => {
            const from = COMPONENTS_BY_ID.get(edge.from);
            const to = COMPONENTS_BY_ID.get(edge.to);
            if (from === undefined || to === undefined) {
              return null;
            }
            const geometry = edgeGeometry(edge, boxFor(from), boxFor(to));
            return (
              <g
                key={`${edge.from}-${edge.to}`}
                className={edge.loop === true ? "edge loop" : "edge"}
                data-testid={`edge-${edge.from}-${edge.to}`}
              >
                <path d={geometry.path} markerEnd="url(#arrow)" />
                <text x={geometry.labelX} y={geometry.labelY} textAnchor="middle">
                  {edge.label}
                </text>
              </g>
            );
          })}
        </g>
        <g className="nodes">
          {placed.map((view) => (
            <NodeBox key={view.componentId} view={view} />
          ))}
        </g>
      </svg>
      <dl className="legend" data-testid="legend">
        <dt>Lit</dt>
        <dd>
          {ILLUMINATION.lit.glyph} A heartbeat from this component arrived inside the window it
          declared. Lit means heard from. It does not mean working: a component that heartbeats
          while failing at its job is lit, and says so in its reported status.
        </dd>
        <dt>Dark</dt>
        <dd>
          {ILLUMINATION.dark.glyph} Nothing has been heard from this component, or what was heard
          has expired. Most of drogna is here, and that is the true picture.
        </dd>
        <dt>Cannot tell</dt>
        <dd>
          {ILLUMINATION.indeterminate.glyph} What was heard has expired while this page was not
          connected. A page that has gone deaf cannot report a death.
        </dd>
        <dt>This page</dt>
        <dd>
          {ILLUMINATION.self.glyph} The browser client cannot hear itself over the broker, so its
          box is lit by its own presence and labelled as such rather than pretending to a heartbeat.
        </dd>
        <dt>Square corners</dt>
        <dd>{KIND_LEGEND.bespoke}</dd>
        <dt>Round corners</dt>
        <dd>{KIND_LEGEND.plumbing}</dd>
      </dl>
    </figure>
  );
}
