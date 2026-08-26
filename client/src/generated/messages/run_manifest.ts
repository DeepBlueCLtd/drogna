// DO NOT EDIT.
// Generated from contracts/schemas/run-manifest.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

/**
 * The record from which a run can be started again. Together with the code version it names, this document is sufficient input to a replay: no other file, flag or environment is consulted. It records digests of configuration and never configuration values, so a manifest can be published without leaking whatever a config file happens to carry. Named run-manifest to distinguish it from the environment generator's ground-truth manifest, which refers to a run by run_id.
 */
export interface DrognaRunManifest {
  /** Bumped when the shape changes in a way a reader must notice. */
  schema_version: 1;
  /**
   * Identity of the run. Deterministic: derived from seed and scenario, never from entropy or a host clock.
   */
  run_id: string;
  /** The seed every generator in the run derives from. */
  root_seed: number;
  /**
   * How per-stream seeds come from the root seed. Recorded as a rule rather than a table of seeds, because the rule is a pure function of root seed and stream name and so recomputes exactly.
   */
  seed_derivation: {
    /** Rule name, for example harness-rng. */
    rule: string;
    /** Rule version. A change here changes every sequence in every replay. */
    version: number;
  };
  /**
   * The clock configuration the run started with. Tick values follow from epoch and interval alone.
   */
  clock: {
    /** Simulation epoch, ISO-8601 UTC with microsecond precision. */
    epoch: string;
    /** Simulation microseconds between ticks. */
    tick_interval_us: number;
    /**
     * Byte-identical replay is claimed for lockstep only. The free-running modes reproduce drawn values, not interleaving.
     */
    mode: "realtime" | "accelerated" | "paused" | "lockstep";
    /** Emission rate. Zero means pinned. */
    rate: number;
    min_rate?: number;
    max_rate?: number;
    /**
     * How long the clock waits for an outstanding acknowledgement before reporting a stall. It never skips the tick.
     */
    lockstep_deadline_seconds?: number;
  };
  /**
   * The code the run executed. A replay claims byte-identical output only against the same revision.
   */
  code_version: {
    /** Commit identifier, or a build identifier where there is no commit. */
    revision: string;
    /**
     * True when the working tree carried uncommitted changes, in which case the revision does not identify the code and the replay claim does not hold.
     */
    dirty?: boolean;
  };
  /**
   * Components that registered with the clock, with the digest of the configuration each was started from. Digests only: never values.
   */
  participants: ({
    id: string;
    role: "observer" | "lockstep";
    /** SHA-256 of the configuration file as read. */
    config_digest: string;
    /** The tick at which the registration was observed. */
    registered_tick?: number | null;
  })[];
  /**
   * Named RNG streams the run is expected to use. Listed so that two call sites accidentally sharing one stream shows up in the document rather than as a puzzle in the output.
   */
  streams?: string[];
  /** How the run ended. Written atomically, so no reader sees a partial document. */
  exit_state: {
    state: "running" | "completed" | "failed" | "stalled";
    /** The last tick emitted. */
    final_tick?: number | null;
    /**
     * Free-text diagnostic. Declared non-reproducible: it may name a host, a duration or an exception message, none of which a replay is expected to match.
     */
    detail?: string;
  };
  /**
   * JSON pointers a replay comparison excludes. Declared in the document as well as annotated in the schema, so a comparison needs the manifest alone.
   */
  non_reproducible: string[];
}
