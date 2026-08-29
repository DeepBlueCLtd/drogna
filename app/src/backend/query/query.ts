/**
 * The query components (V2-C09), wired as one component with two faces: EDR over
 * the coverage store, SensorThings over the observation store, and the subset
 * statement on the control plane — served through the release gate like all seam
 * HTTP (SRD-v2 §5.4). The served statement is held equal to the documented one by
 * test (FR-27).
 */
import type { SeamClient } from '../../seam/transport.js';
import type { ConfigQuery, QuerySubsets } from '../../generated/types.js';
import type { CoverageStore } from '../coverage-store/store.js';
import type { ObservationStore } from '../observation-store/store.js';
import type { AdvisoryStore } from '../advisories/store.js';
import type { FeatureStore } from '../feature-store/store.js';
import type { Router } from '../runtime/router.js';
import { configDigest } from '../lib/sha256.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';
import { EdrComponent } from './edr.js';
import { SensorThingsComponent } from './sensorthings.js';
import { FeaturesComponent } from './features.js';

export const SUBSET_STATEMENT: Omit<QuerySubsets, 'schema_version'> = {
  edr: {
    standard: 'OGC API - Environmental Data Retrieval 1.1',
    query_types: ['position', 'trajectory', 'area'],
    parameters: ['temperature', 'salinity'],
    interpolation: 'nearest neighbour on the stored grid, in all four dimensions; the snapped grid point is reported in the domain — an area query returns the stored grid points inside the requested bounding box, at one depth and one instant',
    refused_by_name: ['radius', 'cube', 'corridor', 'items', 'locations', 'instances', 'crs', 'f', 'within', 'within-units', 'resolution-x', 'resolution-y'],
  },
  sensorthings: {
    standard: 'OGC SensorThings API Part 1: Sensing 1.1, read-only',
    resources: ['Things', 'Datastreams', 'Observations', "Datastreams('id')/Observations"],
    query_options: ['$top', '$skip'],
    refused_by_name: ['$filter', '$orderby', '$select', '$expand', '$count', 'Sensors', 'ObservedProperties', 'FeaturesOfInterest', 'Locations', 'HistoricalLocations'],
  },
  features: {
    standard: 'OGC API - Features Part 1: Core 1.0, read-only',
    resources: ['collections', 'collections/{id}', 'collections/{id}/items'],
    refused_by_name: ['conformance', 'items/{featureId}', 'bbox', 'datetime', 'limit', 'crs', 'f'],
  },
};

export class QueryComponent {
  private readonly heartbeat: HeartbeatEmitter;
  private simTime = { value: '', tick: null as number | null };

  constructor(
    config: ConfigQuery,
    client: SeamClient,
    coverageStore: CoverageStore,
    observationStore: ObservationStore,
    advisoryStore: AdvisoryStore,
    featureStore: FeatureStore,
    router: Router,
    runId: string,
  ) {
    const edr = new EdrComponent(config, coverageStore);
    const sensorThings = new SensorThingsComponent(config, observationStore);
    const features = new FeaturesComponent(config, advisoryStore, featureStore);
    router.registerPrefix('GET', config.http.edr_prefix, (request) => edr.handle(request));
    router.registerPrefix('GET', config.http.st_prefix, (request) => sensorThings.handle(request));
    router.registerPrefix('GET', config.http.features_prefix, (request) => features.handle(request));
    router.register('GET', config.http.subsets_path, () => ({
      status: 200,
      body: JSON.stringify({ schema_version: 1, ...SUBSET_STATEMENT }),
    }));
    client.subscribe(config.topics.clock, (message) => {
      const sample = message.payload as { sim_time: string; tick: number };
      this.simTime = { value: sample.sim_time, tick: sample.tick };
    });
    this.heartbeat = new HeartbeatEmitter(
      config.id,
      config.heartbeat,
      client,
      () => ({
        sim_time: this.simTime.value,
        tick: this.simTime.tick,
        status: 'ok',
        detail: `serving ${coverageStore.holdings().length} collection(s) and ${observationStore.count()} observation(s)`,
        figures: [
          { key: 'collections', value: coverageStore.holdings().length, label: 'collections' },
          { key: 'observations', value: observationStore.count(), label: 'observations' },
        ],
      }),
      runId,
      configDigest(config),
    );
  }

  start(): void {
    this.heartbeat.start();
  }

  stop(): void {
    this.heartbeat.stop();
  }
}
