/**
 * OGC API-EDR over the coverage store (SRD-v2 FR-26 to FR-29): the honest subset.
 *
 * Collections are enumerated from the store by convention — the archive, the
 * current now-cast, and (from feature 105) each forecast instance — so a new
 * holding becomes servable without editing query configuration (FR-29). Implemented
 * query types: position and trajectory, nearest-neighbour, CoverageJSON out.
 * Everything else in the standard is refused with the thing refused named (FR-27):
 * the option, the shape, the property, the extent.
 */
import type { SeamHttpResponse, SeamRequest } from '../../seam/http.js';
import type { ConfigQuery, CoverageHolding, EdrCollectionsCollection } from '../../generated/types.js';
import type { CoverageStore } from '../coverage-store/store.js';
import { sampleGrid, sampleHolding, timeAxisPosixOrigin, type SamplePoint } from './field-sampler.js';
import { parsePoint, parsePolygon, parseTrajectory } from './wkt.js';
import { parseEpochMicros } from '../lib/sim-time.js';

const IMPLEMENTED_QUERY_TYPES = ['position', 'trajectory', 'area'] as const;
const KNOWN_UNIMPLEMENTED = ['radius', 'cube', 'corridor', 'items', 'locations', 'instances'];

function json(status: number, body: unknown): SeamHttpResponse {
  return { status, body: JSON.stringify(body) };
}

function refusal(status: number, text: string): SeamHttpResponse {
  return json(status, { refused: text });
}

export class EdrComponent {
  constructor(
    private readonly config: ConfigQuery,
    private readonly store: CoverageStore,
  ) {}

  /** era-or-instance collection ids resolved to holdings, by convention (FR-29). */
  private collectionsById(): Map<string, { descriptor: CoverageHolding; bytes: Uint8Array }> {
    const result = new Map<string, { descriptor: CoverageHolding; bytes: Uint8Array }>();
    for (const descriptor of this.store.holdings()) {
      const entry = this.store.holding(descriptor.holding_id);
      if (!entry) continue;
      const id = descriptor.era === 'instance' ? descriptor.holding_id : descriptor.era;
      result.set(id, entry);
    }
    return result;
  }

  handle(request: SeamRequest): SeamHttpResponse {
    const prefix = this.config.http.edr_prefix;
    const pathOnly = request.path.split('?')[0];
    const rest = pathOnly === prefix ? '' : pathOnly.slice(prefix.length + 1);
    const segments = rest === '' ? [] : rest.split('/');
    const query = new URLSearchParams(request.path.split('?')[1] ?? '');

    if (segments.length === 0) return this.landing();
    if (segments[0] === 'conformance') return this.conformance();
    if (segments[0] === 'collections') {
      if (segments.length === 1) return this.collectionsList();
      const collection = this.collectionsById().get(segments[1]);
      if (!collection) {
        return refusal(404, `no collection named '${segments[1]}'; served: ${[...this.collectionsById().keys()].sort().join(', ')}`);
      }
      if (segments.length === 2) return json(200, this.collectionDocument(segments[1], collection.descriptor));
      const queryType = segments[2];
      if (queryType === 'position') return this.position(collection, query);
      if (queryType === 'trajectory') return this.trajectory(collection, query);
      if (queryType === 'area') return this.area(collection, query);
      if (KNOWN_UNIMPLEMENTED.includes(queryType)) {
        return refusal(501, `query type '${queryType}' is not implemented; implemented: ${IMPLEMENTED_QUERY_TYPES.join(', ')}`);
      }
      return refusal(404, `'${queryType}' is not an EDR query type this subset knows`);
    }
    return refusal(404, `no EDR resource at '${pathOnly}'`);
  }

  private landing(): SeamHttpResponse {
    const prefix = this.config.http.edr_prefix;
    return json(200, {
      title: 'drogna EDR',
      description:
        'OGC API-EDR over the synthetic coverage holdings. A stated subset: see the subset statement on the control plane. Deliberately fake numerics throughout.',
      links: [
        { href: prefix, rel: 'self', type: 'application/json' },
        { href: `${prefix}/conformance`, rel: 'conformance', type: 'application/json' },
        { href: `${prefix}/collections`, rel: 'data', type: 'application/json' },
      ],
    });
  }

