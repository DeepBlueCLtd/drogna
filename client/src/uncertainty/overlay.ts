/**
 * Which run's uncertainty field is on the map, and how the page learned there was a new one.
 *
 * FR-021 states the rule negatively — the client MUST NOT poll the query layer to discover
 * that a new run exists — and SRD FR-31 gives the reason: the query layer has no
 * notification mechanism, so freshness is announced rather than discovered. A page that
 * polled would work, and would be wrong in a way nothing on the screen would show.
 *
 * So the only thing that moves the overlay's run identifier is a `ctl/run-published`
 * message. There is no timer here, no interval, no retry loop and no parameter one could
 * come in through: the fetch of the field itself is a consequence of an announcement,
 * never of a schedule. A test counts the fetches against the announcements, which is the
 * only form of that promise that stays true under refactoring.
 */
import { CONTROL_SCHEMAS } from "../contracts/schemas";
import { microsFromIso } from "../controls/simInstant";
import type { DrognaModelRunPublished } from "../generated/messages/run_published";

export interface OverlayState {
  /** The run whose field the overlay is showing, or null before any announcement. */
  readonly runId: string | null;
  /**
   * The fixed collection identifier the announcement named.
   *
   * One collection carries the forecast parameters and the uncertainty parameter
   * together, so the field fetch and the route's conditions both address it; which run it
   * serves is `runId`, carried separately in the same announcement (the link-5 decision,
   * issue #34). It still arrives in the announcement rather than in configuration, so
   * publishing a run edits no document anywhere (SRD FR-31).
   */
  readonly collection: string | null;
  /** The simulation-time span the forecast covers, as the publisher stated it. */
  readonly validFrom: string | null;
  readonly validTo: string | null;
  /** How many announcements have been folded in. */
  readonly announcements: number;
  /** How many announcements were refused by their schema and changed nothing. */
  readonly refused: number;
  /** True when the run in force has changed and the field for it has not been read yet. */
  readonly stale: boolean;
}

export const emptyOverlay: OverlayState = {
  runId: null,
  collection: null,
  validFrom: null,
  validTo: null,
  announcements: 0,
  refused: 0,
  stale: false,
};

/**
 * Fold in one announcement.
 *
 * A run published for inspection rather than made current does not move the overlay: the
 * publisher says which it is in the message (`current`), and a display that showed a
 * non-current run as the field in force would be asserting something the announcement
 * explicitly denied.
 */
export function announceRun(state: OverlayState, raw: unknown): OverlayState {
  if (!CONTROL_SCHEMAS.runPublished.validate(raw)) {
    return { ...state, refused: state.refused + 1 };
  }
  const message = raw as DrognaModelRunPublished;
  const announcements = state.announcements + 1;
  if (!message.current) {
    return { ...state, announcements };
  }
  return {
    runId: message.run_id,
    collection: message.collections.forecast,
    validFrom: message.valid_time.start_sim_time,
    validTo: message.valid_time.end_sim_time,
    announcements,
    refused: state.refused,
    stale: true,
  };
}

/** Record that the field for the run in force has been read. */
export function fieldRead(state: OverlayState): OverlayState {
  return state.stale ? { ...state, stale: false } : state;
}

/**
 * Whether a simulation instant falls inside the published forecast's valid span.
 *
 * Used by the route's arrival-time control as well as by the overlay, because it is the
 * same question in both places: is there a forecast for that moment at all? Answering
 * "the nearest one" would be the display substituting a field that does not apply, which
 * FR-027 forbids in as many words.
 */
export function coversInstant(state: OverlayState, simTime: string): boolean {
  if (state.validFrom === null || state.validTo === null) {
    return false;
  }
  const asked = microsFromIso(simTime);
  const from = microsFromIso(state.validFrom);
  const to = microsFromIso(state.validTo);
  if (asked === null || from === null || to === null) {
    // An instant that cannot be read is not quietly treated as inside the span. Where the
    // display cannot tell, it says there is no forecast rather than showing one.
    return false;
  }
  return asked >= from && asked <= to;
}
