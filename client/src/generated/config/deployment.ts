// DO NOT EDIT.
// Generated from contracts/schemas/config.deployment.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

import type { Component } from "./common";

/**
 * The values that distinguish one destination from another. Every hostname, port, path, resource limit and profile the Compose configuration needs is declared here, so that deploy/compose.yaml can hold none of them. This file is read by the deployment scripts, not by a component at runtime, which is why it carries no clock, seed, broker or logging section: those belong to the per-component files beside it and are defined by config.common.schema.json, whose component definition this schema references.
 */
export interface DestinationDeploymentValues {
  /**
   * Component identity, taken from the shared definition so that the shape has one home. This file is read by the deployment scripts rather than by a running process, which is why it carries no clock, seed, broker or logging section.
   */
  component: Component;
  /** Name of the destination, matching the directory this file sits in. */
  destination: string;
  /**
   * Compose project name, and therefore the prefix of every container, network and volume the deployment creates.
   */
  project_name: string;
  profiles: {
    /**
     * Compose profiles started at this destination. A profile says what runs here today. It says nothing about which components the client shows as alive, which is decided by heartbeats alone.
     */
    active: string[];
  };
  runtime: {
    restart_policy: "no" | "always" | "on-failure" | "unless-stopped";
    log_driver: string;
    log_max_size: string;
    log_max_files: string;
    healthcheck: {
      interval: string;
      timeout: string;
      retries: number;
      start_period: string;
    };
    wait_timeout_seconds: number;
  };
  /**
   * Paths inside containers. Every one of these reaches an image as a build argument or an environment variable, never as a literal in a Dockerfile or in the Compose file. coverage_root, environment_root, run_root, offload_root and released_root are the deployment's five stores: a named volume is mounted at each, and every container directory a component configuration names has to sit under one of them or nothing mounts it. That is checked by deploy/lib/mount_lint.py, which is a registered gate.
   */
  container_paths: Record<string, string>;
  /**
   * Paths on the host, relative to the repository root. Absolute host paths are deliberately not accepted: they would tie a destination to one machine.
   */
  host_paths: Record<string, string>;
  network: {
    /**
     * One entry per service that publishes a port to the host. A service absent from this map publishes nothing and is reachable only on the internal network.
     */
    publish: Record<string, PublishedPort>;
  };
  /**
   * The address a person types to reach this destination. The run scripts print it; nothing in the stack resolves it.
   */
  public_url: {
    scheme: "http" | "https";
    host: string;
    port: Port;
    base_path: string;
  };
  /**
   * Whether this destination terminates TLS, and at what name. The reverse proxy feature (C-10) consumes this; this feature only carries it.
   */
  tls: {
    terminate: boolean;
    hostname: string;
  };
  /**
   * Database name and role. The password is not here and never will be: it is generated into the untracked environment file at deploy time.
   */
  database: {
    name: string;
    user: string;
  };
  /**
   * Memory and CPU ceilings. 'default' applies to every service; a key named for a service overrides it for that service.
   */
  resources: Record<string, ResourceLimit>;
  seeding: {
    record_filename: string;
    artefact_dirname: string;
  };
}

export type Port = number;

export interface PublishedPort {
  bind: string;
  host_port: Port;
  container_port: Port;
}

export interface ResourceLimit {
  memory: string;
  cpus: string;
}
