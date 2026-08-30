/**
 * The composition root (ADR-0030): the only module that imports both sides of the
 * seam. It reads the run configuration document, resolves the start condition this
 * visit begins in, seeds and provisions the run, drives that condition's pre-roll
 * through the control plane, installs the fetch shim (ADR-0029), and mounts the shell —
 * handing each half only configuration and seam interfaces. Nothing imports this module.
 */
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import runConfigDocument from '../../config/run.json';
import type { ConfigRun, ConfigStartConditionsCondition, RunManifest } from '../generated/types.js';
import { createSeamValidator } from '../seam/validate.js';
import type { SeamValidator } from '../seam/validate.js';
import { installSeamFetch } from '../seam/http.js';
import type { SeamHttpBackend } from '../seam/http.js';
import { buildBackend, type BackendRuntime } from '../backend/runtime/runtime.js';
import { Shell } from '../shell/Shell.js';
import { Welcome, type WelcomePreparation } from '../shell/Welcome.js';
import { viewFromHash } from '../shell/views.js';
import {
  artefactPath,
  authorsCoveredBySnapshot,
  conditionById,
  conditionFromSearch,
  configForCondition,
  defaultCondition,
  holdingBack,
  searchNaming,
  START_PARAMETER,
} from './start-condition.js';
import { runPreRoll } from './preroll.js';
import { decodeSnapshot, type SnapshotContents } from '../backend/snapshot/codec.js';

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
/**
 * A condition's committed seed-data artefact, or undefined with the reason (ADR-0041).
 *
 * A missing or unreadable artefact is a performance regression and not a correctness
 * one — the drift gate's whole claim is that an artefact only ever holds what the
 * components would author — so this never throws. It reports, the source says so in its
 * heartbeat, and the run authors its own ocean, several seconds slower and every bit as
 * true. A page that refused to open because a static asset had gone missing would be
 * trading the thing that works for the thing that is fast.
 */
async function fetchArtefact(
  condition: ConfigStartConditionsCondition,
): Promise<{ contents?: SnapshotContents; unavailable?: string }> {
  if ((condition.snapshot_eras ?? []).length === 0) return {};
  const path = artefactPath(condition, config.snapshot_source);
  try {
    const response = await fetch(path);
    if (!response.ok) return { unavailable: `${path} answered ${response.status}` };
    return { contents: await decodeSnapshot(new Uint8Array(await response.arrayBuffer())) };
  } catch (fault) {
    return { unavailable: `${path}: ${fault instanceof Error ? fault.message : String(fault)}` };
  }
}

let runtime: BackendRuntime | undefined;

/**
 * Building the backend is one unbroken task — validating twenty-two configuration
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
 * The yield between the pre-roll's bursts of stepped ticks. It arms a timer and so reads
 * the host, which is why it lives here rather than in `preroll.ts`: simulation time
 * advances on the step operation and on nothing else, so what this pauses is the host's
 * event loop and never the run — the same argument `backend/test-support/drive.ts` makes
 * for the same yield, and the reason a progress reading can paint at all.
 */
