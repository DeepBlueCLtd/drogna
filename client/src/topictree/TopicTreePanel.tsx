/**
 * The topic tree panel: the declared topology, lit by live traffic (feature 022).
 *
 * Self-contained on purpose: the shell integration is one element, and everything else —
 * the read-only subscription, the folding of arrivals, the frame discipline — lives
 * here. The panel deliberately does not share the shell's control subscription: it
 * listens under its own identity (ADR-0025), to both namespaces, and what it hears has
 * no route to the component shell's liveness state or any other surface (022 FR-010).
 *
 * The two sources never mix (Constitution VII): the skeleton is built once from the
 * derived topology document; arrivals fold into the activity model; the render reads
 * both and is the only place they meet. Arrivals fold as they come and drawing is
 * throttled to the frame budget, so a burst costs frames and never truth.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import type { RuntimeConfig } from "../config/runtime";
import { CLOCK_TOPIC } from "../data/topics";
import { decode } from "../liveness/ingest";
import type { ConnectionState } from "../liveness/types";
import { hostInstant } from "../time/host";
import { emptyClock, receiveClockSample } from "../transport/clock";
import type { ClockState } from "../transport/clock";

import type { ActivityState } from "./activity";
import { connectionGlow, emptyActivity, recordArrival, stampFor } from "./activity";
import { describeSelection } from "./detail";
import { DetailView } from "./DetailView";
import { RoleColumn } from "./RoleColumn";
import type { Tier } from "./skeleton";
import { buildSkeleton, classify, findNode, withGrafts } from "./skeleton";
import { describeHonesty } from "./state";
import type { PanelState } from "./state";
import { TOPOLOGY } from "./topology";
import { openTreeSubscription } from "./transport";
import type { TreeSink, TreeSubscription } from "./transport";
import { TreeView } from "./TreeView";

const FALLBACK_FRAME_INTERVAL_MS = 250;

export interface TopicTreePanelProps {
  /** The validated configuration, or null while there is none — the panel says so. */
  readonly config: RuntimeConfig | null;
  /** Why there is no configuration, where loading failed. */
  readonly configurationFailure: string | null;
  /** Open the read-only subscription. Injectable so the state layer tests need no wire. */
  readonly open?: (config: RuntimeConfig, sink: TreeSink) => TreeSubscription;
  /** Host time, injectable the way the shell's is. */
  readonly now?: () => number;
}

interface Snapshot {
  readonly state: PanelState;
  readonly instant: number;
  /**
   * Host instant the display was pinned at, or null while the simulation advances.
   * Pinned means a paused clock, or no clock sample heard yet: the capture rule (012
   * FR-53) requires a pinned page to hold still, so while pinned the panel draws
   * steady marks instead of pulses. Truth still folds; only the animation is keyed.
   */
  readonly pinnedSince: number | null;
}

/** One drawn connection between a role's rule and the subtree its filter covers. */
interface Wire {
  readonly key: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly phase: number;
}

/** The wildcard-free prefix a filter's connection anchors to: `obs/#` anchors at `obs`. */
export function wireAnchor(filter: string): string | null {
  const concrete: string[] = [];
  for (const segment of filter.split("/")) {
    if (segment === "#" || segment === "+") {
      break;
    }
    concrete.push(segment);
  }
  return concrete.length === 0 ? null : concrete.join("/");
}

