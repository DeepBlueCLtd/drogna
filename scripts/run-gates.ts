/**
 * The gates runner. It names no gate: the set is scripts/gates.registry, one path
 * per line, so a feature adds a gate by appending a line and never by editing this
 * file. A gate that cannot run is a failure — the outcome that proves nothing must
 * not look like a pass.
 *
 * Overrides for the runner's own tests: DROGNA_GATES_REGISTRY points at an
 * alternative registry; DROGNA_GATES_ROOT at an alternative tree to scan.
 *
 * A gate may return its findings or a promise of them, and the result is awaited either
 * way. That is not a convenience: before feature 118 the call was not awaited, so a gate
 * that returned a promise had `.length` read off the promise, found undefined, compared
 * undefined > 0 false, and was reported **ok** — a gate that ran nothing and looked like
 * a pass, which is the one outcome the paragraph above says must not happen. The
 * snapshot-drift gate is the first that has to be asynchronous (it rebuilds artefacts
 * through the same async pre-roll the browser drives); the hazard was there for every
 * gate before it existed.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { printFindings, REPO_ROOT, type Finding } from './gates/lib.js';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const registryPath = process.env.DROGNA_GATES_REGISTRY ?? join(scriptsDir, 'gates.registry');
const scanRoot = process.env.DROGNA_GATES_ROOT ?? REPO_ROOT;

const entries = readFileSync(registryPath, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith('#'));

let failed = 0;
for (const entry of entries) {
  const gateName = entry.replace(/^gates\//, '').replace(/\.ts$/, '');
  try {
    const module = (await import(pathToFileURL(join(scriptsDir, entry)).href)) as {
      runGate?: (root?: string) => Finding[] | Promise<Finding[]>;
    };
    if (typeof module.runGate !== 'function') {
      console.error(`${gateName}: could not run — the module exports no runGate`);
      failed += 1;
      continue;
    }
    const findings = await module.runGate(scanRoot);
    if (!Array.isArray(findings)) {
      // A gate that answered with something that is not a list of findings has not
      // reported "clean"; it has failed to report at all.
      console.error(`${gateName}: could not run — runGate answered with ${typeof findings}, not a list of findings`);
      failed += 1;
      continue;
    }
    if (findings.length > 0) {
      printFindings(gateName, findings);
      console.error(`${gateName}: FAILED with ${findings.length} finding(s)`);
      failed += 1;
    } else {
      console.log(`${gateName}: ok`);
    }
  } catch (fault) {
    console.error(`${gateName}: could not run — ${(fault as Error).message}`);
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`${failed} of ${entries.length} gate(s) failed`);
  process.exit(1);
}
console.log(`${entries.length} gate(s) ran clean`);
