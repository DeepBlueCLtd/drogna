/**
 * The EDR composer's pure half (FR-41): assembling the literal request URL from
 * the choices made so far, offering only what the server's own metadata states it
 * serves. The URL shown IS the URL fetched — one function builds both — and the
 * result is classified into the three facts the display keeps distinct: a value
 * (null included), a decline naming what was refused, and absence.
 */
import type { QuerySubsets } from '../../generated/types.js';

export interface ComposerChoices {
  collection?: string;
  queryType?: string;
  /** Comma-joined parameter names; empty means every served parameter. */
  parameters: string[];
  longitude?: number;
  latitude?: number;
  depthM?: number;
  /** ISO simulation instant; omitted means the collection's first step. */
  datetime?: string;
}

/** What the composer may offer, enumerated from served metadata, never stubbed. */
export interface ComposerOffering {
  collections: string[];
  queryTypes: string[];
  parameters: string[];
}

export function offeringFrom(subsets: QuerySubsets, collectionIds: string[]): ComposerOffering {
  return {
    collections: [...collectionIds].sort(),
    queryTypes: [...subsets.edr.query_types],
    parameters: [...subsets.edr.parameters],
  };
}

/**
 * The literal request URL for the choices so far, or the reason it cannot be
 * assembled yet. Position and area only: a trajectory needs per-vertex times the
 * guided sequence does not collect, and the composer says so rather than guessing.
 */
export function composeUrl(
  edrPrefix: string,
  choices: ComposerChoices,
): { ok: true; url: string } | { ok: false; missing: string } {
  if (!choices.collection) return { ok: false, missing: 'choose a collection' };
  if (!choices.queryType) return { ok: false, missing: 'choose a query type' };
  if (choices.queryType === 'trajectory') {
    return {
      ok: false,
      missing:
        'the composer does not guide trajectory queries: a trajectory carries per-vertex depth and time, which this sequence does not collect — compose it by hand against the stated subset',
    };
  }
  if (choices.longitude === undefined || choices.latitude === undefined) {
    return { ok: false, missing: 'set a position (click the map, or type lon/lat)' };
  }
  if (choices.depthM === undefined) return { ok: false, missing: 'set a depth' };
  const query = new URLSearchParams();
  if (choices.queryType === 'position') {
    query.set('coords', `POINT(${choices.longitude} ${choices.latitude})`);
  } else if (choices.queryType === 'area') {
    // A half-degree box centred on the chosen position: the guided area query.
    const west = round3(choices.longitude - 0.25);
    const east = round3(choices.longitude + 0.25);
    const south = round3(choices.latitude - 0.25);
    const north = round3(choices.latitude + 0.25);
    query.set(
      'coords',
      `POLYGON((${west} ${south}, ${east} ${south}, ${east} ${north}, ${west} ${north}, ${west} ${south}))`,
    );
  } else {
    return { ok: false, missing: `the composer does not guide '${choices.queryType}' queries` };
  }
  query.set('z', String(choices.depthM));
  if (choices.datetime) query.set('datetime', choices.datetime);
  if (choices.parameters.length > 0) query.set('parameter-name', choices.parameters.join(','));
  return { ok: true, url: `${edrPrefix}/collections/${choices.collection}/${choices.queryType}?${query.toString()}` };
}

/** The three facts a response can be, kept distinct (FR-41). */
export type ComposerResult =
  | { fact: 'value'; body: unknown }
  | { fact: 'declined'; refusal: string }
  | { fact: 'absent'; detail: string };

export function classifyResponse(status: number, body: unknown): ComposerResult {
  if (status === 200) return { fact: 'value', body };
  const refusal =
    typeof body === 'object' && body !== null && 'refused' in body
      ? String((body as { refused: unknown }).refused)
      : undefined;
  if (status === 404) return { fact: 'absent', detail: refusal ?? `the server answered 404` };
  return { fact: 'declined', refusal: refusal ?? `the server answered ${status} with no refusal text` };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
