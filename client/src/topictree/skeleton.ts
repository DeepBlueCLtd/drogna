/**
 * The declared skeleton: what the topology says exists, drawn before anything speaks.
 *
 * Built from the derived topology document and from nothing else (022 FR-001). Every
 * concrete topic row becomes a leaf; a wildcard row (`obs/#`) declares its branch and
 * lends the branch its governing master; the roles become the consumer column with their
 * filters and the components that authenticate as them. A declared-but-silent topic is
 * information, not absence, so the whole skeleton exists cold — activity is a separate
 * model and there is no route from here to it (Constitution VII).
 *
 * Topics heard on the wire that the artefact does not row are *grafted* at view time:
 * covered by a declared wildcard, they are observed-under-declaration; covered by
 * nothing, they are undeclared and marked — a finding about the topology, never
 * absorbed quietly (022 FR-006).
 */
import type { DrognaBrokerTopology } from "../generated/messages/topology";

import { isCovered } from "./match";

/** The three ways a topic can stand to the declared topology (022 FR-006). */
export type Tier = "declared" | "observed-under-declaration" | "undeclared";

/** One segment path in the tree. Children are ordered by segment. */
export interface TreeNode {
  /** The full path, e.g. `obs/platform-a/ds-temperature`. Empty string at the root. */
  readonly path: string;
  /** The last segment, which is what the tree draws. */
  readonly segment: string;
  readonly tier: Tier;
  /** The governing master, own or lent by the covering branch declaration. */
  readonly schema: string | null;
  /** True where `schema` came from the covering branch rather than this topic's row. */
  readonly schemaInherited: boolean;
  /** True where a wildcard row (`<branch>/#`) declares this whole branch. */
  readonly declaresBranch: boolean;
  readonly children: readonly TreeNode[];
}

/** A consumer role: the visible answer to "who is triggered by this" (022 FR-004). */
export interface ConsumerRole {
  readonly role: string;
  readonly rules: readonly { readonly access: string; readonly filter: string }[];
  /** The components the artefact records authenticating as this role. */
  readonly components: readonly string[];
}

export interface Skeleton {
  readonly root: TreeNode;
  readonly roles: readonly ConsumerRole[];
  /** Every concrete declared path, for classification and for the detail view. */
  readonly declaredPaths: ReadonlySet<string>;
}

interface MutableNode {
  path: string;
  segment: string;
  tier: Tier;
  schema: string | null;
  schemaInherited: boolean;
  declaresBranch: boolean;
  children: Map<string, MutableNode>;
}

function newNode(path: string, segment: string, tier: Tier): MutableNode {
  return {
    path,
    segment,
    tier,
    schema: null,
    schemaInherited: false,
    declaresBranch: false,
    children: new Map(),
  };
}

function descend(root: MutableNode, path: string, tier: Tier): MutableNode {
  let node = root;
  let walked = "";
  for (const segment of path.split("/")) {
    walked = walked === "" ? segment : `${walked}/${segment}`;
    const found = node.children.get(segment);
    if (found === undefined) {
      const made = newNode(walked, segment, tier);
      node.children.set(segment, made);
      node = made;
    } else {
      node = found;
    }
  }
  return node;
}

function frozen(node: MutableNode): TreeNode {
  return {
    path: node.path,
    segment: node.segment,
    tier: node.tier,
    schema: node.schema,
    schemaInherited: node.schemaInherited,
    declaresBranch: node.declaresBranch,
    children: [...node.children.values()]
      .sort((left, right) => left.segment.localeCompare(right.segment))
      .map(frozen),
  };
}

/**
 * A node with no master of its own reads under the nearest branch declaration above it,
 * and the display states the difference: `schemaInherited` is what lets the detail view
 * say "governed by the branch's master" rather than presenting a lent shape as the
 * topic's own.
 */
function inherit(node: MutableNode, above: string | null): void {
  if (node.schema === null && above !== null) {
    node.schema = above;
    node.schemaInherited = true;
  }
  const lent = node.declaresBranch ? node.schema : above;
  for (const child of node.children.values()) {
    inherit(child, lent);
  }
}

