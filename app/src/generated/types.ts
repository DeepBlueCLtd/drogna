// GENERATED — DO NOT EDIT.
// Source of truth: contracts/schemas/*.schema.json (Constitution III).
// Regenerate with: pnpm generate. CI fails on drift.

/** drogna boundary denial — from boundary-denial.schema.json */
export type BoundaryDenial = {
  "component": string;
  "path": string;
  "method": string;
  "rule": string;
};

/** drogna bundle manifest — from bundle-manifest.schema.json */
export type BundleManifest = {
  "schema_version": number;
  "bundle_id": string;
  "run_reference": string;
  "run_manifest_digest": string;
  "format_version": string;
  "window": {
    "index": number;
    "start_sim_time": string;
    "end_sim_time": string;
  };
  "members": {
    "name": string;
    "digest": string;
    "byte_length": number;
  }[];
  "variables": string[];
  "profile_count": number;
  "level_count": number;
};

/** drogna simulation time sample — from clock.schema.json */
export type Clock = {
  "run_id": string;
  "tick": number;
  "sim_time": string;
  "mode": "realtime" | "accelerated" | "paused" | "lockstep";
  "rate": number;
};

/** drogna release-gate configuration (V2-C10) — from config.boundary.schema.json */
export type ConfigBoundary = {
  "id": ConfigCommonComponentId;
  "api_prefix": ConfigCommonRelativePath;
  "allow_prefixes": ConfigCommonRelativePath[];
  "topics": {
    "denial": ConfigCommonTopic;
  };
  "heartbeat": ConfigCommonHeartbeat;
};

/** drogna broker configuration (V2-C03) — from config.broker.schema.json */
export type ConfigBroker = {
  "id": ConfigCommonComponentId;
  "roles": {
    "role": ConfigCommonComponentId;
    "publish": ConfigCommonTopicFilter[];
    "subscribe": ConfigCommonTopicFilter[];
  }[];
  "heartbeat": ConfigCommonHeartbeat;
};

/** drogna clock configuration (V2-C01) — from config.clock.schema.json */
export type ConfigClock = {
  "id": ConfigCommonComponentId;
  "epoch": string;
  "tick_interval_us": number;
  "mode": "realtime" | "accelerated" | "paused" | "lockstep";
  "rate": number;
  "min_rate": number;
  "max_rate": number;
  "topics": {
    "clock": ConfigCommonTopic;
  };
  "http": {
    "rate_path": ConfigCommonRelativePath;
  };
  "heartbeat": ConfigCommonHeartbeat;
};

/** config.common.schema.json #/$defs/topic */
export type ConfigCommonTopic = string;

/** config.common.schema.json #/$defs/topic_filter */
export type ConfigCommonTopicFilter = string;

/** config.common.schema.json #/$defs/relative_path */
export type ConfigCommonRelativePath = string;

/** config.common.schema.json #/$defs/component_id */
export type ConfigCommonComponentId = string;

/** config.common.schema.json #/$defs/heartbeat */
export type ConfigCommonHeartbeat = {
  "topic": ConfigCommonTopic;
  "interval_seconds": number;
  "liveness_window_seconds": number;
};

/** drogna run configuration — from config.run.schema.json */
export type ConfigRun = {
  "schema_version": 1;
  "scenario": string;
  "clock": ConfigClock;
  "broker": ConfigBroker;
  "boundary": ConfigBoundary;
  "shell": ConfigShell;
};

/** drogna shell configuration (V2-C19) — from config.shell.schema.json */
export type ConfigShell = {
  "id": ConfigCommonComponentId;
  "role": ConfigCommonComponentId;
  "views": {
    "id": ConfigCommonComponentId;
    "label": string;
  }[];
  "components": {
    "id": ConfigCommonComponentId;
    "label": string;
    "beat": number;
  }[];
  "topics": {
    "clock": ConfigCommonTopicFilter;
    "heartbeat": ConfigCommonTopicFilter;
    "all": ConfigCommonTopicFilter;
  };
  "message_schemas": {
    "filter": ConfigCommonTopicFilter;
    "schema": string;
  }[];
  "endpoints": {
    "clock_rate": ConfigCommonRelativePath;
  };
  "liveness": {
    "default_window_seconds": number;
  };
  "messages": {
    "buffer": number;
  };
};

