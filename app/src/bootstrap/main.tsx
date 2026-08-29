/**
 * The composition root (ADR-0030): the only module that imports both sides of the
 * seam. It reads the run configuration document, seeds and provisions the run,
 * installs the fetch shim (ADR-0029), and mounts the shell — handing each half only
 * configuration and seam interfaces. Nothing imports this module.
 */
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import runConfigDocument from '../../config/run.json';
import type { ConfigRun, RunManifest } from '../generated/types.js';
import { createSeamValidator } from '../seam/validate.js';
import type { SeamValidator } from '../seam/validate.js';
import { installSeamFetch } from '../seam/http.js';
import type { SeamHttpBackend } from '../seam/http.js';
import { buildBackend, type BackendRuntime } from '../backend/runtime/runtime.js';
import { Shell } from '../shell/Shell.js';

declare const __DROGNA_REVISION__: string;
declare const __DROGNA_DIRTY__: boolean;

const config = runConfigDocument as ConfigRun;

/**
 * Built on first use rather than at module scope, because everything that wants it runs
 * after the starting frame and constructing it does not: at module scope its ~270 ms at
 * Chromium's 4x throttle sat in front of the first paint, and moving it behind the frame
 * was worth that much of the blank screen on its own (spikes/load-time §7).
 *
 * Memoised, so a re-boot from an imported manifest reuses the one Ajv instance rather
 * than paying for it again.
 */
let seamValidator: SeamValidator | undefined;
function validatorForRun(): SeamValidator {
  seamValidator ??= createSeamValidator();
  return seamValidator;
}

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

/**
 * Building the backend is one unbroken task — validating twenty-one configuration
 * documents, constructing every component, then provisioning the archive on the clock's
 * first sample — and until it returns the page has painted nothing but the background
 * colour in `index.html`. On a mid-range laptop that is over a second of blank screen
 * before the shell exists (`spikes/load-time`, §3).
 *
 * So the shell's frame is painted first and the construction runs after it. Nothing about
 * the construction changes: the same order, the same clock sample, the same bytes a
 * replay must reproduce (AT-04). What changes is only that the browser is let up for air
 * in between, which it cannot do from inside a synchronous stretch.
 *
 * Two frames deep because one only guarantees the callback runs *before* the next paint,
 * not after it; the second fires once that paint has happened.
 */
function whenPainted(proceed: () => void): void {
  // harness:allow-wallclock a yield until the shell's first frame is on screen — the frame timestamp is not read, and no simulation time exists yet
  requestAnimationFrame(() => requestAnimationFrame(proceed));
}

/**
 * What the page shows while the backend is being built. It says the harness is starting
 * rather than leaving the screen dark; the seam is already honest behind it, because the
 * fetch shim answers 503 until a run is provisioned.
 */
function Starting(): ReactNode {
  return (
    <div className="shell">
      <header className="shell-header">
        <span className="shell-title">drogna</span>
        <span className="shell-disclaimer">synthetic throughout — holds no third-party entities</span>
      </header>
      <div className="shell-body">
        <div className="panel">
          <p className="not-landed">provisioning the run…</p>
        </div>
      </div>
    </div>
  );
}

function boot(rootSeed: number): void {
  runtime?.stop();
  const validator = validatorForRun();
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
  const verdict = validatorForRun().validate('run-manifest', candidate);
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
// flushSync, because `root.render` only schedules: React 18 would otherwise still be
// holding the starting frame uncommitted when the yield below expires, and the first
// thing painted would be the finished shell — measured, and the reason this is not a
// plain render (spikes/load-time).
flushSync(() => root.render(<Starting />));
whenPainted(() => boot(freshRootSeed()));
