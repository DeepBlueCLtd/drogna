/**
 * The integrator's account of one node (022 FR-005): where a new process would attach,
 * and the grant it would need.
 *
 * Declared facts — matching roles with access, the governing master — come from the
 * topology document through the same pure matching the column uses, so the roles named
 * here agree with the artefact exactly (SC-003). Observed facts come from the activity
 * model, and where nothing was observed they are stated as unobserved, never invented
 * or zero-filled (Constitution VII applied to a display). Payloads are opaque: shown
 * verbatim, pretty-printed where they parse as JSON, size-capped with the cap stated,
 * and never failed on.
 */
import type { BrokerRole } from "../generated/messages/topology";

import type { ActivityState } from "./activity";
import { simRatePerSecond } from "./activity";
import type { DeclaredFilter } from "./match";
import { coveringFilters } from "./match";
import type { TreeNode } from "./skeleton";

/** How many characters of a payload the detail shows before stating the cap. */
export const PAYLOAD_DISPLAY_CAP = 16_384;

export type PayloadView =
  | { readonly kind: "unobserved" }
  | { readonly kind: "json"; readonly pretty: string }
  | { readonly kind: "raw"; readonly shown: string; readonly reason: string };

export interface SelectionDetail {
  readonly path: string;
  readonly tier: TreeNode["tier"];
  readonly payload: PayloadView;
  /** The last arrival's simulation-time stamp, or null — stated, never invented. */
  readonly lastArrivalSimTime: string | null;
  /** Arrivals per simulation second over the recent window, or null where unstatable. */
  readonly ratePerSimulationSecond: number | null;
  readonly arrivals: number;
  /** Every role holding a matching declared filter, with its access. Exact (SC-003). */
  readonly roles: readonly DeclaredFilter[];
  readonly schema: string | null;
  readonly schemaInherited: boolean;
}

/** Render one payload safely: verbatim intent, stated caps, no failure on content. */
export function viewPayload(payload: string | undefined): PayloadView {
  if (payload === undefined) {
    return { kind: "unobserved" };
  }
  if (payload.length > PAYLOAD_DISPLAY_CAP) {
    return {
      kind: "raw",
      shown: payload.slice(0, PAYLOAD_DISPLAY_CAP),
      reason:
        `${String(payload.length)} characters; showing the first ` +
        `${String(PAYLOAD_DISPLAY_CAP)} — the payload is held whole, displayed capped`,
    };
  }
  try {
    const parsed: unknown = JSON.parse(payload);
    return { kind: "json", pretty: JSON.stringify(parsed, null, 2) };
  } catch {
    return {
      kind: "raw",
      shown: payload,
      reason: "not JSON; shown as received",
    };
  }
}

/** The whole account, pure: node, activity and the document in, statements out. */
export function describeSelection(
  node: TreeNode,
  activity: ActivityState,
  roles: readonly BrokerRole[],
): SelectionDetail {
  const observed = activity.get(node.path);
  return {
    path: node.path,
    tier: node.tier,
    payload: viewPayload(observed?.last.payload),
    lastArrivalSimTime: observed?.last.simTime ?? null,
    ratePerSimulationSecond: simRatePerSecond(observed),
    arrivals: observed?.count ?? 0,
    roles: coveringFilters(node.path, roles),
    schema: node.schema,
    schemaInherited: node.schemaInherited,
  };
}
