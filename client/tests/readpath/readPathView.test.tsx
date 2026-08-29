/**
 * The read-path pane, rendered against real recorded state and against none.
 *
 * The scenarios feature 018's Story 1 and Story 4 name, asserted on the markup: a
 * boundary nothing has crossed states the absence of traffic; a recorded crossing shows
 * the request line, the response's declared type and size, the simulation time it
 * carried and the governing standard; the server-side edges carry the inferred marking
 * in text and in an attribute; a failure is drawn as the failure it was; the history
 * states its bound and its evictions; truncation is declared; the re-ask control states
 * its interval and the reason it is disabled.
 *
 * Rendered with `renderToStaticMarkup`, the suite's idiom. Selection is exercised by
 * rendering the detail component directly, the same way the map suite renders a mode.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { emptyReadPath, recordCrossing } from "../../src/readpath/crossings";
import type { ObservedCrossing, ReadPathState } from "../../src/readpath/crossings";
import { ReadPathView } from "../../src/readpath/ReadPathView";
import type { ReAskOffer } from "../../src/readpath/ReadPathView";
import { StandardBadge } from "../../src/readpath/StandardBadge";
import { STANDARDS } from "../../src/readpath/standards";

const IDLE_ASK: ReAskOffer = {
  kind: null,
  unavailableBecause: "no plan has been recommended and no run has been announced, so there is no read the client already makes to repeat",
  gate: { allowed: true },
};

const FIELD_ASK: ReAskOffer = { kind: "field", unavailableBecause: null, gate: { allowed: true } };

function answered(overrides: Partial<ObservedCrossing> = {}): ObservedCrossing {
  return {
    kind: "field",
    requestLine: "GET http://query.invalid/released/u/cube?bbox=0,48,3,50",
    outcome: "answered",
    status: 200,
    declaredType: "application/prs.coverage+json",
    bodyBytes: 5_000,
    simTime: "2026-08-26T00:10:00.000000Z",
    excerpt: '{"type":"Coverage"',
    excerptDroppedBytes: 4_982,
    failure: null,
    ...overrides,
  };
}

function render(
  state: ReadPathState,
  reAsk: ReAskOffer = IDLE_ASK,
  standardsUrl?: string,
  initialEdge?: string,
): string {
  return renderToStaticMarkup(
    <ReadPathView
      state={state}
      standardsUrl={standardsUrl}
      reAsk={reAsk}
      onReAsk={() => undefined}
      initialEdge={initialEdge}
    />,
  );
}

describe("before any read", () => {
  const markup = render(emptyReadPath());

  it("draws all three edges, labelled by their standards, inferred ones marked", () => {
    expect(markup).toContain("coverage store to query layer — CF Conventions (inferred)");
    expect(markup).toContain("query layer to proxy — OGC API-EDR (inferred)");
    expect(markup).toContain("proxy to this browser — CoverageJSON");
    expect(markup).not.toContain("proxy to this browser — CoverageJSON (inferred)");
  });

  it("explains itself while nothing is selected, rather than showing an empty detail", () => {
    expect(markup).toContain('data-testid="read-path-unselected"');
    expect(markup).toContain("marked inferred because this browser cannot witness them");
  });

  it("says why nothing can be re-asked, with the interval stated", () => {
    expect(markup).toContain("Nothing can be re-asked yet");
    expect(markup).toContain("At most one re-ask per 10 seconds");
    expect(markup).toContain("disabled");
  });
});

describe("a selected boundary nothing has crossed", () => {
  it("states the absence of traffic, not the absence of a display", () => {
    const markup = render(emptyReadPath(), IDLE_ASK, undefined, "proxy→client");
    expect(markup).toContain('data-testid="read-path-empty"');
    expect(markup).toContain("absence of traffic, not the");
    expect(markup).toContain("absence of a display");
  });
});

describe("a recorded crossing, read in full on the witnessed edge", () => {
  const state = recordCrossing(emptyReadPath(), answered());
  const markup = render(state, FIELD_ASK, "http://site.invalid/standards", "proxy→client");

  it("is marked witnessed, first-hand", () => {
    expect(markup).toContain('data-witness="witnessed"');
    expect(markup).toContain("Witnessed directly");
  });

  it("shows the request line, the declared type and size, and the simulation time carried", () => {
    expect(markup).toContain("GET http://query.invalid/released/u/cube?bbox=0,48,3,50");
    expect(markup).toContain("application/prs.coverage+json");
    expect(markup).toContain("5000 bytes");
    expect(markup).toContain("2026-08-26T00:10:00.000000Z");
  });

  it("names the governing standard beside a primer link", () => {
    expect(markup).toContain("CoverageJSON");
    expect(markup).toContain('href="http://site.invalid/standards/coveragejson/"');
  });

  it("declares the excerpt's truncation rather than shortening silently", () => {
    expect(markup).toContain('data-testid="crossing-truncated"');
    expect(markup).toContain("Truncated");
    expect(markup).toContain("the response was 5000 bytes");
  });

  it("states the history's bound and its evictions (FR-009)", () => {
    expect(markup).toContain("1 crossing retained of 1 recorded");
    expect(markup).toContain("beyond the bound of 64");
    expect(markup).toContain("0 evicted so far");
  });

  it("shows the classification the layout already holds for this boundary", () => {
    expect(markup).toContain('data-testid="read-path-classification"');
    expect(markup).toContain("well-chosen plumbing");
  });
});

describe("the same crossing on a server-side edge", () => {
  const state = recordCrossing(emptyReadPath(), answered());

  it("is marked inferred, in an attribute and in words saying what is known", () => {
    const markup = render(state, FIELD_ASK, undefined, "query→proxy");
    expect(markup).toContain('data-witness="inferred"');
    expect(markup).toContain("Inferred, not witnessed");
    expect(markup).toContain("Inferred from the response, not witnessed");
  });

  it("states the absence of knowledge for a crossing that failed", () => {
    const failed = recordCrossing(
      emptyReadPath(),
      answered({
        outcome: "failed",
        status: null,
        declaredType: null,
        bodyBytes: null,
        simTime: null,
        excerpt: null,
        excerptDroppedBytes: 0,
        failure: "the request did not complete: connection refused",
      }),
    );
    const markup = render(failed, FIELD_ASK, undefined, "coverage_store→query");
    expect(markup).toContain("does not know whether anything crossed");
    expect(markup).toContain("failed — no response arrived");
  });
});

describe("a failed read on the witnessed edge", () => {
  it("is drawn as a failure, carrying the error the client actually received", () => {
    const failed = recordCrossing(
      emptyReadPath(),
      answered({
        outcome: "failed",
        status: null,
        declaredType: null,
        bodyBytes: null,
        simTime: null,
        excerpt: null,
        excerptDroppedBytes: 0,
        failure: "the request did not complete: connection refused",
      }),
    );
    const markup = render(failed, FIELD_ASK, undefined, "proxy→client");
    expect(markup).toContain('data-outcome="failed"');
    expect(markup).toContain("What the client actually received");
    expect(markup).toContain("connection refused");
    expect(markup).toContain("No response body arrived");
  });
});

describe("browsing history", () => {
  it("lists the retained crossings in order once there is more than one", () => {
    let state = emptyReadPath();
    state = recordCrossing(state, answered({ kind: "trajectory" }));
    state = recordCrossing(state, answered({ outcome: "refused", status: 502 }));
    const markup = render(state, FIELD_ASK, undefined, "proxy→client");
    expect(markup).toContain('data-testid="crossing-1"');
    expect(markup).toContain('data-testid="crossing-2"');
    expect(markup.indexOf('data-testid="crossing-1"')).toBeLessThan(
      markup.indexOf('data-testid="crossing-2"'),
    );
    expect(markup).toContain("2 crossings retained of 2 recorded");
  });
});

describe("a recorded crossing and the re-ask control", () => {
  const state = recordCrossing(emptyReadPath(), answered());

  it("keeps the absence statement for a path with traffic out of the edge buttons", () => {
    const markup = render(state, FIELD_ASK);
    expect(markup).not.toContain('data-testid="read-path-empty"');
  });

  it("offers a genuine re-ask, saying what it would do and that it is never a replay", () => {
    const markup = render(state, FIELD_ASK);
    expect(markup).toContain("one genuine request the client already makes");
    expect(markup).toContain("Never a replay");
  });

  it("states the reason when the gate refuses, and disables the control", () => {
    const markup = render(state, {
      kind: "field",
      unavailableBecause: null,
      gate: { allowed: false, because: "a re-asked read is in flight; its crossing completes before another can be asked" },
    });
    expect(markup).toContain("disabled");
    expect(markup).toContain("Disabled now: a re-asked read is in flight");
  });
});

describe("the badge", () => {
  it("links to the primer where the destination declared a site root", () => {
    const markup = renderToStaticMarkup(
      <StandardBadge standard={STANDARDS["OGC API-EDR"]} standardsUrl="http://site.invalid/standards" />,
    );
    expect(markup).toContain('href="http://site.invalid/standards/ogc-api-edr/"');
    expect(markup).toContain("OGC API-EDR");
  });

  it("links the slugless delivery channel to the standards index page", () => {
    const markup = renderToStaticMarkup(
      <StandardBadge
        standard={STANDARDS["MQTT, contract-validated JSON"]}
        standardsUrl="http://site.invalid/standards"
      />,
    );
    expect(markup).toContain('href="http://site.invalid/standards/"');
  });

  it("states the absence of a link where no site root was declared, and guesses nothing", () => {
    const markup = renderToStaticMarkup(
      <StandardBadge standard={STANDARDS["CoverageJSON"]} standardsUrl={undefined} />,
    );
    expect(markup).toContain("CoverageJSON");
    expect(markup).toContain("declares no site root");
    expect(markup).not.toContain("href=");
  });
});
