/**
 * Gate: the application has one breakpoint, and every stylesheet carries the same
 * number (feature 112, FR-002, SC-006).
 *
 * The presentation switch is a TypeScript constant — `NARROW_WIDTH` in
 * `app/src/shell/viewport.ts` — and the stylesheets have to agree with it, because CSS
 * cannot read it: a custom property is not usable in a `@media` or `@container`
 * condition, so the number is necessarily written out again. That is the whole risk this
 * gate exists for. A breakpoint copied into five files is a number that drifts, and it
 * drifts *silently*: nothing renders wrong on the machine of whoever changed one of
 * them, and the fault surfaces later, on somebody's phone, as a panel that switched
 * presentation at one width and re-laid its contents at another.
 *
 * So: read the constant from the module that declares it, then scan every `@media` and
 * `@container` condition in `app/src` for a width in pixels, and fail on any that is not
 * it. Reading the declaration rather than a number typed here is the point — a bound
 * derived from something on disk, rather than a second copy of the thing being checked.
 *
 * A genuinely different breakpoint is exempted with `harness:allow-breakpoint <reason>`
 * on the line or the line above. It is expected to be rare and argued: two breakpoints
 * are two presentations, and feature 112 says there are two, once.
 */
import { join, relative } from 'node:path';
import { readFileSync } from 'node:fs';
import { walk, readLines, hasMarker, REPO_ROOT, type Finding } from './lib.js';

const DECLARATION = join('app', 'src', 'shell', 'viewport.ts');
/** `@media (max-width: 720px)`, `@container (min-width: 720px)`, and their kin. */
const CONDITION = /@(?:media|container)[^{]*?\(\s*(?:min|max)-width:\s*(\d+(?:\.\d+)?)px/g;

function declaredThreshold(root: string): number {
  // A gate that cannot find its bound has proved nothing, and must not look like a pass
  // (`run-gates.ts`). Both failures — no such module, and a module that declares no
  // threshold — say the same thing and say it in the same words.
  let source: string;
  try {
    source = readFileSync(join(root, DECLARATION), 'utf8');
  } catch {
    throw new Error(`${DECLARATION} is not there to read NARROW_WIDTH from — the gate has nothing to hold the stylesheets to`);
  }
  const match = /export const NARROW_WIDTH\s*=\s*(\d+)/.exec(source);
  if (!match) {
    throw new Error(`${DECLARATION} declares no NARROW_WIDTH — the gate has nothing to hold the stylesheets to`);
  }
  return Number(match[1]);
}

export function runGate(root: string = REPO_ROOT): Finding[] {
  const threshold = declaredThreshold(root);
  const findings: Finding[] = [];
  for (const file of walk(join(root, 'app', 'src'), (path) => path.endsWith('.css'))) {
    const lines = readLines(file);
    lines.forEach((line, index) => {
      for (const match of line.matchAll(CONDITION)) {
        if (Number(match[1]) === threshold) continue;
        if (hasMarker(lines, index, 'harness:allow-breakpoint')) continue;
        findings.push({
          file: relative(root, file),
          line: index + 1,
          message: `a breakpoint at ${match[1]}px; the one threshold is ${threshold}px, declared in ${DECLARATION}`,
        });
      }
    });
  }
  return findings;
}
