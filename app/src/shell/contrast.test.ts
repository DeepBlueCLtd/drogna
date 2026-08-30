/**
 * The console's secondary text has to be readable on every surface the console paints.
 *
 * --shell-dim was #6b7785: 4.0:1 on --shell-bg, 3.1:1 on the panel chrome and 2.4:1 on
 * the lightest surface it lands on, all under WCAG AA's 4.5:1 for body text — and it
 * carries most of the words on some panels, at sizes down to 0.62rem. Reported as text
 * that "almost disappears" across every tab.
 *
 * A colour is easy to darken again by eye, so the bound is held here rather than in the
 * comment beside the token. Both the tokens and the surfaces are read off the
 * stylesheets: the surfaces are the backgrounds that do not themselves contrast with
 * --shell-bg (under 3:1, WCAG's own floor for a non-text difference), which is what
 * makes a colour a surface in the shell's chrome rather than a mark drawn on one. So a
 * new panel background joins the check by being declared, not by being remembered.
 *
 * Watched failing: with --shell-dim restored to #6b7785 this reports 12 surfaces it
 * cannot be read on, the tightest at 2.42:1; with it set equal to --shell-fg instead,
 * the step assertion below reports the distinction gone.
 *
 * Feature 117 arrived at the same fault from the other end and brought three checks this
 * one does not make, kept below rather than in a second file that would drift from this
 * one. Each answers something the checks above cannot see:
 *
 * - a surface **lighter** than the chrome is not a surface by the definition above, and
 *   the map's stylesheet was written for light paper before the shell went dark: four of
 *   its rules painted pale boxes and set no colour, so the text on them inherited the
 *   near-white and the EDR composer's URL box read at 1.2:1. That is a pairing fault
 *   rather than a token fault, and it is found by asking what will land on each surface;
 * - a colour written as a literal answers to no token, and `#444` on the shell's own
 *   background was the same fault upside down;
 * - `var(--absent)` with no fallback is invalid at computed-value time, so the
 *   declaration is dropped and nothing says so. `--flow-cy` was asked for by three rules
 *   and defined by none since feature 113: an advisory lane drew a bar with no fill, and
 *   a pill took whatever colour it inherited.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AA_NON_TEXT, AA_TEXT, contrast } from './colour.js';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The arithmetic and the two WCAG bounds are shared with the consumers' greyscale check
// (`panels/consumers/greyscale.test.ts`), which asks the same question of its marks.
const VISIBLE = AA_NON_TEXT;

function stylesheets(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return stylesheets(path);
    return path.endsWith('.css') ? [path] : [];
  });
}

/** The CSS a file contributes: a stylesheet whole, an HTML page's <style> blocks. */
function rules(path: string): string {
  const source = readFileSync(path, 'utf8');
  const css = path.endsWith('.css')
    ? source
    : [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((block) => block[1]).join('\n');
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

// mobile.html is the phone-preview frame (feature 112): its own chrome around the built
// app, with its own copy of the palette, and so its own chance to darken the same grey.
const SOURCES = [
  ...stylesheets(join(APP, 'src')),
  ...readdirSync(APP)
    .filter((entry) => entry.endsWith('.html'))
    .map((entry) => join(APP, entry)),
].map((path) => ({ path, css: rules(path) }));

const TOKENS = new Map<string, string>();
for (const { css } of SOURCES) {
  for (const [, name, value] of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/g)) {
    TOKENS.set(name, value.trim());
  }
}

/** A declared value as a hex colour, following one `var(--token)` chain, or undefined. */
function colour(value: string, depth = 0): string | undefined {
  const trimmed = value.trim();
  const reference = /^var\((--[a-z0-9-]+)\)$/.exec(trimmed);
  if (reference) {
    const referred = TOKENS.get(reference[1]);
    return referred !== undefined && depth < 8 ? colour(referred, depth + 1) : undefined;
  }
  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(trimmed);
  return hex ? expand(`#${hex[1]}`) : undefined;
}

/**
 * Rules that paint a surface nothing is written on, and why each holds no text.
 *
 * A bar, a dot and a drawing canvas are shapes: their meaning is carried by a label
 * beside them, and a text threshold would drag the whole picture towards white for no
 * reader's benefit. Anything not named here is treated as a surface a sentence could
 * land on, which is the safe way round and how the next one of these gets found.
 */
const NO_TEXT_ON: Record<string, string> = {
  '.status-dot': 'a 0.6em circle, beside the word it repeats',
  '.status-ok': 'the same circle, lit',
  '.status-stopping': 'the same circle, amber',
  '.status-stalled': 'the same circle, red',
  '.map-canvas': 'the paper the map is drawn on; deck.gl paints over it and nothing is written on it',
  '.traffic-mark': 'a mark in a lane, one or two pixels wide',
  '.traffic-mark-refused': 'the same mark, refused',
  '.face-bar': 'a bar track, with its figure beside it',
  '.face-gauge': 'a gauge track, with its figure beside it',
  '.face-slot-filled': 'a filled slot in a row of slots',
  '.face-stack-bar': 'one bar of the holdings stack',
  '.face-member-done': 'one member of the ensemble, drawn as a block',
  '.face-tape-track': 'a tape track; the value is written outside it',
  '.face-tape-fill': 'the fill inside that track',
  '.flow-bar': 'a bar track in the list view',
  '.flow-tape-track': 'the drawer’s tape track',
  '.flow-tape-fill': 'the fill inside it',
  '.flow-slot-filled': 'a filled slot in the drawer',
  '.walkthrough-button:hover': 'the help button under the pointer; its own rule sets the text colour',
  '.driver-popover.walkthrough-popover button:hover': 'a popover button under the pointer; its own rule sets the text colour',
};

/**
 * `#abc` and `#aabbcc` are the same colour to a browser. Matching six digits only is how
 * the first version of this check passed the very fault it was written for: the reported
 * colour was `#444`, and a six-digit colour one shade away was caught while it was not.
 */
function expand(hex: string): string {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex.trim());
  return (short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : hex.trim())
    .toLowerCase();
}

