/**
 * The field is read because a run was announced, and for no other reason.
 *
 * FR-021 states the rule negatively — the client MUST NOT poll the query layer to discover
 * that a new run exists — and SRD FR-31 gives the reason: the query layer has no
 * notification mechanism, so freshness is announced rather than discovered. `overlay.ts`
 * makes that promise about the run identifier and `refresh.test.ts` counts it. This file
 * makes the same promise about the field itself, which is the part that actually issues a
 * request.
 *
 * Two halves, because the promise has two ways to break.
 *
 * The first is the request's shape: it must name the collection the announcement named, at
 * the bounds the announcement stated, for the parameter the destination configured, at the
 * instant the publisher said the forecast begins. A request built from anything else would
 * return a plausible field describing something other than the run that was announced.
 *
 * The second is where the request is issued from, and it is asserted by reading the shell's
 * own source. A behavioural count cannot see the failure that matters — a fetch added to
 * the frame loop still produces one request per announcement *plus* one per frame, and a
 * test that counted only announcements would pass. So this reads the animation-frame effect
 * in `App.tsx` and asserts that nothing in it reaches the network or the field reader. That
 * is blunt, and it is the right instrument: the property is the absence of a thing, and the
 * only way to check an absence is to look — the same argument `no-mock.test.ts` makes.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { extentFromAnnouncement } from "../../src/map/extent";
import { fieldRequest, isRequest } from "../../src/map/fieldRequest";
import { announceRun, emptyOverlay } from "../../src/uncertainty/overlay";

import { CUBE_PARAMETER } from "./cubeResponse";
import { runPublished } from "../control";
import { runtimeConfig } from "../runtimeConfig";

const CONFIG = runtimeConfig({ cubePath: "/cube", fieldParameter: CUBE_PARAMETER });

function requestFor(announcement: unknown) {
  const overlay = announceRun(emptyOverlay, announcement);
  const bounds = extentFromAnnouncement(announcement);
  return fieldRequest(CONFIG, overlay.collection, bounds, overlay.validFrom);
}

describe("the request an announcement causes", () => {
  it("names the collection the announcement named, and no configured one", () => {
    const asked = requestFor(runPublished());
    if (!isRequest(asked)) {
      throw new Error(asked.missing);
    }
    expect(asked.collection).toBe("uncertainty-run-0007");
    expect(asked.url).toContain("/released/uncertainty-run-0007/cube?");
  });

  it("asks at the bounds the announcement stated, in west, south, east, north order", () => {
    const asked = requestFor(runPublished());
    if (!isRequest(asked)) {
      throw new Error(asked.missing);
    }
    expect(decodeURIComponent(asked.url)).toContain("bbox=-4,49.5,-2.5,50.5");
  });

  it("asks for the instant the publisher said the forecast begins at", () => {
    const asked = requestFor(runPublished());
    if (!isRequest(asked)) {
      throw new Error(asked.missing);
    }
    expect(asked.simTime).toBe("2026-08-26T00:10:00.000000Z");
    expect(decodeURIComponent(asked.url)).toContain(
      "datetime=2026-08-26T00:10:00.000000Z/2026-08-26T00:10:00.000000Z",
    );
  });

  it("asks for the parameter the destination configured, and never one written here", () => {
    const asked = requestFor(runPublished());
    if (!isRequest(asked)) {
      throw new Error(asked.missing);
    }
    expect(asked.parameter).toBe(CUBE_PARAMETER);
    expect(decodeURIComponent(asked.url)).toContain(`parameter-name=${CUBE_PARAMETER}`);
  });

  it("asks for every depth, so entering the volume needs no second request", () => {
    const asked = requestFor(runPublished());
    if (!isRequest(asked)) {
      throw new Error(asked.missing);
    }
    expect(asked.url).not.toContain("z=");
  });

  it("names what it has not been told, rather than assembling a request without it", () => {
    const withoutPath = fieldRequest(
      runtimeConfig({ fieldParameter: CUBE_PARAMETER }),
      "uncertainty-run-0007",
      extentFromAnnouncement(runPublished()),
      "2026-08-26T00:10:00.000000Z",
    );
    expect(isRequest(withoutPath)).toBe(false);
    expect(isRequest(withoutPath) ? "" : withoutPath.missing).toContain("cube query is served");

    const withoutParameter = fieldRequest(
      runtimeConfig({ cubePath: "/cube" }),
      "uncertainty-run-0007",
      extentFromAnnouncement(runPublished()),
      "2026-08-26T00:10:00.000000Z",
    );
    expect(isRequest(withoutParameter)).toBe(false);

    const withoutRun = fieldRequest(CONFIG, null, null, null);
    expect(isRequest(withoutRun)).toBe(false);
  });
});

describe("announcements, counted against requests", () => {
  it("issues one request per announcement of a current run, and none for the others", () => {
    let overlay = emptyOverlay;
    const asked: string[] = [];
    const announce = (message: unknown): void => {
      const before = overlay.runId;
      overlay = announceRun(overlay, message);
      const bounds = extentFromAnnouncement(message);
      if (bounds === null || overlay.runId === before) {
        return;
      }
      const request = fieldRequest(CONFIG, overlay.collection, bounds, overlay.validFrom);
      if (isRequest(request)) {
        asked.push(request.url);
      }
    };
    announce(runPublished());
    announce(runPublished({ run_id: "run-0008", current: false }));
    announce({ run_id: "run-0009" });
    announce(runPublished({ run_id: "run-0010", collections: { forecast: "f", uncertainty: "u" } }));
    expect(asked).toHaveLength(2);
    expect(asked[1]).toContain("/released/u/cube?");
  });
});

const shellSource = readFileSync(fileURLToPath(new URL("../../src/App.tsx", import.meta.url)), "utf8");

/** The animation-frame effect: everything the page does once per drawn frame. */
function frameLoop(): string {
  const opened = shellSource.indexOf("const draw = (): void => {");
  const closed = shellSource.indexOf("cancelAnimationFrame", opened);
  expect(opened, "the shell's frame loop has moved; this test cannot see it").toBeGreaterThan(-1);
  expect(closed).toBeGreaterThan(opened);
  return shellSource.slice(opened, closed);
}