/** drogna coverage run manifest — from coverage-run-manifest.schema.json */
export type CoverageRunManifest = {
  "schema_version": number;
  "run_id": string;
  "root_seed": number;
  "run_sequence": number | null;
  "generator_version": string;
  "model_version": string;
  "sim_time": string;
  "valid_time": {
    "begin": string;
    "end": string;
  };
  "ensemble": {
    "members": number | null;
    "method": string;
  };
};

/** drogna divergence event — from divergence.schema.json */
export type Divergence = {
  "component": string;
  "scenario_run_id": string;
  "sim_time": string;
  "tick": number;
  "divergence_id": string;
  "forecast_run_id": string;
  "region": DivergenceRegion;
  "residual": DivergenceResidual;
  "persistence": DivergencePersistence;
  "sound_speed_equation": string;
};

/** divergence.schema.json #/$defs/region */
export type DivergenceRegion = {
  "centre_latitude": number;
  "centre_longitude": number;
  "radius_m": number;
  "minimum_depth_m": number;
  "maximum_depth_m": number;
};

/** divergence.schema.json #/$defs/residual */
export type DivergenceResidual = {
  "mean_m_per_s": number;
  "peak_m_per_s": number;
  "threshold_m_per_s": number;
  "sample_count": number;
};

/** divergence.schema.json #/$defs/persistence */
export type DivergencePersistence = {
  "rule": "spatial" | "temporal";
  "sample_count": number;
  "span_seconds": number;
  "first_sim_time": string;
  "last_sim_time": string;
};

/** drogna component heartbeat — from heartbeat.schema.json */
export type Heartbeat = {
  "component": string;
  "sim_time": string;
  "tick"?: number | null;
  "status": "starting" | "ok" | "degraded" | "stalled" | "stopping";
  "run_id"?: string | null;
  "config_digest"?: string | null;
  "heartbeat_interval_seconds"?: number;
  "liveness_window_seconds"?: number;
  "detail"?: string;
};

/** drogna ingest telemetry — from ingest-telemetry.schema.json */
export type IngestTelemetry = {
  "component": string;
  "scenario_run_id": string;
  "sim_time": string;
  "tick": number;
  "queue": {
    "depth": number;
    "bound": number;
    "at_bound": boolean;
    "high_water": number;
    "filled": number;
  };
  "write": {
    "batches": number;
    "stored": number;
    "duplicates": number;
    "rate_per_simulation_second": number;
  };
  "rejections": {
    "count": number;
    "retained": number;
    "discarded": number;
  };
  "broker": {
    "received": number;
    "lost": number;
  };
};

