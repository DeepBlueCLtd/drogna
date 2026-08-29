// @vitest-environment jsdom
/**
 * The Map's ownship track (SRD-v2 FR-60), against a genuine backend.
 *
 * In its own file rather than beside the other map tests: it runs the world forward a
 * long way to get reports into the store, and the seam read it then issues resolves
 * after the assertions of whichever test came next — which is exactly how it broke two
 * of its neighbours when it lived there. Isolation here is a fix, not a convenience.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IDockviewPanelProps } from 'dockview-react';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { buildBackend, type BackendRuntime } from '../../backend/runtime/runtime.js';
import { createSeamFetch } from '../../seam/http.js';
import type { PanelParams } from '../../shell/Shell.js';
import { MapPanel } from './MapPanel.js';

const validator = createSeamValidator();
const realFetch = globalThis.fetch;

function lockstepConfig(): ConfigRun {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  return config;
}

/** A panel that addresses no position inside itself never reads this (ADR-0032). */
const noAddress: PanelParams['address'] = {
  current: () => undefined,
  write: () => {},
  onChange: () => () => {},
};

function panelProps(config: ConfigRun, runtime: BackendRuntime) {
  const params: PanelParams = {
    config: config.shell,
    client: runtime.transport.connect('shell-test', config.shell.role),
    validator,
    manifest: runtime.manifest,
    address: noAddress,
  };
  return { params } as unknown as IDockviewPanelProps<PanelParams>;
}

describe('the Map’s ownship track (feature 113)', () => {
  let config: ConfigRun;
  let runtime: BackendRuntime;

  beforeEach(() => {
    config = lockstepConfig();
    runtime = buildBackend(config, { rootSeed: 23, revision: 'test', dirty: false }, validator);
    globalThis.fetch = createSeamFetch(config.boundary.api_prefix, runtime.httpBackend, realFetch);
  });

  afterEach(() => {
    runtime.stop();
    cleanup();
    globalThis.fetch = realFetch;
  });

  it('says what it has and has not asked for, rather than drawing a stub', async () => {
    render(<MapPanel {...panelProps(config, runtime)} />);
    // On first paint the query has not answered, and the panel says exactly that.
    // "Asked and answered empty" and "not asked yet" are different facts, and the
    // panel does not collapse them into an empty canvas that looks the same either
    // way (FR-60). Not a stub, not a straight line between two points, and not the
    // configured loiter drawn from a document nobody published.
    expect(screen.getByTestId('ownship-status').textContent).toContain('not asked for yet');

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // The platform reports as the runtime is built, so by the time the seam answers
    // there is genuinely one position — and the panel says how many, never "some".
    expect(screen.getByTestId('ownship-status').textContent).toMatch(
      /ownship track: 1 reported position\(s\)/,
    );
  });

  it('draws what the query answered, in phenomenon-time order', async () => {
    act(() => {
      for (let i = 0; i < 150; i++) runtime.clock.tickOnce();
    });
    const reported = runtime.observationStore.byDatastream(config.platform.thing.thing_id, 'ownship-course');
    expect(reported.length).toBeGreaterThan(1);

    render(<MapPanel {...panelProps(config, runtime)} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    const status = screen.getByTestId('ownship-status').textContent ?? '';
    // The count on screen is the count the seam served — not a number the panel held.
    expect(status).toMatch(/ownship track: \d+ reported position\(s\), drawn point to point/);
    expect(status).toContain(`${reported.length} reported position(s)`);
  });
});
