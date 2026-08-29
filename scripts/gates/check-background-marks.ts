/**
 * Gate: no category style is authored inline in an explainer (feature 111 FR-011).
 *
 * Every explainer is designed in colour and must survive greyscale. FR-011 requires
 * that guarantee to be *structural* rather than a promise kept by review: a category
 * is a hue together with a texture and a line weight, held in one shared vocabulary
 * (`app/src/panels/background/marks.tsx`), so a colour-only distinction cannot be
 * expressed. That only holds while colour arrives from the vocabulary — one hex
 * literal in an explainer and the guarantee is back to being a promise.
 *
 * So: under app/src/panels/background/explainers, no colour literal, and no paint
 * attribute given a string that is not `none`, `currentColor`, `transparent`, or a
 * reference to a pattern the vocabulary defines. The colours themselves live in
 * marks.tsx, which this gate does not scan, because that is where they belong.
 *
 * Watched failing against a planted violation in
 * scripts/gates/tests/fixtures/violations. Exemptions are
 * `// harness:allow-inline-mark <reason>`.
 */
import { join } from 'node:path';
import { walk, scanForPatterns, isTestFile, type Finding, REPO_ROOT } from './lib.js';

const ALLOWED_PAINT = String.raw`none|currentColor|transparent|url\(#[a-z0-9-]+\)`;

const PATTERNS = [
  {
    pattern: /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b(?![)'"]*\s*=>)/,
    message: 'a colour literal in an explainer; a category is a hue with a texture and a weight (FR-011)',
  },
  {
    pattern: /\b(?:rgba?|hsla?|color-mix)\s*\(/,
    message: 'a computed colour in an explainer; colour comes from the mark vocabulary (FR-011)',
  },
  {
    pattern: new RegExp(String.raw`\b(?:fill|stroke)\s*=\s*"(?!(?:${ALLOWED_PAINT})")`),
    message: 'a paint literal in an explainer; ask marks.tsx for a category (FR-011)',
  },
];

export function runGate(root: string = REPO_ROOT): Finding[] {
  const explainersRoot = join(root, 'app', 'src', 'panels', 'background', 'explainers');
  const files = walk(explainersRoot, (path) => /\.tsx?$/.test(path) && !isTestFile(path));
  return scanForPatterns(files, PATTERNS, 'harness:allow-inline-mark', root, { skipComments: true });
}
