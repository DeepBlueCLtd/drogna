/**
 * The Intro tab's drawing: the architecture, grown one step at a time
 * (SRD-v2 FR-76 to FR-78, feature 117).
 *
 * The composition follows the Operator flow chart's arrangement for the same reason it
 * does there: wires in one SVG layer, nodes as absolutely-positioned real DOM on top.
 * The nodes are then focusable, readable by assistive technology and reachable by query
 * in a test, rather than being shapes inside a picture — which matters more here,
 * because this drawing has no table standing behind it to be the keyboard surface.
 *
 * What is drawn is derived. A node's text is the component's own declared label; the
 * wires are the wiring, collapsed one-per-pair from the same derivation the Operator tab
 * draws (`panels/operator/graph.ts`); the plane strip is the components that declare
 * themselves the plane; the coverage store's eras are the enum in the holding master;
 * the interfaces on the arrow leaving the harness are the shell's declared endpoints.
 * The storyboard authors the order, the words, the cells and the omissions, and nothing
 * else.
 *
 * A wire is drawn only when **both** its ends are on the canvas. That is what keeps the
 * curated picture honest: the wires to the components this drawing leaves out are not
 * redrawn to somewhere else or quietly trimmed at the edge — they simply are not there,
 * and the panel says which components are missing and why.
 *
 * **Nothing here is lit.** This is a drawing of the wiring, not a report of the run: no
 * heartbeat reaches it and no node claims to be alive. Constitution VII's rule is that
 * structure comes from declaration and illumination from heartbeats, and the cheapest
 * way to break it is a diagram that looks like a readout. The panel says where the live
 * answer is instead, and links there.
 */
import { useMemo, type ReactNode } from 'react';
import type { ConfigShell } from '../../generated/types.js';
import { schemaDocuments } from '../../generated/schema-documents.js';
import { collapse, place, region, route, type Link } from './geometry.js';
import { LOOP_REGION, PLANE_ROW, STORYBOARD, nodesOf, type Beat, type Node } from './storyboard.js';

export interface DiagramEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: 'topic' | 'port';
  readonly label: string;
}

export interface DiagramProps {
  readonly shell: ConfigShell;
  /** The derived wiring, before collapsing: one entry per topic filter. */
  readonly edges: readonly DiagramEdge[];
  /** 1-based, and always a step the storyboard has. */
  readonly step: number;
  readonly onSelect: (component: string) => void;
  readonly storyboard?: readonly Beat[];
}

/**
 * The eras named by the master that declares them. They are drawn as slabs inside the
 * node that holds them because the archive, the now-cast and the instances are the whole
 * of the forecast's input — and a fourth era arriving would appear here without anybody
 * remembering to draw it.
 */
function holdingEras(): readonly string[] {
  const master = schemaDocuments['coverage-holding'] as
    | { properties?: { era?: { enum?: unknown } } }
    | undefined;
  const declared = master?.properties?.era?.enum;
  return Array.isArray(declared) ? declared.map(String) : [];
}

/** The standard interfaces the query components answer on, as the shell declares them. */
function servedInterfaces(shell: ConfigShell): readonly { name: string; path: string }[] {
  return [
    { name: 'OGC API-EDR', path: shell.endpoints.edr },
    { name: 'SensorThings', path: shell.endpoints.sensorthings },
    { name: 'OGC API-Features', path: shell.endpoints.features },
  ];
}

/**
 * Where everything sits. Exported because the panel needs the drawing's size before the
 * drawing exists, to decide whether there is room for it — and a second copy of that
 * arithmetic in the panel is a second thing to keep in step.
 */
export function diagramPlacement(storyboard: readonly Beat[] = STORYBOARD) {
  return place(
    nodesOf(storyboard).map((node) => ({
      id: node.component,
      cell: node.place,
      servesOutside: node.servesOutside,
    })),
  );
}

interface Wire {
  readonly link: Link;
  readonly d: string;
  readonly touchesNewest: boolean;
}

