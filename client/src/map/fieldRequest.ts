/**
 * Where the field is asked for, and what is asked. One request, caused by one announcement.
 *
 * The rule `overlay.ts` states about freshness binds this module exactly: FR-021 forbids
 * polling the query layer to discover that a new run exists, because the query layer has no
 * notification mechanism and a page that polled would work while being wrong in a way
 * nothing on the screen would show. So there is no timer here, no interval, no retry loop
 * and no parameter one could arrive through. There is a function that turns an announcement
 * into a request, and the caller may only call it because an announcement arrived. A test
 * counts requests against announcements, which is the only form of that promise that stays
 * true under refactoring.
 *
 * Three decisions are made here that a response does not show, so they are stated:
 *
 * **The bounding box is the announcement's own grid bounds.** Not the declared extent,
 * which describes the destination rather than the run, and not a box the viewer panned to,
 * which would make what is fetched depend on where somebody was looking. Asking for the
 * grid the publisher said it published is the request whose answer can be checked against
 * the announcement that caused it.
 *
 * **One time step, and it is the run's own valid start.** The alternative is the run's whole
 * valid span, which for this harness's grid is thirteen times as many cells for a display
 * that draws one instant at a time. The instant drawn is therefore unambiguous and is
 * printed beside the field: a map that quietly showed the first of thirteen steps while
 * looking like "the forecast" would be answering a question nobody asked. Ageing between
 * runs is the planner's projection's business (FR-022) and not a matter of which step is
 * drawn.
 *
 * **Every depth.** The volume mode draws the same fetched cube with its vertical axis made
 * spatial, and FR-006 requires entering it to fetch nothing. That is only true if the flat
 * map's own fetch already carried every depth, so it does.
 *
 * Nothing in this module reads a clock. Every instant it sends is one the publisher
 * announced.
 */
import type { RuntimeConfig } from "../config/runtime";
import type { MapExtent } from "./extent";

export interface FieldRequest {
  readonly url: string;
  /** The collection that was asked for, so a failure can name it. */
  readonly collection: string;
  /** The parameter that was asked for. */
  readonly parameter: string;
  /** The simulation instant the response will describe. */
  readonly simTime: string;
}

/** Why no request could be assembled. Never a silent absence of one. */
export interface NoFieldRequest {
  readonly missing: string;
}

export type FieldRequestOutcome = FieldRequest | NoFieldRequest;

/** Whether an outcome is a request, for a caller that must not assume. */
export function isRequest(outcome: FieldRequestOutcome): outcome is FieldRequest {
  return "url" in outcome;
}

/**
 * The request for one run's field, or a statement of what the page has not been told.
 *
 * Assembled by hand rather than with the browser's search-parameter class, whose name
 * feature 003's standing scan of this source forbids outright: a client that can read its
 * own address bar can be told what to display by a link, which is Constitution VII's
 * failure arriving by another door. This builds an outgoing query and is not that, and the
 * way to say so is to not reach for the name at all rather than to weaken a scan that is
 * deliberately blunt.
 */
export function fieldRequest(
  config: RuntimeConfig,
  collection: string | null,
  extent: MapExtent | null,
  simTime: string | null,
): FieldRequestOutcome {
  if (collection === null) {
    return { missing: "which collection carries this run's uncertainty field" };
  }
  if (config.query.cubePath === undefined) {
    return { missing: "where a cube query is served under a collection" };
  }
  if (config.query.fieldParameter === undefined) {
    return { missing: "which parameter to draw as the uncertainty field" };
  }
  if (extent === null) {
    return { missing: "the bounds of the grid that was published" };
  }
  if (simTime === null) {
    return { missing: "the simulation instant the published forecast begins at" };
  }
  const west = Math.min(extent.minimumLongitude, extent.maximumLongitude);
  const east = Math.max(extent.minimumLongitude, extent.maximumLongitude);
  const south = Math.min(extent.minimumLatitude, extent.maximumLatitude);
  const north = Math.max(extent.minimumLatitude, extent.maximumLatitude);
  const bbox = [west, south, east, north].join(",");
  const query = [
    `bbox=${encodeURIComponent(bbox)}`,
    // An interval whose ends are equal, which the provider answers with the one step at
    // that instant rather than with a span. Stated as an interval because that is the
    // shape the standard gives for asking about time at all.
    `datetime=${encodeURIComponent(`${simTime}/${simTime}`)}`,
    `parameter-name=${encodeURIComponent(config.query.fieldParameter)}`,
  ];
  const base = `${config.query.collectionsUrl}/${collection}${config.query.cubePath}`;
  return {
    url: `${base}?${query.join("&")}`,
    collection,
    parameter: config.query.fieldParameter,
    simTime,
  };
}
