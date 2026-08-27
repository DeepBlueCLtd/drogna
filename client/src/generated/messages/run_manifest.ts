// DO NOT EDIT.
// Generated from contracts/schemas/run-manifest.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

/**
 * The record from which a run can be started again. Together with the code version it names, this document is sufficient input to a replay: no other file, flag or environment is consulted. It records digests of configuration and never configuration values, so a manifest can be published without leaking whatever a config file happens to carry. Named run-manifest to distinguish it from the environment generator's ground-truth manifest, which refers to a run by run_id. Two components write a document of this shape and they do not write the same one: C-01 writes the run's own manifest as the run starts, and the offload packager writes the copy that travels beside a bundle. The difference between them is measurement_geometry, which only the second one is in a position to know, which is why it is optional here and why a manifest is withheld rather than released — a manifest carrying the geometry is the document that says where the measurements were taken (FR-42).
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
  /**
   * Where the run's measurements were taken, and the terms a release of that run is scored on. Optional, and the reason is the thing a reader will otherwise get wrong: C-01 writes the run's own manifest and holds no observations, so the manifest on the run-data volume does not carry this block and is complete without it; the offload packager writes the copy that travels beside a bundle and does know the geometry, so that copy carries it. A consumer that needs the geometry — the updated-region half of the leakage gate is the only one — must refuse a manifest without this block rather than read the absence as an empty geometry, because an empty geometry makes every comparison inconclusive and an inconclusive result nobody reads is indistinguishable from a pass (FR-015, FR-017).
   */
  measurement_geometry?: MeasurementGeometry;
}

/**
 * The ground truth the change mask between two successive released products is scored against. Held in the manifest rather than beside the products because it is the same class of thing as the seeds: the record of what the run actually did, which is what makes a claim about a release checkable, and which is exactly what a release must not contain.
 */
export interface MeasurementGeometry {
  /**
   * How close to a measurement a released value has to be before it identifies where that measurement was taken. It travels with the geometry rather than being read from a deployment's policy alone, so a run scored long after it finished is scored on the radius it was released under and not on whatever the boundary has been widened to since.
   */
  identification_radius_m: number;
  /**
   * How long the interval between two successive released products is, in simulation seconds. Stated rather than inferred from the measurements: a geometry covering a shorter span than the products it is scored against would leave the cells that moved unaccounted for, and a mask nobody can account for scores at chance for the wrong reason.
   */
  interval_seconds: number;
  /**
   * Every place a measurement was taken in the interval. At least one, because a geometry with none is not a geometry: it buffers to no cells, every comparison against it is inconclusive, and a document that could produce that silently is worse than one that is refused.
   */
  measurements: Measurement[];
}

/**
 * One place a measurement was taken, and when in the interval. Position and simulation time only: what was measured is an observation and lives in the observation store, and repeating it here would put a second copy of the values in the one document that must never be released.
 */
export interface Measurement {
  /**
   * Degrees east. Bounded so that a pair written the other way round, or in radians, is refused here rather than scored as a geometry somewhere else entirely — which would put the buffered cells nowhere near the mask and read as a clean release.
   */
  longitude: number;
  /**
   * Degrees north. Bounded for the same reason as the longitude beside it, and separately because the metres-per-degree conversion the buffer uses is only meaningful inside this range.
   */
  latitude: number;
  /**
   * When in the interval the measurement was taken, counted in simulation seconds from the interval's start. Simulation time and not a host clock, so that a replay of the run produces the same geometry and the gate's verdict is reproducible (Constitution I, Constitution II).
   */
  simulation_seconds: number;
}
