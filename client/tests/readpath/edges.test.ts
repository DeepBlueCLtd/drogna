/**
 * Three edges, one witnessed, two honestly inferred, all classified.
 *
 * FR-004's wording requirement is the substance here: an inferred edge must say what is
 * actually known and from where, and must stop claiming anything when the crossing it
 * would reason from failed. FR-005 is held structurally: the edges reuse the layout's
 * boundary identifiers, so the classification table — and `classification.test.ts`,
 * which asserts every boundary classified with a reason — covers them with no second
 * table. The spec's original bespoke reading of two of these was reconciled against that
 * table (spec.md, FR-005's amendment note); the assertion below pins the reconciled
 * reading so a silent reclassification would be noticed.
 */
import { describe, expect, it } from "vitest";

import { BOUNDARIES_BY_ID } from "../../src/legibility/classification";
import type { Crossing } from "../../src/readpath/crossings";
import { knownAbout, READ_PATH_EDGES } from "../../src/readpath/edges";

const CROSSING: Crossing = {
  kind: "field",
  sequence: 1,
  requestLine: "GET http://query.invalid/released/u/cube?bbox=0",
  outcome: "answered",
  status: 200,
  declaredType: "application/prs.coverage+json",
  bodyBytes: 64,
  simTime: "2026-08-26T00:10:00Z",
  excerpt: "{}",
  excerptDroppedBytes: 0,
  failure: null,
};

describe("the three edges", () => {
  it("are store to query to proxy to browser, in crossing order", () => {
    expect(READ_PATH_EDGES.map((edge) => edge.id)).toEqual([
      "coverage_store→query",
      "query→proxy",
      "proxy→client",
    ]);
  });

  it("mark only the browser-facing hop witnessed (FR-004)", () => {
    expect(READ_PATH_EDGES.map((edge) => edge.witness)).toEqual([
      "inferred",
      "inferred",
      "witnessed",
    ]);
  });

  it("each carry the standard that governs them, with the reason said", () => {
    expect(READ_PATH_EDGES.map((edge) => edge.standard)).toEqual([
      "CF Conventions",
      "OGC API-EDR",
      "CoverageJSON",
    ]);
    for (const edge of READ_PATH_EDGES) {
      expect(edge.governs.length, edge.id).toBeGreaterThan(20);
    }
  });

  it("are held by the existing classification table under the reconciled reading", () => {
    for (const edge of READ_PATH_EDGES) {
      const classification = BOUNDARIES_BY_ID.get(edge.id);
      expect(classification, `${edge.id} is not in the classification table`).toBeDefined();
      expect(classification?.kind).toBe("plumbing");
      expect(classification?.because.length ?? 0).toBeGreaterThan(20);
    }
  });
});

describe("what an edge says it knows", () => {
  const [storeToQuery, queryToProxy, proxyToBrowser] = READ_PATH_EDGES;

  it("says first-hand on the witnessed edge", () => {
    expect(knownAbout(proxyToBrowser!, CROSSING)).toContain("Witnessed directly");
  });

  it("states the inference and its source on an answered server-side hop", () => {
    const aboutProxyHop = knownAbout(queryToProxy!, CROSSING);
    expect(aboutProxyHop).toContain("Inferred from the response, not witnessed");
    expect(aboutProxyHop).toContain("query layer");
    const aboutStoreHop = knownAbout(storeToQuery!, CROSSING);
    expect(aboutStoreHop).toContain("Inferred from the response, not witnessed");
    expect(aboutStoreHop).toContain("coverage store");
  });

  it("claims nothing behind the proxy when the proxy itself refused", () => {
    const refused: Crossing = { ...CROSSING, outcome: "refused", status: 502 };
    const words = knownAbout(queryToProxy!, refused);
    expect(words).toContain("502");
    expect(words).toContain("not claimed");
  });

  it("states the absence of knowledge when the request never completed", () => {
    const failed: Crossing = { ...CROSSING, outcome: "failed", status: null };
    for (const edge of [storeToQuery!, queryToProxy!]) {
      const words = knownAbout(edge, failed);
      expect(words).toContain("nothing can be");
      expect(words).toContain("does not know whether anything crossed");
    }
    expect(knownAbout(proxyToBrowser!, failed)).toContain("as a failure");
  });
});
