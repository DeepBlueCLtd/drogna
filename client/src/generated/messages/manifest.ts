// DO NOT EDIT.
// Generated from contracts/schemas/manifest.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

/**
 * Everything that produced one generated field: the grid, the background, the four seeded features with their parameters, the decorrelation timescale background and per-feature values with the rule that blends them, the seed, the generator version and the digests of what was written. It is the document AT-01 and AT-03 score against, and Constitution IX allows no claim of recovery that is not measured against it. Two properties are load-bearing. It is sufficient: with the generator version it names, the analytic field can be reconstructed at any point in the domain without the field file and without the generator running. And it records the evaluated form only: the authored per-feature representation is an authoring convenience and does not reach a consumer (ADR-0002). Distinct from run-manifest.schema.json, which records a run; this document refers to a run by run_id.
 */
export interface DrognaGroundTruthManifest {
  /** Bumped when the shape changes in a way a reader must notice. */
  schema_version: 1;
  /**
   * Which generator, and which analytic form. Any change to the analytic form is a version bump here, so a manifest never describes a field it could not have produced.
   */
  generator: {
    name: string;
    /** Generator version, in the sense of the code that wrote this document. */
    version: string;
    /**
     * Version of the analytic form itself. A reader that understands this number can reconstruct the field; a reader that does not must refuse rather than guess.
     */
    analytic_form_version: number;
  };
  /** The run this field belongs to, as recorded in the run manifest. */
  run_id: string;
  /**
   * Digest of the configuration that produced the field. A digest and never values, so publishing a manifest cannot leak what a config file happens to carry.
   */
  config_digest: string;
  /**
   * Where every stochastic value came from. Randomness enters only as authored jitter on feature parameters; the jittered values are what this document records, which is why it stays sufficient on its own.
   */
  seed: {
    root: number;
    stream: string;
    /**
     * The stream's derived entropy in hexadecimal, so a reader can rebuild the sequence without repeating the derivation by hand.
     */
    derived_entropy: string;
    derivation: {
      rule: string;
      version: number;
    };
    /**
     * The names of the draws, in the exact order they were taken. Order is load-bearing: reordering it changes every world without changing any parameter.
     */
    draw_order: string[];
  };
  /**
   * Simulation time, taken from the clock port. There is no host time anywhere in this document.
   */
  generated_at: {
    sim_time: string;
    tick: number;
  };
  grid: {
    latitude: SpatialAxis;
    longitude: SpatialAxis;
    /** Depth increases downwards, as CF requires it to say explicitly. */
    depth: SpatialAxis;
    /**
     * The time axis is offsets in seconds from an origin in simulation time. The evaluator takes seconds from that origin, so a point between two steps is as evaluable as one on them.
     */
    time: {
      origin_sim_time: string;
      start_offset_seconds: number;
      step_seconds: number;
      count: number;
      units: string;
    };
  };
  /**
   * What the field carries, with the units and standard names a consumer reads it by, and the absolute tolerance within which the evaluator agrees with the stored value.
   */
  variables: ({
    name: string;
    /**
     * The CF standard name, or null where CF has none. Null is stated rather than invented: a standard name that is not in the table is a claim the vocabulary does not support.
     */
    standard_name: string | null;
    long_name: string;
    units: string;
    dtype: "float32" | "float64";
    /**
     * Derived from the stored width at this variable's largest magnitude, not chosen. It is the threshold a comparison against the stored field is entitled to use.
     */
    tolerance_absolute: number;
  })[];
  /** The base state on which every feature is composed. */
  background: {
    rule: string;
    description: string;
    parameters: {
      surface_temperature_c: number;
      deep_temperature_c: number;
      temperature_scale_depth_m: number;
      surface_salinity_psu: number;
      deep_salinity_psu: number;
      salinity_scale_depth_m: number;
    };
  };
  /**
   * Pressure is derived from depth, never generated beside it. A pressure generated independently of depth would be unphysical and would make the sound speed derivation meaningless.
   */
  pressure_relation: {
    name: string;
    expression: string;
    dbar_per_metre: number;
    surface_dbar: number;
  };
  /**
   * ADR-0005: sound speed is derived at the point of use by one implementation, named here so a residual computed elsewhere can say which equation produced it.
   */
  sound_speed: {
    method: string;
    /**
     * The single implementation in drogna, by module name. A second implementation would make a recovery error partly an artefact of the disagreement between copies.
     */
    implementation: string;
    validity: {
      min_temperature_c: number;
      max_temperature_c: number;
      min_salinity_psu: number;
      max_salinity_psu: number;
      min_depth_m: number;
      max_depth_m: number;
    };
    /**
     * Where the equation was used outside its stated range, and how often. The numerics are deliberately fake, but the fact of being used outside range must not be invisible.
     */
    outside_validity: {
      count: number;
      first_point: {
        latitude: number;
        longitude: number;
        depth_m: number;
        time_seconds: number;
      } | null;
    };
  };
  /**
   * How features reach the background. Stated as a rule so the field is reproducible from this document's parameters alone.
   */
  composition: {
    rule: string;
    description: string;
  };
  /**
   * The four seeded features of SRD FR-03, with the parameters that produced them after jitter. These are the ground truth a recovery error is measured against.
   */
  features: Feature[];
  /**
   * ADR-0002. The timescale is a field: authored per feature over this background, evaluated per location, and advected with the feature that moves. Both the background and the per-feature values are ground truth.
   */
  timescale: {
    background_seconds: number;
    background_to_time_step_ratio: number;
    /** The configured floor every ratio in this document was checked against. */
    floor_ratio: number;
    /**
     * ADR-0002 leaves the blending rule open and requires it to be named here, because two features may overlap and the answer where they do is a modelling choice rather than a fact.
     */
    blending_rule: {
      name: string;
      version: number;
      description: string;
      parameters: Record<string, unknown>;
    };
    /**
     * How a feature's weight at a location is obtained. It shares the anomaly's geometry so that a timescale and the anomaly it belongs to cannot drift apart.
     */
    membership: {
      rule: string;
      description: string;
    };
  };
  /**
   * What was written, by the names configuration gave them, so a cataloguing convention can be applied without the generator knowing it.
   */
  outputs: {
    field: {
      name: string;
      format: string;
      sha256: string;
    };
    /**
     * This document. It carries no digest of itself, which it could not compute without changing.
     */
    manifest: {
      name: string;
      format: string;
    };
  };
  /**
   * The file attributes fixed or omitted so that two runs with one seed are byte-identical. Declared, because a comparison that silently skipped them would be proving less than it claims.
   */
  normalised_attributes: ({
    name: string;
    treatment: "omitted" | "fixed";
    reason: string;
  })[];
  /**
   * Why the per-variable tolerances above are what they are. Derived from the stored width, so a comparison has a stated threshold rather than a chosen one.
   */
  tolerance: {
    basis: string;
    stored_dtype: "float32" | "float64";
    description: string;
  };
}

