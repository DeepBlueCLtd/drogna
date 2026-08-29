/**
 * Gate: the published site discloses nothing about the machine that built it, or about
 * anyone (SRD-v2 PR-01 — public but unadvertised, no customer, project or bid material
 * anywhere).
 *
 * An email address and a home-directory path are the two that actually reach a public
 * site by accident: pasted into a code block with the terminal prompt still attached, or
 * carried in a stack trace copied out of a session. Neither is prose anybody writes on
 * purpose, which is what makes them checkable without an acknowledgement list.
 *
 * This carries the text half of V1's `site/gates/check_vocabulary.py`. The half not
 * carried is OCR over published images, which read screenshots for an address bar or a
 * host path burnt into a pixel. That was a real check and its loss is real: it wanted
 * an OCR engine, which is a second language runtime (NFR-01, NFR-05), and the discipline
 * that fed it — every screenshot comes from the capture mechanism, and capture output is
 * committed deliberately — is what has to hold instead. ADR-0031 records the trade.
 *
 * The exemption on the next line is the whole of V1's recorded reason for it: a
 * document must be able to name a prohibition in order to state it. harness:allow-forbidden-vocabulary
 * The tracked-entity nouns are deliberately not scanned here. V1 ruled that
 * documentation must be able to discuss a prohibition in order to state it, excluded the
 * site from that scan, and the rendered pages are the same prose; the seven lines that
 * would match today are all sentences about the rule. The ruling is inherited, not
 * re-argued — `check-vocabulary.ts` still scans everything that is not documentation.
 */
import { join } from 'node:path';
import { buildSite, type SiteFile } from '../site/build.js';
import { REPO_ROOT, type Finding } from './lib.js';

const DISCLOSURES = [
  {
    label: 'an email address',
    // A `mailto:` hyperlink would be a deliberate offer of an address; there is none, and
    // if one is ever wanted it is a decision worth making explicitly rather than here.
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
  },
  { label: "a home directory on the machine that built it", pattern: /\/(?:home|Users)\/[A-Za-z0-9._-]+/g },
  { label: "a home directory on the machine that built it", pattern: /[A-Z]:\\Users\\[A-Za-z0-9._-]+/g },
];

export function inspect(files: readonly SiteFile[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    if (!/\.(html|css|txt|json)$/.test(file.path)) continue;
    const text = String(file.contents);
    for (const { label, pattern } of DISCLOSURES) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        findings.push({
          file: file.path,
          line: text.slice(0, match.index).split('\n').length,
          message: `the published page carries ${label}: '${match[0]}' (SRD-v2 PR-01)`,
        });
      }
    }
  }
  return findings;
}

export function runGate(root: string = REPO_ROOT, contentDir?: string): Finding[] {
  return inspect(buildSite(root, contentDir ?? join(root, 'site', 'docs')).files);
}
