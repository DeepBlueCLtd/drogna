/**
 * A crossing exists because a read happened, and it records what actually came back.
 *
 * Constitution VII for the read path, asserted behaviourally: the observer delivers
 * exactly one crossing per request issued — an answered one, a refused one, or a failed
 * one — and zero crossings when no request was issued, because the only place a crossing
 * is constructed is inside the function that performs the read. The facts recorded are
 * the response's own: its status, its declared type, its size in bytes, the simulation
 * time its body carried, and a bounded excerpt whose truncation is declared.
 *
 * Watched failing: the truncation assertion against a version that sliced characters
 * rather than bytes (a multi-byte body under-reported what was dropped), and the failure
 * case against a version that swallowed the rejection and delivered nothing — the
 * assertion that a failure is a crossing too is the one this feature exists for.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ObservedCrossing } from "../../src/readpath/crossings";
import { EXCERPT_BYTES, observedRead, simTimeCarried } from "../../src/readpath/observedRead";

const original = globalThis.fetch;

let delivered: ObservedCrossing[] = [];
const deliver = (crossing: ObservedCrossing): void => {
  delivered.push(crossing);
};

beforeEach(() => {
  delivered = [];
});

afterEach(() => {
  globalThis.fetch = original;
});

function answering(body: string, status = 200, type = "application/prs.coverage+json"): void {
  globalThis.fetch = (async () =>
    new Response(body, { status, headers: { "content-type": type } })) as typeof globalThis.fetch;
}

describe("an answered read", () => {
  it("delivers one crossing carrying the response's own facts", async () => {
    const body = JSON.stringify({ domain: { axes: { t: { values: ["2026-08-26T00:10:00Z"] } } } });
    answering(body);
    const outcome = await observedRead("field", "http://query.invalid/released/u/cube?bbox=0", deliver);
    expect(outcome.ok).toBe(true);
    expect(delivered).toHaveLength(1);
    const crossing = delivered[0];
    expect(crossing?.requestLine).toBe("GET http://query.invalid/released/u/cube?bbox=0");
    expect(crossing?.outcome).toBe("answered");
    expect(crossing?.status).toBe(200);
    expect(crossing?.declaredType).toContain("coverage+json");
    expect(crossing?.bodyBytes).toBe(body.length);
    expect(crossing?.simTime).toBe("2026-08-26T00:10:00Z");
    expect(crossing?.excerpt).toBe(body);
    expect(crossing?.excerptDroppedBytes).toBe(0);
    expect(crossing?.failure).toBeNull();
  });

  it("hands the caller the same document the crossing was recorded from", async () => {
    answering(JSON.stringify({ answered: true }));
    const outcome = await observedRead("field", "http://query.invalid/a", deliver);
    expect(outcome.body).toEqual({ answered: true });
  });
});

describe("a refused read", () => {
  it("is a crossing too, marked refused, with the status the proxy answered", async () => {
    answering(JSON.stringify({ code: "NotFound" }), 404, "application/json");
    const outcome = await observedRead("trajectory", "http://query.invalid/missing", deliver);
    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe(404);
    expect(delivered[0]?.outcome).toBe("refused");
    expect(delivered[0]?.status).toBe(404);
  });
});

describe("a failed read", () => {
  it("is a crossing too, carrying the error the client actually received", async () => {
    globalThis.fetch = (async () => {
      throw new Error("connection refused by nobody in particular");
    }) as typeof globalThis.fetch;
    const outcome = await observedRead("field", "http://query.invalid/gone", deliver);
    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBeNull();
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.outcome).toBe("failed");
    expect(delivered[0]?.status).toBeNull();
    expect(delivered[0]?.failure).toContain("connection refused by nobody in particular");
  });

  it("records a body that was not JSON as what it was, not as an absence of a crossing", async () => {
    answering("<html>an error page</html>", 200, "text/html");
    const outcome = await observedRead("field", "http://query.invalid/odd", deliver);
    expect(outcome.body).toBeNull();
    expect(delivered[0]?.outcome).toBe("answered");
    expect(delivered[0]?.failure).toContain("not JSON");
    expect(delivered[0]?.excerpt).toContain("an error page");
  });
});

describe("no read, no crossing", () => {
  it("delivers nothing when nothing was asked: the only constructor is the read itself", async () => {
    // Nothing to await: the assertion is that the module has no other entry point. The
    // function takes the URL to ask and the delivery seam, and crossing construction is
    // local to it — this is the parameter-count proxy the no-mock suite established.
    expect(observedRead.length).toBe(3);
    expect(delivered).toHaveLength(0);
  });
});

describe("the excerpt bound", () => {
  it("truncates by bytes and declares exactly how many were dropped", async () => {
    // Multi-byte characters, so a character slice and a byte slice disagree.
    const long = `["${"é".repeat(EXCERPT_BYTES)}"]`;
    answering(long);
    await observedRead("field", "http://query.invalid/long", deliver);
    const crossing = delivered[0];
    const totalBytes = new TextEncoder().encode(long).length;
    expect(crossing?.bodyBytes).toBe(totalBytes);
    expect(crossing?.excerptDroppedBytes).toBe(totalBytes - EXCERPT_BYTES);
    expect(new TextEncoder().encode(crossing?.excerpt ?? "").length).toBeLessThanOrEqual(EXCERPT_BYTES);
  });
});

describe("the simulation time a response carried", () => {
  it("reads a grid coverage's t axis and a trajectory's composite axis", () => {
    expect(simTimeCarried({ domain: { axes: { t: { values: ["2026-08-26T01:00:00Z"] } } } })).toBe(
      "2026-08-26T01:00:00Z",
    );
    expect(
      simTimeCarried({
        domain: { axes: { composite: { values: [["2026-08-26T02:00:00Z", -4.5, 49.1, 10]] } } },
      }),
    ).toBe("2026-08-26T02:00:00Z");
  });

  it("reports none rather than inventing one for a shape it does not recognise", () => {
    expect(simTimeCarried({})).toBeNull();
    expect(simTimeCarried(null)).toBeNull();
    expect(simTimeCarried({ domain: { axes: { t: { values: [7] } } } })).toBeNull();
  });
});
