/**
 * The coverage volume's pure half (feature 118, FR-13, FR-14).
 *
 * Three of its axes are the Map's cube — longitude, latitude and depth, one genuine EDR
 * area query per level of the holding's own depth axis — and this module adds the
 * fourth: the time steps the holding's manifest declares. Months for the archive, hours
 * for a forecast run, and in both cases read from the manifest rather than assumed.
 *
 * The whole file exists to make one rule checkable: **nothing is drawn that was not
 * fetched.** A volume that filled a gap with a neighbouring step's values would be
 * showing a reader an instant the store was never asked about, and it would look exactly
 * like a volume that had loaded. So the cache answers "not here" rather than "near
 * enough", and the panel says which steps it holds.
 *
 * Nothing here fetches, and nothing here knows about deck.gl.
 */
import type { GridCoverage } from '../map/map-data.js';

/** One depth level of one time step, as the area query answered it. */
export interface VolumeLevel {
  readonly depthM: number;
  readonly coverage: GridCoverage;
}

export interface VolumeStep {
  readonly instant: string;
  readonly levels: readonly VolumeLevel[];
}

export type StepState =
  | { readonly status: 'loaded'; readonly step: VolumeStep }
  | { readonly status: 'loading' }
  | { readonly status: 'absent' }
  | { readonly status: 'refused'; readonly refusal: string };

/**
 * What has been fetched, keyed by collection and instant.
 *
 * Keyed by collection as well as instant because a reader moving between holdings must
 * not be shown one holding's field labelled as another's — the instants of an archive
 * and of a forecast run can coincide, and the cache is the one place that could confuse
 * them.
 */
export class VolumeCache {
  private readonly steps = new Map<string, StepState>();

  private static key(collectionId: string, instant: string): string {
    return `${collectionId} ${instant}`;
  }

  get(collectionId: string, instant: string): StepState {
    return this.steps.get(VolumeCache.key(collectionId, instant)) ?? { status: 'absent' };
  }

  set(collectionId: string, instant: string, state: StepState): void {
    this.steps.set(VolumeCache.key(collectionId, instant), state);
  }

  /** The instants of one collection that are drawable now, in the order given. */
  loaded(collectionId: string, instants: readonly string[]): readonly string[] {
    return instants.filter((instant) => this.get(collectionId, instant).status === 'loaded');
  }

  /** A copy, so React sees a new object and redraws; the entries are shared. */
  clone(): VolumeCache {
    const next = new VolumeCache();
    for (const [key, value] of this.steps) next.steps.set(key, value);
    return next;
  }
}

/**
 * What the panel says about its own loading, in the reader's terms.
 *
 * "3 of 12 steps fetched" is a different claim from "12 steps", and this tab is required
 * to make the first one: a reader scrubbing a half-loaded volume needs to know that the
 * gaps are gaps rather than ocean.
 */
export function loadingSummary(loaded: number, total: number): string {
  if (total === 0) return 'no time steps declared';
  if (loaded === 0) return `nothing fetched yet of ${total} step(s)`;
  if (loaded >= total) return `all ${total} step(s) fetched`;
  return `${loaded} of ${total} step(s) fetched — the rest are fetched as they are asked for`;
}
