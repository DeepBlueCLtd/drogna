/**
 * The tree: root at the left, one branch per topic segment, cold until spoken on.
 *
 * Structure is the skeleton (plus view-time grafts); everything that glows reads from
 * the activity model at the frame instant — a pulse decaying at a leaf, the ripple an
 * ancestor shows because a wildcard subscription under it would have seen the arrival,
 * and the sustained intensity a busy stream crosses over to. No activity, no glow: a
 * declared-but-silent topic renders cold on purpose, and that is information.
 */
import type { CSSProperties } from "react";

import type { ActivityState } from "./activity";
import { aggregate, decayPhase, intensity, reading, ripplePhase } from "./activity";
import type { TreeNode } from "./skeleton";

export interface TreeViewProps {
  readonly root: TreeNode;
  readonly activity: ActivityState;
  readonly now: number;
  readonly selected: string | null;
  readonly onSelect: (path: string) => void;
  readonly collapsed: ReadonlySet<string>;
  readonly onToggleCollapse: (path: string) => void;
}

const TIER_WORDS: Readonly<Record<TreeNode["tier"], string>> = {
  declared: "declared",
  "observed-under-declaration": "observed under a declared wildcard, not named by configuration",
  undeclared: "UNDECLARED: no declared filter covers this topic",
};

function Node({
  node,
  activity,
  now,
  selected,
  onSelect,
  collapsed,
  onToggleCollapse,
}: { readonly node: TreeNode } & Omit<TreeViewProps, "root">): JSX.Element {
  const own = activity.get(node.path);
  const branch = node.children.length > 0;
  const phase = branch ? ripplePhase(activity, node.path, now) : decayPhase(own, now);
  const mode = reading(own);
  const glow = mode === "sustained" ? intensity(own, now) : phase;
  const isCollapsed = branch && collapsed.has(node.path);
  const summary = isCollapsed ? aggregate(activity, node.path) : null;
  return (
    <li className="tt-node" data-tier={node.tier}>
      <span className="tt-row">
        <button
          type="button"
          className="tt-label"
          data-tt-path={node.path}
          data-testid={`tt-node-${node.path}`}
          data-tier={node.tier}
          data-reading={mode}
          data-selected={String(node.path === selected)}
          aria-pressed={node.path === selected}
          title={`${node.path} — ${TIER_WORDS[node.tier]}`}
          style={{ "--tt-glow": glow } as CSSProperties}
          onClick={() => {
            onSelect(node.path);
          }}
        >
          {node.segment}
          {node.tier === "undeclared" ? (
            <span className="tt-flag" aria-label="undeclared topic">
              ⚠
            </span>
          ) : null}
          {node.tier === "observed-under-declaration" ? (
            <span className="tt-flag tt-flag-observed" aria-label="observed under declaration">
              ◌
            </span>
          ) : null}
        </button>
        {branch ? (
          <button
            type="button"
            className="tt-collapse"
            aria-label={
              isCollapsed ? `expand ${node.path || "the tree"}` : `collapse ${node.path}`
            }
            data-testid={`tt-collapse-${node.path}`}
            onClick={() => {
              onToggleCollapse(node.path);
            }}
          >
            {isCollapsed ? "+" : "−"}
          </button>
        ) : null}
      </span>
      {isCollapsed && summary !== null ? (
        <span className="tt-summary" data-testid={`tt-summary-${node.path}`}>
          {node.children.length} topics folded; {summary.count} arrivals between them
        </span>
      ) : null}
      {branch && !isCollapsed ? (
        <ul
          className="tt-children"
          style={{ "--tt-edge": ripplePhase(activity, node.path, now) } as CSSProperties}
        >
          {node.children.map((child) => (
            <Node
              key={child.path}
              node={child}
              activity={activity}
              now={now}
              selected={selected}
              onSelect={onSelect}
              collapsed={collapsed}
              onToggleCollapse={onToggleCollapse}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function TreeView(props: TreeViewProps): JSX.Element {
  const { root, ...rest } = props;
  return (
    <ul className="tt-tree" data-testid="topic-tree-root">
      {root.children.map((child) => (
        <Node key={child.path} node={child} {...rest} />
      ))}
    </ul>
  );
}