/** drogna ground-truth manifest — from manifest.schema.json */
export type Manifest = {
  "schema_version": 1;
  "generator": {
    "name": string;
    "version": string;
    "analytic_form_version": number;
  };
  "run_id": string;
  "config_digest": string;
  "seed": {
    "root": number;
    "stream": string;
    "derived_entropy": string;
    "derivation": {
      "rule": string;
      "version": number;
    };
    "draw_order": string[];
  };
  "generated_at": {
    "sim_time": string;
    "tick": number;
  };
  "grid": {
    "latitude": ManifestSpatialAxis;
    "longitude": ManifestSpatialAxis;
    "depth": (ManifestSpatialAxis);
    "time": {
      "origin_sim_time": string;
      "start_offset_seconds": number;
      "step_seconds": number;
      "count": number;
      "units": string;
    };
  };
  "variables": {
    "name": string;
    "standard_name": string | null;
    "long_name": string;
    "units": string;
    "dtype": "float32" | "float64";
    "tolerance_absolute": number;
  }[];
  "background": {
    "rule": string;
    "description": string;
    "parameters": {
      "surface_temperature_c": number;
      "deep_temperature_c": number;
      "temperature_scale_depth_m": number;
      "surface_salinity_psu": number;
      "deep_salinity_psu": number;
      "salinity_scale_depth_m": number;
    };
  };
  "pressure_relation": {
    "name": string;
    "expression": string;
    "dbar_per_metre": number;
    "surface_dbar": number;
  };
  "sound_speed": {
    "method": string;
    "implementation": string;
    "validity": {
      "min_temperature_c": number;
      "max_temperature_c": number;
      "min_salinity_psu": number;
      "max_salinity_psu": number;
      "min_depth_m": number;
      "max_depth_m": number;
    };
    "outside_validity": {
      "count": number;
      "first_point": {
        "latitude": number;
        "longitude": number;
        "depth_m": number;
        "time_seconds": number;
      } | null;
    };
  };
  "composition": {
    "rule": string;
    "description": string;
  };
  "features": ManifestFeature[];
  "timescale": {
    "background_seconds": number;
    "background_to_time_step_ratio": number;
    "floor_ratio": number;
    "blending_rule": {
      "name": string;
      "version": number;
      "description": string;
      "parameters": {
        [key: string]: unknown;
      };
    };
    "membership": {
      "rule": string;
      "description": string;
    };
  };
  "outputs": {
    "field": {
      "name": string;
      "format": string;
      "sha256": string;
    };
    "manifest": {
      "name": string;
      "format": string;
    };
  };
  "normalised_attributes": {
    "name": string;
    "treatment": "omitted" | "fixed";
    "reason": string;
  }[];
  "tolerance": {
    "basis": string;
    "stored_dtype": "float32" | "float64";
    "description": string;
  };
};

/** manifest.schema.json #/$defs/spatial_axis */
export type ManifestSpatialAxis = {
  "minimum": number;
  "maximum": number;
  "count": number;
  "spacing": number;
  "units": string;
  "direction": "north" | "east" | "down";
};

/** manifest.schema.json #/$defs/resolution */
export type ManifestResolution = {
  "scale": number;
  "scale_units": string;
  "grid_spacing": number;
  "ratio": number;
};

/** manifest.schema.json #/$defs/feature */
export type ManifestFeature = ({
  "kind"?: "eddy";
  "parameters"?: ManifestEddyParameters;
}) | ({
  "kind"?: "front";
  "parameters"?: ManifestFrontParameters;
}) | ({
  "kind"?: "thermocline";
  "parameters"?: ManifestThermoclineParameters;
}) | ({
  "kind"?: "moving";
  "parameters"?: ManifestMovingParameters;
});

/** manifest.schema.json #/$defs/eddy_parameters */
export type ManifestEddyParameters = {
  "centre_latitude": number;
  "centre_longitude": number;
  "radius_km": number;
  "strength_c": number;
  "salinity_strength_psu": number;
  "sign": -1 | 1;
  "depth_centre_m": number;
  "depth_half_thickness_m": number;
};

/** manifest.schema.json #/$defs/front_parameters */
export type ManifestFrontParameters = {
  "anchor_latitude": number;
  "anchor_longitude": number;
  "bearing_degrees": number;
  "sharpness_km": number;
  "amplitude_c": number;
  "salinity_amplitude_psu": number;
  "depth_scale_m": number;
};

/** manifest.schema.json #/$defs/thermocline_parameters */
export type ManifestThermoclineParameters = {
  "depth_m": number;
  "thickness_m": number;
  "temperature_drop_c": number;
  "salinity_rise_psu": number;
};

/** manifest.schema.json #/$defs/moving_parameters */
export type ManifestMovingParameters = {
  "centre_latitude": number;
  "centre_longitude": number;
  "radius_km": number;
  "strength_c": number;
  "salinity_strength_psu": number;
  "sign": -1 | 1;
  "depth_centre_m": number;
  "depth_half_thickness_m": number;
  "drift_east_km_per_day": number;
  "drift_north_km_per_day": number;
  "reference_latitude": number;
};

