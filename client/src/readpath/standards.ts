/**
 * The standards the client's panes are delivered by, and where each primer is.
 *
 * A badge names the standard that delivered a pane's contents and links to that
 * standard's primer on the published site (FR-008). The names and slugs here mirror the
 * site's own standards section; where the site is lives in the served configuration
 * document, never in this source, so a destination that declares no site root gets
 * badges that name the standard and state the absence of a link (Constitution IV).
 *
 * Two of the client's delivery channels have no primer of their own: the control traffic
 * arrives over MQTT as contract-validated JSON, which the site explains on the standards
 * section's index page rather than in a dedicated primer. That entry links there and its
 * badge says what it is, rather than claiming a primer that does not exist.
 */

export type StandardName =
  | "OGC API-EDR"
  | "CoverageJSON"
  | "CF Conventions"
  | "SensorThings"
  | "MQTT, contract-validated JSON";

export interface Standard {
  readonly name: StandardName;
  /** What the standard delivers to this client, in a phrase the badge's tooltip shows. */
  readonly delivers: string;
  /**
   * The primer's directory slug under the site's standards section, or null where the
   * standards index page is the closest primer the site carries.
   */
  readonly primerSlug: string | null;
}

export const STANDARDS: Readonly<Record<StandardName, Standard>> = {
  "OGC API-EDR": {
    name: "OGC API-EDR",
    delivers: "reads against the coverage store: the field cube and the trajectory query",
    primerSlug: "ogc-api-edr",
  },
  CoverageJSON: {
    name: "CoverageJSON",
    delivers: "the response the browser renders: coverages as JSON, domain beside values",
    primerSlug: "coveragejson",
  },
  "CF Conventions": {
    name: "CF Conventions",
    delivers: "the coverage store's own convention: NetCDF the query layer reads fields from",
    primerSlug: "cf-conventions",
  },
  SensorThings: {
    name: "SensorThings",
    delivers: "the observation vocabulary, from sensor to query",
    primerSlug: "sensorthings",
  },
  "MQTT, contract-validated JSON": {
    name: "MQTT, contract-validated JSON",
    delivers:
      "the control namespace this page subscribes to, every payload checked against its master in contracts",
    primerSlug: null,
  },
};

/** The entry whose primer is the standards index itself. */
export const INDEX_STANDARD: Standard = STANDARDS["MQTT, contract-validated JSON"];

/**
 * Where a standard's primer is, from the destination's declared standards root.
 *
 * Returns null where no root was declared, which the badge renders as a stated absence.
 * A slugless standard links to the standards index, which is the site's own orientation
 * page for exactly that case.
 */
export function primerUrl(standardsUrl: string | undefined, standard: Standard): string | null {
  if (standardsUrl === undefined) {
    return null;
  }
  return standard.primerSlug === null ? `${standardsUrl}/` : `${standardsUrl}/${standard.primerSlug}/`;
}
