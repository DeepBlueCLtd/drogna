/**
 * Everything the Data tab reads, in one place (FR-05).
 *
 * Every function here is a relative-path GET answered by the interception layer, and
 * every response is validated against the master it declares before a caller sees it.
 * Nothing in this file renders; nothing above it fetches.
 *
 * The return shape is a value or a refusal, never a throw and never undefined standing
 * in for both. FR-06 requires a branch to say *why* it is empty, and a function that
 * answers `undefined` for "the store holds none" and for "the store would not answer"
 * has thrown that distinction away before the panel can draw it.
 */
import type { SeamValidator } from '../../seam/validate.js';
import type { CoverageHolding, FeaturesResponseFeatureCollection, HoldingsInventory } from '../../generated/types.js';

export type Read<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly refusal: string };

function refused(what: string, detail: string): Read<never> {
  return { ok: false, refusal: `${what}: ${detail}` };
}

/**
 * One GET, validated. `master` is the name the response is held to — the same name the
 * backend's own tests validate it under, so the two halves of the seam are checked
 * against one document rather than against each other.
 */
async function read<T>(
  path: string,
  master: string,
  what: string,
  validator: SeamValidator,
): Promise<Read<T>> {
  let response: Response;
  try {
    response = await fetch(path);
  } catch (error) {
    return refused(what, `the request did not complete (${String(error)})`);
  }
  if (!response.ok) {
    // The query components refuse by naming the thing refused (FR-27). Where they have,
    // that sentence is the most useful thing this tab can show, so it is carried through
    // rather than replaced with a status code.
    let named: string | undefined;
    try {
      const body = (await response.clone().json()) as { refused?: unknown };
      if (typeof body.refused === 'string') named = body.refused;
    } catch {
      named = undefined;
    }
    return refused(what, named ?? `answered ${response.status}`);
  }
  const body = (await response.json()) as unknown;
  const verdict = validator.validate(master, body);
  if (!verdict.ok) return refused(what, `refused by its master (${master}): ${verdict.refusals[0]}`);
  return { ok: true, value: body as T };
}

export interface Thing {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface Datastream {
  /** The served key, `<thing>/<datastream>`. */
  readonly id: string;
  readonly thingId: string;
  readonly name: string;
  readonly description: string;
  readonly unit: { readonly name: string; readonly symbol: string };
  readonly observedProperty: string;
}

export interface ObservationPoint {
  readonly id: string;
  readonly simTime: string;
  readonly result: number;
}

export async function readHoldings(
  endpoint: string,
  validator: SeamValidator,
): Promise<Read<readonly CoverageHolding[]>> {
  const answer = await read<HoldingsInventory>(endpoint, 'holdings-inventory', 'the coverage inventory', validator);
  return answer.ok ? { ok: true, value: answer.value.holdings } : answer;
}

export async function readThings(prefix: string, validator: SeamValidator): Promise<Read<readonly Thing[]>> {
  const answer = await read<{ value: { '@iot.id': string; name: string; description: string }[] }>(
    `${prefix}/Things`,
    'sensorthings-subset#things_response',
    'the platforms',
    validator,
  );
  if (!answer.ok) return answer;
  return {
    ok: true,
    value: answer.value.value.map((thing) => ({
      id: thing['@iot.id'],
      name: thing.name,
      description: thing.description,
    })),
  };
}

export async function readDatastreams(prefix: string, validator: SeamValidator): Promise<Read<readonly Datastream[]>> {
  const answer = await read<{
    value: {
      '@iot.id': string;
      name: string;
      description: string;
      unitOfMeasurement: { name: string; symbol: string };
      observedProperty: { name: string };
    }[];
  }>(`${prefix}/Datastreams`, 'sensorthings-subset#datastreams_response', 'the datastreams', validator);
  if (!answer.ok) return answer;
  return {
    ok: true,
    value: answer.value.value.map((stream) => ({
      id: stream['@iot.id'],
      thingId: stream['@iot.id'].split('/')[0],
      name: stream.name,
      description: stream.description,
      unit: { name: stream.unitOfMeasurement.name, symbol: stream.unitOfMeasurement.symbol },
      observedProperty: stream.observedProperty.name,
    })),
  };
}

/** How many observations one request asks for. The server's own default is 100. */
const PAGE = 500;
/**
 * A ceiling on paging, so a store that grows without bound cannot spin this loop
 * forever. It is a stated limit rather than a silent one: a chart that reaches it says so
 * (FR-08 draws the full history the store holds, and a truncated history is a different
 * claim).
 */
const MAX_PAGES = 40;

export interface ObservationHistory {
  readonly points: readonly ObservationPoint[];
  /** What the store says it holds for this datastream, whether or not it was all read. */
  readonly count: number;
  /** True when the ceiling above stopped the paging before the store was exhausted. */
  readonly truncated: boolean;
}

/**
 * A datastream's whole history, paged until the store is exhausted (FR-08).
 *
 * The observation store is in the browser, so "all of it" is affordable and is what the
 * chart is specified to draw. The count the server reports is carried beside the points
 * so the display can hold itself to it rather than to the length of what it happened to
 * receive.
 */
export async function readObservations(
  prefix: string,
  datastreamId: string,
  validator: SeamValidator,
): Promise<Read<ObservationHistory>> {
  const points: ObservationPoint[] = [];
  let count = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    // Not percent-encoded: the served id *is* `<thing>/<datastream>`, and the query
    // component splits on that slash to find the datastream. Encoding it hands the
    // server a single opaque id it then refuses by name — correctly, and confusingly.
    const path = `${prefix}/Datastreams('${datastreamId}')/Observations?$top=${PAGE}&$skip=${page * PAGE}`;
    const answer = await read<{
      '@iot.count': number;
      value: { '@iot.id': string; phenomenonTime: string; result: number }[];
    }>(path, 'sensorthings-subset#observations_response', `the observations of ${datastreamId}`, validator);
    if (!answer.ok) return answer;
    count = answer.value['@iot.count'];
    for (const entity of answer.value.value) {
      points.push({ id: entity['@iot.id'], simTime: entity.phenomenonTime, result: entity.result });
    }
    if (answer.value.value.length < PAGE || points.length >= count) {
      return { ok: true, value: { points, count, truncated: false } };
    }
  }
  return { ok: true, value: { points, count, truncated: true } };
}

export async function readAdvisories(
  prefix: string,
  validator: SeamValidator,
): Promise<Read<FeaturesResponseFeatureCollection>> {
  return read<FeaturesResponseFeatureCollection>(
    `${prefix}/collections/advisories/items`,
    'features-response#feature_collection',
    'the shore advisories',
    validator,
  );
}