/** drogna observation — from observation.schema.json */
export type Observation = {
  "observation_id": string;
  "scenario_run_id": string;
  "sim_time": string;
  "tick": number;
  "thing_id": string;
  "datastream_id": string;
  "sensor_id": string;
  "feature_of_interest_id": string;
  "observed_property": ObservationObservedProperty;
  "result": number;
  "location": ObservationLocation;
  "context": ObservationContext;
};

/** observation.schema.json #/$defs/observed_property */
export type ObservationObservedProperty = "temperature" | "salinity" | "pressure";

/** observation.schema.json #/$defs/location */
export type ObservationLocation = {
  "latitude": number;
  "longitude": number;
  "depth_m": number;
};

/** observation.schema.json #/$defs/context */
export type ObservationContext = {
  "thing": {
    "name": string;
    "description": string;
  };
  "sensor": {
    "name": string;
    "description": string;
    "encoding_type": string;
    "metadata": string;
  };
  "observed_property": {
    "id": string;
    "name": string;
    "definition": string;
    "description": string;
  };
  "datastream": {
    "name": string;
    "description": string;
    "observation_type": string;
    "unit_of_measurement": {
      "name": string;
      "symbol": string;
      "definition": string;
    };
  };
  "feature_of_interest": {
    "name": string;
    "description": string;
    "encoding_type": string;
  };
};

/** drogna offload telemetry — from offload-telemetry.schema.json */
export type OffloadTelemetry = {
  "component": string;
  "scenario_run_id": string;
  "sim_time": string;
  "tick": number;
  "bundles": {
    "staged": number;
    "transferred": number;
    "verified": number;
    "evictable": number;
    "evicted": number;
    "failed": number;
  };
  "verification": {
    "refused": number;
    "verified": number;
    "last_refusal"?: string;
  };
  "staging": {
    "bytes": number;
    "bound_bytes": number;
    "at_bound": boolean;
    "producing": boolean;
  };
};

/** drogna sampling recommendation — from plan.schema.json */
export type Plan = {
  "component": string;
  "scenario_run_id": string;
  "sim_time": PlanSimTime;
  "tick": number;
  "kind": "sampling-recommendation";
  "plan_id": string;
  "supersedes": string | null;
  "state": "planning" | "no-field" | "nothing-worth-sampling";
  "empty_reason": "no-field" | "budget-too-small" | "nothing-worth-sampling" | null;
  "horizon": PlanHorizon;
  "uncertainty_field": PlanUncertaintyField;
  "indexing": PlanIndexing;
  "platform": PlanPlatform;
  "route": PlanRoute;
  "selection": PlanSelection;
  "commitment": PlanCommitment;
  "projection": PlanProjection;
};

/** plan.schema.json #/$defs/sim_time */
export type PlanSimTime = string;

/** plan.schema.json #/$defs/h3_index */
export type PlanH3Index = string;

/** plan.schema.json #/$defs/horizon */
export type PlanHorizon = {
  "start_sim_time": PlanSimTime;
  "end_sim_time": PlanSimTime;
  "span_seconds": number;
};

/** plan.schema.json #/$defs/uncertainty_field */
export type PlanUncertaintyField = {
  "run_id": string;
  "variable": "temperature_spread" | "salinity_spread";
  "digest": string | null;
};

/** plan.schema.json #/$defs/indexing */
export type PlanIndexing = {
  "h3_resolution": number;
  "depth_bands": PlanDepthBand[];
};

/** plan.schema.json #/$defs/depth_band */
export type PlanDepthBand = {
  "index": number;
  "minimum_depth_m": number;
  "maximum_depth_m": number;
};

/** plan.schema.json #/$defs/platform */
export type PlanPlatform = {
  "latitude": number;
  "longitude": number;
  "depth_m": number;
};

/** plan.schema.json #/$defs/route */
export type PlanRoute = {
  "vertices": PlanVertex[];
  "value": number;
  "value_without_collapse": number;
  "budget_seconds": number;
  "consumed_seconds": number;
  "distance_m": number;
};