describe("where the request is issued from", () => {
  it("is never the frame loop: nothing drawn reaches the network", () => {
    const loop = frameLoop();
    expect(loop).not.toContain("fetch");
    expect(loop).not.toContain("readFieldFor");
    expect(loop).not.toContain("fieldRequest");
  });

  it("is the announcement branch or the viewer's re-ask, and nowhere else in the shell", () => {
    // Two call sites since feature 018, and exactly two causes, neither of them a poll:
    // a run-published announcement, and the viewer pressing the re-ask control — one
    // genuine request of a kind the client already makes, gated to a stated minimum
    // interval and disabled while in flight (018 FR-010). Anything beyond these two is
    // the polling FR-021 forbids arriving by a new door.
    const calls = shellSource.match(/void readFieldFor\(/g) ?? [];
    expect(calls).toHaveLength(2);
    const branch = shellSource.slice(
      shellSource.indexOf("if (topic === RUN_PUBLISHED_TOPIC)"),
      shellSource.indexOf("if (topic === PLAN_TOPIC"),
    );
    expect(branch).toContain("void readFieldFor(");
    const reAsk = shellSource.slice(
      shellSource.indexOf("const reAskNow = useMemo("),
      shellSource.indexOf("const sink = useMemo<ControlSink>("),
    );
    expect(reAsk).toContain("void readFieldFor(");
    // The re-ask site re-checks the gate before asking, so a queued click cannot slip
    // past the interval bound.
    expect(reAsk).toContain("offer.gate.allowed");
  });

  it("has no timer anywhere in the map's own source that could cause one", () => {
    for (const name of ["fieldRequest", "fieldCube", "extent", "MapSurface", "layers"]) {
      const suffix = name === "MapSurface" ? "tsx" : "ts";
      const text = readFileSync(
        fileURLToPath(new URL(`../../src/map/${name}.${suffix}`, import.meta.url)),
        "utf8",
      );
      expect(/setInterval\s*\(|setTimeout\s*\(/.test(text), name).toBe(false);
      expect(/\bfetch\s*\(/.test(text), name).toBe(false);
    }
  });
});
