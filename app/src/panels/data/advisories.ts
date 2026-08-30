/**
 * The shore-updates canvas's pure half (feature 120, FR-15, FR-16).
 *
 * Advisories arrive as OGC API-Features items: the geometry is the advised region and
 * the properties are the advisory document minus that region. This module turns them
 * into regions with a standing, and the standing is the whole subject — advice
 * accumulates and expires, and drawing them all alike would throw away the only motion
 * this branch has.
 *
 * **A lapsed advisory is drawn spent, not removed.** What shore has said is a record,
 * and a canvas that silently dropped an advisory when its validity ran out would answer
 * "has anything been advised for this region?" with "no" when the truth is "yes, and it
 * has expired". Those are different answers.
 *
 * Whether an advisory is current is a question about *simulation* time, answered from
 * the clock component's own instant. No host clock takes part; `now` is passed in.
 */
import type { FeaturesResponseFeatureCollection } from '../../generated/types.js';

export type Standing = 'pending' | 'current' | 'lapsed';

export interface AdvisoryRegion {
  readonly id: string;
  readonly kind: string;
  readonly standing: Standing;
  /** west, south, east, north — degrees, WGS 84, as the advisory's own region states. */
  readonly bbox: readonly [number, number, number, number];
  /** The closed ring the canvas draws, anticlockwise from the south-west corner. */
  readonly ring: readonly (readonly [number, number])[];
  readonly validFrom: string;
  readonly validTo: string;
  /** The document, for the reader who selects it — every field, nothing summarised. */
  readonly properties: Record<string, unknown>;
}

/** The kinds the advisory master declares, which is what the canvas colours by. */
export const KIND_LABEL: Record<string, string> = {
  'sound-speed-outlook': 'sound-speed outlook',
  'sampling-window': 'sampling window',
  'caution-region': 'caution region',
};

function standingOf(from: string, to: string, now: string | undefined): Standing {
  // With no clock instant yet, nothing is claimed: an advisory drawn "current" because
  // the shell had not heard the time would be the display inventing a fact.
  if (now === undefined || now === '') return 'pending';
  if (now < from) return 'pending';
  if (now > to) return 'lapsed';
  return 'current';
}

/**
 * Regions from a Features answer.
 *
 * A feature whose geometry or validity cannot be read is dropped and counted rather than
 * drawn at a guessed position — `unreadable` is returned so the panel can say so instead
 * of quietly showing fewer regions than the store holds (FR-06).
 */
export function advisoryRegions(
  response: FeaturesResponseFeatureCollection,
  now: string | undefined,
): { readonly regions: readonly AdvisoryRegion[]; readonly unreadable: number } {
  const regions: AdvisoryRegion[] = [];
  let unreadable = 0;
  for (const feature of response.features) {
    const properties = (feature.properties ?? {}) as Record<string, unknown>;
    const validity = properties.valid_time as { start_sim_time?: string; end_sim_time?: string } | undefined;
    const coordinates = (feature.geometry as { coordinates?: number[][][] } | undefined)?.coordinates?.[0];
    if (!validity?.start_sim_time || !validity.end_sim_time || !coordinates || coordinates.length < 4) {
      unreadable += 1;
      continue;
    }
    const longitudes = coordinates.map(([longitude]) => longitude);
    const latitudes = coordinates.map(([, latitude]) => latitude);
    regions.push({
      id: String(feature.id ?? properties.advisory_id ?? `advisory-${regions.length}`),
      kind: typeof properties.kind === 'string' ? properties.kind : 'unstated',
      standing: standingOf(validity.start_sim_time, validity.end_sim_time, now),
      bbox: [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)],
      ring: coordinates.map(([longitude, latitude]) => [longitude, latitude] as const),
      validFrom: validity.start_sim_time,
      validTo: validity.end_sim_time,
      properties,
    });
  }
  return { regions, unreadable };
}

/**
 * The colour a kind is drawn in, and how a lapsed one is drawn spent.
 *
 * Returned as RGBA rather than set in the stylesheet because deck.gl paints into a
 * canvas, where a CSS class reaches nothing. The alpha is what carries standing: the
 * hue stays the kind's, so a reader following one kind through its life follows one
 * colour.
 */
export function fillFor(colour: readonly [number, number, number], standing: Standing): [number, number, number, number] {
  const alpha = standing === 'current' ? 150 : standing === 'pending' ? 70 : 35;
  return [colour[0], colour[1], colour[2], alpha];
}

export function outlineFor(colour: readonly [number, number, number], standing: Standing): [number, number, number, number] {
  return [colour[0], colour[1], colour[2], standing === 'lapsed' ? 90 : 230];
}

/** How a region's standing is said in words, for the list beside the canvas. */
export function standingLabel(standing: Standing): string {
  if (standing === 'current') return 'in force';
  if (standing === 'pending') return 'not yet in force';
  return 'expired';
}
