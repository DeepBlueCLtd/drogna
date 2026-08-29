// @vitest-environment jsdom
/**
 * The shell's address writeback (SRD-v2 FR-15, feature 111 FR-003).
 *
 * The regression this file exists for: `onDidActivePanelChange` rewrote the address
 * to `hashForView(panel.id)` whenever the hash did not already *equal* a bare view
 * address. A deep link naming a step below the panel — `#/view/background/mqtt/3` —
 * was therefore erased by the first activation, including the one dockview fires
 * while restoring its layout. It looked like a working deep link that quietly forgot
 * where it pointed, and only on a second visit. This test was watched reporting that
 * erasure before the writeback was fixed.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import runConfigDocument from '../../config/run.json';
import type { ConfigRun } from '../generated/types.js';
import { createSeamValidator } from '../seam/validate.js';
import { buildBackend } from '../backend/runtime/runtime.js';
import { createSeamFetch } from '../seam/http.js';
import { Shell } from './Shell.js';

// jsdom implements no layout, so dockview's resize observation has nothing to watch.
// The stub is the environment, not the subject: nothing here asserts on geometry.
class NoLayoutResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoLayoutResizeObserver as unknown as typeof ResizeObserver;

const validator = createSeamValidator();

function lockstepRuntime() {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  const runtime = buildBackend(config, { rootSeed: 11, revision: 'test', dirty: false }, validator);
  return { config, runtime };
}

async function shellAt(hash: string) {
  const { config, runtime } = lockstepRuntime();
  // The panels that fetch on mount are not the subject here; they reach the genuine
  // in-page backend rather than the network, exactly as the bootstrap wires them.
  const realFetch = globalThis.fetch;
  globalThis.fetch = createSeamFetch(config.boundary.api_prefix, runtime.httpBackend, realFetch);
  window.location.hash = hash;
  await act(async () => {
    render(
      <Shell
        config={config.shell}
        client={runtime.transport.connect('shell-test', config.shell.role)}
        validator={validator}
        manifest={runtime.manifest}
        onImportManifest={() => undefined}
      />,
    );
    await Promise.resolve();
  });
  return () => {
    globalThis.fetch = realFetch;
    runtime.stop();
  };
}

afterEach(cleanup);

describe('the address survives an activation (FR-003)', () => {
  it('keeps a sub-path when the panel it names becomes active', async () => {
    const done = await shellAt('#/view/background/why-a-standard/3');
    try {
      expect(window.location.hash).toBe('#/view/background/why-a-standard/3');
    } finally {
      done();
    }
  });

  it('still writes a bare view address when the address names another panel', async () => {
    const done = await shellAt('#/view/messages');
    try {
      expect(window.location.hash).toBe('#/view/messages');
    } finally {
      done();
    }
  });

  it('opens the course at the step a deep link names', async () => {
    const done = await shellAt('#/view/background/why-a-standard/3');
    try {
      const stage = document.querySelector('.bg-stage');
      expect(stage?.getAttribute('data-explainer')).toBe('why-a-standard');
      expect(stage?.getAttribute('data-step')).toBe('3');
    } finally {
      done();
    }
  });

  it('falls back to the first step when the address names a step that no longer exists', async () => {
    // The content was edited after the link was shared. The anchor is a convenience,
    // never state (SRD FR-15): it opens the explainer rather than erroring or blanking.
    const done = await shellAt('#/view/background/why-a-standard/99');
    try {
      const stage = document.querySelector('.bg-stage');
      expect(stage?.getAttribute('data-explainer')).toBe('why-a-standard');
      expect(stage?.getAttribute('data-step')).toBe('1');
      expect(window.location.hash).toBe('#/view/background/why-a-standard/1');
    } finally {
      done();
    }
  });

  it('falls back to the first explainer when the address names one that does not exist', async () => {
    const done = await shellAt('#/view/background/no-such-explainer/2');
    try {
      const stage = document.querySelector('.bg-stage');
      expect(stage?.getAttribute('data-explainer')).toBe('why-a-standard');
      expect(stage?.getAttribute('data-step')).toBe('1');
    } finally {
      done();
    }
  });
});
