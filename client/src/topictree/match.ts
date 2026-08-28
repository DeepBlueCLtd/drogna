/**
 * MQTT topic filter matching, as the broker applies it.
 *
 * This is the join between the tree and the role column (022 FR-004): a role is
 * connected to exactly the topics its declared filters cover, and an arrival lights
 * exactly the roles whose filters match. The semantics are the broker's — `+` covers one
 * level, `#` covers the rest — and they are implemented once here, pure, so that the
 * unit tests can hold the panel's answer against `contracts/topology.json` itself
 * (SC-003) rather than against anything hand-kept.
 *
 * The same semantics live in `scripts/scan_topology.py` (`topic_matches`), where they
 * decide the artefact's permission columns. The two are held together by tests on both
 * sides asserting the same table of cases, which is the only cross-language guarantee
 * available: the shape that crosses the boundary is the topology document, and these
 * functions are behaviour, not shape.
 */
import type { AccessRule, BrokerRole } from "../generated/messages/topology";

/** Whether an MQTT filter covers a topic: `+` one level, `#` the rest. */
export function topicMatches(filter: string, topic: string): boolean {
  const filterParts = filter.split("/");
  const topicParts = topic.split("/");
  for (let index = 0; index < filterParts.length; index += 1) {
    const part = filterParts[index];
    if (part === "#") {
      return true;
    }
    if (index >= topicParts.length) {
      return false;
    }
    if (part !== "+" && part !== topicParts[index]) {
      return false;
    }
  }
  return filterParts.length === topicParts.length;
}

/** One declared access statement, carried with the role that holds it. */
export interface DeclaredFilter {
  readonly role: string;
  readonly access: AccessRule["access"];
  readonly filter: string;
}

/**
 * Every declared filter that covers a topic, with its role and access, in declaration
 * order. Nothing is omitted and nothing invented: this list is the whole of "who is
 * connected to this topic", and the detail view's role table reads straight off it.
 */
export function coveringFilters(
  topic: string,
  roles: readonly BrokerRole[],
): readonly DeclaredFilter[] {
  const covering: DeclaredFilter[] = [];
  for (const role of roles) {
    for (const rule of role.rules) {
      if (topicMatches(rule.filter, topic)) {
        covering.push({ role: role.role, access: rule.access, filter: rule.filter });
      }
    }
  }
  return covering;
}

/** Whether any declared filter of any role covers the topic, in either direction. */
export function isCovered(topic: string, roles: readonly BrokerRole[]): boolean {
  return roles.some((role) => role.rules.some((rule) => topicMatches(rule.filter, topic)));
}