/** plan.schema.json #/$defs/vertex */
export type PlanVertex = {
  "sequence": number;
  "h3_index": PlanH3Index;
  "depth_band": number;
  "arrival_sim_time": PlanSimTime;
  "latitude": number;
  "longitude": number;
  "depth_m": number;
  "marginal_value": number;
};

/** plan.schema.json #/$defs/selection */
export type PlanSelection = {
  "formulation": "orienteering-prize-collecting";
  "heuristic": "greedy-insertion-seeded-restarts";
  "candidate_cell_count": number;
  "visited_cell_count": number;
  "restarts": number;
};

/** plan.schema.json #/$defs/commitment */
export type PlanCommitment = {
  "window_seconds": number;
  "retained_vertex_count": number;
  "departed_from_previous": boolean;
  "improvement_over_retained": number;
  "margin": number;
};

/** plan.schema.json #/$defs/projection */
export type PlanProjection = {
  "step_seconds": number;
  "horizon_seconds": number;
  "usable_threshold": number;
  "region_count": number;
  "regions": PlanProjectionEntry[];
};

/** plan.schema.json #/$defs/projection_entry */
export type PlanProjectionEntry = {
  "h3_index": PlanH3Index;
  "depth_band": number;
  "state": "crossing" | "already-lapsed" | "no-crossing-within-horizon";
  "crossing_sim_time": (PlanSimTime) | (null);
  "uncertainty_now": number;
  "saturated_uncertainty": number;
  "timescale_seconds": number;
};

/** drogna run manifest — from run-manifest.schema.json */
export type RunManifest = {
  "schema_version": 1;
  "run_id": string;
  "root_seed": number;
  "seed_derivation": {
    "rule": string;
    "version": number;
  };
  "clock": {
    "epoch": string;
    "tick_interval_us": number;
    "mode": "realtime" | "accelerated" | "paused" | "lockstep";
    "rate": number;
    "min_rate"?: number;
    "max_rate"?: number;
    "lockstep_deadline_seconds"?: number;
  };
  "code_version": {
    "revision": string;
    "dirty"?: boolean;
  };
  "participants": {
    "id": string;
    "role": "observer" | "lockstep";
    "config_digest": string;
    "registered_tick"?: number | null;
  }[];
  "streams"?: string[];
  "exit_state": {
    "state": "running" | "completed" | "failed" | "stalled";
    "final_tick"?: number | null;
    "detail"?: string;
  };
  "non_reproducible": string[];
  "measurement_geometry"?: RunManifestMeasurementGeometry;
};

/** run-manifest.schema.json #/$defs/measurement_geometry */
export type RunManifestMeasurementGeometry = {
  "identification_radius_m": number;
  "interval_seconds": number;
  "measurements": RunManifestMeasurement[];
};

/** run-manifest.schema.json #/$defs/measurement */
export type RunManifestMeasurement = {
  "longitude": number;
  "latitude": number;
  "simulation_seconds": number;
};

/** drogna model run published — from run-published.schema.json */
export type RunPublished = {
  "component": string;
  "scenario_run_id": string;
  "sim_time": string;
  "tick": number;
  "run_id": string;
  "current": boolean;
  "valid_time": RunPublishedValidTime;
  "grid_bounds": RunPublishedGridBounds;
  "collections": RunPublishedCollections;
  "digests": RunPublishedDigests;
};

/** run-published.schema.json #/$defs/valid_time */
export type RunPublishedValidTime = {
  "start_sim_time": string;
  "end_sim_time": string;
};

/** run-published.schema.json #/$defs/grid_bounds */
export type RunPublishedGridBounds = {
  "minimum_latitude": number;
  "maximum_latitude": number;
  "minimum_longitude": number;
  "maximum_longitude": number;
  "minimum_depth_m": number;
  "maximum_depth_m": number;
};

/** run-published.schema.json #/$defs/collections */
export type RunPublishedCollections = {
  "forecast": string;
  "uncertainty": string;
};

