// DO NOT EDIT.
// Generated from contracts/schemas/config.common.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

/**
 * The sections every drogna component's configuration carries. A component schema does not reference this document's root; it references the entries under $defs, lists them among its own properties, and sets additionalProperties to false so that a typo in a key is a startup failure rather than a silent default. The root here validates a component that has no section of its own.
 */
export interface DrognaCommonConfigurationSections {
  component: Component;
  clock: Clock;
  seed: Seed;
  broker?: Broker;
  logging: Logging;
}

/**
 * Who this process is. The id is deterministic and appears in heartbeats, in the clock's participant registry and in the run manifest.
 */
export interface Component {
  /** Stable component id, for example clock or env_generator. */
  id: string;
  /** One line for a human reading a heartbeat. */
  description?: string;
  /**
   * Declared liveness interval, in host seconds. Real time by ADR-0006: measured in simulation time, a rate of zero would expire every liveness window and grey out a running system during exactly the capture FR-53 exists to make meaningful.
   */
  heartbeat_interval_seconds?: number;
}

/**
 * How this component reaches the simulation clock. Time arrives by subscription to ctl/clock on the broker (ADR-0009); the HTTP interface here is for two things a subscription cannot do, setting the rate and asking what the time is now at startup. The routes are configuration rather than code because they are part of the clock's published interface and because Constitution IV admits no URL or path literal in component source.
 */
export interface Clock {
  /** Base URL of the clock service's HTTP interface (C-01). Not a way to read time in a loop. */
  endpoint: string;
  /**
   * Routes relative to the endpoint. Read and control routes sit under distinct prefixes so the reverse proxy can apply policy by prefix without enumerating routes.
   */
  routes: {
    /** What the time is now, for startup and for catching up after a restart. */
    snapshot: string;
    /** Mode, rate, registration and acknowledgement: commands, not reads. */
    control: string;
  };
  /**
   * The mode this component expects the run to be in. It does not set the mode; the clock does.
   */
  mode: ClockMode;
  /**
   * Tolerated gap in tick indices before the clock port reports itself stale. Gaps are normal in accelerated mode, so this is a per-component tolerance, not a constant.
   */
  stale_after_gap?: number;
  /** Socket timeout for clock requests. A transport parameter, not a source of time. */
  timeout_seconds?: number;
  /** Present when this component registers with the clock. Absent means it only listens. */
  participant?: {
    /** Deterministic participant id, recorded in the run manifest. */
    id: string;
    role: ParticipantRole;
  };
}

/**
 * The run's root seed and this component's stream prefix. Every generator in the process derives from these through harness_core.rng.
 */
export interface Seed {
  /** The run's root seed, recorded in the run manifest. */
  root: number;
  /** This component's stream prefix. Stream names are <component>.<purpose>. */
  stream: string;
}

/**
 * MQTT connection details. Topics are namespaced obs/ and ctl/; the namespaces are conventions of the harness and are not configurable.
 */
export interface Broker {
  /** Broker URL. */
  url: string;
  /** Deterministic client id. Never derived from entropy or from a host clock. */
  client_id: string;
  /** Transport keepalive. A socket parameter, not simulation time. */
  keepalive_seconds?: number;
}

export interface Logging {
  /** Log level. Log line decoration may carry host time; nothing else may. */
  level: "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";
}

/**
 * realtime and accelerated are free-running; paused emits nothing; lockstep advances only when every registered participant has acknowledged the current tick.
 */
export type ClockMode = "realtime" | "accelerated" | "paused" | "lockstep";

/**
 * An observer reads ticks. A lockstep participant additionally acknowledges each one, and the clock will not advance without it.
 */
export type ParticipantRole = "observer" | "lockstep";