export function TopicTreePanel({
  config,
  configurationFailure,
  open = openTreeSubscription,
  now = hostInstant,
}: TopicTreePanelProps): JSX.Element {
  const activity = useRef<ActivityState>(emptyActivity);
  const grafts = useRef<ReadonlyMap<string, Tier>>(new Map());
  const connection = useRef<ConnectionState>("not-connected");
  const clock = useRef<ClockState>(emptyClock);
  const listeningSince = useRef<number | null>(null);
  // Pinned from the first instant: before any clock sample the simulation is not known
  // to advance, and a page that cannot say "advancing" must hold still (FR-53's rule).
  const pinnedSince = useRef<number | null>(0);
  const surface = useRef<HTMLDivElement | null>(null);

  const skeleton = useMemo(() => buildSkeleton(TOPOLOGY), []);
  const [selected, setSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [wires, setWires] = useState<readonly Wire[]>([]);
  const [snap, setSnap] = useState<Snapshot>(() => ({
    instant: now(),
    pinnedSince: pinnedSince.current,
    state: {
      connection: connection.current,
      clock: clock.current,
      activity: activity.current,
      grafts: grafts.current,
      listeningSince: listeningSince.current,
    },
  }));

  const sink = useMemo<TreeSink>(
    () => ({
      message(topic: string, payload: string): void {
        const receivedAt = now();
        if (topic === CLOCK_TOPIC) {
          const decoded = decode(payload);
          if (!("reason" in decoded)) {
            clock.current = receiveClockSample(clock.current, decoded.value, receivedAt);
            const sample = clock.current.sample;
            const advancing = sample !== null && sample.rate > 0 && sample.mode !== "paused";
            if (advancing) {
              pinnedSince.current = null;
            } else if (pinnedSince.current === null) {
              pinnedSince.current = receivedAt;
            }
          }
        }
        const simTime = stampFor(payload, clock.current.sample?.simTime ?? null);
        activity.current = recordArrival(activity.current, {
          topic,
          payload,
          receivedAt,
          simTime,
        });
        const tier = classify(topic, skeleton, TOPOLOGY);
        if (tier !== "declared" && !grafts.current.has(topic)) {
          const grown = new Map(grafts.current);
          grown.set(topic, tier);
          grafts.current = grown;
        }
      },
      connection(state: ConnectionState): void {
        connection.current = state;
      },
    }),
    [now, skeleton],
  );

  useEffect(() => {
    if (config === null) {
      return;
    }
    listeningSince.current = now();
    const subscription = open(config, sink);
    return () => {
      subscription.close();
    };
  }, [config, open, sink, now]);

  useEffect(() => {
    let frame = 0;
    let lastDrawn = Number.NEGATIVE_INFINITY;
    const draw = (): void => {
      const instant = now();
      const interval = config?.display.frameIntervalMs ?? FALLBACK_FRAME_INTERVAL_MS;
      if (instant - lastDrawn >= interval) {
        lastDrawn = instant;
        setSnap({
          instant,
          pinnedSince: pinnedSince.current,
          state: {
            connection: connection.current,
            clock: clock.current,
            activity: activity.current,
            grafts: grafts.current,
            listeningSince: listeningSince.current,
          },
        });
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [config, now]);

  // The connections are drawn between elements the tree and the column just rendered,
  // so they are measured after that render and carry the same frame's phases.
  useEffect(() => {
    const container = surface.current;
    if (container === null) {
      setWires([]);
      return;
    }
    const frame = container.getBoundingClientRect();
    const drawn: Wire[] = [];
    skeleton.roles.forEach((role) => {
      role.rules.forEach((rule, index) => {
        const anchor = wireAnchor(rule.filter);
        if (anchor === null) {
          return;
        }
        const node = container.querySelector(`[data-tt-path="${anchor}"]`);
        const ruleRow = container.querySelector(`[data-tt-rule="${role.role}:${String(index)}"]`);
        if (node === null || ruleRow === null) {
          return;
        }
        const from = node.getBoundingClientRect();
        const to = ruleRow.getBoundingClientRect();
        drawn.push({
          key: `${role.role}:${String(index)}`,
          x1: from.right - frame.left,
          y1: from.top + from.height / 2 - frame.top,
          x2: to.left - frame.left,
          y2: to.top + to.height / 2 - frame.top,
          phase: connectionGlow(snap.state.activity, rule.filter, snap.instant, snap.pinnedSince),
        });
      });
    });
    setWires(drawn);
  }, [snap, skeleton, collapsed]);

  const tree = useMemo(
    () => withGrafts(skeleton.root, snap.state.grafts),
    [skeleton, snap.state.grafts],
  );
  const honesty = describeHonesty(snap.state, config !== null, configurationFailure);
  const sample = snap.state.clock.sample;
  const selectedNode = selected === null ? null : findNode(tree, selected);

  return (
    <section className="panel topic-tree" data-testid="topic-tree">
      <h2>The topic tree</h2>
      <p className="tt-strapline">
        Every declared topic and every declared consumer role, drawn whether or not it
        has spoken; cells and pulses light only from messages genuinely received on this
        page&apos;s own read-only subscription.
      </p>
      <p className="tt-factor" data-testid="tt-factor">
        {sample === null
          ? "No clock sample heard: rates cannot be stated in simulation time yet."
          : `Stated figures are simulation time; acceleration in force: ×${String(sample.rate)} (${sample.mode}).`}
      </p>
      {honesty.disabled === null ? null : (
        <p className="tt-honesty tt-disabled" data-testid="tt-disabled">
          {honesty.disabled}
        </p>
      )}
      {honesty.disconnected === null ? null : (
        <p className="tt-honesty tt-disconnected" data-testid="tt-disconnected">
          {honesty.disconnected}
        </p>
      )}
      {honesty.paused === null ? null : (
        <p className="tt-honesty tt-paused" data-testid="tt-paused">
          {honesty.paused}
        </p>
      )}
      <p className="tt-session" data-testid="tt-session">
        {honesty.session}
      </p>
      {honesty.disabled === null ? (
        <div className="tt-surface" ref={surface}>
          <svg className="tt-wires" aria-hidden="true">
            {wires.map((wire) => (
              <line
                key={wire.key}
                x1={wire.x1}
                y1={wire.y1}
                x2={wire.x2}
                y2={wire.y2}
                strokeOpacity={0.2 + 0.8 * wire.phase}
                strokeWidth={1 + 2.5 * wire.phase}
                data-lit={String(wire.phase > 0)}
              />
            ))}
          </svg>
          <TreeView
            root={tree}
            activity={snap.state.activity}
            now={snap.instant}
            pinnedSince={snap.pinnedSince}
            selected={selected}
            onSelect={setSelected}
            collapsed={collapsed}
            onToggleCollapse={(path) => {
              setCollapsed((folded) => {
                const next = new Set(folded);
                if (next.has(path)) {
                  next.delete(path);
                } else {
                  next.add(path);
                }
                return next;
              });
            }}
          />
          <RoleColumn
            roles={skeleton.roles}
            activity={snap.state.activity}
            now={snap.instant}
            pinnedSince={snap.pinnedSince}
          />
        </div>
      ) : null}
      {selectedNode === null ? null : (
        <DetailView
          detail={describeSelection(selectedNode, snap.state.activity, TOPOLOGY.roles)}
        />
      )}
    </section>
  );
}
