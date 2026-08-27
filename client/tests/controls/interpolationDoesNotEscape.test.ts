/**
 * Nothing derived from the frame timestamp leaves the render path.
 *
 * ADR-0007's third rule, and the reason SC-014 insists it be asserted by a test rather
 * than by inspection: the other two rules fail as a wrong picture, which somebody
 * notices. This one fails as a right-looking number somewhere else — in a query, in a
 * recorded observation, in a capture's recorded time — and nobody notices at all.
 *
 * Three instruments, because the rule has three shapes.
 *
 * **The module's surface.** `interpolatedClock` returns text to print and a unitless
 * fraction. There is no accessor for the interpolated instant as a number, so there is
 * nothing for anything downstream to be handed. That is the structural half, and it is
 * checked by handing the module a poisoned frame timestamp and asserting that no
 * arithmetic on it appears in anything the module returns.
 *
 * **The client's outbound surface.** One request leaves this page: a rate change, through
 * `rateRequest`. Driving the interpolation and then sending a rate change, with the
 * requester instrumented, asserts that nothing frame-derived reaches the wire.
 *
 * **The source.** No module outside `interpolatedClock` reads an animation frame
 * timestamp, and `interpolatedClock` is not imported by anything that queries, records or
 * publishes. A grep is a blunt instrument and the right one here: the property is the
 * absence of an import, and the only way to check an absence is to look.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { frameInstant, NO_SAMPLES, receiveDisplaySample } from "../../src/controls/interpolatedClock";
import { rateCommand, rateRequesterFor } from "../../src/controls/rateRequest";
import type { RuntimeConfig } from "../../src/config/runtime";

import { runtimeConfig } from "../runtimeConfig";

const sourceRoot = fileURLToPath(new URL("../../src", import.meta.url));
const generated = join(sourceRoot, "generated");
const theOneModule = join(sourceRoot, "controls", "interpolatedClock.ts");
const compositionRoot = join(sourceRoot, "App.tsx");

function sources(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (path.startsWith(generated)) {
      continue;
    }
    if (statSync(path).isDirectory()) {
      found.push(...sources(path));
    } else if (/\.tsx?$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

const files = sources(sourceRoot);

/**
 * A frame timestamp chosen so that anything derived from it is recognisable.
 *
 * Interpolating between two samples a second apart with this frame timestamp gives a
 * fraction with a long decimal tail. If any digit sequence traceable to it turns up in a
 * value the module hands back, or on the wire, the rule has been broken.
 */
const POISONED_FRAME = 1_777_777.777;
const EARLIER = { simTime: "2026-08-26T00:00:00.000000Z", receivedAt: 1_776_000 };
const LATER = { simTime: "2026-08-26T00:00:01.000000Z", receivedAt: 1_777_000 };
const PAIR = receiveDisplaySample(receiveDisplaySample(NO_SAMPLES, EARLIER), LATER);

describe("what the interpolation hands back", () => {
  it("returns text and a fraction, and no simulation instant as a number", () => {
    const instant = frameInstant(PAIR, POISONED_FRAME);
    expect(typeof instant.text).toBe("string");
    expect(typeof instant.fraction).toBe("number");
    expect(instant.fraction).toBeGreaterThanOrEqual(0);
    expect(instant.fraction).toBeLessThanOrEqual(1);
    // Every key the module exposes, and not one of them a micro- or millisecond count.
    expect(Object.keys(instant).sort()).toEqual(["fraction", "holding", "interpolated", "text"]);
  });

  it("lets no host instant through into the text it returns", () => {
    const instant = frameInstant(PAIR, POISONED_FRAME);
    expect(instant.text).not.toContain("1777");
    expect(instant.text).not.toContain(String(POISONED_FRAME));
    // The text is a simulation instant in the contract's own spelling, and nothing else.
    expect(instant.text).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
  });

  it("keeps the fraction unitless, so it cannot be read as a duration", () => {
    const instant = frameInstant(PAIR, POISONED_FRAME);
    // 777.777 of the 1000 host milliseconds between the two samples.
    expect(instant.fraction).toBeCloseTo(0.777777, 5);
    expect(instant.fraction).not.toBe(POISONED_FRAME);
  });
});

