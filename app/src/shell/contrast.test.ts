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
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');
const SHELL = join(__dirname, 'shell.css');
const OPERATOR = join(__dirname, '..', 'panels', 'operator', 'operator.css');

/** Every stylesheet the application ships, found rather than listed. */
function stylesheets(from: string = SRC): string[] {
  return readdirSync(from, { withFileTypes: true }).flatMap((entry) => {
    const path = join(from, entry.name);
    if (entry.isDirectory()) return stylesheets(path);
    return entry.name.endsWith('.css') ? [path] : [];
  });
}

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

/**
 * Rules that paint a surface nothing is written on, and why each one holds no text.
 *
 * A bar, a dot, a lane and a drawing canvas are shapes: what they mean is carried by a
 * label beside them, and holding them to a text threshold would drag the whole picture
 * towards white for no reader's benefit. Anything not named here is treated as a
 * surface a sentence could land on — which is the safe way round, and the way this
 * check finds the next one of these.
 */
const NO_TEXT_ON: Record<string, string> = {
  '.status-dot': 'a 0.6em circle, beside the word it repeats',
  '.status-ok': 'the same circle, lit',
  '.status-stopping': 'the same circle, amber',
  '.status-stalled': 'the same circle, red',
  '.map-canvas': 'the paper the map is drawn on; deck.gl paints over it and the shell writes nothing on it',
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

/**
 * `#abc` and `#aabbcc` are the same colour, and CSS accepts both. The first version of
 * this file matched six digits only, so `#444` — the very colour that had been reported
 * as unreadable — went straight past it while a six-digit colour one shade away was
 * caught. Planting the reported fault back is how that was found; a check with a hole in
 * its pattern is a check that passes.
 */
function expand(hex: string): string {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex.trim());
  return (short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : hex.trim())
    .toLowerCase();
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(expand(a)), luminance(expand(b))].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * One CSS rule, flattened enough to ask what it paints and what it writes. Not a CSS
 * parser: a rule is `selector { body }` with no braces inside, which is every rule in
 * this application, and the last line of the prelude is the selector even when a media
 * query opened a brace before it.
 */
function rules(css: string): { selector: string; body: string }[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: (match[1].trim().split('\n').pop() ?? '').trim(),
    body: match[2],
  }));
}

/**
 * The element a rule paints, as far as this needs to know: the last class in its
 * selector.
 *
 * Two rules that end in the same class are painting the same element, and one may set a
 * colour while the other sets only a surface — which is how the holdings timeline is
 * written, a bar with a label colour and a fill per era that overrides the fill alone.
 * Reading that as text inheriting from the body reported two faults that were not there,
 * and a check that cries wolf gets its exclusions widened until it sees nothing.
 */
function target(selector: string): string {
  const classes = selector.match(/\.[a-z][a-z0-9-]*/gi);
  return classes ? classes[classes.length - 1] : selector;
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

  /**
   * The fault the palette check above could not see, because it read two stylesheets.
   *
   * The map was written for light paper and the shell is dark. Four of its rules painted
   * a pale surface and set no colour of their own, so the text on them inherited the
   * shell's near-white and read at about 1.1:1 — the composer's URL box, which is the
   * one thing in the composer a reader has to be able to read, was reported as white on
   * white. `.map-status` was the same fault upside down: `#444` on the shell's own
   * background.
   *
   * So this asks the general question instead of the palette question: for every rule in
   * every stylesheet that paints an opaque surface, is the text that will land on it
   * legible against it? The text is the rule's own colour where it sets one, and the
   * colour it would inherit from the body where it does not — which is exactly the
   * inheritance that caused this.
   */
  it('writes legibly on every opaque surface any stylesheet paints', () => {
    const inherited = tokens.get('--shell-fg');
    expect(inherited, 'the colour an uncoloured rule inherits').toBeDefined();
    const resolve = (value: string): string | undefined => {
      const literal = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
      if (literal) return expand(literal[0]);
      const token = /^var\((--[a-z-]+)\)$/i.exec(value.trim());
      return token ? tokens.get(token[1]) : undefined;
    };

    const every = stylesheets().flatMap((sheet) => rules(readFileSync(sheet, 'utf8')));
    // What each element is written in, wherever that was said: on the rule itself, or on
    // another rule painting the same element.
    const writtenIn = new Map<string, string>();
    for (const { selector, body } of every) {
      const written = /(?<!-)\bcolor:\s*([^;]+);/i.exec(body)?.[1];
      const resolved = written === undefined ? undefined : resolve(written);
      if (resolved !== undefined) writtenIn.set(target(selector), resolved);
    }

    const failures: string[] = [];
    for (const { selector, body } of every) {
      if (selector in NO_TEXT_ON) continue;
      const painted = /background(?:-color)?:\s*([^;]+);/i.exec(body)?.[1];
      // Translucent and absent surfaces are not resolved: what shows through them is
      // whatever is behind, which this cannot know without rendering the page.
      const surface = painted === undefined ? undefined : resolve(painted);
      if (surface === undefined) continue;
      const own = /(?<!-)\bcolor:\s*([^;]+);/i.exec(body)?.[1];
      const text = own !== undefined ? resolve(own) : (writtenIn.get(target(selector)) ?? inherited);
      if (text === undefined) continue;
      const ratio = contrast(text, surface);
      if (ratio < AA) {
        const how = own !== undefined ? 'sets' : writtenIn.has(target(selector)) ? 'is written in' : 'inherits';
        failures.push(`${selector} ${how} ${text} on ${surface}: ${ratio.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });

  /**
   * The other half of the same fault, which the check above cannot see.
   *
   * `.map-status` was `#444` on the shell's own background — a colour chosen for light
   * paper, on a rule that paints nothing, so there is no pair for a surface check to
   * measure. Planting it back went straight past this file's first version.
   *
   * A colour written as a literal has no palette entry holding it to anything, so it is
   * held to what the tokens are held to: legible on every surface the application
   * declares. A rule that paints its own surface is not asked twice — the check above
   * has it, against the surface it actually sits on.
   */
  it('holds a colour written as a literal to the same rule as a colour in the palette', () => {
    const every = stylesheets().flatMap((sheet) => rules(readFileSync(sheet, 'utf8')));
    const failures: string[] = [];
    for (const { selector, body } of every) {
      if (selector in NO_TEXT_ON) continue;
      if (/background(?:-color)?:/i.test(body)) continue;
      const written = /(?<!-)\bcolor:\s*(#(?:[0-9a-f]{3}|[0-9a-f]{6}))\s*;/i.exec(body)?.[1];
      if (written === undefined) continue;
      for (const surface of surfaces) {
        const ratio = contrast(expand(written), surface);
        if (ratio < AA) failures.push(`${selector} sets ${expand(written)} on ${surface}: ${ratio.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('keeps its list of text-free surfaces honest', () => {
    // Same rule as the token exclusions: a selector excused here has to still exist, and
    // has to carry the reason it is excused. A renamed rule loses its excuse and comes
    // back through the check above rather than staying quietly exempt.
    const every = stylesheets().flatMap((sheet) => rules(readFileSync(sheet, 'utf8')));
    for (const [selector, reason] of Object.entries(NO_TEXT_ON)) {
      expect(
        every.some((rule) => rule.selector === selector),
        `${selector} is excused but no stylesheet declares it`,
      ).toBe(true);
      expect(reason.length, `${selector} is excused without a reason`).toBeGreaterThan(10);
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
