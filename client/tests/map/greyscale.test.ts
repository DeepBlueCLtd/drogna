/**
 * Nothing on this map means anything by its colour, and here is the proof.
 *
 * PR-08 and FR-005: every encoding legible in greyscale, no state or magnitude carried by
 * hue alone. The usual way to check that is to look at the map in a greyscale print and
 * form an opinion, which is a check nobody runs twice and which cannot be run at all on a
 * palette somebody adds next year.
 *
 * The property asserted instead is stronger and is machine-checkable: every colour the map
 * produces is achromatic — red equal to green equal to blue — so hue carries nothing
 * because there is no hue to carry it. A greyscale print of this map is not an
 * approximation of it. SC-005 asks that a reader rank three sampled cells correctly in
 * such a print; the monotonicity assertions below are that requirement with the reader
 * taken out of it.
 *
 * The route's own marks are included, because "every encoding" means every encoding: a
 * declined vertex distinguished only by being a different colour would be exactly the
 * failure this forbids, one panel away from where anybody was looking.
 */
import { describe, expect, it } from "vitest";

import { INK, encode, normalise, rampWords, shade, sizeFraction, tone } from "../../src/map/shading";

/** Enough of the range to catch a ramp that is achromatic at the ends and not between. */
const FRACTIONS = Array.from({ length: 101 }, (_unused, step) => step / 100);

describe("every colour the map draws", () => {
  it("has equal red, green and blue channels, so hue carries nothing at all", () => {
    for (const fraction of FRACTIONS) {
      const [red, green, blue] = shade(fraction);
      expect(red, `at ${fraction}`).toBe(green);
      expect(green, `at ${fraction}`).toBe(blue);
    }
  });

  it("is achromatic for the route, the graticule, the frame and a declined vertex too", () => {
    for (const [name, ink] of Object.entries(INK)) {
      const [red, green, blue] = ink;
      expect(red, name).toBe(green);
      expect(green, name).toBe(blue);
    }
  });

  it("distinguishes a declined vertex from an answered one by tone, not by colour", () => {
    expect(INK.declinedVertex[0]).not.toBe(INK.vertex[0]);
  });
});

describe("magnitude, drawn twice", () => {
  it("darkens as the value rises, without exception across the range", () => {
    for (let step = 1; step < FRACTIONS.length; step += 1) {
      const lower = tone(FRACTIONS[step - 1] as number);
      const higher = tone(FRACTIONS[step] as number);
      expect(higher, `between ${FRACTIONS[step - 1]} and ${FRACTIONS[step]}`).toBeLessThan(lower);
    }
  });

  it("grows as the value rises, so a cell too pale to judge is still large", () => {
    for (let step = 1; step < FRACTIONS.length; step += 1) {
      expect(sizeFraction(FRACTIONS[step] as number)).toBeGreaterThan(
        sizeFraction(FRACTIONS[step - 1] as number),
      );
    }
  });

  it("ranks three sampled values correctly by tone and by size alike (SC-005)", () => {
    const range: readonly [number, number] = [0.1, 0.9];
    const [low, middle, high] = [0.2, 0.5, 0.8].map((value) => encode(value, range));
    expect(low?.shade[0]).toBeGreaterThan(middle?.shade[0] as number);
    expect(middle?.shade[0]).toBeGreaterThan(high?.shade[0] as number);
    expect(low?.sizeFraction).toBeLessThan(middle?.sizeFraction as number);
    expect(middle?.sizeFraction).toBeLessThan(high?.sizeFraction as number);
  });
});

describe("normalising a value into the range that was drawn", () => {
  it("puts the ends of the range at the ends of the ramp", () => {
    expect(normalise(2, [2, 6])).toBe(0);
    expect(normalise(6, [2, 6])).toBe(1);
    expect(normalise(4, [2, 6])).toBe(0.5);
  });

  it("holds a value outside the range at the end it is beyond, never past it", () => {
    expect(normalise(-4, [2, 6])).toBe(0);
    expect(normalise(400, [2, 6])).toBe(1);
  });

  it("puts a field with no spread in the middle, not at the bottom", () => {
    // A uniform field drawn as uniformly lowest would be a claim about its magnitude that
    // the data does not make.
    expect(normalise(3, [3, 3])).toBe(0.5);
    expect(rampWords([3, 3])).toContain("spans nothing");
  });

  it("says which end of the ramp is which, in the legend's own words", () => {
    expect(rampWords([0.1, 0.9])).toContain("Light is 0.1 and dark is 0.9");
    expect(rampWords([0.1, 0.9])).toContain("no colour at all");
  });
});
