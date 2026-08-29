/**
 * OGC API - Features (Part 1, Core) over the advisory store and the feature
 * store, read-only (SRD-v2 FR-37, and the reference-geometry serving deferred
 * there from 104): the honest subset. Two collections — 'advisories' and
 * 'reference' — each served as a GeoJSON FeatureCollection subset
 * (features-response.schema.json). The advisories collection is
 * present-and-stating-empty before any advisory exists: an empty collection is
 * an answer, not an error. Everything else in the standard is refused with its
 * own name in the refusal (FR-27, E9).
 */
import type { SeamHttpResponse, SeamRequest } from '../../seam/http.js';
import type {
  Advisory,
  ConfigQuery,
  FeaturesResponseCollection,
  FeaturesResponseFeature,
} from '../../generated/types.js';
import type { AdvisoryStore } from '../advisories/store.js';
import type { FeatureStore } from '../feature-store/store.js';

const KNOWN_UNIMPLEMENTED_PATHS = ['conformance'];
const KNOWN_UNIMPLEMENTED_OPTIONS = ['bbox', 'datetime', 'limit', 'crs', 'f'];

function json(status: number, body: unknown): SeamHttpResponse {
  return { status, body: JSON.stringify(body) };
}

function refusal(status: number, text: string): SeamHttpResponse {
  return json(status, { refused: text });
}

export class FeaturesComponent {
  constructor(
    private readonly config: ConfigQuery,
    private readonly advisories: AdvisoryStore,
    private readonly reference: FeatureStore,
  ) {}

  handle(request: SeamRequest): SeamHttpResponse {
    const prefix = this.config.http.features_prefix;
    const pathOnly = request.path.split('?')[0];
    const rest = pathOnly === prefix ? '' : pathOnly.slice(prefix.length + 1);
    const query = new URLSearchParams(request.path.split('?')[1] ?? '');

    for (const key of query.keys()) {
      if (KNOWN_UNIMPLEMENTED_OPTIONS.includes(key)) {
        return refusal(501, `query option '${key}' is not implemented; this subset serves every item of a collection, unfiltered`);
      }
      return refusal(400, `'${key}' is not a Features query option this subset knows`);
    }

    if (rest === '' || rest === 'collections') return this.collections();
    const parts = rest.split('/');
    if (parts[0] === 'collections' && parts.length === 2) return this.collection(parts[1]);
    if (parts[0] === 'collections' && parts.length === 3 && parts[2] === 'items') {
      return this.items(parts[1]);
    }
    if (parts[0] === 'collections' && parts.length === 4 && parts[2] === 'items') {
      return refusal(501, `single-feature access (items/'${parts[3]}') is not implemented; the items page carries every feature`);
    }
    if (KNOWN_UNIMPLEMENTED_PATHS.includes(parts[0])) {
      return refusal(501, `'${parts[0]}' is not implemented; implemented: collections, collections/{id}, collections/{id}/items`);
    }
    return refusal(404, `no Features resource at '${rest}'`);
  }

  private collectionDescriptors(): FeaturesResponseCollection[] {
    const prefix = this.config.http.features_prefix;
    const link = (id: string): FeaturesResponseCollection['links'] => [
      { href: `${prefix}/collections/${id}`, rel: 'self' },
      { href: `${prefix}/collections/${id}/items`, rel: 'items', type: 'application/geo+json' },
    ];
    return [
      {
        id: 'advisories',
        title: 'shore advisories',
        description:
          'Every advisory the advisory store has ingested, as features whose geometry is the advised region. Present and stating empty before any advisory exists.',
        itemType: 'feature',
        links: link('advisories'),
      },
      {
        id: 'reference',
        title: 'reference geometry',
        description:
          'The read-only spatial reference the harness was provisioned with: the domain and the loiter region. Immutable for the run.',
        itemType: 'feature',
        links: link('reference'),
      },
    ];
  }

  private collections(): SeamHttpResponse {
    const prefix = this.config.http.features_prefix;
    return json(200, {
      links: [{ href: `${prefix}/collections`, rel: 'self' }],
      collections: this.collectionDescriptors(),
    });
  }

  private collection(id: string): SeamHttpResponse {
    const found = this.collectionDescriptors().find((collection) => collection.id === id);
    if (!found) return refusal(404, `no Features collection named '${id}'; collections: advisories, reference`);
    return json(200, found);
  }

  private items(id: string): SeamHttpResponse {
    if (id === 'advisories') {
      const features = this.advisories.all().map((advisory) => advisoryFeature(advisory));
      return json(200, { type: 'FeatureCollection', features, numberReturned: features.length });
    }
    if (id === 'reference') {
      const features = this.reference.features().map(
        (feature): FeaturesResponseFeature => ({
          type: 'Feature',
          id: feature.feature_id,
          geometry: { type: 'Polygon', coordinates: feature.geometry.coordinates },
          properties: { name: feature.name, kind: feature.kind },
        }),
      );
      return json(200, { type: 'FeatureCollection', features, numberReturned: features.length });
    }
    return refusal(404, `no Features collection named '${id}'; collections: advisories, reference`);
  }
}

/**
 * An advisory as a feature: the geometry carries the advised region (the bbox as
 * a Polygon ring), and the properties are the advisory document minus that
 * region — governed content either way; nothing here escapes its own master.
 */
export function advisoryFeature(advisory: Advisory): FeaturesResponseFeature {
  const { region, ...properties } = advisory;
  const [west, south, east, north] = region.bbox;
  return {
    type: 'Feature',
    id: advisory.advisory_id,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    },
    properties,
  };
}
