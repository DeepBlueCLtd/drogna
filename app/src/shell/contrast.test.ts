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
  const hex = /^#([0-9a-fA-F]{6})$/.exec(trimmed);
  return hex ? `#${hex[1].toLowerCase()}` : undefined;
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

  it('states the same secondary grey everywhere it is restated', () => {
    // operator.css restates the console palette as its own --flow-* vocabulary and
    // mobile.html carries a third copy; drifting apart is how one of them would keep an
    // unreadable grey after the other two were fixed.
    expect(token('--flow-dim')).toBe(token('--shell-dim'));
    expect(token('--dim')).toBe(token('--shell-dim'));
  });
});
