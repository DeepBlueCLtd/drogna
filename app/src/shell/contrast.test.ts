/**
 * Every colour the shell draws text in, against every surface it draws text on
 * (WCAG 2.2 SC 1.4.3, the 4.5:1 that ordinary text needs).
 *
 * This exists because a reader reported the muted text as unreadable on a phone, and
 * measuring it found `#6b7785` sitting at 3.1:1 on the darkest surface it is used on —
 * a fault that had been in every panel since the palette was written, in the one colour
 * used for every quiet sentence in the application. Judging a contrast by eye on a
 * bright desktop monitor is how it survived that long.
 *
 * The palette and the surfaces are **read off the stylesheets**, not restated here: a
 * test carrying its own copy of the colours would pass while the application drew
 * something else. The only number typed in is the WCAG threshold itself.
 *
 * A token has to be classified before this test will accept it. That is deliberate —
 * adding a colour to a palette should make somebody say whether text is drawn in it,
 * and an unclassified token fails rather than being quietly assumed decorative.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SHELL = join(__dirname, 'shell.css');
const OPERATOR = join(__dirname, '..', 'panels', 'operator', 'operator.css');

/** WCAG 2.2 SC 1.4.3, normal text. The one number in this file that is not on disk. */
const AA = 4.5;

/**
 * Tokens no text is ever drawn in, and why. A border, a wire and a bar fill are
 * graphical objects: they carry their own threshold (3:1 for a control's boundary,
 * nothing at all for decoration beside a label that says the same thing), and holding
 * them to a text rule would push the whole picture towards white for no reader's
 * benefit.
 */
const NOT_TEXT: Record<string, string> = {
  '--shell-bg': 'the surface itself',
  '--shell-lit': 'a status dot, beside the word it repeats',
  '--flow-line': 'a 1px border between panels and around cards',
};

/** Colours in `:root`-style blocks: `--name: #rrggbb`. */
function tokensOf(css: string): Map<string, string> {
  return new Map(
    [...css.matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2].toLowerCase()]),
  );
}

/**
 * Surfaces text is drawn on: every literal background in the stylesheet, less the ones
 * that are a shape rather than a surface. A status dot is 0.6em across and holds no
 * text; a bar fill is drawn under nothing. Anything else a rule paints could have a
 * sentence on it, and this errs towards including it.
 */
function surfacesOf(css: string): Set<string> {
  const shapes = new Set(['#333d47', '#e8c268', '#f2c14e', '#ffd469', '#2c3742']);
  return new Set(
    [...css.matchAll(/background:\s*(#[0-9a-f]{6})\s*;/gi)]
      .map((m) => m[1].toLowerCase())
      .filter((hex) => !shapes.has(hex)),
  );
}

function channel(eight: number): number {
  const s = eight / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('the palette is legible (WCAG 2.2 SC 1.4.3)', () => {
  const shell = readFileSync(SHELL, 'utf8');
  const operator = readFileSync(OPERATOR, 'utf8');
  const tokens = new Map([...tokensOf(shell), ...tokensOf(operator)]);
  const surfaces = [...new Set([...surfacesOf(shell), ...surfacesOf(operator)])];

  it('reads a palette and a set of surfaces off the stylesheets, rather than holding its own', () => {
    // If either of these ever comes back empty the test above would pass vacuously,
    // which is the way a check like this fails silently rather than loudly.
    expect(tokens.size).toBeGreaterThan(6);
    expect(surfaces.length).toBeGreaterThan(2);
    expect(tokens.get('--shell-dim')).toBeDefined();
  });

  it('draws every text colour at 4.5:1 or better, on every surface either sheet declares', () => {
    const failures: string[] = [];
    for (const [name, hex] of tokens) {
      if (name in NOT_TEXT) continue;
      for (const surface of surfaces) {
        const ratio = contrast(hex, surface);
        if (ratio < AA) failures.push(`${name} ${hex} on ${surface}: ${ratio.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('refuses a colour nobody has said whether text is drawn in', () => {
    // The list of exceptions is knowledge, not measurement, so it is kept honest by
    // failing when it is out of date: a token added to a palette is either classified
    // or held to the text rule.
    for (const name of Object.keys(NOT_TEXT)) {
      expect(tokens.has(name), `${name} is excused but no longer declared`).toBe(true);
      expect(NOT_TEXT[name].length, `${name} is excused without a reason`).toBeGreaterThan(10);
    }
  });

  it('leaves every rule that asks for a token with a token to find', () => {
    // `var(--absent)` with no fallback is invalid at computed-value time, which is not
    // an error anywhere: the declaration is dropped and the rule quietly does nothing.
    // `--flow-cy` was asked for by three rules and defined by none since feature 113 —
    // an advisory lane drew a bar with no fill, and a pill took whatever colour it
    // inherited. Nothing said so, which is exactly why this is a test.
    const asked = new Set(
      [...`${shell}${operator}`.matchAll(/var\((--[a-z-]+)\)/gi)].map((match) => match[1]),
    );
    const undefinedTokens = [...asked].filter((name) => !tokens.has(name));
    expect(undefinedTokens).toEqual([]);
  });
});
