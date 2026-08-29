/**
 * The gates runner. It names no gate: the set is scripts/gates.registry, one path
 * per line, so a feature adds a gate by appending a line and never by editing this
 * file. A gate that cannot run is a failure — the outcome that proves nothing must
 * not look like a pass.
 *
 * Overrides for the runner's own tests: DROGNA_GATES_REGISTRY points at an
 * alternative registry; DROGNA_GATES_ROOT at an alternative tree to scan.
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
      runGate?: (root?: string) => Finding[];
    };
    if (typeof module.runGate !== 'function') {
      console.error(`${gateName}: could not run — the module exports no runGate`);
      failed += 1;
      continue;
    }
    const findings = module.runGate(scanRoot);
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
