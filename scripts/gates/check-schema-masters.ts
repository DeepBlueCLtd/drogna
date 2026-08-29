/**
 * Gate: every master under contracts/schemas/ is itself a valid JSON Schema 2020-12
 * document, and Ajv can compile it.
 *
 * This check used to happen in every visitor's browser. `createSeamValidator` handed all
 * forty-nine masters to Ajv with `validateSchema` at its default, so each page load
 * re-validated them against the meta-schema before it could do anything else — about
 * 250 ms of a mid-range laptop's boot, spent re-deciding something that cannot change
 * between visits (`spikes/load-time`, §3). The masters are committed; the right place to
 * decide it is once, here, where a bad master fails the build instead of every reader.
 *
 * So this is not a check that was dropped for speed. It is the same check, moved to the
 * moment it can still be acted on — and made stricter on the way: the browser only ever
 * validated the documents, where this also compiles each one, so a master that parses but
 * cannot produce a validator is caught here rather than at the call site that first wants
 * it.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { type Finding, REPO_ROOT } from './lib.js';

/**
 * Ajv belongs to the `app` workspace and not to the root, so it is resolved from there
 * rather than imported by bare name. That is not only plumbing: it means this gate
 * decides with the very Ajv the browser will use, and cannot pass against a version the
 * app does not ship.
 */
function ajvFromApp(root: string): { Ajv2020: new (options: object) => AjvInstance; addFormats: (ajv: AjvInstance) => void } {
  const fromApp = createRequire(join(root, 'app', 'package.json'));
  return {
    Ajv2020: fromApp('ajv/dist/2020.js').Ajv2020,
    addFormats: fromApp('ajv-formats').default ?? fromApp('ajv-formats'),
  };
}

interface AjvInstance {
  addSchema(document: unknown): unknown;
  getSchema(id: string): unknown;
}

export function runGate(root: string = REPO_ROOT): Finding[] {
  const { Ajv2020, addFormats } = ajvFromApp(root);
  const schemasDir = join(root, 'contracts', 'schemas');
  let files: string[];
  try {
    files = readdirSync(schemasDir).filter((name) => name.endsWith('.schema.json')).sort();
  } catch {
    return [{ file: 'contracts/schemas', line: 1, message: 'no masters directory to check' }];
  }

  const findings: Finding[] = [];
  // validateSchema stays ON here — this gate is the place that does that work.
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  const documents: { file: string; document: Record<string, unknown> }[] = [];
  for (const file of files) {
    const path = `contracts/schemas/${file}`;
    let document: Record<string, unknown>;
    try {
      document = JSON.parse(readFileSync(join(schemasDir, file), 'utf8')) as Record<string, unknown>;
    } catch (error) {
      findings.push({ file: path, line: 1, message: `not JSON: ${(error as Error).message}` });
      continue;
    }
    try {
      // Refused here means refused by the 2020-12 meta-schema.
      ajv.addSchema(document);
      documents.push({ file: path, document });
    } catch (error) {
      findings.push({ file: path, line: 1, message: `refused by the meta-schema: ${(error as Error).message}` });
    }
  }

  // Compilation is deferred until every master is registered, because a master that
  // $refs another cannot compile before that other one is known.
  for (const { file, document } of documents) {
    const id = document.$id;
    if (typeof id !== 'string') {
      findings.push({ file, line: 1, message: 'no $id, so nothing can address this master' });
      continue;
    }
    try {
      if (!ajv.getSchema(id)) {
        findings.push({ file, line: 1, message: `$id '${id}' resolves to no schema` });
      }
    } catch (error) {
      findings.push({ file, line: 1, message: `does not compile: ${(error as Error).message}` });
    }
  }

  return findings;
}
