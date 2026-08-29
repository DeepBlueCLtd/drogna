/**
 * OGC SensorThings (Part 1, Sensing) over the observation store, read-only
 * (SRD-v2 FR-26): the honest subset. Things, Datastreams and Observations, with
 * $top and $skip; every other resource and query option is refused with its own
 * name in the refusal (FR-27, E9's grain: a subset grows one capability at a time).
 * The entity shapes are functions of the traffic — what the sensors published is
 * what this serves, and nothing else exists to serve.
 */
import type { SeamHttpResponse, SeamRequest } from '../../seam/http.js';
import type { ConfigQuery, Observation } from '../../generated/types.js';
import type { ObservationStore } from '../observation-store/store.js';

const KNOWN_UNIMPLEMENTED_RESOURCES = [
  'Sensors',
  'ObservedProperties',
  'FeaturesOfInterest',
  'Locations',
  'HistoricalLocations',
];
const SUPPORTED_OPTIONS = ['$top', '$skip'];
const KNOWN_UNIMPLEMENTED_OPTIONS = ['$filter', '$orderby', '$select', '$expand', '$count'];

function json(status: number, body: unknown): SeamHttpResponse {
  return { status, body: JSON.stringify(body) };
}

function refusal(status: number, text: string): SeamHttpResponse {
  return json(status, { refused: text });
}

export class SensorThingsComponent {
  constructor(
    private readonly config: ConfigQuery,
    private readonly store: ObservationStore,
  ) {}

  handle(request: SeamRequest): SeamHttpResponse {
    const prefix = this.config.http.st_prefix;
    const pathOnly = request.path.split('?')[0];
    const rest = pathOnly === prefix ? '' : pathOnly.slice(prefix.length + 1);
    const query = new URLSearchParams(request.path.split('?')[1] ?? '');

    for (const key of query.keys()) {
      if (SUPPORTED_OPTIONS.includes(key)) continue;
      if (KNOWN_UNIMPLEMENTED_OPTIONS.includes(key)) {
        return refusal(501, `query option '${key}' is not implemented; implemented options: ${SUPPORTED_OPTIONS.join(', ')}`);
      }
      return refusal(400, `'${key}' is not a SensorThings query option this subset knows`);
    }

    if (rest === '') return this.serviceRoot();
    if (rest === 'Things') return this.things(query);
    if (rest === 'Datastreams') return this.datastreams(query);
    if (rest === 'Observations') return this.observations(query, undefined);
    const nested = /^Datastreams\('([^']+)'\)\/Observations$/.exec(rest);
    if (nested) return this.observations(query, nested[1]);
    const resource = rest.split('(')[0].split('/')[0];
    if (KNOWN_UNIMPLEMENTED_RESOURCES.includes(resource)) {
      return refusal(501, `resource '${resource}' is not implemented; implemented: Things, Datastreams, Observations (and Datastreams('id')/Observations)`);
    }
    return refusal(404, `no SensorThings resource at '${rest}'`);
  }

  private page<T>(items: T[], query: URLSearchParams): { count: number; page: T[] } | SeamHttpResponse {
    const top = query.has('$top') ? Number(query.get('$top')) : 100;
    const skip = query.has('$skip') ? Number(query.get('$skip')) : 0;
    if (!Number.isInteger(top) || top < 0) return refusal(400, `$top '${query.get('$top')}' is not a non-negative integer`);
    if (!Number.isInteger(skip) || skip < 0) return refusal(400, `$skip '${query.get('$skip')}' is not a non-negative integer`);
    return { count: items.length, page: items.slice(skip, skip + top) };
  }

  private serviceRoot(): SeamHttpResponse {
    const prefix = this.config.http.st_prefix;
    return json(200, {
      value: [
        { name: 'Things', url: `${prefix}/Things` },
        { name: 'Datastreams', url: `${prefix}/Datastreams` },
        { name: 'Observations', url: `${prefix}/Observations` },
      ],
    });
  }

  private things(query: URLSearchParams): SeamHttpResponse {
    const things = [...this.store.things().values()].sort((a, b) => a.thing_id.localeCompare(b.thing_id));
    const paged = this.page(things, query);
    if ('status' in paged) return paged;
    return json(200, {
      '@iot.count': paged.count,
      value: paged.page.map((thing) => ({
        '@iot.id': thing.thing_id,
        name: thing.name,
        description: thing.description,
      })),
    });
  }

  private datastreams(query: URLSearchParams): SeamHttpResponse {
    const streams = [...this.store.datastreams().entries()].sort(([a], [b]) => a.localeCompare(b));
    const paged = this.page(streams, query);
    if ('status' in paged) return paged;
    return json(200, {
      '@iot.count': paged.count,
      value: paged.page.map(([key, sample]) => ({
        '@iot.id': key,
        name: sample.context.datastream.name,
        description: sample.context.datastream.description,
        observationType: sample.context.datastream.observation_type,
        unitOfMeasurement: sample.context.datastream.unit_of_measurement,
        observedProperty: {
          name: sample.context.observed_property.name,
          definition: sample.context.observed_property.definition,
        },
      })),
    });
  }

  private observations(query: URLSearchParams, datastreamKey: string | undefined): SeamHttpResponse {
    let observations = this.store.all();
    if (datastreamKey !== undefined) {
      const [thingId, datastreamId] = datastreamKey.split('/');
      if (!datastreamId) {
        return refusal(400, `Datastream id '${datastreamKey}' is not the served form '<thing>/<datastream>'`);
      }
      observations = this.store.byDatastream(thingId, datastreamId);
    }
    const paged = this.page(observations, query);
    if ('status' in paged) return paged;
    return json(200, {
      '@iot.count': paged.count,
      value: paged.page.map((observation) => this.entity(observation)),
    });
  }

  private entity(observation: Observation) {
    const prefix = this.config.http.st_prefix;
    return {
      '@iot.id': observation.observation_id,
      phenomenonTime: observation.sim_time,
      resultTime: null,
      result: observation.result,
      'Datastream@iot.navigationLink': `${prefix}/Datastreams('${observation.thing_id}/${observation.datastream_id}')`,
      FeatureOfInterest: {
        name: observation.context.feature_of_interest.name,
        feature: {
          type: 'Point' as const,
          coordinates: [
            observation.location.longitude,
            observation.location.latitude,
            observation.location.depth_m,
          ],
        },
      },
    };
  }
}