/** The branch a wildcard row declares: `obs/#` names `obs`, or null for a concrete row. */
function branchOf(topic: string): string | null {
  return topic.endsWith("/#") ? topic.slice(0, -2) : null;
}

/**
 * Build the declared skeleton from the topology document. Pure: same document, same
 * skeleton, whatever has or has not been heard.
 */
export function buildSkeleton(topology: DrognaBrokerTopology): Skeleton {
  const root = newNode("", "", "declared");
  const declaredPaths = new Set<string>();

  // Branch declarations first, so a concrete row under one can inherit its master.
  const branchSchemas = new Map<string, string | null>();
  for (const entry of topology.topics) {
    const branch = branchOf(entry.topic);
    if (branch !== null) {
      branchSchemas.set(branch, entry.schema);
      const node = descend(root, branch, "declared");
      node.declaresBranch = true;
      node.schema = entry.schema;
      declaredPaths.add(entry.topic);
      declaredPaths.add(branch);
    }
  }
  for (const entry of topology.topics) {
    if (branchOf(entry.topic) !== null || entry.topic.includes("+")) {
      continue;
    }
    const node = descend(root, entry.topic, "declared");
    node.schema = entry.schema;
    declaredPaths.add(entry.topic);
    // Every ancestor of a declared topic is part of the declared drawing.
    const segments = entry.topic.split("/");
    for (let depth = 1; depth < segments.length; depth += 1) {
      declaredPaths.add(segments.slice(0, depth).join("/"));
    }
  }
  inherit(root, null);

  const roles: ConsumerRole[] = topology.roles.map((role) => ({
    role: role.role,
    rules: role.rules.map((rule) => ({ access: rule.access, filter: rule.filter })),
    components: topology.components
      .filter((component) => component.role === role.role)
      .map((component) => component.id),
  }));

  return { root: frozen(root), roles, declaredPaths };
}

/** The node at a path, or null — a selection can outlive the shape that offered it. */
export function findNode(root: TreeNode, path: string): TreeNode | null {
  if (root.path === path) {
    return root;
  }
  for (const child of root.children) {
    const found = findNode(child, path);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

/**
 * How a heard topic stands to the declared topology. Declared topics are rows (or their
 * ancestors); a topic covered by any declared filter is observed under declaration; a
 * topic covered by nothing is undeclared — shown, and marked (022 FR-006).
 */
export function classify(topic: string, skeleton: Skeleton, topology: DrognaBrokerTopology): Tier {
  if (skeleton.declaredPaths.has(topic)) {
    return "declared";
  }
  return isCovered(topic, topology.roles) ? "observed-under-declaration" : "undeclared";
}

/**
 * The skeleton with heard-but-unrowed topics grafted in where their segments place
 * them, each carrying its tier. Pure, and applied at view time: the skeleton itself
 * never changes because something was heard.
 */
export function withGrafts(root: TreeNode, grafts: ReadonlyMap<string, Tier>): TreeNode {
  if (grafts.size === 0) {
    return root;
  }
  const thaw = (node: TreeNode): MutableNode => {
    const mutable = newNode(node.path, node.segment, node.tier);
    mutable.schema = node.schema;
    mutable.schemaInherited = node.schemaInherited;
    mutable.declaresBranch = node.declaresBranch;
    for (const child of node.children) {
      mutable.children.set(child.segment, thaw(child));
    }
    return mutable;
  };
  const mutable = thaw(root);
  for (const [topic, tier] of grafts) {
    const node = descend(mutable, topic, tier);
    // A graft never overwrites a declared node: arrival on a declared topic is
    // activity, not structure.
    if (node.tier === "declared") {
      continue;
    }
    node.tier = tier;
  }
  // A graft under a declared branch reads under that branch's master, stated as lent.
  inherit(mutable, null);
  return frozen(mutable);
}