export interface SpatialAxis {
  minimum: number;
  maximum: number;
  count: number;
  spacing: number;
  units: string;
  /**
   * Which way the axis increases. The vertical says down, because a field that leaves it implicit will be read upside down by somebody.
   */
  direction: "north" | "east" | "down";
}

/**
 * How well the grid resolves this feature. A ratio below one means the field under-resolves it, and a recovery error can then be interpreted rather than merely reported.
 */
export interface Resolution {
  scale: number;
  scale_units: string;
  grid_spacing: number;
  ratio: number;
}

export type Feature = {
  id: string;
  kind: "eddy" | "front" | "thermocline" | "moving";
  /** This feature's authored decorrelation timescale. Ground truth, and scorable. */
  timescale_seconds: number;
  /**
   * Recorded whether or not it passed the floor, because a ratio close to the floor is worth seeing.
   */
  timescale_to_time_step_ratio: number;
  resolution: Resolution;
  parameters: Record<string, unknown>;
} & ({
  kind: "eddy";
  parameters: EddyParameters;
} | {
  kind: "front";
  parameters: FrontParameters;
} | {
  kind: "thermocline";
  parameters: ThermoclineParameters;
} | {
  kind: "moving";
  parameters: MovingParameters;
});

export interface EddyParameters {
  centre_latitude: number;
  centre_longitude: number;
  radius_km: number;
  strength_c: number;
  salinity_strength_psu: number;
  sign: -1 | 1;
  depth_centre_m: number;
  depth_half_thickness_m: number;
}

export interface FrontParameters {
  anchor_latitude: number;
  anchor_longitude: number;
  bearing_degrees: number;
  sharpness_km: number;
  amplitude_c: number;
  salinity_amplitude_psu: number;
  depth_scale_m: number;
}

export interface ThermoclineParameters {
  depth_m: number;
  thickness_m: number;
  temperature_drop_c: number;
  salinity_rise_psu: number;
}

/**
 * The initial centre is the position at the time origin. Its position at any other time is that centre plus the drift velocity times the elapsed simulation time, computed about reference_latitude, so no consumer needs to step through the field to find it.
 */
export interface MovingParameters {
  centre_latitude: number;
  centre_longitude: number;
  radius_km: number;
  strength_c: number;
  salinity_strength_psu: number;
  sign: -1 | 1;
  depth_centre_m: number;
  depth_half_thickness_m: number;
  drift_east_km_per_day: number;
  drift_north_km_per_day: number;
  /**
   * The latitude the local plane is built about, so the advection is an exact affine map rather than an approximation that depends on where it is evaluated.
   */
  reference_latitude: number;
}
