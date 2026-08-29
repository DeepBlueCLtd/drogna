/**
 * The topic tree (SRD-v2 FR-24, E12): structure from the derived topology artefact
 * and nothing else; illumination from genuinely received traffic and nothing else;
 * the two never mixing. Arrival is a pulse at the leaf and a ripple up the
 * ancestors, crossing to sustained intensity as rates rise; consumer roles are a
 * first-class column connected to the subtrees their declared filters cover; wide
 * branches collapse to a summary node.
 *
 * A display may not show cold where there is traffic (E13): this view hears through
 * the shell's read-everything identity, and a received topic no entry declares is
 * rendered as an undeclared branch — a finding, never a silence.
 */
import { useEffect, useRef, useState } from 'react';
import { topology } from '../../generated/topology.js';
import type { SeamClient } from '../../seam/transport.js';
import { topicMatchesFilter } from './topic-match.js';

interface TreeNode {
  segment: string;
  path: string;
  children: Map<string, TreeNode>;
  declared: boolean;
  schema: string | null;
  subscribers: readonly string[];
  publishers: readonly string[];
}

interface Activity {
  count: number;
  lastMs: number;
  /** Messages per second, exponentially smoothed. */
  rate: number;
}

const WIDE_BRANCH = 8;

function buildTree(): TreeNode {
  const root: TreeNode = { segment: '', path: '', children: new Map(), declared: true, schema: null, subscribers: [], publishers: [] };
  for (const entry of topology.topics) {
    if (entry.topic.includes('#') || entry.topic.includes('+')) continue; // filters are permissions, not places
    let node = root;
    let path = '';
    for (const segment of entry.topic.split('/')) {
      path = path ? `${path}/${segment}` : segment;
      let child = node.children.get(segment);
      if (!child) {
        child = { segment, path, children: new Map(), declared: true, schema: null, subscribers: [], publishers: [] };
        node.children.set(segment, child);
      }
      node = child;
    }
    node.schema = entry.schema;
    node.subscribers = entry.subscribers;
    node.publishers = entry.publishers;
  }
  return root;
}

/** Roles whose subscribe filters cover this subtree (the E12 roles column). */
function rolesCovering(path: string): string[] {
  return topology.roles
    .filter((role) =>
      role.rules.some(
        (rule) =>
          (rule.access === 'read' || rule.access === 'readwrite') &&
          (topicMatchesFilter(rule.filter, path) || rule.filter.startsWith(`${path}/`) || rule.filter === '#'),
      ),
    )
    .map((role) => role.role);
}

export function TopicTree({ client }: { client: SeamClient }) {
  const [tree] = useState(buildTree);
  const activity = useRef(new Map<string, Activity>());
  const [, setSweep] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    return client.subscribe('#', (message) => {
      // harness:allow-wallclock pulse decay and rate are render-path smoothing (ADR-0007's bound)
      const now = Date.now();
      let path = '';
      for (const segment of message.topic.split('/')) {
        path = path ? `${path}/${segment}` : segment;
        const entry = activity.current.get(path) ?? { count: 0, lastMs: 0, rate: 0 };
        const dt = entry.lastMs ? (now - entry.lastMs) / 1000 : 1;
        entry.rate = entry.rate * Math.exp(-dt / 5) + 1 / 5;
        entry.count += 1;
        entry.lastMs = now;
        activity.current.set(path, entry);
      }
      // An arrival on an undeclared topic must grow the tree, never vanish (E13).
      let node = tree;
      let nodePath = '';
      for (const segment of message.topic.split('/')) {
        nodePath = nodePath ? `${nodePath}/${segment}` : segment;
        let child = node.children.get(segment);
        if (!child) {
          child = { segment, path: nodePath, children: new Map(), declared: false, schema: null, subscribers: [], publishers: [] };
          node.children.set(segment, child);
        }
        node = child;
      }
      setSweep((n) => n + 1);
    });
  }, [client, tree]);

  useEffect(() => {
    // harness:allow-wallclock pulse decay re-renders on host time (render path only)
    const sweep = setInterval(() => setSweep((n) => n + 1), 400);
    return () => clearInterval(sweep);
  }, []);

  // harness:allow-wallclock pulse decay compares against host now (render path only)
  const now = Date.now();

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const entries = [...node.children.values()].sort((a, b) => a.segment.localeCompare(b.segment));
    const wide = entries.length > WIDE_BRANCH && !expanded.has(node.path);
    return (
      <ul className="topic-branch" key={node.path || 'root'}>
        {(wide ? [] : entries).map((child) => {
          const heard = activity.current.get(child.path);
          const age = heard ? now - heard.lastMs : Number.POSITIVE_INFINITY;
          const pulse = age < 450;
          const intensity = heard ? Math.min(1, heard.rate / 2) : 0;
          return (
            <li key={child.path}>
              <span
                className={`topic-node${pulse ? ' topic-pulse' : ''}${child.declared ? '' : ' topic-undeclared'}`}
                style={{ opacity: 0.45 + 0.55 * intensity }}
                data-topic-path={child.path}
                data-lit={heard !== undefined}
                title={child.schema ?? undefined}
              >
                {child.segment}
                {heard && <span className="topic-count">{heard.count}</span>}
                {!child.declared && <span className="topic-flag">undeclared</span>}
              </span>
              {(() => {
                // The roles column (E12): on a leaf, the declared subscribers of the
                // topic; on a branch, the roles whose filters cover the subtree.
                const roles = child.children.size === 0 ? child.subscribers : rolesCovering(child.path);
                return roles.length > 0 ? (
                  <span className="topic-roles">
                    {roles.map((role) => (
                      <span key={role} className="topic-role-chip" title="a consumer whose declared filters cover this subtree">
                        {role}
                      </span>
                    ))}
                  </span>
                ) : null;
              })()}
              {renderNode(child, depth + 1)}
            </li>
          );
        })}
        {wide && (
          <li>
            <button
              className="topic-summary"
              onClick={() => setExpanded((previous) => new Set([...previous, node.path]))}
            >
              {entries.length} branches — expand
            </button>
          </li>
        )}
      </ul>
    );
  };

  return (
    <div className="topic-tree" data-testid="topic-tree">
      <p className="panel-footnote">
        Structure: the derived topology artefact ({topology.generator}). Light: received
        traffic. Roles beside a leaf are the consumers whose declared filters cover it.
      </p>
      {renderNode(tree, 0)}
    </div>
  );
}
