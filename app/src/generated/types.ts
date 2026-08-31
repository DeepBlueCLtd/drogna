// GENERATED — DO NOT EDIT.
// Source of truth: contracts/schemas/*.schema.json (Constitution III).
// Regenerate with: pnpm generate. CI fails on drift.

/** drogna shore advisory — from advisory.schema.json */
export type Advisory = {
  "advisory_id": string;
  "scenario_run_id": string;
  "sim_time": string;
  "tick": number;
  "sequence": number;
  "kind": "sound-speed-outlook" | "sampling-window" | "caution-region";
  "valid_time": {
    "start_sim_time": string;
    "end_sim_time": string;
  };
  "region": {
    "bbox": number[];
  };
  "guidance": {
    "confidence": "low" | "moderate" | "high";
    "recommended_minimum_depth_m": number;
    "recommended_maximum_depth_m": number;
    "expected_sound_speed_minimum_m_per_s": number;
    "expected_sound_speed_maximum_m_per_s": number;
  };
};

/** drogna analysis published — from analysis-published.schema.json */
export type AnalysisPublished = {
  "component": string;
  "scenario_run_id": string;
  "sim_time": string;
  "tick": number;
  "run_id": string;
  "initialisation_sim_time": string;
  "ensemble_size": number;
  "background": {
    "holding_id": string;
    "era": "archive" | "nowcast" | "analysis" | "instance";
  };
  "collections": {
    "analysis": string;
    "error": string;
    "provenance": string;
  };
  "digests": {
    "analysis": string;
    "error": string;
    "provenance": string;
  };
  "observations": {
    "assimilated": number;
    "clamped": number;
    "worst_displacement_km": number;
  };
};

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

/** drogna shore advisory source configuration (V2-C16) — from config.advisory-source.schema.json */
export type ConfigAdvisorySource = {
  "id": ConfigCommonComponentId;
  "stream": string;
  "topics": {
    "clock": ConfigCommonTopic;
    "advisory": ConfigCommonTopic;
    "command": ConfigCommonTopic;
  };
  "heartbeat": ConfigCommonHeartbeat;
  "cadence_ticks": number;
  "valid_seconds": number;
  "region_feature": string;
  "depth_span_m": number;
  "sound_speed_half_width_m_per_s": number;
  "prompt_event": string;
};

/** drogna advisory store configuration (V2-C17) — from config.advisory-store.schema.json */
export type ConfigAdvisoryStore = {
  "id": ConfigCommonComponentId;
  "topics": {
    "clock": ConfigCommonTopic;
    "advisory": ConfigCommonTopicFilter;
  };
  "heartbeat": ConfigCommonHeartbeat;
  "size_ceiling_bytes": number;
};