function breathe(): Promise<void> {
  // harness:allow-wallclock a yield between stepped bursts, so the page can paint; no timestamp is read and no simulation time passes
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * What the page shows while a run is being built and pre-rolled, when there is no
 * welcome page in front of it — a deep link, or a manifest import. It says what is
 * happening rather than leaving the screen dark; the seam is already honest behind it,
 * because the fetch shim answers 503 until a run is provisioned.
 *
 * `refusal` is the other end of the same screen. A boot that throws — a configuration
 * document its master refuses, a pre-roll script the control plane will not honour —
 * would otherwise leave the page showing a progress reading that has stopped moving,
 * which is the one thing worse than an error: a page that looks like it is still
 * working. The fault is named where the reading was.
 */
function Starting({
  preparation,
  refusal,
}: {
  preparation?: WelcomePreparation;
  refusal?: string;
}): ReactNode {
  return (
    <div className="shell">
      <header className="shell-header">
        <span className="shell-title">drogna</span>
        <span className="shell-disclaimer">synthetic throughout — holds no third-party entities</span>
      </header>
      <div className="shell-body">
        <div className="panel">
          {refusal === undefined ? (
            <p className="not-landed">
              {preparation === undefined
                ? 'provisioning the run…'
                : `${preparation.note} — ${preparation.ticksDone} of ${preparation.ticksTotal} ticks stepped`}
            </p>
          ) : (
            <p className="shell-refusal">the run could not be started: {refusal}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Boot into one start condition: build the backend from the configuration that condition
 * runs under, drive its pre-roll, then mount the shell.
 *
 * `render` is how the caller draws progress — the welcome page when the reader chose
 * there, the starting frame when nothing was asked. The shell is mounted only once the
 * pre-roll has finished, because a console that opens onto a run still being wound
 * forward would show a clock racing and figures no reader can read.
 */
async function boot(
  condition: ConfigStartConditionsCondition,
  rootSeed: number,
  render: (preparation: WelcomePreparation) => void,
): Promise<void> {
  runtime?.stop();
  const validator = validatorForRun();
  const effective = configForCondition(config, condition);

  const total = condition.legs.reduce((sum, leg) => sum + leg.ticks, 0);
  render({
    conditionId: condition.id,
    note: 'fetching the ocean this situation was built with',
    leg: 1,
    legs: condition.legs.length,
    ticksDone: 0,
    ticksTotal: total,
  });
  const artefact = await fetchArtefact(condition);

  runtime = buildBackend(
    effective,
    {
      rootSeed,
      startCondition: condition.id,
      snapshot: artefact.contents,
      snapshotUnavailable: artefact.unavailable,
      revision: __DROGNA_REVISION__,
      dirty: __DROGNA_DIRTY__,
    },
    validator,
  );
  const built = runtime;

  // Whoever the artefact speaks for is held back for the pre-roll; where there is none,
  // this is the condition unchanged and everybody runs. One script, two crews.
  const script = artefact.contents
    ? holdingBack(condition, authorsCoveredBySnapshot(condition, effective.snapshot_source))
    : condition;

  await runPreRoll(
    {
      backend: built.httpBackend,
      clock: effective.clock,
      operator: effective.operator,
      breathe,
      onProgress: (progress) =>
        render({
          conditionId: condition.id,
          note: progress.note,
          leg: progress.leg,
          legs: progress.legs,
          ticksDone: progress.ticksDone,
          ticksTotal: progress.ticksTotal,
        }),
    },
    script,
  );

  const shellClient = built.transport.connect(effective.shell.id, effective.shell.role);
  root.render(
    <StrictMode>
      <Shell
        key={built.runId}
        config={effective.shell}
        client={shellClient}
        validator={validator}
        manifest={built.manifest}
        onImportManifest={importManifest}
      />
    </StrictMode>,
  );
}

/**
 * A manifest names the condition its run began in, and a replay that ignored that would
 * reproduce a different world under the same run id — every seeded draw correct, and the
 * platform somewhere else entirely. So the import resolves the condition first and
 * refuses when this build does not offer it, which is the same class of refusal as a
 * seed-derivation rule this build does not implement.
 */
function importManifest(candidate: unknown): string | undefined {
  const verdict = validatorForRun().validate('run-manifest', candidate);
  if (!verdict.ok) return `manifest refused by its master: ${verdict.refusals[0]}`;
  const manifest = candidate as RunManifest;
  if (manifest.seed_derivation.rule !== runtime?.manifest.seed_derivation.rule) {
    return `manifest derives seeds by '${manifest.seed_derivation.rule}', this build by '${runtime?.manifest.seed_derivation.rule}'`;
  }
  const condition = conditionById(config.start_conditions, manifest.start_condition);
  if (!condition) {
    return `manifest began in start condition '${manifest.start_condition}', which this build does not offer`;
  }
  root.render(<Starting />);
  void boot(condition, manifest.root_seed, (preparation) =>
    root.render(<Starting preparation={preparation} />),
  )
    .then(() => {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${searchNaming(window.location.search, condition.id)}${window.location.hash}`,
      );
    })
    .catch((fault: unknown) => {
      root.render(<Starting refusal={fault instanceof Error ? fault.message : String(fault)} />);
    });
  return undefined;
}

/** Boot into a condition and write it into the address, so the visit is linkable. */
function start(condition: ConfigStartConditionsCondition, render: (p: WelcomePreparation) => void): void {
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${searchNaming(window.location.search, condition.id)}${window.location.hash}`,
  );
  void boot(condition, condition.root_seed, render).catch((fault: unknown) => {
    root.render(<Starting refusal={fault instanceof Error ? fault.message : String(fault)} />);
  });
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

/**
 * Which screen the visit opens on.
 *
 * A `?start=` in the address is an explicit choice and is honoured without asking again.
 * So is a `#/view/...`: views have been addressable since feature 101 precisely so a
 * pull request or a blog entry can point a reader at the thing being discussed (D16), and
 * a welcome page in front of such a link would put the work of finding it back on the
 * reader — exactly what the link was supposed to save. Everything else — a bare visit to
 * the front door — is a reader who has not chosen, and is asked.
 */
// An empty `?start=` names nothing and is treated as an absent choice rather than as a
// request for a condition called '' — which would have drawn a refusal quoting nothing.
const requestedId = new URLSearchParams(window.location.search).get(START_PARAMETER) || undefined;
const requested = conditionFromSearch(config.start_conditions, window.location.search);
const fallback = defaultCondition(config.start_conditions);

if (requested !== undefined || (requestedId === undefined && viewFromHash(window.location.hash) !== undefined)) {
  const condition = requested ?? fallback;
  flushSync(() => root.render(<Starting />));
  whenPainted(() =>
    start(condition, (preparation) => root.render(<Starting preparation={preparation} />)),
  );
} else {
  const drawWelcome = (preparing?: WelcomePreparation) =>
    root.render(
      <Welcome
        conditions={config.start_conditions}
        initial={fallback}
        unknownRequest={requestedId}
        preparing={preparing}
        onChoose={(condition) => {
          // Painted before the build begins, so the card the reader pressed is already
          // showing its progress when the first unbroken stretch of work starts.
          drawWelcome({
            conditionId: condition.id,
            note: condition.legs[0].note,
            leg: 1,
            legs: condition.legs.length,
            ticksDone: 0,
            ticksTotal: condition.legs.reduce((total, leg) => total + leg.ticks, 0),
          });
          whenPainted(() => start(condition, (preparation) => drawWelcome(preparation)));
        }}
      />,
    );
  flushSync(() => drawWelcome());
}
