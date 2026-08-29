/**
 * Reconstructing the evaluable world from a published ground-truth manifest — the
 * sufficiency the manifest master claims, used: a consumer holding the document can
 * evaluate the analytic form (and tau, ADR-0002) at any point without the field
 * bytes and without the generator running. The planner is exactly such a consumer:
 * it never reads the generator's live state, only what publication released.
 */
import type { Manifest } from '../../generated/types.js';
import type { TimescaleParameters, WorldParameters } from '../env-generator/analytic.js';

export function worldFromManifest(manifest: Manifest): WorldParameters {
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
