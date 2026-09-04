/**
 * Reconstructing the evaluable world from a published ground-truth manifest — the
 * sufficiency the manifest master claims, used: a consumer holding the document can
 * evaluate the analytic form (and tau, ADR-0002) at any point without the field
 * bytes and without the generator running. The planner is exactly such a consumer:
 * it never reads the generator's live state, only what publication released.
 */
import type { Manifest } from '../../generated/types.js';
import { ANALYTIC_FORM_VERSION } from '../env-generator/analytic.js';
import type { TimescaleParameters, WorldParameters } from '../env-generator/analytic.js';

/**
 * **The form version is checked, because refusing is what it is for.**
 * `manifest.schema.json` says of `analytic_form_version`: "a reader that understands this number
 * can reconstruct the field; a reader that does not must refuse rather than guess". This is the
 * reader. It was not checking — the cast below is total, so a manifest from another form arrived
 * here as a `WorldParameters` missing whatever that form did not have, and the arithmetic
 * downstream returned `NaN` for every cell rather than saying why.
 *
 * That was harmless while there was one form and became reachable the moment there were two
 * (#113, ADR-0044): a form 1 manifest has no `displacement_m_per_c`, and
 * `depth_m + undefined * anomaly` is `NaN` at every point in the domain. A planner drawing that
 * would show an empty field and no reason for it, which is the fault Constitution VII names.
 *
 * Newer is refused as firmly as older. A form this build has never seen may differ anywhere, and
 * a reader that evaluates it anyway is guessing — which is the word the master uses.
 */
export function refusalForForm(manifest: Manifest): string | undefined {
  const form = manifest.generator.analytic_form_version;
  if (form === ANALYTIC_FORM_VERSION) return undefined;
  return (
    `the manifest declares analytic form ${form} and this build evaluates form ${ANALYTIC_FORM_VERSION}; ` +
    'the parameters of another form cannot be evaluated by this one, so the world is refused rather than reconstructed from what happens to be present'
  );
}

export function worldFromManifest(manifest: Manifest): WorldParameters {
  const refusal = refusalForForm(manifest);
  if (refusal) throw new Error(refusal);
  const byId = Object.fromEntries(manifest.features.map((feature) => [feature.id, feature.parameters]));
  return {
    background: manifest.background.parameters,
    eddy: byId.eddy,
    front: byId.front,
    thermocline: byId.thermocline,
    moving: byId.moving,
  } as WorldParameters;
}

export function timescaleFromManifest(manifest: Manifest): TimescaleParameters {
  const seconds = Object.fromEntries(
    manifest.features.map((feature) => [feature.id, feature.timescale_seconds]),
  ) as { eddy: number; front: number; thermocline: number; moving: number };
  return { background_seconds: manifest.timescale.background_seconds, feature_seconds: seconds };
}