  private conformance(): SeamHttpResponse {
    return json(200, {
      conformsTo: [
        // harness:allow-literal-path OGC conformance-class identifiers, never fetched
        'http://www.opengis.net/spec/ogcapi-edr-1/1.1/conf/core',
        // harness:allow-literal-path OGC conformance-class identifiers, never fetched
        'http://www.opengis.net/spec/ogcapi-edr-1/1.1/conf/position',
        // harness:allow-literal-path OGC conformance-class identifiers, never fetched
        'http://www.opengis.net/spec/ogcapi-edr-1/1.1/conf/trajectory',
        // harness:allow-literal-path OGC conformance-class identifiers, never fetched
        'http://www.opengis.net/spec/ogcapi-edr-1/1.1/conf/area',
        // harness:allow-literal-path OGC conformance-class identifiers, never fetched
        'http://www.opengis.net/spec/ogcapi-edr-1/1.1/conf/covjson',
      ],
    });
  }

  private collectionsList(): SeamHttpResponse {
    const prefix = this.config.http.edr_prefix;
    const collections = [...this.collectionsById().entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, entry]) => this.collectionDocument(id, entry.descriptor));
    return json(200, {
      links: [{ href: `${prefix}/collections`, rel: 'self', type: 'application/json' }],
      collections,
    });
  }

  private collectionDocument(id: string, descriptor: CoverageHolding): EdrCollectionsCollection {
    const prefix = this.config.http.edr_prefix;
    const manifest = descriptor.manifest;
    const { longitude, latitude, depth, time } = manifest.grid;
    const originPosix = timeAxisPosixOrigin(manifest);
    const beginIso = isoAt(originPosix + time.start_offset_seconds);
    const endIso = isoAt(originPosix + time.start_offset_seconds + (time.count - 1) * time.step_seconds);
    return {
      id,
      title: `${descriptor.era} holding ${descriptor.holding_id}`,
      description:
        descriptor.era === 'archive'
          ? 'The multi-decade monthly historic archive, authored at provisioning through the publication seam.'
          : descriptor.era === 'nowcast'
            ? 'The rolling now-cast, replaced on its configured cadence.'
            : 'A forecast run instance.',
      links: [{ href: `${prefix}/collections/${id}`, rel: 'self', type: 'application/json' }],
      extent: {
        spatial: {
          bbox: [[longitude.minimum, latitude.minimum, longitude.maximum, latitude.maximum]],
          crs: 'EPSG:4326',
        },
        vertical: {
          interval: [[depth.minimum, depth.maximum]],
          vrs: 'depth in metres, positive downwards',
        },
        temporal: { interval: [[beginIso, endIso]], trs: 'simulation time, ISO-8601 UTC' },
      },
      data_queries: {
        position: {
          link: { href: `${prefix}/collections/${id}/position`, rel: 'data', title: 'position query' },
        },
        trajectory: {
          link: { href: `${prefix}/collections/${id}/trajectory`, rel: 'data', title: 'trajectory query' },
        },
        area: {
          link: { href: `${prefix}/collections/${id}/area`, rel: 'data', title: 'area query' },
        },
      },
      parameter_names: this.parameters(manifest),
      crs: ['EPSG:4326'],
    };
  }

  private parameters(manifest: CoverageHolding['manifest']) {
    return Object.fromEntries(
      manifest.variables.map((variable) => [
        variable.name,
        {
          type: 'Parameter' as const,
          description: { en: variable.long_name },
          unit: { symbol: variable.units },
          observedProperty: {
            id: variable.standard_name ?? variable.name,
            label: { en: variable.long_name },
          },
        },
      ]),
    );
  }

  private requestedParameters(
    manifest: CoverageHolding['manifest'],
    query: URLSearchParams,
  ): { ok: true; names: string[] } | { ok: false; response: SeamHttpResponse } {
    const known = manifest.variables.map((variable) => variable.name);
    const raw = query.get('parameter-name');
    if (raw === null) return { ok: true, names: known };
    const requested = raw.split(',').map((name) => name.trim());
    const unknown = requested.filter((name) => !known.includes(name));
    if (unknown.length > 0) {
      return {
        ok: false,
        response: refusal(400, `parameter '${unknown[0]}' is not served; served parameters: ${known.join(', ')}`),
      };
    }
    return { ok: true, names: requested };
  }

  private unsupportedOption(query: URLSearchParams, supported: string[]): SeamHttpResponse | undefined {
    for (const key of query.keys()) {
      if (!supported.includes(key)) {
        return refusal(400, `query option '${key}' is not implemented; implemented options: ${supported.join(', ')}`);
      }
    }
    return undefined;
  }

  private position(
    collection: { descriptor: CoverageHolding; bytes: Uint8Array },
    query: URLSearchParams,
  ): SeamHttpResponse {
    const unsupported = this.unsupportedOption(query, ['coords', 'z', 'datetime', 'parameter-name']);
    if (unsupported) return unsupported;
    const coords = query.get('coords');
    if (!coords) return refusal(400, 'a position query needs coords=POINT(lon lat)');
    const point = parsePoint(coords);
    if (!point.ok) return refusal(400, point.refusal);
    const depth = Number(query.get('z') ?? Number.NaN);
    if (!Number.isFinite(depth)) return refusal(400, 'a position query needs z=<depth metres, positive down>');
    const datetime = query.get('datetime');
    const manifest = collection.descriptor.manifest;
    const posixSeconds = datetime
      ? Number(parseEpochMicros(ensureMicros(datetime)) / 1_000_000n)
      : timeAxisPosixOrigin(manifest) + manifest.grid.time.start_offset_seconds;
    const parameters = this.requestedParameters(manifest, query);
    if (!parameters.ok) return parameters.response;

    const sampled = sampleHolding(collection, {
      longitude: point.value.longitude,
      latitude: point.value.latitude,
      depthM: depth,
      posixSeconds,
    });
    if (!sampled.ok) return refusal(400, sampled.refusal);
    const variableOrder = manifest.variables.map((variable) => variable.name);
    return json(200, {
      type: 'Coverage',
      domain: {
        type: 'Domain',
        domainType: 'Point',
        axes: {
          x: { values: [sampled.value.snapped.longitude] },
          y: { values: [sampled.value.snapped.latitude] },
          z: { values: [sampled.value.snapped.depthM] },
          t: { values: [sampled.value.snapped.simTime] },
        },
        referencing: REFERENCING,
      },
      parameters: pick(this.parameters(manifest), parameters.names),
      ranges: Object.fromEntries(
        parameters.names.map((name) => [
          name,
          {
            type: 'NdArray',
            dataType: 'float',
            axisNames: ['t', 'z', 'y', 'x'],
            shape: [1, 1, 1, 1],
            values: [sampled.value.values[variableOrder.indexOf(name)]],
          },
        ]),
      ),
    });
  }

  private area(
    collection: { descriptor: CoverageHolding; bytes: Uint8Array },
    query: URLSearchParams,
  ): SeamHttpResponse {
    const unsupported = this.unsupportedOption(query, ['coords', 'z', 'datetime', 'parameter-name']);
    if (unsupported) return unsupported;
    const coords = query.get('coords');
    if (!coords) return refusal(400, 'an area query needs coords=POLYGON((lon lat, ...))');
    const box = parsePolygon(coords);
    if (!box.ok) return refusal(400, box.refusal);
    const depth = Number(query.get('z') ?? Number.NaN);
    if (!Number.isFinite(depth)) return refusal(400, 'an area query needs z=<depth metres, positive down>');
    const datetime = query.get('datetime');
    const manifest = collection.descriptor.manifest;
    const posixSeconds = datetime
      ? Number(parseEpochMicros(ensureMicros(datetime)) / 1_000_000n)
      : timeAxisPosixOrigin(manifest) + manifest.grid.time.start_offset_seconds;
    const parameters = this.requestedParameters(manifest, query);
    if (!parameters.ok) return parameters.response;

    const sampled = sampleGrid(collection, box.value, depth, posixSeconds);
    if (!sampled.ok) return refusal(400, sampled.refusal);
    const variableOrder = manifest.variables.map((variable) => variable.name);
    const { lons, lats, snapped, values } = sampled.value;
    return json(200, {
      type: 'Coverage',
      domain: {
        type: 'Domain',
        domainType: 'Grid',
        axes: {
          x: { values: lons },
          y: { values: lats },
          z: { values: [snapped.depthM] },
          t: { values: [snapped.simTime] },
        },
        referencing: REFERENCING,
      },
      parameters: pick(this.parameters(manifest), parameters.names),
      ranges: Object.fromEntries(
        parameters.names.map((name) => [
          name,
          {
            type: 'NdArray',
            dataType: 'float',
            axisNames: ['t', 'z', 'y', 'x'],
            shape: [1, 1, lats.length, lons.length],
            values: values[variableOrder.indexOf(name)],
          },
        ]),
      ),
    });
  }

  private trajectory(
    collection: { descriptor: CoverageHolding; bytes: Uint8Array },
    query: URLSearchParams,
  ): SeamHttpResponse {
    const unsupported = this.unsupportedOption(query, ['coords', 'parameter-name']);
    if (unsupported) return unsupported;
    const coords = query.get('coords');
    if (!coords) return refusal(400, 'a trajectory query needs coords=LINESTRINGZM(lon lat depth posix_seconds, ...)');
    const parsed = parseTrajectory(coords);
    if (!parsed.ok) return refusal(400, parsed.refusal);
    const manifest = collection.descriptor.manifest;
    const parameters = this.requestedParameters(manifest, query);
    if (!parameters.ok) return parameters.response;

    const variableOrder = manifest.variables.map((variable) => variable.name);
    const tuples: (string | number)[][] = [];
    const rangeValues = new Map<string, number[]>(parameters.names.map((name) => [name, []]));
    for (const vertex of parsed.value) {
      const point: SamplePoint = {
        longitude: vertex.longitude,
        latitude: vertex.latitude,
        depthM: vertex.depthM,
        posixSeconds: vertex.posixSeconds,
      };
      const sampled = sampleHolding(collection, point);
      if (!sampled.ok) return refusal(400, `at vertex (${vertex.longitude} ${vertex.latitude}): ${sampled.refusal}`);
      tuples.push([
        sampled.value.snapped.simTime,
        sampled.value.snapped.longitude,
        sampled.value.snapped.latitude,
        sampled.value.snapped.depthM,
      ]);
      for (const name of parameters.names) {
        rangeValues.get(name)?.push(sampled.value.values[variableOrder.indexOf(name)]);
      }
    }
    return json(200, {
      type: 'Coverage',
      domain: {
        type: 'Domain',
        domainType: 'Trajectory',
        axes: { composite: { dataType: 'tuple', coordinates: ['t', 'x', 'y', 'z'], values: tuples } },
        referencing: REFERENCING,
      },
      parameters: pick(this.parameters(manifest), parameters.names),
      ranges: Object.fromEntries(
        parameters.names.map((name) => [
          name,
          {
            type: 'NdArray',
            dataType: 'float',
            axisNames: ['composite'],
            shape: [tuples.length],
            values: rangeValues.get(name) ?? [],
          },
        ]),
      ),
    });
  }
}

const REFERENCING = [
  {
    coordinates: ['x', 'y'],
    system: { type: 'GeographicCRS', id: 'EPSG:4326' },
  },
  {
    coordinates: ['z'],
    system: { type: 'VerticalCRS', description: 'depth in metres, positive downwards' },
  },
  {
    coordinates: ['t'],
    system: { type: 'TemporalRS', calendar: 'Gregorian', description: 'simulation time' },
  },
];

function pick<T>(record: Record<string, T>, keys: string[]): Record<string, T> {
  return Object.fromEntries(keys.map((key) => [key, record[key]]));
}

function ensureMicros(iso: string): string {
  return /\.\d{1,6}Z$/.test(iso) ? iso : iso.replace(/Z$/, '.000000Z');
}

function isoAt(posixSeconds: number): string {
  const millis = Math.round(posixSeconds * 1000);
  return `${new Date(millis).toISOString().slice(0, 19)}.000000Z`;
}
