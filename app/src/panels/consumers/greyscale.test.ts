/**
 * The consumer tabs, read with colour removed (T035, FR-76).
 *
 * Background's proof of the same claim is a picture: each explainer shot twice, once
 * through a `grayscale(1)` filter, for a human to compare. That is the right proof for a
 * drawing, whose legibility is a judgement. It is the wrong proof for these three tabs,
 * where the colour carries specific, checkable distinctions — and a picture nobody
 * compares this month is a claim, not a check.
 *
 * So the bound is held here and the pictures are the illustration (`pnpm capture:consumers`
 * shoots both). Three distinctions have to survive:
 *
 *   1. **The uncertainty ramp.** A reader must be able to order two hexes. That needs
 *      luminance to move monotonically from one end of the ramp to the other — a ramp that
 *      only changes hue collapses to one flat grey — and the ends to be plainly apart.
 *   2. **The line marks.** Route, ghost and comparison overlap on the same map and mean
 *      different things. Each pair must differ in luminance *or* in dash pattern. The
 *      disjunction is the honest form: route and ghost are deliberately the same yellow,
 *      because a ghost is the same answer from a moment ago and recolouring it would say
 *      it was a different kind of thing. What tells them apart is the dashes, and a check
 *      demanding a colour step would have forced a worse drawing to satisfy the test.
 *   3. **The provenance chips.** Synthesised and seam-derived are the claim ADR-0039
 *      rests on, so they may not depend on colour alone either.
 *
 * The values come off the stylesheet and out of the ramp function, never out of this file:
 * a bound typed here would be a second opinion about the palette rather than a check on it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AA_NON_TEXT, contrast, luminance } from '../../shell/colour.js';
import { uncertaintyColour } from './hexes.js';

const here = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(here, 'consumers.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const SHELL_CSS = readFileSync(join(here, '..', '..', 'shell', 'shell.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

const TOKENS = new Map<string, string>();
for (const source of [CSS, SHELL_CSS]) {
  for (const [, name, value] of source.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/g)) {
    if (!TOKENS.has(name)) TOKENS.set(name, value.trim());
  }
}

/** A declared value as a hex colour, following one `var(--token)` chain. */
function resolve(value: string, depth = 0): string | undefined {
  const trimmed = value.trim();
  const reference = /^var\((--[a-z0-9-]+)\)$/.exec(trimmed);
  if (reference) {
    const referred = TOKENS.get(reference[1]);
    return referred !== undefined && depth < 8 ? resolve(referred, depth + 1) : undefined;
  }
  const hex = /^#([0-9a-fA-F]{6})$/.exec(trimmed);
  return hex ? `#${hex[1].toLowerCase()}` : undefined;
}

/** The declarations of one rule, by selector, from the consumers' stylesheet. */
function rule(selector: string): Map<string, string> {
  const escaped = selector.replace(/[.[\]='*+?^${}()|\\]/g, '\\$&');
  const found = new RegExp(`(?:^|})\\s*${escaped}\\s*{([^}]*)}`, 'm').exec(CSS);
  expect(found, `${selector} is declared in consumers.css`).not.toBeNull();
  const declarations = new Map<string, string>();
  for (const [, property, value] of (found as RegExpExecArray)[1].matchAll(
    /([a-z-]+)\s*:\s*([^;]+)/g,
  )) {
    declarations.set(property.trim(), value.trim());
  }
  return declarations;
}

/** A mark as the reader meets it: what colour it is drawn in, and whether it is broken. */
function mark(selector: string, property: 'stroke' | 'fill' | 'background') {
  const declarations = rule(selector);
  const declared = declarations.get(property);
  expect(declared, `${selector} declares ${property}`).toBeDefined();
  const hex = resolve(declared as string);
  expect(hex, `${selector}'s ${property} resolves to a hex colour`).toBeDefined();
  return { hex: hex as string, dashes: declarations.get('stroke-dasharray') };
}

describe('the uncertainty ramp survives greyscale (FR-80)', () => {
  const STEPS = 24;
  const ramp = Array.from({ length: STEPS + 1 }, (_, step) => uncertaintyColour(step / STEPS));

  /** `rgb(r, g, b)` as `#rrggbb`, so one luminance implementation serves both. */
  const asHex = (rgb: string): string => {
    const parts = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(rgb);
    expect(parts, `${rgb} is an rgb() triple`).not.toBeNull();
    return `#${(parts as RegExpExecArray)
      .slice(1)
      .map((channel) => Number(channel).toString(16).padStart(2, '0'))
      .join('')}`;
  };

  it('rises in luminance at every step, so two hexes can be put in order', () => {
    const luminances = ramp.map((rgb) => luminance(asHex(rgb)));
    const falls = luminances.flatMap((value, step) =>
      step > 0 && value <= luminances[step - 1] ? [`${step - 1} → ${step}`] : [],
    );
    expect(falls, 'every step of the ramp is lighter than the one below it').toEqual([]);
  });

  it('separates its ends by more than the least visible difference', () => {
    expect(contrast(asHex(ramp[0]), asHex(ramp[STEPS]))).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});

describe('the marks on the map are told apart without colour (FR-78, FR-85)', () => {
  const MARKS = [
    ['.consumer-route', 'the accepted answer'],
    ['.consumer-ghost', 'the previous answer'],
    ['.consumer-comparison', 'a course being compared'],
  ] as const;

  it.each(
    MARKS.flatMap(([one, oneMeans], index) =>
      MARKS.slice(index + 1).map(([other, otherMeans]) => ({
        one,
        other,
        why: `${oneMeans} and ${otherMeans}`,
      })),
    ),
  )('$one against $other — $why', ({ one, other }) => {
    const [a, b] = [mark(one, 'stroke'), mark(other, 'stroke')];
    const byLuminance = contrast(a.hex, b.hex) >= AA_NON_TEXT;
    const byDashes = (a.dashes ?? 'solid') !== (b.dashes ?? 'solid');
    expect(
      byLuminance || byDashes,
      `${one} and ${other} are the same colour and the same dash pattern`,
    ).toBe(true);
  });

  /*
   * The other pattern-carried distinction, and the one the running page taught: water
   * nobody has sampled and water sampled long ago both sit at the top of the ramp, so at
   * saturation they are the same colour. The outline is what separates them.
   */
  it('draws a hex nothing has been heard from as an outline, not as another fill', () => {
    const unheard = rule(".consumer-hex[data-unheard='true']");
    expect(unheard.get('stroke-dasharray'), 'the unheard hex is dashed').toBeDefined();
    expect(Number(unheard.get('fill-opacity')), 'and barely filled').toBeLessThan(0.5);
  });
});

describe('provenance is legible without colour (ADR-0039)', () => {
  it('separates a synthesised value from a seam-derived one', () => {
    const synthesised = mark(".consumer-source[data-provenance='synthesised']", 'background');
    const body = rule('.consumer-body');
    const behind = resolve(body.get('background') as string);
    expect(behind, 'the consumer body declares a background').toBeDefined();
    // The seam chip is not given a background, so it sits on the body's own.
    expect(contrast(synthesised.hex, behind as string)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});
