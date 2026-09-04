/**
 * The form-version refusal, watched failing.
 *
 * ADR-0044 credits `analytic_form_version` with stopping a reader of one form evaluating another's
 * manifest, and until this test that credit was unearned in two ways: nothing checked the number,
 * and nothing checked the check. Both halves are here — a form 1 manifest is refused with the two
 * versions named, and the shipped manifest is accepted, so a guard that refused everything would
 * fail too.
 */
import { describe, expect, it } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun, Manifest } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { buildBackend } from '../runtime/runtime.js';
import { ANALYTIC_FORM_VERSION } from '../env-generator/analytic.js';
import { refusalForForm, worldFromManifest } from './manifest-world.js';

function shippedManifest(): Manifest {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  const runtime = buildBackend(
    config,
    { rootSeed: 1234, startCondition: 'loitering', revision: 'test', dirty: false },
    createSeamValidator(),
  );
  try {
    const nowcast = runtime.store.currentNowcast();
    if (!nowcast) throw new Error('no nowcast to take a manifest from');
    return nowcast.descriptor.manifest;
  } finally {
    runtime.stop();
  }
}

describe('reconstructing a world from a manifest', () => {
  it('evaluates a manifest of the form this build implements', () => {
    const manifest = shippedManifest();
    expect(manifest.generator.analytic_form_version).toBe(ANALYTIC_FORM_VERSION);
    expect(refusalForForm(manifest)).toBeUndefined();
    // Not merely "does not throw": the world has to carry the term the form is about, or the
    // acceptance above would pass on a manifest this build cannot actually evaluate.
    expect(worldFromManifest(manifest).thermocline.displacement_m_per_c).toBeTypeOf('number');
  });

  it('refuses a manifest of another form rather than reconstructing what happens to be present', () => {
    const manifest = shippedManifest();
    for (const form of [ANALYTIC_FORM_VERSION - 1, ANALYTIC_FORM_VERSION + 1]) {
      const foreign: Manifest = { ...manifest, generator: { ...manifest.generator, analytic_form_version: form } };
      expect(refusalForForm(foreign)).toMatch(new RegExp(`declares analytic form ${form}`));
      expect(() => worldFromManifest(foreign)).toThrow(/analytic form/);
    }
  });
});
