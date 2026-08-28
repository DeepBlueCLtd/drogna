// DO NOT EDIT.
// Generated from contracts/schemas/config.features.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

import type { Broker, Clock, Component, Logging, Seed } from "./common";

/**
 * Configuration for C-07, the feature store. It is provisioned by script at scenario start and is read-only for the duration of a run, so this document describes a job rather than a long-lived component: what content to produce, into which schema, and which roles must hold nothing but select afterwards. The content is synthetic, produced from the root seed, and represents no real place. The common sections are referenced from config.common.schema.json rather than restated.
 */
export interface DrognaFeatureStoreProvisioningConfiguration {
  component: Component;
  clock: Clock;
  seed: Seed;
  broker?: Broker;
  logging: Logging;
  features: {
    /**
     * The second schema in the observation store's Postgres instance. Two schemas in one instance, mirroring the conceptual split without doubling the operational surface (SRD FR-12).
     */
    store: {
      /**
       * Connection string for the provisioning role, which is the only role that may write here and only while the scenario is not running.
       */
      dsn: string;
      /** The schema provisioned. features, beside observations in the same instance. */
      schema: string;
      /**
       * Where the store's own definitions — provision.py, the migrations and roles.sql — are readable from inside the provisioning container. Declared here rather than passed as an environment variable because Constitution IV admits one variable, HARNESS_CONFIG, and everything else arrives inside the document it names. Being a `_directory` key under a declared container path, deploy/lib/mount_lint.py also checks that the deployment actually mounts it, which is the failure that would otherwise be silent: an unmounted directory still exists inside a container, so a provisioning run would find nothing and have no way to say why.
       */
      definitions_directory: string;
      /**
       * The role the script connects as. It holds write permission; nothing running during a scenario does.
       */
      provisioning_role: string;
      /**
       * Every role a running scenario connects with. Each is granted select and nothing else, and the script asserts that after applying the grants, so a drifted grant fails the run rather than being found later.
       */
      runtime_roles: string[];
      tables: {
        bathymetry: string;
        coastline: string;
      };
    };
    /**
     * The same extent the generated environment occupies, so the client and the planner have reference data everywhere they have a field.
     */
    domain: {
      latitude: Extent;
      longitude: Extent;
    };
    /**
     * A grid of depths produced from the root seed. It is not a survey of anywhere: the numerics are deliberately fake and the shape is whatever the seeded parameters make it.
     */
    bathymetry: {
      /** Rows in the depth grid. */
      latitude_count: number;
      /** Columns in the depth grid. */
      longitude_count: number;
      /** Depth at the shallow edge of the shelf, in metres. */
      shallow_depth_m: number;
      /**
       * Depth at the deep edge, in metres. The slope between the two is smooth and the seeded roughness is added to it.
       */
      deep_depth_m: number;
      /** One standard deviation of the seeded variation added to the smooth slope, in metres. */
      roughness_m: number;
    };
    /**
     * One line along the shallow edge of the domain, with seeded variation. A boundary to draw against, not a chart of anywhere.
     */
    coastline: {
      /** Vertices in the line. */
      vertex_count: number;
      /** One standard deviation of the seeded wander of the line, in degrees. */
      variation_degrees: number;
    };
  };
}

export interface Extent {
  minimum: number;
  maximum: number;
}
