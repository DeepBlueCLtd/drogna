/**
 * The three edges of the read path, and what this browser can honestly say about each.
 *
 * The path is the architecture's central bet made walkable: coverage store to query layer
 * to proxy to this browser, every hop governed by a published standard. The browser
 * witnesses exactly one of the three — the proxy answering it — so the other two are
 * drawn **inferred**, and the marking is not a style: for each crossing outcome this
 * module states in words what is actually known about that hop and where the knowledge
 * comes from (FR-004). The deliberate absence of trace headers is why inference is all
 * there is; the spec chose honesty about that over instrumenting the services.
 *
 * Edge identifiers reuse the layout's boundary identifiers, so the classification table
 * and its test — the ones that already hold every boundary in the diagram — hold these
 * three without a second table (FR-005). All three are classified plumbing there, with
 * the reasons argued in `legibility/classification.ts`; the spec's earlier bespoke
 * reading was reconciled against that table and the table won, as the spec's own
 * Assumptions said it would.
 *
 * Nothing here holds state, subscribes to anything, or can light a component. It is a
 * static description of three hops plus pure wording functions over a recorded crossing.
 */
import { boundaryId } from "../legibility/classification";

import type { Crossing } from "./crossings";
import { INDEX_STANDARD, STANDARDS } from "./standards";
import type { StandardName } from "./standards";

export type EdgeWitness = "witnessed" | "inferred";

export interface ReadPathEdge {
  /** The layout's identifier for this boundary, shared with the classification table. */
  readonly id: string;
  readonly from: string;
  readonly to: string;
  /** The hop, in words. */
  readonly title: string;
  /** The standard governing what crosses this hop. */
  readonly standard: StandardName;
  /** What governs the hop, said beside the badge. */
  readonly governs: string;
  readonly witness: EdgeWitness;
}

/** Store to browser, in crossing order. The last is the only one the browser witnesses. */
export const READ_PATH_EDGES: readonly ReadPathEdge[] = [
  {
    id: boundaryId("coverage_store", "query"),
    from: "coverage_store",
    to: "query",
    title: "coverage store to query layer",
    standard: "CF Conventions",
    governs:
      "the store holds NetCDF written to CF conventions, and the query layer's EDR provider reads it as such",
    witness: "inferred",
  },
  {
    id: boundaryId("query", "proxy"),
    from: "query",
    to: "proxy",
    title: "query layer to proxy",
    standard: "OGC API-EDR",
    governs:
      "the query layer serves OGC API-EDR, and the proxy forwards the released prefix to it unchanged",
    witness: "inferred",
  },
  {
    id: boundaryId("proxy", "client"),
    from: "proxy",
    to: "client",
    title: "proxy to this browser",
    standard: "CoverageJSON",
    governs:
      "the answer crosses as CoverageJSON over HTTP, through the one proxy under one path policy",
    witness: "witnessed",
  },
];

export const READ_PATH_EDGES_BY_ID: ReadonlyMap<string, ReadPathEdge> = new Map(
  READ_PATH_EDGES.map((edge) => [edge.id, edge]),
);

/** Re-exported for the view, so the badge and the edge label draw from one register. */
export { STANDARDS, INDEX_STANDARD };

/**
 * What this browser actually knows about a hop, for one crossing, in a sentence.
 *
 * The witnessed edge states its evidence directly. For an inferred edge the sentence
 * carries both halves the spec asks for — what is known, and from where — and degrades
 * honestly with the outcome: an error status from the proxy, or a request that never
 * completed, supports no claim about the hops behind it, and the sentence says so
 * instead of narrating a crossing nobody observed.
 */
export function knownAbout(edge: ReadPathEdge, crossing: Crossing): string {
  if (edge.witness === "witnessed") {
    if (crossing.outcome === "failed") {
      return (
        "Witnessed directly, as a failure: the browser issued this request and no response " +
        "arrived. What is recorded is the error the browser's own transport reported."
      );
    }
    return (
      "Witnessed directly: this browser composed the request and received this response, " +
      "so everything shown for this hop is first-hand."
    );
  }
  if (crossing.outcome === "failed") {
    return (
      "Inferred, and for this crossing nothing can be: the request did not complete, so " +
      "the browser has no response to reason back from and does not know whether anything " +
      "crossed this hop at all. Absence of knowledge, stated as such."
    );
  }
  if (crossing.outcome === "refused") {
    return (
      `Inferred from the response, not witnessed: the proxy answered ${crossing.status ?? "an error"}, ` +
      "which is the proxy speaking. Whether this hop was crossed on the way to that answer " +
      "is not something the browser can see, and it is not claimed."
    );
  }
  if (edge.to === "proxy") {
    return (
      "Inferred from the response, not witnessed: the proxy holds no forecasts, so an " +
      "answered read implies the query layer answered it behind the proxy. That implication " +
      "— nothing stronger — is what this edge draws; the request and response shown are the " +
      "witnessed ones it is inferred from."
    );
  }
  return (
    "Inferred from the response, not witnessed: the values in an answered CoverageJSON body " +
    "had to be read from the coverage store's files by the query layer's provider. The " +
    "browser sees only the result; this hop is that reasoning drawn, not an observation."
  );
}