/** drogna analyst configuration (V2-C19) — from config.analyst.schema.json */
export type ConfigAnalyst = {
  "id": ConfigCommonComponentId;
  "stream": string;
  "topics": {
    "clock": ConfigCommonTopic;
    "observations": ConfigCommonTopicFilter;
    "run_request": ConfigCommonTopic;
    "run_published": ConfigCommonTopic;
    "analysis_published": ConfigCommonTopic;
  };
  "heartbeat": ConfigCommonHeartbeat;
  "correlation": {
    "horizontal_km": number;
    "vertical_m": number;
  };
  "excluded_datastreams": string[];
  "shares": {
    "archive": string;
    "departure": string;
    "measurement": string;
    "model": string;
  };
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

/** drogna coverage store configuration (V2-C08) — from config.coverage-store.schema.json */
export type ConfigCoverageStore = {
  "id": ConfigCommonComponentId;
  "topics": {
    "clock": ConfigCommonTopic;
    "published": ConfigCommonTopic;
    "command": ConfigCommonTopic;
  };
  "http": {
    "holdings_path": ConfigCommonRelativePath;
  };
  "heartbeat": ConfigCommonHeartbeat;
  "announce_event": string;
};

/** drogna environment generator configuration (V2-C02) — from config.env-generator.schema.json */
export type ConfigEnvGenerator = {
  "id": ConfigCommonComponentId;
  "stream": string;
  "topics": {
    "clock": ConfigCommonTopic;
    "command": ConfigCommonTopic;
  };
  "prompt_event": string;
  "heartbeat": ConfigCommonHeartbeat;
  "domain": {
    "latitude": ConfigEnvGeneratorExtent;
    "longitude": ConfigEnvGeneratorExtent;
    "depth": ConfigEnvGeneratorExtent;
  };
  "nowcast": {
    "grid": ConfigEnvGeneratorGridCounts;
    "interval_ticks": number;
    "time_steps": number;
    "step_seconds": number;
  };
  "archive": {
    "grid": ConfigEnvGeneratorGridCounts;
    "months": number;
    "month_seconds": number;
  };
  "background": {
    "surface_temperature_c": number;
    "deep_temperature_c": number;
    "temperature_scale_depth_m": number;
    "surface_salinity_psu": number;
    "deep_salinity_psu": number;
    "salinity_scale_depth_m": number;
  };
  "features": {
    "eddy": {
      "nominal": {
        "centre_latitude": number;
        "centre_longitude": number;
        "radius_km": number;
        "strength_c": number;
        "salinity_strength_psu": number;
        "sign": -1 | 1;
        "depth_centre_m": number;
        "depth_half_thickness_m": number;
      };
      "jitter": {
        "centre_degrees": number;
        "radius_km": number;
        "strength_c": number;
      };
    };
    "front": {
      "nominal": {
        "anchor_latitude": number;
        "anchor_longitude": number;
        "bearing_degrees": number;
        "sharpness_km": number;
        "amplitude_c": number;
        "salinity_amplitude_psu": number;
        "depth_scale_m": number;
      };
      "jitter": {
        "anchor_degrees": number;
        "bearing_degrees": number;
      };
    };
    "thermocline": {
      "nominal": {
        "depth_m": number;
        "thickness_m": number;
        "temperature_drop_c": number;
        "salinity_rise_psu": number;
      };
      "jitter": {
        "depth_m": number;
        "temperature_drop_c": number;
      };
    };
    "moving": {
      "nominal": {
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
      };
      "jitter": {
        "centre_degrees": number;
        "drift_km_per_day": number;
      };
    };
  };
  "timescale": {
    "background_seconds": number;
    "floor_ratio": number;
    "feature_seconds": {
      "eddy": number;
      "front": number;
      "thermocline": number;
      "moving": number;
    };
  };
};

/** config.env-generator.schema.json #/$defs/extent */
export type ConfigEnvGeneratorExtent = {
  "minimum": number;
  "maximum": number;
};

/** config.env-generator.schema.json #/$defs/grid_counts */
export type ConfigEnvGeneratorGridCounts = {
  "longitude": number;
  "latitude": number;
  "depth": number;
};

/** drogna feature store configuration (V2-C07) — from config.feature-store.schema.json */
export type ConfigFeatureStore = {
  "id": ConfigCommonComponentId;
  "topics": {
    "clock": ConfigCommonTopic;
  };
  "heartbeat": ConfigCommonHeartbeat;
  "features": {
    "feature_id": string;
    "name": string;
    "kind": "domain" | "loiter_region" | "reference_area";
    "geometry": {
      "type": "Polygon";
      "coordinates": number[][][];
    };
  }[];
};

/** drogna ingestion seam configuration (V2-C05) — from config.ingest.schema.json */
export type ConfigIngest = {
  "id": ConfigCommonComponentId;
  "topics": {
    "clock": ConfigCommonTopic;
    "observations": ConfigCommonTopicFilter;
  };
  "heartbeat": ConfigCommonHeartbeat;
};

/** drogna model runner configuration (V2-C13) — from config.model-runner.schema.json */
export type ConfigModelRunner = {
  "id": ConfigCommonComponentId;
  "stream": string;
  "topics": {
    "clock": ConfigCommonTopic;
    "run_request": ConfigCommonTopic;
    "analysis_published": ConfigCommonTopic;
    "run_started": ConfigCommonTopic;
    "run_published": ConfigCommonTopic;
  };
  "heartbeat": ConfigCommonHeartbeat;
  "kernel": string;
  "steps": number;
  "step_seconds": number;
  "advection": {
    "east_km_per_day": number;
    "north_km_per_day": number;
  };
  "noise_std": {
    "temperature": number;
    "salinity": number;
  };
};

/** drogna monitor configuration (V2-C11) — from config.monitor.schema.json */
export type ConfigMonitor = {
  "id": ConfigCommonComponentId;
  "topics": {
    "clock": ConfigCommonTopic;
    "observations": ConfigCommonTopicFilter;
    "divergence": ConfigCommonTopic;
    "telemetry": ConfigCommonTopic;
    "command": ConfigCommonTopic;
  };
  "heartbeat": ConfigCommonHeartbeat;
  "pairs": {
    "thing_id": string;
    "temperature_datastream": string;
    "salinity_datastream": string;
    "depth_m": number;
  }[];
  "threshold_m_per_s": number;
  "persistence_count": number;
  "region": {
    "radius_m": number;
    "depth_pad_m": number;
  };
};

/** drogna observation store configuration (V2-C06) — from config.observation-store.schema.json */
export type ConfigObservationStore = {
  "id": ConfigCommonComponentId;
  "topics": {
    "clock": ConfigCommonTopic;
  };
  "heartbeat": ConfigCommonHeartbeat;
};

/** drogna offload packager configuration (V2-C20) — from config.offload.schema.json */
export type ConfigOffload = {
  "id": ConfigCommonComponentId;
  "topics": {
    "clock": ConfigCommonTopic;
    "run_published": ConfigCommonTopic;
    "offload": ConfigCommonTopic;
    "command": ConfigCommonTopic;
  };
  "prompt_event": string;
  "heartbeat": ConfigCommonHeartbeat;
  "identification_radius_m": number;
  "format_version": string;
  "staging_bound_bytes": number;
};

/** drogna operator surface configuration (V2-C18) — from config.operator.schema.json */
export type ConfigOperator = {
  "id": ConfigCommonComponentId;
  "topics": {
    "clock": ConfigCommonTopic;
    "heartbeat": ConfigCommonTopicFilter;
    "platform_demand": ConfigCommonTopic;
    "command": ConfigCommonTopic;
  };
  "http": {
    "components_path": ConfigCommonRelativePath;
    "step_path": ConfigCommonRelativePath;
    "command_prefix": ConfigCommonRelativePath;
    "platform_demand_path": ConfigCommonRelativePath;
    "controls_path": ConfigCommonRelativePath;
    "tuning_path": ConfigCommonRelativePath;
    "event_prefix": ConfigCommonRelativePath;
  };
  "heartbeat": ConfigCommonHeartbeat;
  "protected": ConfigCommonComponentId[];
  "step": OperatorControlsStep;
  "demand": OperatorControlsDemand;
  "tunables": OperatorControlsTunable[];
  "events": OperatorControlsEvent[];
};

/** drogna planner configuration (V2-C14) — from config.planner.schema.json */
export type ConfigPlanner = {
  "id": ConfigCommonComponentId;
  "stream": string;
  "topics": {
    "clock": ConfigCommonTopic;
    "observations": ConfigCommonTopicFilter;
    "run_published": ConfigCommonTopic;
    "plan": ConfigCommonTopic;
    "command": ConfigCommonTopic;
  };
  "prompt_event": string;
  "heartbeat": ConfigCommonHeartbeat;
  "excluded_datastreams"?: string[];
  "replan_interval_ticks": number;
  "region_feature": string;
  "h3_resolution": number;
  "depth_bands": {
    "index": number;
    "minimum_depth_m": number;
    "maximum_depth_m": number;
  }[];
  "budget_seconds": number;
  "speeds": {
    "horizontal_m_per_s": number;
    "vertical_m_per_s": number;
  };
  "usable_threshold": number;
  "restarts": number;
  "shortlist": number;
  "projection": {
    "step_seconds": number;
    "horizon_seconds": number;
  };
};

/** drogna platform configuration (V2-C21) — from config.platform.schema.json */
export type ConfigPlatform = {
  "id": ConfigCommonComponentId;
  "stream": string;
  "topics": {
    "clock": ConfigCommonTopic;
    "demand": ConfigCommonTopic;
    "state": ConfigCommonTopic;
    "observation_prefix": string;
    "command": ConfigCommonTopic;
  };
  "fault_event": string;
  "heartbeat": ConfigCommonHeartbeat;
  "thing": {
    "thing_id": string;
    "name": string;
    "description": string;
  };
  "initial": {
    "latitude": number;
    "longitude": number;
    "course_degrees": number;
    "speed_m_per_s": number;
    "depth_m": number;
  };
  "limits": {
    "maximum_speed_m_per_s": number;
    "maximum_depth_m": number;
    "turn_rate_degrees_per_second": number;
    "acceleration_m_per_s2": number;
    "dive_rate_m_per_s": number;
  };
  "report_event": string;
  "report_interval_ticks"?: number;
  "instruments": {
    "sensor_id": string;
    "datastream_id": string;
    "observed_property": "platform_course" | "platform_speed" | "platform_depth";
    "noise_std": number;
    "unit": {
      "name": string;
      "symbol": string;
      "definition": string;
    };
  }[];
};

/** drogna query components configuration (V2-C09) — from config.query.schema.json */
export type ConfigQuery = {
  "id": ConfigCommonComponentId;
  "topics": {
    "clock": ConfigCommonTopic;
  };
  "http": {
    "edr_prefix": ConfigCommonRelativePath;
    "st_prefix": ConfigCommonRelativePath;
    "subsets_path": ConfigCommonRelativePath;
    "features_prefix": ConfigCommonRelativePath;
  };
  "heartbeat": ConfigCommonHeartbeat;
};

/** drogna run configuration — from config.run.schema.json */
export type ConfigRun = {
  "schema_version": 1;
  "scenario": string;
  "clock": ConfigClock;
  "broker": ConfigBroker;
  "boundary": ConfigBoundary;
  "env_generator": ConfigEnvGenerator;
  "coverage_store": ConfigCoverageStore;
  "platform": ConfigPlatform;
  "sensors": ConfigSensors;
  "ingest": ConfigIngest;
  "observation_store": ConfigObservationStore;
  "query": ConfigQuery;
  "monitor": ConfigMonitor;
  "scheduler": ConfigScheduler;
  "model_runner": ConfigModelRunner;
  "analyst": ConfigAnalyst;
  "planner": ConfigPlanner;
  "telemetry": ConfigTelemetry;
  "operator": ConfigOperator;
  "advisory_source": ConfigAdvisorySource;
  "advisory_store": ConfigAdvisoryStore;
  "offload": ConfigOffload;
  "feature_store": ConfigFeatureStore;
  "shell": ConfigShell;
  "start_conditions": ConfigStartConditions;
  "snapshot_source": ConfigSnapshotSource;
};

/** drogna scheduler configuration (V2-C12) — from config.scheduler.schema.json */
export type ConfigScheduler = {
  "id": ConfigCommonComponentId;
  "topics": {
    "clock": ConfigCommonTopic;
    "divergence": ConfigCommonTopic;
    "run_request": ConfigCommonTopic;
    "run_published": ConfigCommonTopic;
    "telemetry": ConfigCommonTopic;
    "command": ConfigCommonTopic;
  };
  "heartbeat": ConfigCommonHeartbeat;
  "min_interval_ticks": number;
  "max_interval_ticks": number;
  "ensemble_size": number;
  "prompt_event": string;
};

/** drogna sensors configuration (V2-C04) — from config.sensors.schema.json */
export type ConfigSensors = {
  "id": ConfigCommonComponentId;
  "stream": string;
  "topics": {
    "clock": ConfigCommonTopic;
    "ownship": ConfigCommonTopicFilter;
    "observation_prefix": string;
    "command": ConfigCommonTopic;
  };
  "heartbeat": ConfigCommonHeartbeat;
  "platform": {
    "thing_id": string;
    "name": string;
    "description": string;
  };
  "fault_event": string;
  "sample_event": string;
  "sample_interval_ticks": number;
  "instruments": {
    "sensor_id": string;
    "datastream_id": string;
    "observed_property": "temperature" | "salinity" | "pressure";
    "depth_m": number;
    "noise_std": number;
    "unit": {
      "name": string;
      "symbol": string;
      "definition": string;
    };
  }[];
};

/** drogna shell configuration (V2-C19) — from config.shell.schema.json */
export type ConfigShell = {
  "id": ConfigCommonComponentId;
  "role": ConfigCommonComponentId;
  "views": {
    "id": ConfigCommonComponentId;
    "label": string;
    "kind"?: "harness" | "consumer";
  }[];
  "components": {
    "id": ConfigCommonComponentId;
    "label": string;
    "beat": number;
    "band": "plane" | "loop" | "path" | "downstream";
    "rank": number;
  }[];
  "topics": {
    "clock": ConfigCommonTopicFilter;
    "heartbeat": ConfigCommonTopicFilter;
    "holdings": ConfigCommonTopicFilter;
    "all": ConfigCommonTopicFilter;
    "plan": ConfigCommonTopicFilter;
    "run_published": ConfigCommonTopicFilter;
    "analysis_published": ConfigCommonTopic;
    "advisories": ConfigCommonTopicFilter;
    "platform_state": ConfigCommonTopicFilter;
    "telemetry": ConfigCommonTopicFilter;
    "observations": ConfigCommonTopicFilter;
  };
  "message_schemas": {
    "filter": ConfigCommonTopicFilter;
    "schema": string;
  }[];
  "endpoints": {
    "clock_rate": ConfigCommonRelativePath;
    "holdings": ConfigCommonRelativePath;
    "components": ConfigCommonRelativePath;
    "telemetry": ConfigCommonRelativePath;
    "clock_step": ConfigCommonRelativePath;
    "component_command": ConfigCommonRelativePath;
    "platform_demand": ConfigCommonRelativePath;
    "sensorthings": ConfigCommonRelativePath;
    "edr": ConfigCommonRelativePath;
    "features": ConfigCommonRelativePath;
    "query_subsets": ConfigCommonRelativePath;
    "operator_controls": ConfigCommonRelativePath;
    "operator_tuning": ConfigCommonRelativePath;
    "operator_event": ConfigCommonRelativePath;
  };
  "flow": {
    "suppressed_filters": string[];
    "ports": {
      "from": ConfigCommonComponentId;
      "to": ConfigCommonComponentId;
      "label": string;
    }[];
    "series_samples": number;
    "pulse": {
      "fade_ms": number;
      "hold_above_rate": number;
    };
  };
  "consumers": {
    "notice": string;
    "hexes": {
      "minimum_resolution": number;
      "maximum_resolution": number;
      "default_resolution": number;
      "cell_ceiling": number;
    };
    "sampling": {
      "time_budget_hours": number[];
      "default_time_budget_hours": number;
      "expendable_interval_hours": number[];
      "default_expendable_interval_hours": number;
      "depth_zones": number;
      "observation_backfill": number;
      "nominal_speed_m_per_s": number;
      "uncertainty": {
        "saturation": number;
        "recency_timescale_seconds": number;
        "density_halving_count": number;
      };
    };
    "courses": {
      "classes": {
        "id": ConfigCommonComponentId;
        "label": string;
        "motion": "corridor" | "loiter" | "evasive";
        "default_likelihood": number;
        "included": boolean;
        "speed_m_per_s": number;
      }[];
      "objectives": {
        "id": ConfigCommonComponentId;
        "label": string;
      }[];
      "default_objective": ConfigCommonComponentId;
      "candidate_count": number;
      "steps": number;
      "step_seconds": number;
      "samples_per_likelihood": number;
      "default_exposure_weight": number;
      "bank_count": number;
    };
    "feasibility": {
      "horizon_hours": number;
      "step_minutes": number;
      "forecast_samples": number;
      "set_count": number;
      "confidence_weights": {
        "high": number;
        "medium": number;
        "low": number;
      };
      "veto_weight": number;
      "lanes": {
        "id": ConfigCommonComponentId;
        "label": string;
        "kind": "boolean" | "continuous";
        "provenance": "seam" | "seam-derived" | "synthesised";
        "unit"?: string;
        "default_confidence": "high" | "medium" | "low" | "off";
        "period_minutes"?: number;
        "on_minutes"?: number;
        "minimum"?: number;
        "maximum"?: number;
      }[];
      "tasks": {
        "id": ConfigCommonComponentId;
        "label": string;
        "duration_minutes": number;
        "requirements": {
          "lane": ConfigCommonComponentId;
          "sense": "present" | "absent" | "at-least" | "at-most";
          "threshold"?: number;
        }[];
      }[];
    };
  };
  "liveness": {
    "default_window_seconds": number;
  };
  "messages": {
    "buffer": number;
  };
};

/** drogna snapshot source configuration (V2-C22) — from config.snapshot-source.schema.json */
export type ConfigSnapshotSource = {
  "id": ConfigCommonComponentId;
  "topics": {
    "clock": ConfigCommonTopic;
  };
  "heartbeat": ConfigCommonHeartbeat;
  "artefacts": {
    "path_prefix": string;
    "path_suffix": string;
  };
  "authors": {
    "archive": ConfigCommonComponentId;
    "nowcast": ConfigCommonComponentId;
    "analysis": ConfigCommonComponentId;
    "instance": ConfigCommonComponentId;
  };
};

/** drogna start conditions — from config.start-conditions.schema.json */
export type ConfigStartConditions = {
  "default": ConfigStartConditionsConditionId;
  "conditions": ConfigStartConditionsCondition[];
};

/** config.start-conditions.schema.json #/$defs/condition_id */
export type ConfigStartConditionsConditionId = string;

/** config.start-conditions.schema.json #/$defs/condition */
export type ConfigStartConditionsCondition = {
  "id": ConfigStartConditionsConditionId;
  "label": string;
  "situation": string;
  "holds": string[];
  "root_seed": number;
  "snapshot_eras"?: ("archive" | "nowcast" | "analysis" | "instance")[];
  "platform": {
    "latitude": number;
    "longitude": number;
    "course_degrees": number;
    "speed_m_per_s": number;
    "depth_m": number;
  };
  "legs": ConfigStartConditionsLeg[];
};

/** config.start-conditions.schema.json #/$defs/leg */
export type ConfigStartConditionsLeg = {
  "note": string;
  "ticks": number;
  "stopped"?: ConfigCommonComponentId[];
  "demand"?: {
    "course_degrees"?: number;
    "speed_m_per_s"?: number;
    "depth_m"?: number;
    "note"?: string;
  };
  "tune"?: {
    "id": string;
    "value": number;
  }[];
  "prompt"?: string[];
};

/** drogna telemetry configuration (V2-C15) — from config.telemetry.schema.json */
export type ConfigTelemetry = {
  "id": ConfigCommonComponentId;
  "topics": {
    "clock": ConfigCommonTopic;
    "telemetry": ConfigCommonTopic;
    "run_published": ConfigCommonTopic;
    "observations": ConfigCommonTopicFilter;
    "command": ConfigCommonTopic;
  };
  "http": {
    "report_path": ConfigCommonRelativePath;
  };
  "heartbeat": ConfigCommonHeartbeat;
  "cadence_ticks": number;
  "staleness_window_seconds": number;
  "minimum_skill_samples": number;
  "skill_event": string;
  "statistics_event": string;
  "regions": {
    "rows": number;
    "columns": number;
    "minimum_samples": number;
  };
};

/** drogna coverage holding — from coverage-holding.schema.json */
export type CoverageHolding = {
  "schema_version": 1;
  "holding_id": string;
  "era": "archive" | "nowcast" | "analysis" | "instance";
  "run_id": string;
  "published_at": {
    "sim_time": string;
    "tick": number;
  };
  "field": {
    "format": "drogna-f32-v1";
    "sha256": string;
    "byte_length": number;
  };
  "manifest": Manifest;
};

/** drogna CoverageJSON subset — from coveragejson.schema.json */
export type Coveragejson = {
  "type": "Coverage";
  "domain": {
    "type": "Domain";
    "domainType": "Point" | "Trajectory" | "Grid";
    "axes": {
      "x"?: CoveragejsonNumericAxis;
      "y"?: CoveragejsonNumericAxis;
      "z"?: CoveragejsonNumericAxis;
      "t"?: CoveragejsonStringAxis;
      "composite"?: {
        "dataType": "tuple";
        "coordinates": ("t" | "x" | "y" | "z")[];
        "values": ((number | string)[])[];
      };
    };
    "referencing": {
      "coordinates": string[];
      "system": {
        "type": string;
      };
    }[];
  };
  "parameters": {
    [key: string]: unknown;
  };
  "ranges": {
    [key: string]: unknown;
  };
};

/** coveragejson.schema.json #/$defs/numeric_axis */
export type CoveragejsonNumericAxis = {
  "values": number[];
};

/** coveragejson.schema.json #/$defs/string_axis */
export type CoveragejsonStringAxis = {
  "values": string[];
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

/** drogna EDR collections subset — from edr-collections.schema.json */
export type EdrCollections = {
  [key: string]: unknown;
};

/** edr-collections.schema.json #/$defs/landing */
export type EdrCollectionsLanding = {
  "title": string;
  "description": string;
  "links": EdrCollectionsLink[];
};

/** edr-collections.schema.json #/$defs/conformance */
export type EdrCollectionsConformance = {
  "conformsTo": string[];
};

/** edr-collections.schema.json #/$defs/collections */
export type EdrCollectionsCollections = {
  "links": EdrCollectionsLink[];
  "collections": EdrCollectionsCollection[];
};

/** edr-collections.schema.json #/$defs/collection */
export type EdrCollectionsCollection = {
  "id": string;
  "title": string;
  "description": string;
  "links": EdrCollectionsLink[];
  "extent": {
    "spatial": {
      "bbox": number[][];
      "crs": string;
    };
    "vertical": {
      "interval": number[][];
      "vrs": string;
    };
    "temporal": {
      "interval": string[][];
      "trs": string;
    };
  };
  "data_queries": {
    "position"?: EdrCollectionsDataQuery;
    "trajectory"?: EdrCollectionsDataQuery;
    "area"?: EdrCollectionsDataQuery;
  };
  "parameter_names": {
    [key: string]: unknown;
  };
  "crs": string[];
};

/** edr-collections.schema.json #/$defs/data_query */
export type EdrCollectionsDataQuery = {
  "link": EdrCollectionsLink;
};

/** edr-collections.schema.json #/$defs/link */
export type EdrCollectionsLink = {
  "href": string;
  "rel": string;
  "type"?: string;
  "title"?: string;
};

/** drogna Features subset responses — from features-response.schema.json */
export type FeaturesResponse = {
  [key: string]: unknown;
};

/** features-response.schema.json #/$defs/collections */
export type FeaturesResponseCollections = {
  "links": FeaturesResponseLink[];
  "collections": FeaturesResponseCollection[];
};

/** features-response.schema.json #/$defs/collection */
export type FeaturesResponseCollection = {
  "id": string;
  "title": string;
  "description": string;
  "itemType": "feature";
  "links": FeaturesResponseLink[];
};

/** features-response.schema.json #/$defs/feature_collection */
export type FeaturesResponseFeatureCollection = {
  "type": "FeatureCollection";
  "features": FeaturesResponseFeature[];
  "numberReturned": number;
};

/** features-response.schema.json #/$defs/feature */
export type FeaturesResponseFeature = {
  "type": "Feature";
  "id": string;
  "geometry": {
    "type": "Polygon";
    "coordinates": number[][][];
  };
  "properties": {
    [key: string]: unknown;
  };
};

/** features-response.schema.json #/$defs/link */
export type FeaturesResponseLink = {
  "href": string;
  "rel": string;
  "type"?: string;
  "title"?: string;
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
  "figures"?: {
    "key": string;
    "value": number;
    "unit"?: string;
    "of"?: number;
    "label"?: string;
  }[];
};

/** drogna holding-published announcement — from holding-published.schema.json */
export type HoldingPublished = {
  "component": string;
  "holding_id": string;
  "era": "archive" | "nowcast" | "analysis" | "instance";
  "run_id": string;
  "sim_time": string;
  "tick": number;
  "field_sha256": string;
};

/** drogna holdings inventory — from holdings-inventory.schema.json */
export type HoldingsInventory = {
  "schema_version": 1;
  "holdings": CoverageHolding[];
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
  "id": string;
  "kind": "eddy" | "front" | "thermocline" | "moving";
  "timescale_seconds": number;
  "timescale_to_time_step_ratio": number;
  "resolution": ManifestResolution;
  "parameters": {
    [key: string]: unknown;
  };
}) & (({
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
}));

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
export type ObservationObservedProperty = "temperature" | "salinity" | "pressure" | "platform_course" | "platform_speed" | "platform_depth";

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

/** drogna operator command — from operator-command.schema.json */
export type OperatorCommand = (OperatorCommandTuningCommand) | (OperatorCommandEventCommand);

/** operator-command.schema.json #/$defs/component_id */
export type OperatorCommandComponentId = string;

/** operator-command.schema.json #/$defs/tuning_command */
export type OperatorCommandTuningCommand = {
  "component": OperatorCommandComponentId;
  "scenario_run_id": string;
  "sim_time": string;
  "tick": number;
  "kind": "tuning";
  "target": OperatorCommandComponentId;
  "setting": string;
  "value": number;
};

/** operator-command.schema.json #/$defs/event_command */
export type OperatorCommandEventCommand = {
  "component": OperatorCommandComponentId;
  "scenario_run_id": string;
  "sim_time": string;
  "tick": number;
  "kind": "event";
  "target": OperatorCommandComponentId;
  "event": string;
};

/** drogna operator components report — from operator-components.schema.json */
export type OperatorComponents = {
  "schema_version": 1;
  "components": {
    "id": string;
    "heard": boolean;
    "stoppable": boolean;
    "running": boolean;
    "last_heartbeat": (Heartbeat) | (null);
  }[];
};

/** drogna operator controls statement — from operator-controls.schema.json */
export type OperatorControls = {
  "schema_version": 1;
  "step": OperatorControlsStep;
  "demand": OperatorControlsDemand;
  "tunables": OperatorControlsTunable[];
  "events": OperatorControlsEvent[];
};

/** operator-controls.schema.json #/$defs/step */
export type OperatorControlsStep = {
  "maximum_ticks": number;
};

/** operator-controls.schema.json #/$defs/demand */
export type OperatorControlsDemand = {
  "target": string;
};

/** operator-controls.schema.json #/$defs/tunable */
export type OperatorControlsTunable = {
  "id": string;
  "target": string;
  "setting": string;
  "label": string;
  "unit"?: string;
  "minimum": number;
  "maximum": number;
  "step": number;
  "integer": boolean;
  "figure": string;
  "description": string;
};

/** operator-controls.schema.json #/$defs/event */
export type OperatorControlsEvent = {
  "id": string;
  "target": string;
  "label": string;
  "description": string;
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
  "variable": "temperature_spread" | "salinity_spread" | "temperature_error" | "salinity_error";
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

/** drogna platform demand — from platform-demand.schema.json */
export type PlatformDemand = {
  "component": string;
  "scenario_run_id": string;
  "sim_time": string;
  "tick": number;
  "course_degrees"?: number;
  "speed_m_per_s"?: number;
  "depth_m"?: number;
  "note"?: string;
};

/** drogna platform state — from platform-state.schema.json */
export type PlatformState = {
  "component": string;
  "scenario_run_id": string;
  "sim_time": string;
  "tick": number;
  "current": PlatformStateVector;
  "demanded": (PlatformStateDemanded) | (null);
  "demand_from"?: string | null;
  "limits": PlatformStateLimits;
  "binding_limit": "none" | "turn_rate" | "acceleration" | "dive_rate" | "maximum_speed" | "maximum_depth";
  "shortfall"?: (PlatformStateShortfall) | (null);
  "note"?: string;
};

/** platform-state.schema.json #/$defs/vector */
export type PlatformStateVector = {
  "latitude": number;
  "longitude": number;
  "course_degrees": number;
  "speed_m_per_s": number;
  "depth_m": number;
};

/** platform-state.schema.json #/$defs/demanded */
export type PlatformStateDemanded = {
  "course_degrees": number;
  "speed_m_per_s": number;
  "depth_m": number;
};

/** platform-state.schema.json #/$defs/limits */
export type PlatformStateLimits = {
  "maximum_speed_m_per_s": number;
  "maximum_depth_m": number;
  "turn_rate_degrees_per_second": number;
  "acceleration_m_per_s2": number;
  "dive_rate_m_per_s": number;
};

/** platform-state.schema.json #/$defs/shortfall */
export type PlatformStateShortfall = {
  "quantity": "speed_m_per_s" | "depth_m";
  "asked": number;
  "allowed": number;
  "statement": string;
};

/** drogna query subset statement — from query-subsets.schema.json */
export type QuerySubsets = {
  "schema_version": 1;
  "edr": {
    "standard": string;
    "query_types": string[];
    "parameters": string[];
    "interpolation": string;
    "refused_by_name": string[];
  };
  "sensorthings": {
    "standard": string;
    "resources": string[];
    "query_options": string[];
    "refused_by_name": string[];
  };
  "features": {
    "standard": string;
    "resources": string[];
    "refused_by_name": string[];
  };
};

/** drogna run manifest — from run-manifest.schema.json */
export type RunManifest = {
  "schema_version": 1;
  "run_id": string;
  "start_condition": string;
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
  "region": (DivergenceRegion) | (null);
  "divergence": (Divergence) | (null);
  "cause": "divergence" | "scheduled" | "operator";
};

/** drogna model run started — from run-started.schema.json */
export type RunStarted = {
  "component": string;
  "scenario_run_id": string;
  "sim_time": string;
  "tick": number;
  "run_id": string;
  "divergence_id": string | null;
  "member_count": number;
  "kernel": string;
  "initialisation_sim_time": string;
};

/** drogna SensorThings subset responses — from sensorthings-subset.schema.json */
export type SensorthingsSubset = {
  [key: string]: unknown;
};

/** sensorthings-subset.schema.json #/$defs/service_root */
export type SensorthingsSubsetServiceRoot = {
  "value": {
    "name": string;
    "url": string;
  }[];
};

/** sensorthings-subset.schema.json #/$defs/things_response */
export type SensorthingsSubsetThingsResponse = {
  "@iot.count": number;
  "value": SensorthingsSubsetThing[];
};

/** sensorthings-subset.schema.json #/$defs/thing */
export type SensorthingsSubsetThing = {
  "@iot.id": string;
  "name": string;
  "description": string;
};

/** sensorthings-subset.schema.json #/$defs/datastreams_response */
export type SensorthingsSubsetDatastreamsResponse = {
  "@iot.count": number;
  "value": SensorthingsSubsetDatastream[];
};

/** sensorthings-subset.schema.json #/$defs/datastream */
export type SensorthingsSubsetDatastream = {
  "@iot.id": string;
  "name": string;
  "description": string;
  "observationType": string;
  "unitOfMeasurement": {
    "name": string;
    "symbol": string;
    "definition": string;
  };
  "observedProperty": {
    "name": string;
    "definition": string;
  };
};

/** sensorthings-subset.schema.json #/$defs/observations_response */
export type SensorthingsSubsetObservationsResponse = {
  "@iot.count": number;
  "value": SensorthingsSubsetObservationEntity[];
};

/** sensorthings-subset.schema.json #/$defs/observation_entity */
export type SensorthingsSubsetObservationEntity = {
  "@iot.id": string;
  "phenomenonTime": string;
  "resultTime": string | null;
  "result": number;
  "Datastream@iot.navigationLink": string;
  "FeatureOfInterest": {
    "name": string;
    "feature": {
      "type": "Point";
      "coordinates": number[];
    };
  };
};

/** drogna seed-data snapshot header — from snapshot.schema.json */
export type Snapshot = {
  "format": "drogna-snapshot-1";
  "start_condition": string;
  "run_id": string;
  "root_seed": number;
  "config_digest": string;
  "code_revision": string;
  "holdings": {
    "descriptor": CoverageHolding;
    "byte_length": number;
  }[];
};

/** drogna telemetry report — from telemetry-report.schema.json */
export type TelemetryReport = {
  "schema_version": 1;
  "statistics": (TelemetryResidualStatistics) | (null);
  "skill": (TelemetryForecastSkill) | (null);
  "throughput": {
    "window_sim_seconds": number;
    "observations_per_sim_second": number;
    "telemetry_messages_per_sim_second": number;
  };
  "regions": TelemetryResidualStatistics[];
  "latency": {
    "basis": string;
    "sample_count": number;
    "mean_sim_seconds": number | null;
    "maximum_sim_seconds": number | null;
  };
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
  "breach"?: TelemetryBreachState;
};

/** telemetry.schema.json #/$defs/breach_state */
export type TelemetryBreachState = {
  "threshold_m_per_s": number;
  "streak": number;
  "persistence_count": number;
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
  "divergence_id": string | null;
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
  "component": TelemetryComponentId;
  "scenario_run_id": TelemetryScenarioRunId;
  "sim_time": TelemetrySimInstant;
  "tick": TelemetryTickIndex;
  "kind": "forecast-skill";
  "forecast_run_id": string | null;
  "reference_run_id": string | null;
  "reference_changed": boolean;
  "sample_count": number;
  "minimum_sample_count": number;
  "model_mean_square_error": number | null;
  "persistence_mean_square_error": number | null;
  "skill_score": number | null;
  "formula": "1 - model_mean_square_error / persistence_mean_square_error";
  "state": "beating-persistence" | "not-beating-persistence" | "insufficient-samples" | "insufficient-reference" | "reference-without-error" | "no-forecast";
  "statement": string;
  "last_updated_sim_time": TelemetryNullableSimInstant;
  "freshness": TelemetryFreshness;
  "sound_speed_equation": TelemetrySoundSpeedEquation;
}) & (({
  "state"?: "beating-persistence" | "not-beating-persistence";
  "skill_score": number;
  "model_mean_square_error": number;
  "persistence_mean_square_error": number;
  "forecast_run_id"?: string;
  "reference_run_id"?: string;
}) | ({
  "state"?: "insufficient-samples" | "insufficient-reference" | "reference-without-error" | "no-forecast";
  "skill_score": null;
}));

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
  "namespace": "obs" | "ctl" | "cov" | "adv";
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