describe("the client's one outbound surface", () => {
  const configured: RuntimeConfig = runtimeConfig({
    controlUrl: "http://clock.invalid/clock/control",
  });

  it("sends a rate and nothing else, with the interpolation running", () => {
    const sent: string[] = [];
    const requester = rateRequesterFor(configured, async (_url, body) => {
      sent.push(body);
      return { ok: true, status: 200 };
    });
    // Drive the interpolation first, so anything that leaked would have somewhere to leak
    // from.
    const instant = frameInstant(PAIR, POISONED_FRAME);
    expect(instant.interpolated).toBe(true);
    return requester!(0).then(() => {
      expect(sent).toHaveLength(1);
      expect(JSON.parse(sent[0]!)).toEqual({ operation: "set_rate", rate: 0 });
      expect(sent[0]).not.toContain("1777");
      expect(sent[0]).not.toContain(instant.text?.slice(0, 10));
    });
  });

  it("builds the command from the rate alone, with no time in it at all", () => {
    const body = JSON.parse(rateCommand(5)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["operation", "rate"]);
  });
});

describe("the source, read for the absence", () => {
  it("reads an animation frame timestamp in exactly one module", () => {
    const readers = files.filter((path) => /requestAnimationFrame/.test(readFileSync(path, "utf8")));
    // The shell's own frame loop schedules re-renders and passes no timestamp on; the
    // interpolation is the only place a frame timestamp becomes a value.
    expect(readers).toContain(theOneModule);
    for (const path of readers) {
      const text = readFileSync(path, "utf8");
      if (path === theOneModule) {
        continue;
      }
      expect(
        /requestAnimationFrame\(\s*\(\s*\w/.test(text),
        `${path} takes the frame timestamp as a value`,
      ).toBe(false);
    }
  });

  it("is imported by nothing that queries, records or publishes, bar the page itself", () => {
    const importers = files.filter((path) => /from "[^"]*interpolatedClock"/.test(readFileSync(path, "utf8")));
    expect(importers.length).toBeGreaterThan(0);
    for (const path of importers) {
      if (path === compositionRoot) {
        continue; // assembles everything, so a blanket scan says nothing; read below
      }
      const text = readFileSync(path, "utf8");
      expect(/\bfetch\s*\(/.test(text), `${path} imports the interpolation and fetches`).toBe(false);
      expect(/\.publish\s*\(/.test(text), `${path} imports the interpolation and publishes`).toBe(false);
      expect(/JSON\.stringify/.test(text), `${path} imports the interpolation and serialises`).toBe(false);
    }
  });

  it("reaches only the render in the one place that both interpolates and queries", () => {
    // The page is where every part is assembled, so "this file also fetches" says nothing.
    // What matters is the value: whatever the hook's result is bound to must appear only
    // where the page draws, and never on a line that sends, serialises or records. The
    // binding name is read out of the source rather than assumed, so renaming it does not
    // quietly disable the check.
    const text = readFileSync(compositionRoot, "utf8");
    const binding = /const\s+(\w+)\s*=\s*useFrameInstant\(/.exec(text)?.[1];
    expect(binding, "the page does not bind the interpolation to a name").toBeDefined();
    const escaping = /\bfetch\s*\(|JSON\.stringify|\.publish\s*\(|trajectoryRequest\(|rateCommand\(/;
    const uses: string[] = [];
    for (const line of text.split("\n")) {
      if (new RegExp(`\\b${binding!}\\b`).test(line)) {
        uses.push(line.trim());
        expect(escaping.test(line), `the interpolation reaches: ${line.trim()}`).toBe(false);
      }
    }
    // It is used, so the scan above is scanning something: bound once, and drawn once.
    expect(uses.length).toBeGreaterThanOrEqual(2);
    expect(uses.some((line) => line.includes("progress={"))).toBe(true);
  });

  it("carries exactly two marked host-time exemptions across the client, each naming its ADR", () => {
    // SC-013. A third is a defect until it is argued on its own merits, never by analogy
    // to these two.
    const markers: string[] = [];
    for (const path of files) {
      for (const line of readFileSync(path, "utf8").split("\n")) {
        if (line.includes("harness:allow-wallclock")) {
          markers.push(line.trim());
        }
      }
    }
    expect(markers).toHaveLength(2);
    expect(markers.filter((line) => line.includes("ADR-0006"))).toHaveLength(1);
    expect(markers.filter((line) => line.includes("ADR-0007"))).toHaveLength(1);
  });
});