/** run-published.schema.json #/$defs/digests */
export type RunPublishedDigests = {
  "forecast": string;
  "uncertainty": string;
};

/** drogna model run request — from run-request.schema.json */
export type RunRequest = {
  "component": string;
  "scenario_run_id": string;
  "sim_time": string;
  "tick": number;
  "run_id": string;
  "run_sequence": number;
  "initialisation_sim_time": string;
  "ensemble_size": number;
  "region": DivergenceRegion;
  "divergence": Divergence;
};

/** drogna model run started — from run-started.schema.json */
export type RunStarted = {
  "component": string;
  "scenario_run_id": string;
  "sim_time": string;
  "tick": number;
  "run_id": string;
  "divergence_id": string;
  "member_count": number;
  "kernel": string;
  "initialisation_sim_time": string;
};

/** drogna telemetry — from telemetry.schema.json */
export type Telemetry = (TelemetryResidualSampleReport) | (TelemetryResidualSummary) | (TelemetrySchedulerDecision) | (TelemetryRunFailed) | (TelemetryPublicationRefused) | (TelemetryResidualStatistics) | (TelemetryForecastSkill) | (IngestTelemetry) | (OffloadTelemetry);

/** telemetry.schema.json #/$defs/component_id */
export type TelemetryComponentId = string;

/** telemetry.schema.json #/$defs/scenario_run_id */
export type TelemetryScenarioRunId = string;

/** telemetry.schema.json #/$defs/sim_instant */
export type TelemetrySimInstant = string;

/** telemetry.schema.json #/$defs/nullable_sim_instant */
export type TelemetryNullableSimInstant = string | null;

/** telemetry.schema.json #/$defs/tick_index */
export type TelemetryTickIndex = number;

/** telemetry.schema.json #/$defs/forecast_run_id */
export type TelemetryForecastRunId = string;

/** telemetry.schema.json #/$defs/sound_speed_equation */
export type TelemetrySoundSpeedEquation = string;

/** telemetry.schema.json #/$defs/freshness */
export type TelemetryFreshness = "fresh" | "stale";

/** telemetry.schema.json #/$defs/region_bounds */
export type TelemetryRegionBounds = {
  "minimum_latitude": number;
  "maximum_latitude": number;
  "minimum_longitude": number;
  "maximum_longitude": number;
};

/** telemetry.schema.json #/$defs/statistics_scope */
export type TelemetryStatisticsScope = {
  "level": "scenario" | "region";
  "region_id": string | null;
  "bounds": (TelemetryRegionBounds) | (null);
};

/** telemetry.schema.json #/$defs/residual_point */
export type TelemetryResidualPoint = {
  "sim_time": TelemetrySimInstant;
  "latitude": number;
  "longitude": number;
  "depth_m": number;
  "residual_m_per_s": number;
  "measured_m_per_s": number;
  "platform"?: string;
};

/** telemetry.schema.json #/$defs/residual_sample_report */
export type TelemetryResidualSampleReport = {
  "component": TelemetryComponentId;
  "scenario_run_id": TelemetryScenarioRunId;
  "sim_time": TelemetrySimInstant;
  "tick": TelemetryTickIndex;
  "kind": "residual-sample";
  "forecast_run_id": TelemetryForecastRunId;
  "samples": TelemetryResidualPoint[];
  "sound_speed_equation": TelemetrySoundSpeedEquation;
};

/** telemetry.schema.json #/$defs/residual_summary */
export type TelemetryResidualSummary = {
  "component": TelemetryComponentId;
  "scenario_run_id": TelemetryScenarioRunId;
  "sim_time": TelemetrySimInstant;
  "tick": TelemetryTickIndex;
  "kind": "residual-summary";
  "forecast_run_id"?: string | null;
  "scored": number;
  "exceeding": number;
  "outside_domain": number;
  "shed": number;
  "mean_absolute_m_per_s": number;
  "sound_speed_equation": TelemetrySoundSpeedEquation;
};