export function Diagram({
  shell,
  edges,
  step,
  onSelect,
  storyboard = STORYBOARD,
}: DiagramProps): ReactNode {
  const links = useMemo(() => collapse(edges), [edges]);
  const placement = useMemo(() => diagramPlacement(storyboard), [storyboard]);

  const boxes = new Map(placement.boxes.map((box) => [box.id, box]));
  const nodes = nodesOf(storyboard);
  const cells = new Map(nodes.map((node) => [node.component, node.place]));
  const labels = new Map(shell.components.map((component) => [component.id, component.label]));

  const revealed: Node[] = storyboard.slice(0, step).flatMap((beat) => [...beat.reveals]);
  const shown = new Set(revealed.map((node) => node.component));
  const arriving = new Set((storyboard[step - 1]?.reveals ?? []).map((node) => node.component));
  const eras = holdingEras();

  const wires: Wire[] = links.flatMap((link, index) => {
    if (!shown.has(link.from) || !shown.has(link.to)) return [];
    const from = boxes.get(link.from);
    const to = boxes.get(link.to);
    const fromCell = cells.get(link.from);
    const toCell = cells.get(link.to);
    if (!from || !to || !fromCell || !toCell) return [];
    return [
      {
        link,
        d: route(from, to, fromCell, toCell, index).d,
        touchesNewest: arriving.has(link.from) || arriving.has(link.to),
      },
    ];
  });

  const serving = nodes.find((node) => node.servesOutside);
  const servingBox = serving ? boxes.get(serving.component) : undefined;
  const outside =
    serving && servingBox && placement.outside && shown.has(serving.component)
      ? { box: placement.outside, from: servingBox, isNew: arriving.has(serving.component) }
      : undefined;

  // A band is drawn once something is inside it: an empty rectangle labelled "the plane"
  // or "the forecast loop" is a claim about a part of the picture that has not arrived.
  const planeShown = revealed.some((node) => node.place.row === PLANE_ROW);
  const inLoop = (node: Node) =>
    node.place.col >= LOOP_REGION.from.col &&
    node.place.col <= LOOP_REGION.to.col &&
    node.place.row >= LOOP_REGION.from.row &&
    node.place.row <= LOOP_REGION.to.row;
  // Only once the ring closes: the band says the loop turns here, and it does not turn
  // until the write that closes it exists. Five turns since feature 116 added the
  // analyst, and the condition is the cells' own membership rather than a count.
  const loopClosed = nodes.filter(inLoop).every((node) => shown.has(node.component));
  const loop = region(LOOP_REGION.from, LOOP_REGION.to);

  return (
    <div
      className="intro-canvas"
      style={{ width: placement.width, height: placement.height }}
      data-testid="intro-diagram"
      data-step={step}
    >
      <svg className="intro-wires" width={placement.width} height={placement.height} aria-hidden="true">
        <defs>
          {(['topic', 'port'] as const).map((kind) => (
            <marker
              key={kind}
              id={`intro-arrow-${kind}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6.5"
              markerHeight="6.5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" className={`intro-arrowhead is-${kind}`} />
            </marker>
          ))}
        </defs>
        {planeShown ? (
          <>
            <rect
              className="intro-plane-band"
              x={placement.plane.x}
              y={placement.plane.y}
              width={placement.plane.width}
              height={placement.plane.height}
              rx={8}
            />
            <text
              className="intro-band-caption"
              x={placement.plane.x + 10}
              y={placement.plane.y + 16}
            >
              THE PLANE — UNDER EVERYTHING ABOVE
            </text>
          </>
        ) : null}
        {loopClosed ? (
          <>
            <rect
              className="intro-loop-band"
              x={loop.x}
              y={loop.y}
              width={loop.width}
              height={loop.height}
              rx={10}
              data-testid="intro-loop-band"
            />
            <text className="intro-band-caption" x={loop.x + 10} y={loop.y + 14}>
              THE FORECAST LOOP TURNS HERE
            </text>
          </>
        ) : null}
        {wires.map((wire) => (
          <path
            key={`${wire.link.from}-${wire.link.to}-${wire.link.kind}`}
            d={wire.d}
            className={`intro-wire is-${wire.link.kind}${wire.touchesNewest ? ' is-new' : ''}`}
            markerEnd={`url(#intro-arrow-${wire.link.kind})`}
            data-intro-wire={`${wire.link.from}->${wire.link.to}`}
            data-wire-kind={wire.link.kind}
          >
            <title>
              {wire.link.from} → {wire.link.to}: {wire.link.labels.join(', ')}
              {wire.link.kind === 'port' ? ' (a port: no broker traffic crosses it)' : ''}
            </title>
          </path>
        ))}
        {outside ? (
          <path
            className={`intro-wire is-outside${outside.isNew ? ' is-new' : ''}`}
            d={`M ${outside.from.x + outside.from.width} ${outside.from.y + outside.from.height / 2} L ${outside.box.x} ${outside.box.y + outside.box.height / 2}`}
            markerEnd="url(#intro-arrow-topic)"
          />
        ) : null}
      </svg>

      {revealed.map((node) => {
        const box = boxes.get(node.component);
        if (!box) return null;
        const isNew = arriving.has(node.component);
        return (
          <button
            key={node.component}
            type="button"
            className={`intro-node${isNew ? ' is-new' : ''}`}
            style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
            data-intro-node={node.component}
            aria-current={isNew ? 'step' : undefined}
            onClick={() => onSelect(node.component)}
          >
            <span className="intro-node-label">{labels.get(node.component) ?? node.component}</span>
            {node.showsEras && eras.length > 0 ? (
              <span className="intro-eras">
                {eras.map((era) => (
                  <span key={era} className="intro-era">
                    {era}
                  </span>
                ))}
              </span>
            ) : null}
          </button>
        );
      })}

      {outside ? (
        <div
          className={`intro-outside${outside.isNew ? ' is-new' : ''}`}
          style={{ left: outside.box.x, top: outside.box.y, width: outside.box.width }}
          data-testid="intro-outside"
        >
          <span className="intro-outside-head">anything outside</span>
          {servedInterfaces(shell).map((served) => (
            <span key={served.name} className="intro-served">
              {served.name} <code>{served.path}</code>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
