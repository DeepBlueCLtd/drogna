/**
 * Gate: every master under contracts/schemas/ is itself a valid JSON Schema 2020-12
 * document, and Ajv can compile it.
 *
 * This began as a way to stop the browser doing the work: `createSeamValidator` hands all
 * forty-nine masters to Ajv, and with `validateSchema` at its default each page load
 * re-validated them against the meta-schema — about 270 ms of a mid-range laptop's boot,
 * re-deciding something that cannot change between visits. Turning that off in the browser
 * turned out to save nothing at all: the cost simply reappeared in compilation, and the
 * boot total came out the same within noise (`spikes/load-time`, §7). So the runtime check
 * stayed, and this gate is what the measurement left behind.
 *
 * It earns its place anyway, on being earlier and stricter rather than on being faster. A
 * bad master fails the build here instead of reaching a reader; and where the browser only
 * ever validated the documents, this also compiles each one, so a master that parses and
 * satisfies the meta-schema but cannot produce a validator — a dangling `$ref`, say — is
 * caught here rather than at whichever call site first happens to want it.
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