/** telemetry.schema.json #/$defs/scheduler_decision */
export type TelemetrySchedulerDecision = {
  "component": TelemetryComponentId;
  "scenario_run_id": TelemetryScenarioRunId;
  "sim_time": TelemetrySimInstant;
  "tick": TelemetryTickIndex;
  "kind": "scheduler-decision";
  "divergence_id": string;
  "decision": "accepted" | "minimum-interval" | "duplicate-outstanding";
  "detail": string;
  "run_id": string | null;
};

/** telemetry.schema.json #/$defs/run_failed */
export type TelemetryRunFailed = {
  "component": TelemetryComponentId;
  "scenario_run_id": TelemetryScenarioRunId;
  "sim_time": TelemetrySimInstant;
  "tick": TelemetryTickIndex;
  "kind": "run-failed";
  "run_id": string;
  "detail": string;
};

/** telemetry.schema.json #/$defs/publication_refused */
export type TelemetryPublicationRefused = {
  "component": TelemetryComponentId;
  "scenario_run_id": TelemetryScenarioRunId;
  "sim_time": TelemetrySimInstant;
  "tick": TelemetryTickIndex;
  "kind": "publication-refused";
  "run_id": string;
  "refusals": string[];
};

/** telemetry.schema.json #/$defs/residual_statistics */
export type TelemetryResidualStatistics = {
  "component": TelemetryComponentId;
  "scenario_run_id": TelemetryScenarioRunId;
  "sim_time": TelemetrySimInstant;
  "tick": TelemetryTickIndex;
  "kind": "residual-statistics";
  "forecast_run_id": string | null;
  "state": "reporting" | "insufficient-samples" | "warming" | "no-forecast";
  "closed": boolean;
  "scope": TelemetryStatisticsScope;
  "basis": "samples" | "summaries" | "mixed" | "none";
  "count": number;
  "mean_m_per_s": number | null;
  "mean_absolute_m_per_s": number | null;
  "root_mean_square_m_per_s": number | null;
  "minimum_m_per_s": number | null;
  "maximum_m_per_s": number | null;
  "first_sim_time": TelemetryNullableSimInstant;
  "last_sim_time": TelemetryNullableSimInstant;
  "last_updated_sim_time": string | null;
  "freshness": TelemetryFreshness;
  "stale_span_seconds": number | null;
  "implausible": boolean;
  "implausible_reason": string | null;
};

/** telemetry.schema.json #/$defs/forecast_skill */
export type TelemetryForecastSkill = ({
  "state"?: "beating-persistence" | "not-beating-persistence";
  "skill_score": number;
  "model_mean_square_error": number;
  "persistence_mean_square_error": number;
  "forecast_run_id"?: string;
  "reference_run_id"?: string;
}) | ({
  "state"?: "insufficient-samples" | "insufficient-reference" | "reference-without-error" | "no-forecast";
  "skill_score": null;
});

/** drogna broker topology — from topology.schema.json */
export type Topology = {
  "generator": string;
  "roles": TopologyBrokerRole[];
  "components": TopologyComponentIdentity[];
  "topics": TopologyTopicEntry[];
};

/** topology.schema.json #/$defs/broker_role */
export type TopologyBrokerRole = {
  "role": string;
  "rules": TopologyAccessRule[];
};

/** topology.schema.json #/$defs/access_rule */
export type TopologyAccessRule = {
  "access": "read" | "write" | "readwrite";
  "filter": string;
};

/** topology.schema.json #/$defs/component_identity */
export type TopologyComponentIdentity = {
  "id": string;
  "role": string;
  "source_root": string | null;
};

/** topology.schema.json #/$defs/topic_entry */
export type TopologyTopicEntry = {
  "topic": string;
  "namespace": "obs" | "ctl";
  "schema": string | null;
  "publishers": string[];
  "subscribers": string[];
  "named_by": TopologySourceSite[];
};

/** topology.schema.json #/$defs/source_site */
export type TopologySourceSite = {
  "component": string | null;
  "path": string;
  "line": number;
  "constant": string;
};

