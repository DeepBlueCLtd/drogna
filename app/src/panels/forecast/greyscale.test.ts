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
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AA_NON_TEXT, contrast, luminance } from '../../shell/colour.js';
import { INSTRUMENTS, SOURCES } from './shares.js';

/** The ground these are drawn on, read off the shell's own stylesheet rather than restated. */
const SHELL_CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'shell', 'shell.css'),
  'utf8',
);
const GROUND = /--shell-bg:\s*(#[0-9a-f]{3,8})/i.exec(SHELL_CSS)?.[1];

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

  it('is legible on the surface it is actually drawn on', () => {
    // **The check the first version of this file omitted**, and the omission cost a hue: the
    // palette was held against *itself* and passed, while `#7233b8` sat at 2.52 against the
    // shell's own ground — under the bound — and every column draws slot 0. The model this
    // test says it follows, `panels/consumers/greyscale.test.ts`, makes exactly this
    // assertion; leaving it out is how a palette can be internally beautiful and unreadable.
    expect(GROUND, 'the shell declares no --shell-bg to measure against').toBeTruthy();
    for (const instrument of INSTRUMENTS) {
      expect(
        contrast(instrument.hue, GROUND ?? '#000000'),
        `${instrument.hue} is not legible on ${GROUND}`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });

  it('carries identity in texture too, so the ramp never has to do it alone', () => {
    // Every instrument has its own hatch angle and its own dash: the ray uses the dash, the
    // profile band uses the angle, and neither depends on the hue being told apart.
    expect(new Set(INSTRUMENTS.map((instrument) => instrument.angle)).size).toBe(INSTRUMENTS.length);
    expect(new Set(INSTRUMENTS.map((instrument) => instrument.dash)).size).toBe(INSTRUMENTS.length);
    // **And the two vocabularies never collide on texture**, asked of the two lists of angles
    // rather than of a property name. This read `SOURCES.every((source) => !('angle' in source))`
    // and could not fail: the share hatch angles were computed as `index * 45` inside the JSX and
    // were never on `SOURCES` to be found, so the assertion tested a key's absence while the map
    // drew archive at 0° and measurement at 90° — exactly instrument slots 0 and 3, in the same
    // region, one surface above the other.
    const shareAngles = SOURCES.map((source) => source.angle);
    expect(new Set(shareAngles).size, 'two shares hatch at the same angle').toBe(SOURCES.length);
    for (const angle of shareAngles) {
      expect(
        INSTRUMENTS.some((instrument) => instrument.angle % 180 === angle % 180),
        `a share hatches at ${angle}°, which is an instrument's own direction`,
      ).toBe(false);
    }
  });
});
