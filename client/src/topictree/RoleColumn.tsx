/**
 * The consumer roles, first-class: the visible answer to "who is triggered by this".
 *
 * Every role the topology declares is a row, whether or not anything it covers has
 * spoken — consumers are named, never built, and a named-but-idle consumer is exactly
 * the room-on-the-page the demonstration wants seen. A row lights only because an
 * arrival matched one of its declared filters (`filterPhase`, over genuinely received
 * traffic); a role whose filters match nothing that arrived does not change at all.
 */
import type { CSSProperties } from "react";

import type { ActivityState } from "./activity";
import { connectionGlow } from "./activity";
import type { ConsumerRole } from "./skeleton";

export interface RoleColumnProps {
  readonly roles: readonly ConsumerRole[];
  readonly activity: ActivityState;
  readonly now: number;
  /** Host instant the display was pinned at (paused or clock-unheard), or null. */
  readonly pinnedSince: number | null;
}

export function RoleColumn({ roles, activity, now, pinnedSince }: RoleColumnProps): JSX.Element {
  return (
    <div className="tt-roles" data-testid="topic-tree-roles">
      <h3>Consumer roles</h3>
      {roles.map((role) => {
        const phases = role.rules.map((rule) => connectionGlow(activity, rule.filter, now, pinnedSince));
        const glow = Math.max(0, ...phases);
        return (
          <div
            key={role.role}
            className="tt-role"
            data-tt-role={role.role}
            data-testid={`tt-role-${role.role}`}
            data-lit={String(glow > 0)}
            style={{ "--tt-glow": glow } as CSSProperties}
          >
            <span className="tt-role-name">{role.role}</span>
            <span className="tt-role-components">
              {role.components.length === 0
                ? "no component authenticates as this role"
                : role.components.join(", ")}
            </span>
            <ul className="tt-role-filters">
              {role.rules.map((rule, index) => (
                <li
                  key={`${rule.access} ${rule.filter}`}
                  data-tt-rule={`${role.role}:${index}`}
                  data-lit={String((phases[index] ?? 0) > 0)}
                >
                  <code>{rule.access}</code> <code>{rule.filter}</code>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
