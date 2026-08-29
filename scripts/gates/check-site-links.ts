/**
 * Gate: every internal link on the published site resolves, and none of them is
 * absolute (SRD-v2 PR-01's discipline of an estate that serves from any base path).
 *
 * The link faults are found by the site build itself, because a link can only be
 * checked against the set of pages that will actually exist, and only the build knows
 * that set. V1 had mkdocs' `--strict` do this and it worked; what did not work was
 * that it ran in a workflow, so when the workflow was deleted the checking stopped
 * without anything going red. This runs wherever `pnpm gates` runs.
 *
 * A page that does not exist, a heading that does not exist, an asset nobody publishes
 * and a link written as `/absolute` are all faults. Links to another origin are not:
 * the site may point a reader at a standards document, it may simply not fetch one.
 */
import { join } from 'node:path';
import { buildSite } from '../site/build.js';
import { REPO_ROOT, type Finding } from './lib.js';

export function runGate(root: string = REPO_ROOT, contentDir?: string): Finding[] {
  return buildSite(root, contentDir ?? join(root, 'site', 'docs')).faults.map((fault) => ({
    file: fault.file,
    line: fault.line,
    message: fault.message,
  }));
}
