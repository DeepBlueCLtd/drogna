/**
 * The composition root (ADR-0030): the only module that imports both sides of the
 * seam. It reads the run configuration document, seeds and provisions the run,
 * installs the fetch shim (ADR-0029), and mounts the shell — handing each half only
 * configuration and seam interfaces. Nothing imports this module.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import runConfigDocument from '../../config/run.json';
import type { ConfigRun, RunManifest } from '../generated/types.js';
import { createSeamValidator } from '../seam/validate.js';
import { installSeamFetch } from '../seam/http.js';
import type { SeamHttpBackend } from '../seam/http.js';
import { buildBackend, type BackendRuntime } from '../backend/runtime/runtime.js';
import { Shell } from '../shell/Shell.js';

declare const __DROGNA_REVISION__: string;
declare const __DROGNA_DIRTY__: boolean;

const config = runConfigDocument as ConfigRun;
const validator = createSeamValidator();

/**
 * The one place entropy may enter the harness: seeding a fresh visit's manifest.
 * Recorded in the manifest immediately; everything downstream derives from it
 * (Constitution II).
 */
function freshRootSeed(): number {
  const buffer = new Uint32Array(1);
  // harness:allow-entropy the root seed of a fresh run, recorded in the manifest
  crypto.getRandomValues(buffer);
  return buffer[0];
}

let runtime: BackendRuntime | undefined;

function boot(rootSeed: number): void {
  runtime?.stop();
  runtime = buildBackend(
    config,
    { rootSeed, revision: __DROGNA_REVISION__, dirty: __DROGNA_DIRTY__ },
    validator,
  );
  const shellClient = runtime.transport.connect(config.shell.id, config.shell.role);
  root.render(
    <StrictMode>
      <Shell
        key={runtime.runId}
        config={config.shell}
        client={shellClient}
        validator={validator}
        manifest={runtime.manifest}
        onImportManifest={importManifest}
      />
    </StrictMode>,
  );
}

function importManifest(candidate: unknown): string | undefined {
  const verdict = validator.validate('run-manifest', candidate);
  if (!verdict.ok) return `manifest refused by its master: ${verdict.refusals[0]}`;
  const manifest = candidate as RunManifest;
  if (manifest.seed_derivation.rule !== runtime?.manifest.seed_derivation.rule) {
    return `manifest derives seeds by '${manifest.seed_derivation.rule}', this build by '${runtime?.manifest.seed_derivation.rule}'`;
  }
  boot(manifest.root_seed);
  return undefined;
}

// The shim is installed once; re-boots swap the backend behind it.
installSeamFetch(config.boundary.api_prefix, {
  handle: (request) => {
    if (!runtime) return Promise.resolve({ status: 503, body: JSON.stringify({ refused: 'no run provisioned' }) });
    return runtime.httpBackend.handle(request);
  },
} satisfies SeamHttpBackend);

const container = document.getElementById('root');
if (!container) throw new Error('no #root element to mount into');
const root = createRoot(container);
boot(freshRootSeed());