function token(name: string): string {
  const value = TOKENS.get(name);
  expect(value, `${name} is declared`).toBeDefined();
  const hex = colour(value as string);
  expect(hex, `${name} resolves to a hex colour`).toBeDefined();
  return hex as string;
}

const BACKGROUND = token('--shell-bg');

/** Every background declared anywhere that reads as chrome rather than as a mark on it. */
const SURFACES = (() => {
  const found = new Map<string, Set<string>>();
  for (const { path, css } of SOURCES) {
    for (const [, value] of css.matchAll(/(?:^|[;{])\s*background(?:-color)?\s*:\s*([^;}!]+)/gi)) {
      const hex = colour(value);
      if (hex === undefined || contrast(hex, BACKGROUND) >= VISIBLE) continue;
      const where = found.get(hex) ?? new Set<string>();
      found.set(hex, where.add(path.slice(APP.length + 1)));
    }
  }
  return [...found.entries()].map(([hex, paths]) => ({ hex, paths: [...paths] }));
})();

describe('the console palette', () => {
  it('found the chrome to check against', () => {
    // A rule that silently matched nothing would pass every assertion below it, so the
    // surfaces are checked for the one colour that must be among them and for more than
    // a handful of the others the panels declare.
    expect(SURFACES.map((surface) => surface.hex)).toContain(BACKGROUND);
    expect(SURFACES.length).toBeGreaterThan(4);
  });

  it.each(['--shell-dim', '--flow-dim', '--dim'])(
    '%s is readable on every surface the shell paints',
    (name) => {
      const dim = token(name);
      // Naming the file that declares each surface, because the fix is usually there
      // rather than in the token: a new background darker or lighter than the rest.
      const unreadable = SURFACES.filter((surface) => contrast(dim, surface.hex) < AA_TEXT).map(
        (surface) =>
          `${surface.hex} (${contrast(dim, surface.hex).toFixed(2)}:1) in ${surface.paths.join(', ')}`,
      );
      expect(unreadable, `${name} is ${dim}`).toEqual([]);
    },
  );

  it('keeps the dim text a step behind the lit text rather than equal to it', () => {
    // The cheapest way to pass the check above is to set the dim colour to the lit one,
    // which would delete the distinction the dim colour exists to draw.
    const step = contrast(token('--shell-fg'), token('--shell-dim'));
    expect(step).toBeGreaterThan(1.3);
    expect(step).toBeLessThan(3);
  });

  /**
   * What each rule paints, and what will be written on it.
   *
   * The surfaces above are the chrome — backgrounds close enough to `--shell-bg` to read
   * as part of it. A rule that paints something *lighter* is outside that set by
   * construction, which is exactly where the map's light paper was hiding. So this asks
   * the pairing question of every rule instead: the colour the rule sets, or the one
   * another rule gives the same element, or the one it inherits from the body.
   */
  it('writes legibly on every opaque surface any rule paints', () => {
    const inherited = token('--shell-fg');
    // The last class in a selector is the element it paints, as far as this needs to
    // know. Two rules ending in the same class paint the same element, and one may set a
    // colour while the other sets only a surface — which is how the holdings timeline is
    // written, and reading that as text inherited from the body reports faults that are
    // not there.
    const target = (selector: string) => {
      const classes = selector.match(/\.[a-z][a-z0-9-]*/gi);
      return classes ? classes[classes.length - 1] : selector;
    };
    const declarations = SOURCES.flatMap(({ path, css }) =>
      [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
        path: path.slice(APP.length + 1),
        selector: (match[1].trim().split('\n').pop() ?? '').trim(),
        body: match[2],
      })),
    );
    const writtenIn = new Map<string, string>();
    for (const { selector, body } of declarations) {
      const written = colour(/(?<!-)\bcolor\s*:\s*([^;}!]+)/i.exec(body)?.[1] ?? '');
      if (written !== undefined) writtenIn.set(target(selector), written);
    }

    const failures: string[] = [];
    for (const { path, selector, body } of declarations) {
      if (selector in NO_TEXT_ON) continue;
      const surface = colour(/background(?:-color)?\s*:\s*([^;}!]+)/i.exec(body)?.[1] ?? '');
      if (surface === undefined) continue;
      const own = colour(/(?<!-)\bcolor\s*:\s*([^;}!]+)/i.exec(body)?.[1] ?? '');
      const text = own ?? writtenIn.get(target(selector)) ?? inherited;
      const ratio = contrast(text, surface);
      if (ratio < AA_TEXT) {
        failures.push(`${selector} in ${path}: ${text} on ${surface} is ${ratio.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('holds a colour written as a literal to what a colour in the palette is held to', () => {
    // A rule that paints nothing offers no pair to measure, so its own colour is held to
    // the whole chrome — the same bound the tokens answer to. `#444` on the shell's
    // background had no token holding it to anything at all.
    const failures: string[] = [];
    for (const { path, css } of SOURCES) {
      for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = (match[1].trim().split('\n').pop() ?? '').trim();
        const body = match[2];
        if (selector in NO_TEXT_ON || /background(?:-color)?\s*:/i.test(body)) continue;
        const written = /(?<!-)\bcolor\s*:\s*(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})\s*[;}]/i.exec(body)?.[1];
        if (written === undefined) continue;
        const hex = expand(written);
        for (const surface of SURFACES) {
          const ratio = contrast(hex, surface.hex);
          if (ratio < AA_TEXT) {
            failures.push(
              `${selector} in ${path.slice(APP.length + 1)}: ${hex} on ${surface.hex} is ${ratio.toFixed(2)}:1`,
            );
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('leaves every rule that asks for a token with a token to find', () => {
    const asked = new Set(
      SOURCES.flatMap(({ css }) => [...css.matchAll(/var\((--[a-z0-9-]+)\)/gi)].map((m) => m[1])),
    );
    expect([...asked].filter((name) => !TOKENS.has(name))).toEqual([]);
  });

  it('keeps its list of text-free surfaces honest', () => {
    // An excused selector has to still exist and still carry its reason: a renamed rule
    // loses its excuse and comes back through the pairing check rather than staying
    // quietly exempt.
    const selectors = new Set(
      SOURCES.flatMap(({ css }) =>
        [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) => (m[1].trim().split('\n').pop() ?? '').trim()),
      ),
    );
    for (const [selector, reason] of Object.entries(NO_TEXT_ON)) {
      expect(selectors.has(selector), `${selector} is excused but nothing declares it`).toBe(true);
      expect(reason.length, `${selector} is excused without a reason`).toBeGreaterThan(10);
    }
  });

  it('states the same secondary grey everywhere it is restated', () => {
    // operator.css restates the console palette as its own --flow-* vocabulary and
    // mobile.html carries a third copy; drifting apart is how one of them would keep an
    // unreadable grey after the other two were fixed.
    expect(token('--flow-dim')).toBe(token('--shell-dim'));
    expect(token('--dim')).toBe(token('--shell-dim'));
  });
});
