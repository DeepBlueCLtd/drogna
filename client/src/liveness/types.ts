/**
 * The client's internal vocabulary for what it has heard.
 *
 * These types are the client's own model, not a second declaration of the heartbeat
 * contract (Constitution III). The wire shape is asserted once, at runtime, against the
 * heartbeat schema in contracts; what survives that check is adapted into the shapes here,
 * which carry things the message does not — when it arrived, and how long it is to be
 * believed.
 */

/** One heartbeat that passed validation, with what the client added on receipt. */
export interface Evidence {
  readonly componentId: string;
  /** As reported by the sender. Rendered as reported, never interpreted as health. */
  readonly status: string;
  /** Simulation time carried in the message: payload, not schedule (ADR-0006). */
  readonly simTime: string;
  readonly tick: number | null;
  readonly runId: string | null;
  readonly configDigest: string | null;
  readonly detail: string;
  /** How long this heartbeat is evidence of life, in host seconds. */
  readonly windowSeconds: number;
  /** Whether the sender declared that window, or the client's tolerance supplied it. */
  readonly windowDeclared: boolean;
  /** Host instant of arrival. Real time, per ADR-0006. */
  readonly receivedAt: number;
}

/** Everything the client has heard from one component id. */
export interface ComponentEvidence {
  /** The most recently arrived heartbeat: what liveness is measured against. */
  readonly latest: Evidence;
  /**
   * The heartbeat carrying the greatest simulation time: what is displayed.
   *
   * Arrival order and simulation order are not the same thing, and a message that
   * overtook another must not make the display go backwards.
   */
  readonly reported: Evidence;
  readonly heard: number;
  /**
   * Distinct sender identities seen for this component id, as run id and config digest.
   *
   * More than one still inside its window means two processes are publishing the same
   * id. The display shows that conflict rather than resolving it silently, because
   * resolving it would mean choosing which of two live things to hide. A component that
   * restarted under a new run id is not a conflict, which is why each identity carries
   * its own arrival: the older one simply falls outside its window.
   */
  readonly identities: readonly Identity[];
}

/** One publishing process, as far as the client can tell from what it carries. */
export interface Identity {
  readonly key: string;
  readonly runId: string | null;
  readonly configDigest: string | null;
  readonly lastReceivedAt: number;
  readonly windowSeconds: number;
}

/** What the client has heard, in total. The reducer's whole state. */
export interface LivenessState {
  readonly components: ReadonlyMap<string, ComponentEvidence>;
  /** Messages refused by the schema. Counted because a silent discard is a lie. */
  readonly discarded: number;
  readonly lastDiscardReason: string | null;
}

/** How a component is drawn. Indeterminate is not a shade of lit. */
export type Illumination = "lit" | "dark" | "indeterminate" | "self";

/** Whether the client can hear anything, and whether it has. */
export type ConnectionState = "not-connected" | "connected-silent" | "receiving";
