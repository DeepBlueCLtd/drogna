/**
 * The forecast's two palettes, read with colour removed (FR-138, and Q-01's own subject).
 *
 * A review measured the first instrument palette's worst pair at a contrast of **1.037** — the
 * same grey twice — for two colours that sit as adjacent bands of one stacked bar. Nothing
 * caught it because the only claim about greyscale was a sentence in a docstring, and a
 * sentence is not a check. This is the check, and it is modelled on
 * `panels/consumers/greyscale.test.ts`: the values come out of the palette rather than out of
 * this file, so a colour edited there moves the test rather than passing it.
 *
 * What has to survive colour being removed is a **disjunction**, and the honest form of it:
 * six ordered steps cannot each clear a contrast of 3 against their neighbour, so the ramp
 * carries *order* and the hatch and dash carry *identity*. A test demanding a contrast of 3
 * between adjacent instruments would force a worse palette, exactly as the consumers' own note
 * records for route and ghost.
 */
import { describe, expect, it } from 'vitest';
import { AA_NON_TEXT, contrast, luminance } from '../../shell/colour.js';
import { INSTRUMENTS, SOURCES } from './shares.js';

describe('the instrument palette without colour', () => {
  it('climbs monotonically, so six sources are six greys rather than one', () => {
    const luminances = INSTRUMENTS.map((instrument) => luminance(instrument.hue));
    for (let index = 1; index < luminances.length; index++) {
      expect(
        luminances[index],
        `instrument ${index} is not lighter than ${index - 1}: the ramp is not ordered`,
      ).toBeGreaterThan(luminances[index - 1]);
    }
  });

  it('separates its extremes by the repository’s own non-text bound', () => {
    const first = INSTRUMENTS[0].hue;
    const last = INSTRUMENTS[INSTRUMENTS.length - 1].hue;
    expect(contrast(first, last)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it('has no pair a reader could mistake for one colour', () => {
    // The bound is the ramp's own even step — the extremes' contrast spread over the five gaps
    // between six entries — rather than a number chosen here. A palette that bunched two
    // entries together would fail even while its extremes still cleared the bound above, which
    // is exactly how the first palette passed a reading of itself.
    const first = luminance(INSTRUMENTS[0].hue);
    const last = luminance(INSTRUMENTS[INSTRUMENTS.length - 1].hue);
    const evenStep = ((last + 0.05) / (first + 0.05)) ** (1 / (INSTRUMENTS.length - 1));
    // Nine tenths of the even step: the ramp need not be perfectly even, but no gap may be
    // nearly closed. The measured worst pair of the palette this replaced was 1.037.
    const floor = evenStep * 0.9;
    expect(floor).toBeGreaterThan(1.1);
    let worst = { pair: '', ratio: Infinity };
    for (let i = 0; i < INSTRUMENTS.length; i++) {
      for (let j = i + 1; j < INSTRUMENTS.length; j++) {
        const ratio = contrast(INSTRUMENTS[i].hue, INSTRUMENTS[j].hue);
        if (ratio < worst.ratio) worst = { pair: `${INSTRUMENTS[i].hue}/${INSTRUMENTS[j].hue}`, ratio };
      }
    }
    expect(worst.ratio, `${worst.pair} is the same grey twice`).toBeGreaterThanOrEqual(floor);
  });

  it('carries identity in texture too, so the ramp never has to do it alone', () => {
    // Every instrument has its own hatch angle and its own dash: the ray uses the dash, the
    // profile band uses the angle, and neither depends on the hue being told apart.
    expect(new Set(INSTRUMENTS.map((instrument) => instrument.angle)).size).toBe(INSTRUMENTS.length);
    expect(new Set(INSTRUMENTS.map((instrument) => instrument.dash)).size).toBe(INSTRUMENTS.length);
    // And the two vocabularies never collide on texture: a share is a flat band, an instrument
    // is a hatched one, so a reader is never asked whether one green means the other's thing.
    expect(SOURCES.every((source) => !('angle' in source))).toBe(true);
  });
});
