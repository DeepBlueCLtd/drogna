// GENERATED — DO NOT EDIT.
// Source of truth: contracts/schemas/*.schema.json (Constitution III).
// Regenerate with: pnpm generate. CI fails on drift.

export const schemaDocuments: Record<string, Record<string, unknown>> = {
  "boundary-denial": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/boundary-denial.schema.json",
    "title": "drogna boundary denial",
    "description": "Published by the release gate (V2-C10) on its declared topic each time the default-deny policy refuses a request (SRD-v2 FR-38, D14). This is what makes a denial observable in the shell rather than a silent 403. It names the request and the rule and carries nothing else: never the body of anything, and never the contents of what was refused.",
    "type": "object",
    "required": [
      "component",
      "path",
      "method",
      "rule"
    ],
    "additionalProperties": false,
    "properties": {
      "component": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$",
        "description": "The gate's component id."
      },
      "path": {
        "type": "string",
        "description": "The relative path that was refused."
      },
      "method": {
        "type": "string",
        "description": "The HTTP method of the refused request."
      },
      "rule": {
        "type": "string",
        "description": "The rule that refused it, named: 'default deny at the boundary', or the specific refusal."
      }
    }
  },
  "bundle-manifest": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/bundle-manifest.schema.json",
    "title": "drogna bundle manifest",
    "description": "The sidecar written beside every offload bundle: what the bundle contains and what its bytes hash to. It is written with the bundle and never regenerated from a bundle that has been transferred, because a manifest recomputed after the fact would agree with whatever the file had become. Nothing here names a machine, a directory, a command or an instrument: the run is carried as an opaque reference derived from the run manifest digest, which ties the bundle to a run inside the boundary and says nothing outside it (FR-42).",
    "type": "object",
    "required": [
      "schema_version",
      "bundle_id",
      "run_reference",
      "run_manifest_digest",
      "format_version",
      "window",
      "members",
      "variables",
      "profile_count",
      "level_count"
    ],
    "additionalProperties": false,
    "properties": {
      "schema_version": {
        "type": "integer",
        "minimum": 1,
        "description": "Bumped when the shape changes in a way a reader must notice."
      },
      "bundle_id": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_.-]*$",
        "description": "Deterministic identifier derived from the run identity and the bundle's logical position — the window index — and from the format version, never from entropy or a host clock. Two packaging runs over one run manifest produce the same identifier for the same window."
      },
      "run_reference": {
        "type": "string",
        "pattern": "^[0-9a-f]{32}$",
        "description": "An opaque derivation of the run manifest digest. Sufficient to tie a bundle to a run inside the boundary; useless to a reader who does not hold the manifest."
      },
      "run_manifest_digest": {
        "type": "string",
        "pattern": "^sha256:[0-9a-f]{64}$",
        "description": "The digest of the run manifest the bundle was packaged from, so anything computed from the bundle can still be scored against the ground truth that produced it. Held here, in the sidecar, and not written into the exported file."
      },
      "format_version": {
        "type": "string",
        "minLength": 1,
        "description": "The export format this bundle was written by. Byte-identity is claimed for a fixed code and format version, so the claim names the version it is about."
      },
      "window": {
        "title": "The simulation time window",
        "description": "Which slice of the run this bundle covers. Boundaries are counted from the run's simulation epoch, so the index is a property of the manifest.",
        "type": "object",
        "required": [
          "index",
          "start_sim_time",
          "end_sim_time"
        ],
        "additionalProperties": false,
        "properties": {
          "index": {
            "type": "integer",
            "minimum": 0
          },
          "start_sim_time": {
            "type": "string",
            "description": "Simulation instant the window opens at, inclusive, ISO-8601 UTC with microsecond precision."
          },
          "end_sim_time": {
            "type": "string",
            "description": "Simulation instant the window closes at, exclusive, ISO-8601 UTC with microsecond precision."
          }
        }
      },
      "members": {
        "type": "array",
        "minItems": 1,
        "description": "Every file in the bundle, with its digest and its byte length. A member list of one is the ordinary case; the shape admits more so that a bundle gaining a second file does not become a different kind of thing.",
        "items": {
          "title": "Bundle member",
          "type": "object",
          "required": [
            "name",
            "digest",
            "byte_length"
          ],
          "additionalProperties": false,
          "properties": {
            "name": {
              "type": "string",
              "minLength": 1,
              "description": "The member's name within the bundle. A name, not a location: no directory reaches this document."
            },
            "digest": {
              "type": "string",
              "pattern": "^sha256:[0-9a-f]{64}$"
            },
            "byte_length": {
              "type": "integer",
              "minimum": 0
            }
          }
        }
      },
      "variables": {
        "type": "array",
        "minItems": 1,
        "uniqueItems": true,
        "items": {
          "type": "string",
          "minLength": 1
        },
        "description": "The variables the export carries, so a reader can tell what is inside without opening it."
      },
      "profile_count": {
        "type": "integer",
        "minimum": 1,
        "description": "How many profiles the bundle holds. A window with none produces no bundle at all rather than an empty one."
      },
      "level_count": {
        "type": "integer",
        "minimum": 1,
        "description": "Total depth levels across every profile: the length of the ragged sample dimension."
      }
    },
    "examples": [
      {
        "schema_version": 1,
        "bundle_id": "b-3f2a1c0d9e8b7a65",
        "run_reference": "9c1d4e6f8a0b2c3d4e5f60718293a4b5",
        "run_manifest_digest": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        "format_version": "drogna-trajectory-profile-1",
        "window": {
          "index": 0,
          "start_sim_time": "2026-09-01T00:00:00.000000Z",
          "end_sim_time": "2026-09-01T01:00:00.000000Z"
        },
        "members": [
          {
            "name": "b-3f2a1c0d9e8b7a65.nc",
            "digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
            "byte_length": 4096
          }
        ],
        "variables": [
          "sea_water_temperature",
          "sea_water_practical_salinity",
          "sea_water_pressure"
        ],
        "profile_count": 3,
        "level_count": 11
      }
    ]
  },
  "clock": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/clock.schema.json",
    "title": "drogna simulation time sample",
    "description": "The message published on ctl/clock at the clock's declared cadence (ADR-0009). Consumers, the browser included, receive simulation time by subscribing; the clock's HTTP interface exists only for setting the rate and for a component catching up at startup. The value of tick n is epoch + n * tick_interval and is unaffected by rate, so a rate change alters the pace of these messages and never their contents. A consumer keys its behaviour to the tick index and the simulation time, never to a count of messages received: in accelerated mode a slow consumer sees gaps, and that is normal. One exception is stated rather than implied: a command that stops emission (a rate of zero, a pause) is acknowledged by re-publishing the tick in force with the new rate and mode, because a clock that will emit no further tick has no other way to say so. Such a sample repeats a tick index already seen; its sim_time is unchanged, only rate and mode differ.",
    "type": "object",
    "required": [
      "run_id",
      "tick",
      "sim_time",
      "mode",
      "rate"
    ],
    "additionalProperties": false,
    "properties": {
      "run_id": {
        "type": "string",
        "description": "The run this sample belongs to, matching the run manifest."
      },
      "tick": {
        "type": "integer",
        "minimum": 0,
        "description": "Tick index. Non-decreasing within a run: strictly increasing across emissions, with the one repeat being the acknowledgement of a command that stopped emission. Gaps are possible for a slow subscriber and are never filled in by the consumer."
      },
      "sim_time": {
        "type": "string",
        "description": "Simulation time of this tick, ISO-8601 UTC with microsecond precision."
      },
      "mode": {
        "type": "string",
        "enum": [
          "realtime",
          "accelerated",
          "paused",
          "lockstep"
        ],
        "description": "Byte-identical replay is claimed for lockstep only; the free-running modes reproduce drawn values but not interleaving."
      },
      "rate": {
        "type": "number",
        "minimum": 0,
        "description": "Emission rate. Zero is a legitimate rate: it pins the clock for screenshot capture (FR-53) and stops simulated time without stopping anything else."
      }
    }
  },
  "config.boundary": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.boundary.schema.json",
    "title": "drogna release-gate configuration (V2-C10)",
    "description": "The release gate at the seam (SRD-v2 FR-38, Constitution X, D14): all seam HTTP traffic passes it before any query component sees the request. Default deny; exposure is opt-in one path prefix at a time; a denial is observable — the gate publishes each on its declared topic, which is what lights the denial in the shell. In V3 this policy moves verbatim to a real proxy, which is why it is configuration and not code.",
    "type": "object",
    "required": [
      "id",
      "api_prefix",
      "allow_prefixes",
      "topics",
      "heartbeat"
    ],
    "additionalProperties": false,
    "properties": {
      "id": {
        "$ref": "config.common.schema.json#/$defs/component_id"
      },
      "api_prefix": {
        "$ref": "config.common.schema.json#/$defs/relative_path",
        "description": "The path prefix under which the seam answers HTTP at all; the fetch shim routes only these requests through the gate."
      },
      "allow_prefixes": {
        "type": "array",
        "items": {
          "$ref": "config.common.schema.json#/$defs/relative_path"
        },
        "description": "The cleared prefixes. Everything under api_prefix and not under one of these is denied. Empty is a legitimate policy: a boundary with nothing released."
      },
      "topics": {
        "type": "object",
        "required": [
          "denial"
        ],
        "additionalProperties": false,
        "properties": {
          "denial": {
            "$ref": "config.common.schema.json#/$defs/topic",
            "description": "Where each denial is announced: path and the rule that refused it, never the body of anything."
          }
        }
      },
      "heartbeat": {
        "$ref": "config.common.schema.json#/$defs/heartbeat"
      }
    }
  },
  "config.broker": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.broker.schema.json",
    "title": "drogna broker configuration (V2-C03)",
    "description": "The broker component's configuration document: the role-based rules that confine every client to its declared namespaces (SRD-v2 FR-22, D12). Publish is default-deny — a role may publish only under its declared filters, and a refusal names the role and the topic. Subscription follows the same declarations. The shell's identity may read every namespace and may never publish (E13): that is a rule in this document, not a special case in code.",
    "type": "object",
    "required": [
      "id",
      "roles",
      "heartbeat"
    ],
    "additionalProperties": false,
    "properties": {
      "id": {
        "$ref": "config.common.schema.json#/$defs/component_id"
      },
      "roles": {
        "type": "array",
        "minItems": 1,
        "description": "Every role a client may connect under. A connection under an undeclared role is refused by name.",
        "items": {
          "type": "object",
          "required": [
            "role",
            "publish",
            "subscribe"
          ],
          "additionalProperties": false,
          "properties": {
            "role": {
              "$ref": "config.common.schema.json#/$defs/component_id"
            },
            "publish": {
              "type": "array",
              "items": {
                "$ref": "config.common.schema.json#/$defs/topic_filter"
              },
              "description": "Filters this role may publish under. Empty means the role may never publish."
            },
            "subscribe": {
              "type": "array",
              "items": {
                "$ref": "config.common.schema.json#/$defs/topic_filter"
              },
              "description": "Filters this role may subscribe with. Empty means the role may never subscribe."
            }
          }
        }
      },
      "heartbeat": {
        "$ref": "config.common.schema.json#/$defs/heartbeat"
      }
    }
  },
  "config.clock": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.clock.schema.json",
    "title": "drogna clock configuration (V2-C01)",
    "description": "The one configuration document the simulation clock receives at construction (Constitution IV). The clock is the single source of time (SRD-v2 FR-09): it publishes samples of clock.schema.json shape on its declared topic, supports realtime, accelerated, paused and lockstep modes with bounded arbitrary rates and a step operation, and exposes exactly one HTTP interface — setting the rate — as in V1 (see clock.schema.json). Tick values follow from epoch and interval alone and are unaffected by rate.",
    "type": "object",
    "required": [
      "id",
      "epoch",
      "tick_interval_us",
      "mode",
      "rate",
      "min_rate",
      "max_rate",
      "topics",
      "http",
      "heartbeat"
    ],
    "additionalProperties": false,
    "properties": {
      "id": {
        "$ref": "config.common.schema.json#/$defs/component_id"
      },
      "epoch": {
        "type": "string",
        "description": "Simulation epoch, ISO-8601 UTC with microsecond precision."
      },
      "tick_interval_us": {
        "type": "integer",
        "exclusiveMinimum": 0,
        "description": "Simulation microseconds between ticks."
      },
      "mode": {
        "type": "string",
        "enum": [
          "realtime",
          "accelerated",
          "paused",
          "lockstep"
        ]
      },
      "rate": {
        "type": "number",
        "minimum": 0,
        "description": "Initial emission rate. Zero is a legitimate rate: it pins the clock (capture, FR-19) without stopping anything else."
      },
      "min_rate": {
        "type": "number",
        "minimum": 0
      },
      "max_rate": {
        "type": "number",
        "exclusiveMinimum": 0,
        "description": "A rate command outside [min_rate, max_rate] is refused with the bound named (FR-36's discipline, present from 101)."
      },
      "topics": {
        "type": "object",
        "required": [
          "clock"
        ],
        "additionalProperties": false,
        "properties": {
          "clock": {
            "$ref": "config.common.schema.json#/$defs/topic"
          }
        }
      },
      "http": {
        "type": "object",
        "required": [
          "rate_path"
        ],
        "additionalProperties": false,
        "properties": {
          "rate_path": {
            "$ref": "config.common.schema.json#/$defs/relative_path",
            "description": "The seam route for setting the rate: PUT with a JSON body {\"rate\": number}."
          }
        }
      },
      "heartbeat": {
        "$ref": "config.common.schema.json#/$defs/heartbeat"
      }
    }
  },
  "config.common": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.common.schema.json",
    "title": "drogna configuration vocabulary",
    "description": "Shared $defs for the V2 component configuration documents. Constitution IV: no component source carries a literal path, URL or topic string, so every such string arrives through a configuration document validated against one of the config.* masters, and the recurring shapes are defined once here. This file describes configuration only; message shapes crossing the seam have their own masters.",
    "$defs": {
      "topic": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_/-]*$",
        "description": "A concrete MQTT-semantics topic: segments joined by '/', no wildcards."
      },
      "topic_filter": {
        "type": "string",
        "pattern": "^([a-z0-9_+-]+|#)(/([a-z0-9_+-]+|#))*$",
        "description": "An MQTT-semantics subscription filter: '+' matches one segment, '#' the remainder and only as the last segment."
      },
      "relative_path": {
        "type": "string",
        "pattern": "^/[A-Za-z0-9_/.-]*$",
        "description": "A relative, same-origin URL path. Absolute URLs are forbidden in client configuration by SRD-v2 FR-04: relative and same-origin is what makes the page portable across any host and clearance."
      },
      "component_id": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$"
      },
      "heartbeat": {
        "type": "object",
        "required": [
          "topic",
          "interval_seconds",
          "liveness_window_seconds"
        ],
        "additionalProperties": false,
        "description": "How a component announces it is alive. Cadence and window are host seconds by ADR-0006: liveness is a fact about the machinery with no simulation-time answer even in principle.",
        "properties": {
          "topic": {
            "$ref": "#/$defs/topic"
          },
          "interval_seconds": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "liveness_window_seconds": {
            "type": "number",
            "exclusiveMinimum": 0
          }
        }
      }
    }
  },
  "config.coverage-store": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.coverage-store.schema.json",
    "title": "drogna coverage store configuration (V2-C08)",
    "description": "The coverage store's configuration document. The store holds gridded fields across three eras behind a store interface, admits writes only through its staged-publication seam with the digest check of SRD-v2 FR-13, announces each publication on its declared topic, and serves its inventory on its declared seam path.",
    "type": "object",
    "required": [
      "id",
      "topics",
      "http",
      "heartbeat"
    ],
    "additionalProperties": false,
    "properties": {
      "id": {
        "$ref": "config.common.schema.json#/$defs/component_id"
      },
      "topics": {
        "type": "object",
        "required": [
          "clock",
          "published"
        ],
        "additionalProperties": false,
        "properties": {
          "clock": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "published": {
            "$ref": "config.common.schema.json#/$defs/topic"
          }
        }
      },
      "http": {
        "type": "object",
        "required": [
          "holdings_path"
        ],
        "additionalProperties": false,
        "properties": {
          "holdings_path": {
            "$ref": "config.common.schema.json#/$defs/relative_path"
          }
        }
      },
      "heartbeat": {
        "$ref": "config.common.schema.json#/$defs/heartbeat"
      }
    }
  },
  "config.env-generator": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.env-generator.schema.json",
    "title": "drogna environment generator configuration (V2-C02)",
    "description": "The generator's one configuration document: the domain and grids, the background profiles, the four features' NOMINAL parameters with the jitter each is authored under, and the timescale authoring (SRD-v2 FR-20, FR-21; ADR-0002). The jittered values the run actually used are recorded in the ground-truth manifest, never here: this document is what every run of the scenario shares, the manifest is what one run drew.",
    "type": "object",
    "required": [
      "id",
      "stream",
      "topics",
      "heartbeat",
      "domain",
      "nowcast",
      "archive",
      "background",
      "features",
      "timescale"
    ],
    "additionalProperties": false,
    "properties": {
      "id": {
        "$ref": "config.common.schema.json#/$defs/component_id"
      },
      "stream": {
        "type": "string",
        "minLength": 1,
        "description": "The RNG stream name the jitter draws from."
      },
      "topics": {
        "type": "object",
        "required": [
          "clock"
        ],
        "additionalProperties": false,
        "properties": {
          "clock": {
            "$ref": "config.common.schema.json#/$defs/topic"
          }
        }
      },
      "heartbeat": {
        "$ref": "config.common.schema.json#/$defs/heartbeat"
      },
      "domain": {
        "type": "object",
        "required": [
          "latitude",
          "longitude",
          "depth"
        ],
        "additionalProperties": false,
        "properties": {
          "latitude": {
            "$ref": "#/$defs/extent"
          },
          "longitude": {
            "$ref": "#/$defs/extent"
          },
          "depth": {
            "$ref": "#/$defs/extent"
          }
        }
      },
      "nowcast": {
        "type": "object",
        "required": [
          "grid",
          "interval_ticks",
          "time_steps",
          "step_seconds"
        ],
        "additionalProperties": false,
        "description": "The fine grid, replaced on a cadence counted in clock ticks; its manifest records the derivation each time.",
        "properties": {
          "grid": {
            "$ref": "#/$defs/grid_counts"
          },
          "interval_ticks": {
            "type": "integer",
            "exclusiveMinimum": 0
          },
          "time_steps": {
            "type": "integer",
            "minimum": 2
          },
          "step_seconds": {
            "type": "number",
            "exclusiveMinimum": 0
          }
        }
      },
      "archive": {
        "type": "object",
        "required": [
          "grid",
          "months",
          "month_seconds"
        ],
        "additionalProperties": false,
        "description": "The multi-decade monthly historic archive, authored deterministically at provisioning through the publisher's path (FR-11, FR-21). Months are a fixed synthetic length so the time axis has constant step.",
        "properties": {
          "grid": {
            "$ref": "#/$defs/grid_counts"
          },
          "months": {
            "type": "integer",
            "minimum": 24
          },
          "month_seconds": {
            "type": "number",
            "exclusiveMinimum": 0
          }
        }
      },
      "background": {
        "type": "object",
        "required": [
          "surface_temperature_c",
          "deep_temperature_c",
          "temperature_scale_depth_m",
          "surface_salinity_psu",
          "deep_salinity_psu",
          "salinity_scale_depth_m"
        ],
        "additionalProperties": false,
        "properties": {
          "surface_temperature_c": {
            "type": "number"
          },
          "deep_temperature_c": {
            "type": "number"
          },
          "temperature_scale_depth_m": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "surface_salinity_psu": {
            "type": "number"
          },
          "deep_salinity_psu": {
            "type": "number"
          },
          "salinity_scale_depth_m": {
            "type": "number",
            "exclusiveMinimum": 0
          }
        }
      },
      "features": {
        "type": "object",
        "required": [
          "eddy",
          "front",
          "thermocline",
          "moving"
        ],
        "additionalProperties": false,
        "properties": {
          "eddy": {
            "type": "object",
            "required": [
              "nominal",
              "jitter"
            ],
            "additionalProperties": false,
            "properties": {
              "nominal": {
                "type": "object",
                "required": [
                  "centre_latitude",
                  "centre_longitude",
                  "radius_km",
                  "strength_c",
                  "salinity_strength_psu",
                  "sign",
                  "depth_centre_m",
                  "depth_half_thickness_m"
                ],
                "additionalProperties": false,
                "properties": {
                  "centre_latitude": {
                    "type": "number"
                  },
                  "centre_longitude": {
                    "type": "number"
                  },
                  "radius_km": {
                    "type": "number",
                    "exclusiveMinimum": 0
                  },
                  "strength_c": {
                    "type": "number",
                    "exclusiveMinimum": 0
                  },
                  "salinity_strength_psu": {
                    "type": "number"
                  },
                  "sign": {
                    "type": "integer",
                    "enum": [
                      -1,
                      1
                    ]
                  },
                  "depth_centre_m": {
                    "type": "number"
                  },
                  "depth_half_thickness_m": {
                    "type": "number",
                    "exclusiveMinimum": 0
                  }
                }
              },
              "jitter": {
                "type": "object",
                "required": [
                  "centre_degrees",
                  "radius_km",
                  "strength_c"
                ],
                "additionalProperties": false,
                "description": "Half-widths of the uniform jitter each parameter is drawn within. AT-03's error bound derives from what is written here and in the manifest, never from a number typed into a test.",
                "properties": {
                  "centre_degrees": {
                    "type": "number",
                    "minimum": 0
                  },
                  "radius_km": {
                    "type": "number",
                    "minimum": 0
                  },
                  "strength_c": {
                    "type": "number",
                    "minimum": 0
                  }
                }
              }
            }
          },
          "front": {
            "type": "object",
            "required": [
              "nominal",
              "jitter"
            ],
            "additionalProperties": false,
            "properties": {
              "nominal": {
                "type": "object",
                "required": [
                  "anchor_latitude",
                  "anchor_longitude",
                  "bearing_degrees",
                  "sharpness_km",
                  "amplitude_c",
                  "salinity_amplitude_psu",
                  "depth_scale_m"
                ],
                "additionalProperties": false,
                "properties": {
                  "anchor_latitude": {
                    "type": "number"
                  },
                  "anchor_longitude": {
                    "type": "number"
                  },
                  "bearing_degrees": {
                    "type": "number"
                  },
                  "sharpness_km": {
                    "type": "number",
                    "exclusiveMinimum": 0
                  },
                  "amplitude_c": {
                    "type": "number",
                    "exclusiveMinimum": 0
                  },
                  "salinity_amplitude_psu": {
                    "type": "number"
                  },
                  "depth_scale_m": {
                    "type": "number",
                    "exclusiveMinimum": 0
                  }
                }
              },
              "jitter": {
                "type": "object",
                "required": [
                  "anchor_degrees",
                  "bearing_degrees"
                ],
                "additionalProperties": false,
                "properties": {
                  "anchor_degrees": {
                    "type": "number",
                    "minimum": 0
                  },
                  "bearing_degrees": {
                    "type": "number",
                    "minimum": 0
                  }
                }
              }
            }
          },
          "thermocline": {
            "type": "object",
            "required": [
              "nominal",
              "jitter"
            ],
            "additionalProperties": false,
            "properties": {
              "nominal": {
                "type": "object",
                "required": [
                  "depth_m",
                  "thickness_m",
                  "temperature_drop_c",
                  "salinity_rise_psu"
                ],
                "additionalProperties": false,
                "properties": {
                  "depth_m": {
                    "type": "number"
                  },
                  "thickness_m": {
                    "type": "number",
                    "exclusiveMinimum": 0
                  },
                  "temperature_drop_c": {
                    "type": "number",
                    "exclusiveMinimum": 0
                  },
                  "salinity_rise_psu": {
                    "type": "number"
                  }
                }
              },
              "jitter": {
                "type": "object",
                "required": [
                  "depth_m",
                  "temperature_drop_c"
                ],
                "additionalProperties": false,
                "properties": {
                  "depth_m": {
                    "type": "number",
                    "minimum": 0
                  },
                  "temperature_drop_c": {
                    "type": "number",
                    "minimum": 0
                  }
                }
              }
            }
          },
          "moving": {
            "type": "object",
            "required": [
              "nominal",
              "jitter"
            ],
            "additionalProperties": false,
            "properties": {
              "nominal": {
                "type": "object",
                "required": [
                  "centre_latitude",
                  "centre_longitude",
                  "radius_km",
                  "strength_c",
                  "salinity_strength_psu",
                  "sign",
                  "depth_centre_m",
                  "depth_half_thickness_m",
                  "drift_east_km_per_day",
                  "drift_north_km_per_day"
                ],
                "additionalProperties": false,
                "properties": {
                  "centre_latitude": {
                    "type": "number"
                  },
                  "centre_longitude": {
                    "type": "number"
                  },
                  "radius_km": {
                    "type": "number",
                    "exclusiveMinimum": 0
                  },
                  "strength_c": {
                    "type": "number",
                    "exclusiveMinimum": 0
                  },
                  "salinity_strength_psu": {
                    "type": "number"
                  },
                  "sign": {
                    "type": "integer",
                    "enum": [
                      -1,
                      1
                    ]
                  },
                  "depth_centre_m": {
                    "type": "number"
                  },
                  "depth_half_thickness_m": {
                    "type": "number",
                    "exclusiveMinimum": 0
                  },
                  "drift_east_km_per_day": {
                    "type": "number"
                  },
                  "drift_north_km_per_day": {
                    "type": "number"
                  }
                }
              },
              "jitter": {
                "type": "object",
                "required": [
                  "centre_degrees",
                  "drift_km_per_day"
                ],
                "additionalProperties": false,
                "properties": {
                  "centre_degrees": {
                    "type": "number",
                    "minimum": 0
                  },
                  "drift_km_per_day": {
                    "type": "number",
                    "minimum": 0
                  }
                }
              }
            }
          }
        }
      },
      "timescale": {
        "type": "object",
        "required": [
          "background_seconds",
          "floor_ratio",
          "feature_seconds"
        ],
        "additionalProperties": false,
        "description": "ADR-0002: tau is authored per feature over a background and evaluated per location; the moving feature's tau advects with it because membership shares the anomaly's geometry.",
        "properties": {
          "background_seconds": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "floor_ratio": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "feature_seconds": {
            "type": "object",
            "required": [
              "eddy",
              "front",
              "thermocline",
              "moving"
            ],
            "additionalProperties": false,
            "properties": {
              "eddy": {
                "type": "number",
                "exclusiveMinimum": 0
              },
              "front": {
                "type": "number",
                "exclusiveMinimum": 0
              },
              "thermocline": {
                "type": "number",
                "exclusiveMinimum": 0
              },
              "moving": {
                "type": "number",
                "exclusiveMinimum": 0
              }
            }
          }
        }
      }
    },
    "$defs": {
      "extent": {
        "type": "object",
        "required": [
          "minimum",
          "maximum"
        ],
        "additionalProperties": false,
        "properties": {
          "minimum": {
            "type": "number"
          },
          "maximum": {
            "type": "number"
          }
        }
      },
      "grid_counts": {
        "type": "object",
        "required": [
          "longitude",
          "latitude",
          "depth"
        ],
        "additionalProperties": false,
        "properties": {
          "longitude": {
            "type": "integer",
            "minimum": 2
          },
          "latitude": {
            "type": "integer",
            "minimum": 2
          },
          "depth": {
            "type": "integer",
            "minimum": 2
          }
        }
      }
    }
  },
  "config.feature-store": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.feature-store.schema.json",
    "title": "drogna feature store configuration (V2-C07)",
    "description": "The read-only spatial reference store, provisioned at scenario start from the geometries declared here and immutable for the rest of the run (SRD-v2 FR-12). Reference geometry only: the domain, the loiter region, and any named reference area — never anything the harness did not place.",
    "type": "object",
    "required": [
      "id",
      "topics",
      "heartbeat",
      "features"
    ],
    "additionalProperties": false,
    "properties": {
      "id": {
        "$ref": "config.common.schema.json#/$defs/component_id"
      },
      "topics": {
        "type": "object",
        "required": [
          "clock"
        ],
        "additionalProperties": false,
        "properties": {
          "clock": {
            "$ref": "config.common.schema.json#/$defs/topic"
          }
        }
      },
      "heartbeat": {
        "$ref": "config.common.schema.json#/$defs/heartbeat"
      },
      "features": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "object",
          "required": [
            "feature_id",
            "name",
            "kind",
            "geometry"
          ],
          "additionalProperties": false,
          "properties": {
            "feature_id": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9_.-]*$"
            },
            "name": {
              "type": "string",
              "minLength": 1
            },
            "kind": {
              "type": "string",
              "enum": [
                "domain",
                "loiter_region",
                "reference_area"
              ]
            },
            "geometry": {
              "type": "object",
              "required": [
                "type",
                "coordinates"
              ],
              "additionalProperties": false,
              "description": "GeoJSON geometry, Polygon only at this beat; the query seam's subset statement says so when it serves these (feature 104).",
              "properties": {
                "type": {
                  "type": "string",
                  "const": "Polygon"
                },
                "coordinates": {
                  "type": "array",
                  "minItems": 1,
                  "maxItems": 1,
                  "description": "A single ring: the outer boundary, closed, no holes — the subset grows one capability at a time (E9).",
                  "items": {
                    "type": "array",
                    "minItems": 4,
                    "items": {
                      "type": "array",
                      "minItems": 2,
                      "maxItems": 2,
                      "items": {
                        "type": "number"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  "config.ingest": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.ingest.schema.json",
    "title": "drogna ingestion seam configuration (V2-C05)",
    "description": "The observation ingestion seam: subscribes to the observation namespace, validates every message against its master, refuses what fails with the fault named and counts it observably, and is the observation store's sole writer (SRD-v2 FR-22). Redelivery is a no-op: the deterministic observation_id is the store's key (at-least-once carried from V1).",
    "type": "object",
    "required": [
      "id",
      "topics",
      "heartbeat"
    ],
    "additionalProperties": false,
    "properties": {
      "id": {
        "$ref": "config.common.schema.json#/$defs/component_id"
      },
      "topics": {
        "type": "object",
        "required": [
          "clock",
          "observations"
        ],
        "additionalProperties": false,
        "properties": {
          "clock": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "observations": {
            "$ref": "config.common.schema.json#/$defs/topic_filter"
          }
        }
      },
      "heartbeat": {
        "$ref": "config.common.schema.json#/$defs/heartbeat"
      }
    }
  },
  "config.model-runner": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.model-runner.schema.json",
    "title": "drogna model runner configuration (V2-C13)",
    "description": "The model runner (SRD-v2 FR-30): initialises from the current now-cast through the store interface, advects analytically with seeded noise behind the kernel port, runs a small ensemble, and publishes the ensemble mean as the forecast with the spread as the uncertainty field — both through the coverage store's digest-checked seam, announced on the control namespace.",
    "type": "object",
    "required": [
      "id",
      "stream",
      "topics",
      "heartbeat",
      "kernel",
      "steps",
      "step_seconds",
      "advection",
      "noise_std"
    ],
    "additionalProperties": false,
    "properties": {
      "id": {
        "$ref": "config.common.schema.json#/$defs/component_id"
      },
      "stream": {
        "type": "string",
        "minLength": 1
      },
      "topics": {
        "type": "object",
        "required": [
          "clock",
          "run_request",
          "run_started",
          "run_published"
        ],
        "additionalProperties": false,
        "properties": {
          "clock": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "run_request": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "run_started": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "run_published": {
            "$ref": "config.common.schema.json#/$defs/topic"
          }
        }
      },
      "heartbeat": {
        "$ref": "config.common.schema.json#/$defs/heartbeat"
      },
      "kernel": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$",
        "description": "The kernel implementation selected behind the port (Constitution VI); named in every run-started message."
      },
      "steps": {
        "type": "integer",
        "minimum": 2
      },
      "step_seconds": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "advection": {
        "type": "object",
        "required": [
          "east_km_per_day",
          "north_km_per_day"
        ],
        "additionalProperties": false,
        "description": "The kernel's advection velocity: a modelling assumption, deliberately not the true drift — forecast error is supposed to grow.",
        "properties": {
          "east_km_per_day": {
            "type": "number"
          },
          "north_km_per_day": {
            "type": "number"
          }
        }
      },
      "noise_std": {
        "type": "object",
        "required": [
          "temperature",
          "salinity"
        ],
        "additionalProperties": false,
        "description": "Per-member, per-step noise standard deviations, drawn from this component's stream.",
        "properties": {
          "temperature": {
            "type": "number",
            "minimum": 0
          },
          "salinity": {
            "type": "number",
            "minimum": 0
          }
        }
      }
    }
  },
  "config.monitor": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.monitor.schema.json",
    "title": "drogna monitor configuration (V2-C11)",
    "description": "The monitor (SRD-v2 FR-30): subscribes to the observation namespace, pairs co-located temperature and salinity samples, derives sound speed by the one implementation, scores the residual against the current forecast instance, and raises a divergence event only on sustained persistence — never a single spike. Evidence gathered against a superseded forecast is discarded, not carried.",
    "type": "object",
    "required": [
      "id",
      "topics",
      "heartbeat",
      "pairs",
      "threshold_m_per_s",
      "persistence_count",
      "region"
    ],
    "additionalProperties": false,
    "properties": {
      "id": {
        "$ref": "config.common.schema.json#/$defs/component_id"
      },
      "topics": {
        "type": "object",
        "required": [
          "clock",
          "observations",
          "divergence"
        ],
        "additionalProperties": false,
        "properties": {
          "clock": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "observations": {
            "$ref": "config.common.schema.json#/$defs/topic_filter"
          },
          "divergence": {
            "$ref": "config.common.schema.json#/$defs/topic"
          }
        }
      },
      "heartbeat": {
        "$ref": "config.common.schema.json#/$defs/heartbeat"
      },
      "pairs": {
        "type": "array",
        "minItems": 1,
        "description": "Which datastreams form a sound-speed sample: a temperature and a salinity series at one depth on one platform.",
        "items": {
          "type": "object",
          "required": [
            "thing_id",
            "temperature_datastream",
            "salinity_datastream",
            "depth_m"
          ],
          "additionalProperties": false,
          "properties": {
            "thing_id": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9_.-]*$"
            },
            "temperature_datastream": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9_.-]*$"
            },
            "salinity_datastream": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9_.-]*$"
            },
            "depth_m": {
              "type": "number",
              "minimum": 0
            }
          }
        }
      },
      "threshold_m_per_s": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "persistence_count": {
        "type": "integer",
        "minimum": 2,
        "description": "Consecutive breaching samples before a divergence is raised: never a single spike."
      },
      "region": {
        "type": "object",
        "required": [
          "radius_m",
          "depth_pad_m"
        ],
        "additionalProperties": false,
        "description": "How the diverged region is stated: centred on the breaching samples' mean position, with this radius and this pad about the pair's depth.",
        "properties": {
          "radius_m": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "depth_pad_m": {
            "type": "number",
            "minimum": 0
          }
        }
      }
    }
  },
  "config.observation-store": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.observation-store.schema.json",
    "title": "drogna observation store configuration (V2-C06)",
    "description": "The observation store: in-memory point observations behind a store interface, written only by the ingestion seam, keyed by the deterministic observation_id so redelivery is a no-op. Its heartbeat carries its row count, which is how the shell can say what it holds without reaching past the seam.",
    "type": "object",
    "required": [
      "id",
      "topics",
      "heartbeat"
    ],
    "additionalProperties": false,
    "properties": {
      "id": {
        "$ref": "config.common.schema.json#/$defs/component_id"
      },
      "topics": {
        "type": "object",
        "required": [
          "clock"
        ],
        "additionalProperties": false,
        "properties": {
          "clock": {
            "$ref": "config.common.schema.json#/$defs/topic"
          }
        }
      },
      "heartbeat": {
        "$ref": "config.common.schema.json#/$defs/heartbeat"
      }
    }
  },
  "config.query": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.query.schema.json",
    "title": "drogna query components configuration (V2-C09)",
    "description": "The query components: OGC API-EDR (CoverageJSON) over the coverage store and OGC SensorThings (Part 1, Sensing, read-only) over the observation store, each a stated honest subset served through the seam and the release gate (SRD-v2 FR-26 to FR-29). The prefixes below are what the boundary's allow list must name for the collections to be released at all.",
    "type": "object",
    "required": [
      "id",
      "topics",
      "http",
      "heartbeat"
    ],
    "additionalProperties": false,
    "properties": {
      "id": {
        "$ref": "config.common.schema.json#/$defs/component_id"
      },
      "topics": {
        "type": "object",
        "required": [
          "clock"
        ],
        "additionalProperties": false,
        "properties": {
          "clock": {
            "$ref": "config.common.schema.json#/$defs/topic"
          }
        }
      },
      "http": {
        "type": "object",
        "required": [
          "edr_prefix",
          "st_prefix",
          "subsets_path"
        ],
        "additionalProperties": false,
        "properties": {
          "edr_prefix": {
            "$ref": "config.common.schema.json#/$defs/relative_path"
          },
          "st_prefix": {
            "$ref": "config.common.schema.json#/$defs/relative_path"
          },
          "subsets_path": {
            "$ref": "config.common.schema.json#/$defs/relative_path",
            "description": "Where the subset statement (query-subsets.schema.json) is served, on the control plane."
          }
        }
      },
      "heartbeat": {
        "$ref": "config.common.schema.json#/$defs/heartbeat"
      }
    }
  },
  "config.run": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.run.schema.json",
    "title": "drogna run configuration",
    "description": "The whole configuration document the composition root reads: one sub-document per component, each validated against its own master before that component does any other work (Constitution IV). This is configuration, not state: everything that varies between runs of the same configuration lives in the run manifest (run-manifest.schema.json), and a replay consults the manifest plus this document's digests, never this document's values.",
    "type": "object",
    "required": [
      "schema_version",
      "scenario",
      "clock",
      "broker",
      "boundary",
      "env_generator",
      "coverage_store",
      "sensors",
      "ingest",
      "observation_store",
      "feature_store",
      "query",
      "monitor",
      "scheduler",
      "model_runner",
      "shell"
    ],
    "additionalProperties": false,
    "properties": {
      "schema_version": {
        "type": "integer",
        "const": 1
      },
      "scenario": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]*$",
        "description": "Names the scenario this configuration describes; joins the root seed in deriving the run id."
      },
      "clock": {
        "$ref": "config.clock.schema.json"
      },
      "broker": {
        "$ref": "config.broker.schema.json"
      },
      "boundary": {
        "$ref": "config.boundary.schema.json"
      },
      "env_generator": {
        "$ref": "config.env-generator.schema.json"
      },
      "coverage_store": {
        "$ref": "config.coverage-store.schema.json"
      },
      "sensors": {
        "$ref": "config.sensors.schema.json"
      },
      "ingest": {
        "$ref": "config.ingest.schema.json"
      },
      "observation_store": {
        "$ref": "config.observation-store.schema.json"
      },
      "query": {
        "$ref": "config.query.schema.json"
      },
      "monitor": {
        "$ref": "config.monitor.schema.json"
      },
      "scheduler": {
        "$ref": "config.scheduler.schema.json"
      },
      "model_runner": {
        "$ref": "config.model-runner.schema.json"
      },
      "feature_store": {
        "$ref": "config.feature-store.schema.json"
      },
      "shell": {
        "$ref": "config.shell.schema.json"
      }
    }
  },
  "config.scheduler": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.scheduler.schema.json",
    "title": "drogna scheduler configuration (V2-C12)",
    "description": "The scheduler (SRD-v2 FR-30 to FR-32): decides whether a run is warranted. A divergence inside the minimum interval is declined by policy, observably; the cadence floor — the maximum interval — means the loop cannot be permanently becalmed (E1, resolved plan §9.7): when no run has been requested within it and the current run's validity has lapsed, a run is warranted on schedule alone, labelled 'scheduled'. One request may be in flight at a time; duplicates are declined by name.",
    "type": "object",
    "required": [
      "id",
      "topics",
      "heartbeat",
      "min_interval_ticks",
      "max_interval_ticks",
      "ensemble_size"
    ],
    "additionalProperties": false,
    "properties": {
      "id": {
        "$ref": "config.common.schema.json#/$defs/component_id"
      },
      "topics": {
        "type": "object",
        "required": [
          "clock",
          "divergence",
          "run_request",
          "run_published"
        ],
        "additionalProperties": false,
        "properties": {
          "clock": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "divergence": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "run_request": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "run_published": {
            "$ref": "config.common.schema.json#/$defs/topic"
          }
        }
      },
      "heartbeat": {
        "$ref": "config.common.schema.json#/$defs/heartbeat"
      },
      "min_interval_ticks": {
        "type": "integer",
        "exclusiveMinimum": 0,
        "description": "No two runs closer than this; a breach inside it is declined by policy, and the decline is legible (FR-32)."
      },
      "max_interval_ticks": {
        "type": "integer",
        "exclusiveMinimum": 0,
        "description": "The cadence floor (FR-31): the interval after which, with the current run's validity lapsed (or no run at all), a run is warranted on schedule alone."
      },
      "ensemble_size": {
        "type": "integer",
        "minimum": 2
      }
    }
  },
  "config.sensors": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.sensors.schema.json",
    "title": "drogna sensors configuration (V2-C04)",
    "description": "The sensors component's configuration document (SRD-v2 FR-22): one simulated platform loitering deterministically, carrying instruments that sample the true field on a tick cadence, add their declared seeded noise, and publish observations of observation.schema.json shape on obs/<thing_id>/<datastream_id>. Sensors read the clock and nothing else (ADR-0012, carried).",
    "type": "object",
    "required": [
      "id",
      "stream",
      "topics",
      "heartbeat",
      "platform",
      "sample_interval_ticks",
      "instruments"
    ],
    "additionalProperties": false,
    "properties": {
      "id": {
        "$ref": "config.common.schema.json#/$defs/component_id"
      },
      "stream": {
        "type": "string",
        "minLength": 1,
        "description": "The RNG stream sensor noise draws from."
      },
      "topics": {
        "type": "object",
        "required": [
          "clock",
          "observation_prefix"
        ],
        "additionalProperties": false,
        "properties": {
          "clock": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "observation_prefix": {
            "type": "string",
            "pattern": "^[a-z0-9]+$",
            "description": "The namespace observations are published under; the topic is <prefix>/<thing_id>/<datastream_id>."
          }
        }
      },
      "heartbeat": {
        "$ref": "config.common.schema.json#/$defs/heartbeat"
      },
      "platform": {
        "type": "object",
        "required": [
          "thing_id",
          "name",
          "description",
          "loiter"
        ],
        "additionalProperties": false,
        "description": "The sampling platform: a coordinate and a sampler, no history, no identity beyond its id (Constitution V).",
        "properties": {
          "thing_id": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9_.-]*$"
          },
          "name": {
            "type": "string",
            "minLength": 1
          },
          "description": {
            "type": "string",
            "minLength": 1
          },
          "loiter": {
            "type": "object",
            "required": [
              "centre_latitude",
              "centre_longitude",
              "radius_km",
              "period_seconds"
            ],
            "additionalProperties": false,
            "description": "The deterministic loiter: position is a pure function of simulation time. The planner's committed routes take over steering at feature 106.",
            "properties": {
              "centre_latitude": {
                "type": "number"
              },
              "centre_longitude": {
                "type": "number"
              },
              "radius_km": {
                "type": "number",
                "exclusiveMinimum": 0
              },
              "period_seconds": {
                "type": "number",
                "exclusiveMinimum": 0
              }
            }
          }
        }
      },
      "sample_interval_ticks": {
        "type": "integer",
        "exclusiveMinimum": 0
      },
      "instruments": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "object",
          "required": [
            "sensor_id",
            "datastream_id",
            "observed_property",
            "depth_m",
            "noise_std",
            "unit"
          ],
          "additionalProperties": false,
          "properties": {
            "sensor_id": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9_.-]*$"
            },
            "datastream_id": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9_.-]*$"
            },
            "observed_property": {
              "type": "string",
              "enum": [
                "temperature",
                "salinity",
                "pressure"
              ]
            },
            "depth_m": {
              "type": "number",
              "minimum": 0
            },
            "noise_std": {
              "type": "number",
              "minimum": 0,
              "description": "Gaussian noise standard deviation, declared here and restated in the sensor's SensorThings metadata so a stored value can be scored against the generator's field."
            },
            "unit": {
              "type": "object",
              "required": [
                "name",
                "symbol",
                "definition"
              ],
              "additionalProperties": false,
              "properties": {
                "name": {
                  "type": "string",
                  "minLength": 1
                },
                "symbol": {
                  "type": "string",
                  "minLength": 1
                },
                "definition": {
                  "type": "string",
                  "minLength": 1
                }
              }
            }
          }
        }
      }
    }
  },
  "config.shell": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.shell.schema.json",
    "title": "drogna shell configuration (V2-C19)",
    "description": "The shell's configuration document: the views it hosts, the declared component layout the System panel renders greyed-out (structure from declaration, illumination only from received heartbeats — Constitution VII), the topics it reads and the seam endpoints it calls. The shell connects under a role that may read every namespace and may never publish (E13).",
    "type": "object",
    "required": [
      "id",
      "role",
      "views",
      "components",
      "topics",
      "message_schemas",
      "endpoints",
      "liveness",
      "messages"
    ],
    "additionalProperties": false,
    "properties": {
      "id": {
        "$ref": "config.common.schema.json#/$defs/component_id"
      },
      "role": {
        "$ref": "config.common.schema.json#/$defs/component_id",
        "description": "The broker role the shell connects under. Its declaration in the broker's rules must carry an empty publish list."
      },
      "views": {
        "type": "array",
        "minItems": 1,
        "description": "The top-level tabs, in first-run order. The view id is the unit of URL addressability (FR-15): '#/view/<id>' opens the shell at that view.",
        "items": {
          "type": "object",
          "required": [
            "id",
            "label"
          ],
          "additionalProperties": false,
          "properties": {
            "id": {
              "$ref": "config.common.schema.json#/$defs/component_id"
            },
            "label": {
              "type": "string"
            }
          }
        }
      },
      "components": {
        "type": "array",
        "minItems": 1,
        "description": "The declared component layout, rendered from day one, greyed out until each is genuinely heard from. Declaration provides structure and captions only; nothing here can light anything.",
        "items": {
          "type": "object",
          "required": [
            "id",
            "label",
            "beat"
          ],
          "additionalProperties": false,
          "properties": {
            "id": {
              "$ref": "config.common.schema.json#/$defs/component_id"
            },
            "label": {
              "type": "string"
            },
            "beat": {
              "type": "integer",
              "minimum": 101,
              "maximum": 109,
              "description": "The narrative beat (feature number) at which this component lands."
            }
          }
        }
      },
      "topics": {
        "type": "object",
        "required": [
          "clock",
          "heartbeat",
          "holdings",
          "all"
        ],
        "additionalProperties": false,
        "properties": {
          "clock": {
            "$ref": "config.common.schema.json#/$defs/topic_filter"
          },
          "heartbeat": {
            "$ref": "config.common.schema.json#/$defs/topic_filter"
          },
          "holdings": {
            "$ref": "config.common.schema.json#/$defs/topic_filter"
          },
          "all": {
            "$ref": "config.common.schema.json#/$defs/topic_filter",
            "description": "The Messages panel's subscription: everything, because a display may not show cold where there is traffic (E13)."
          }
        }
      },
      "message_schemas": {
        "type": "array",
        "minItems": 1,
        "description": "Which master governs the messages on each topic, for the client-side validation and refusal counter of E4. A received message whose topic matches no entry is itself counted refused: every crossing has a master or is a finding.",
        "items": {
          "type": "object",
          "required": [
            "filter",
            "schema"
          ],
          "additionalProperties": false,
          "properties": {
            "filter": {
              "$ref": "config.common.schema.json#/$defs/topic_filter"
            },
            "schema": {
              "type": "string",
              "pattern": "^[a-z0-9][a-z0-9_.-]*$",
              "description": "The master's stem under contracts/schemas, e.g. 'heartbeat'."
            }
          }
        }
      },
      "endpoints": {
        "type": "object",
        "required": [
          "clock_rate",
          "holdings"
        ],
        "additionalProperties": false,
        "description": "Relative seam paths the shell calls. Relative and same-origin by requirement (FR-04).",
        "properties": {
          "clock_rate": {
            "$ref": "config.common.schema.json#/$defs/relative_path"
          },
          "holdings": {
            "$ref": "config.common.schema.json#/$defs/relative_path"
          }
        }
      },
      "liveness": {
        "type": "object",
        "required": [
          "default_window_seconds"
        ],
        "additionalProperties": false,
        "properties": {
          "default_window_seconds": {
            "type": "number",
            "exclusiveMinimum": 0,
            "description": "The window applied to a heartbeat that declares none of its own (heartbeat.schema.json): a tolerance, never a table of components."
          }
        }
      },
      "messages": {
        "type": "object",
        "required": [
          "buffer"
        ],
        "additionalProperties": false,
        "properties": {
          "buffer": {
            "type": "integer",
            "exclusiveMinimum": 0,
            "description": "How many recent seam messages the Messages panel retains for display."
          }
        }
      }
    }
  },
  "coverage-holding": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/coverage-holding.schema.json",
    "title": "drogna coverage holding",
    "description": "One holding in the coverage store (V2-C08): the descriptor a reader catalogues it by, with the ground-truth manifest that produced it embedded whole. Three eras (SRD-v2 FR-21): the historic archive authored at provisioning, the now-cast replaced on its cadence, and the forecast instances that accumulate once the loop turns — an instance's manifest names the model runner as its generator, and the run-level facts (validity, cause, ensemble) travel in the run-published announcement rather than a second descriptor (V1's coverage-run-manifest, retired with the reason in feature 105's record). The field digest is what publication was checked against (FR-13): a staged holding whose bytes do not match it was refused with the mismatch named and never became one of these.",
    "type": "object",
    "required": [
      "schema_version",
      "holding_id",
      "era",
      "run_id",
      "published_at",
      "field",
      "manifest"
    ],
    "additionalProperties": false,
    "properties": {
      "schema_version": {
        "type": "integer",
        "const": 1
      },
      "holding_id": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_.-]*$",
        "description": "Deterministic: derived from era, run and the tick of publication, never from entropy."
      },
      "era": {
        "type": "string",
        "enum": [
          "archive",
          "nowcast",
          "instance"
        ]
      },
      "run_id": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]*$"
      },
      "published_at": {
        "type": "object",
        "required": [
          "sim_time",
          "tick"
        ],
        "additionalProperties": false,
        "description": "Simulation time of publication, from the clock port. No host time.",
        "properties": {
          "sim_time": {
            "type": "string",
            "minLength": 1
          },
          "tick": {
            "type": "integer",
            "minimum": 0
          }
        }
      },
      "field": {
        "type": "object",
        "required": [
          "format",
          "sha256",
          "byte_length"
        ],
        "additionalProperties": false,
        "description": "The stored bytes: every variable's float32 values in the manifest's variable order, each in C order [time][depth][latitude][longitude], little-endian, concatenated.",
        "properties": {
          "format": {
            "type": "string",
            "const": "drogna-f32-v1"
          },
          "sha256": {
            "type": "string",
            "pattern": "^sha256:[0-9a-f]{64}$"
          },
          "byte_length": {
            "type": "integer",
            "minimum": 8
          }
        }
      },
      "manifest": {
        "$ref": "manifest.schema.json",
        "description": "The ground-truth manifest, embedded whole: a holding is inspectable without a second fetch, and AT-01/AT-03 score against exactly what the catalogue serves."
      }
    }
  },
  "coveragejson": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/coveragejson.schema.json",
    "title": "drogna CoverageJSON subset",
    "description": "The CoverageJSON the EDR component serves (SRD-v2 FR-26): the honest subset, stated — Coverage documents with Point and Trajectory domains, NdArray ranges, and the harness's two parameters. This master is the shape a response is validated against in tests and behind the debug flag; it deliberately closes what the harness emits rather than describing everything CoverageJSON permits, so an accidental extra field is a finding, not a feature.",
    "type": "object",
    "required": [
      "type",
      "domain",
      "parameters",
      "ranges"
    ],
    "additionalProperties": false,
    "properties": {
      "type": {
        "type": "string",
        "const": "Coverage"
      },
      "domain": {
        "type": "object",
        "required": [
          "type",
          "domainType",
          "axes",
          "referencing"
        ],
        "additionalProperties": false,
        "properties": {
          "type": {
            "type": "string",
            "const": "Domain"
          },
          "domainType": {
            "type": "string",
            "enum": [
              "Point",
              "Trajectory"
            ]
          },
          "axes": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "x": {
                "$ref": "#/$defs/numeric_axis"
              },
              "y": {
                "$ref": "#/$defs/numeric_axis"
              },
              "z": {
                "$ref": "#/$defs/numeric_axis"
              },
              "t": {
                "$ref": "#/$defs/string_axis"
              },
              "composite": {
                "type": "object",
                "required": [
                  "dataType",
                  "coordinates",
                  "values"
                ],
                "additionalProperties": false,
                "properties": {
                  "dataType": {
                    "type": "string",
                    "const": "tuple"
                  },
                  "coordinates": {
                    "type": "array",
                    "items": {
                      "type": "string",
                      "enum": [
                        "t",
                        "x",
                        "y",
                        "z"
                      ]
                    }
                  },
                  "values": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                      "type": "array",
                      "items": {
                        "type": [
                          "number",
                          "string"
                        ]
                      }
                    }
                  }
                }
              }
            }
          },
          "referencing": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "required": [
                "coordinates",
                "system"
              ],
              "additionalProperties": false,
              "properties": {
                "coordinates": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "system": {
                  "type": "object",
                  "required": [
                    "type"
                  ],
                  "additionalProperties": true,
                  "properties": {
                    "type": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        }
      },
      "parameters": {
        "type": "object",
        "additionalProperties": {
          "type": "object",
          "required": [
            "type",
            "description",
            "unit",
            "observedProperty"
          ],
          "additionalProperties": false,
          "properties": {
            "type": {
              "type": "string",
              "const": "Parameter"
            },
            "description": {
              "type": "object",
              "additionalProperties": {
                "type": "string"
              }
            },
            "unit": {
              "type": "object",
              "required": [
                "symbol"
              ],
              "additionalProperties": true,
              "properties": {
                "symbol": {
                  "type": "string"
                }
              }
            },
            "observedProperty": {
              "type": "object",
              "required": [
                "id",
                "label"
              ],
              "additionalProperties": false,
              "properties": {
                "id": {
                  "type": "string"
                },
                "label": {
                  "type": "object",
                  "additionalProperties": {
                    "type": "string"
                  }
                }
              }
            }
          }
        }
      },
      "ranges": {
        "type": "object",
        "additionalProperties": {
          "type": "object",
          "required": [
            "type",
            "dataType",
            "axisNames",
            "shape",
            "values"
          ],
          "additionalProperties": false,
          "properties": {
            "type": {
              "type": "string",
              "const": "NdArray"
            },
            "dataType": {
              "type": "string",
              "const": "float"
            },
            "axisNames": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "shape": {
              "type": "array",
              "items": {
                "type": "integer",
                "minimum": 0
              }
            },
            "values": {
              "type": "array",
              "items": {
                "type": [
                  "number",
                  "null"
                ]
              }
            }
          }
        }
      }
    },
    "$defs": {
      "numeric_axis": {
        "type": "object",
        "required": [
          "values"
        ],
        "additionalProperties": false,
        "properties": {
          "values": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "number"
            }
          }
        }
      },
      "string_axis": {
        "type": "object",
        "required": [
          "values"
        ],
        "additionalProperties": false,
        "properties": {
          "values": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "string"
            }
          }
        }
      }
    }
  },
  "divergence": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/divergence.schema.json",
    "title": "drogna divergence event",
    "description": "The message the monitor publishes on ctl/divergence when the current forecast has disagreed with the observations for long enough to be worth a model run. The residual is defined on sound speed and never on temperature (ADR-0005), and a single sample is never sufficient: the persistence evidence that justified the event travels with it so that a reader can judge the claim rather than trust it. The monitor raises requests only — nothing here instructs anybody to run anything, and the scheduler is free to decline.",
    "type": "object",
    "required": [
      "component",
      "scenario_run_id",
      "sim_time",
      "tick",
      "divergence_id",
      "forecast_run_id",
      "region",
      "residual",
      "persistence",
      "sound_speed_equation"
    ],
    "additionalProperties": false,
    "properties": {
      "component": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$",
        "description": "The component id of the monitor that raised it, matching config /component/id."
      },
      "scenario_run_id": {
        "type": "string",
        "description": "The scenario run this event belongs to, as carried on every clock sample."
      },
      "sim_time": {
        "type": "string",
        "description": "Simulation time at which the event was raised, ISO-8601 UTC with microsecond precision."
      },
      "tick": {
        "type": "integer",
        "minimum": 0,
        "description": "The tick index the monitor had observed when it raised the event."
      },
      "divergence_id": {
        "type": "string",
        "description": "Deterministic identifier derived from the root seed and the monitor's divergence ordinal, never from entropy or a host clock."
      },
      "forecast_run_id": {
        "type": "string",
        "description": "The model run whose forecast field the residuals were scored against. Evidence gathered against a superseded field is discarded rather than carried, so every sample counted here scored this run."
      },
      "region": {
        "$ref": "#/$defs/region"
      },
      "residual": {
        "$ref": "#/$defs/residual"
      },
      "persistence": {
        "$ref": "#/$defs/persistence"
      },
      "sound_speed_equation": {
        "type": "string",
        "description": "The named equation the derivation used, so a residual can say which model of sound speed produced it."
      }
    },
    "$defs": {
      "region": {
        "title": "Divergence region",
        "description": "Where the disagreement is: a centre, a radius in metres and the depth band the contributing samples came from. A radius rather than a spatial index, because indexing belongs to the planner and coupling the monitor to it would buy nothing here.",
        "type": "object",
        "required": [
          "centre_latitude",
          "centre_longitude",
          "radius_m",
          "minimum_depth_m",
          "maximum_depth_m"
        ],
        "additionalProperties": false,
        "properties": {
          "centre_latitude": {
            "type": "number",
            "minimum": -90,
            "maximum": 90
          },
          "centre_longitude": {
            "type": "number",
            "minimum": -180,
            "maximum": 180
          },
          "radius_m": {
            "type": "number",
            "exclusiveMinimum": 0,
            "description": "Radius enclosing the contributing samples, in metres."
          },
          "minimum_depth_m": {
            "type": "number",
            "minimum": 0
          },
          "maximum_depth_m": {
            "type": "number",
            "minimum": 0
          }
        }
      },
      "residual": {
        "title": "Residual summary",
        "description": "The disagreement in metres per second of sound speed. Signed on the mean, because a forecast that is uniformly too fast is a different fault from one that is noisy, and unsigned on the peak.",
        "type": "object",
        "required": [
          "mean_m_per_s",
          "peak_m_per_s",
          "threshold_m_per_s",
          "sample_count"
        ],
        "additionalProperties": false,
        "properties": {
          "mean_m_per_s": {
            "type": "number",
            "description": "Signed mean of measured minus forecast sound speed over the contributing samples."
          },
          "peak_m_per_s": {
            "type": "number",
            "minimum": 0,
            "description": "Largest absolute residual among the contributing samples."
          },
          "threshold_m_per_s": {
            "type": "number",
            "exclusiveMinimum": 0,
            "description": "The threshold in force when the event was raised, of the order of 1.5 to 2 m/s, which is roughly half a degree Celsius. Carried so a reader need not guess what the scenario was tuned to."
          },
          "sample_count": {
            "type": "integer",
            "minimum": 2,
            "description": "How many residual samples justified the event. Never one: a single sample is a spike, and a spike is not a divergence."
          }
        }
      },
      "persistence": {
        "title": "Persistence evidence",
        "description": "Which rule was satisfied and over what. This is the part that separates a divergence from an outlier, so it is carried rather than summarised away.",
        "type": "object",
        "required": [
          "rule",
          "sample_count",
          "span_seconds",
          "first_sim_time",
          "last_sim_time"
        ],
        "additionalProperties": false,
        "properties": {
          "rule": {
            "type": "string",
            "enum": [
              "spatial",
              "temporal"
            ],
            "description": "spatial: distinct samples above threshold inside one neighbourhood. temporal: consecutive samples above threshold spanning at least the configured simulation-time span."
          },
          "sample_count": {
            "type": "integer",
            "minimum": 2
          },
          "span_seconds": {
            "type": "number",
            "minimum": 0,
            "description": "Simulation-time span from the first contributing sample to the last, in seconds."
          },
          "first_sim_time": {
            "type": "string",
            "description": "Simulation time of the earliest contributing sample."
          },
          "last_sim_time": {
            "type": "string",
            "description": "Simulation time of the latest contributing sample."
          }
        }
      }
    }
  },
  "edr-collections": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/edr-collections.schema.json",
    "title": "drogna EDR collections subset",
    "description": "The OGC API-EDR discovery documents the query component serves (SRD-v2 FR-26, FR-21): the landing page, the conformance declaration, the collections list and one collection. Each collection's extent states what the store genuinely holds, verified against the store by test — a discovery document that flatters its holdings is the dishonesty the harness exists to avoid.",
    "type": "object",
    "$defs": {
      "landing": {
        "type": "object",
        "required": [
          "title",
          "description",
          "links"
        ],
        "additionalProperties": false,
        "properties": {
          "title": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "links": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/link"
            }
          }
        }
      },
      "conformance": {
        "type": "object",
        "required": [
          "conformsTo"
        ],
        "additionalProperties": false,
        "properties": {
          "conformsTo": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        }
      },
      "collections": {
        "type": "object",
        "required": [
          "links",
          "collections"
        ],
        "additionalProperties": false,
        "properties": {
          "links": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/link"
            }
          },
          "collections": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/collection"
            }
          }
        }
      },
      "collection": {
        "type": "object",
        "required": [
          "id",
          "title",
          "description",
          "links",
          "extent",
          "data_queries",
          "parameter_names",
          "crs"
        ],
        "additionalProperties": false,
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9_.-]*$"
          },
          "title": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "links": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/link"
            }
          },
          "extent": {
            "type": "object",
            "required": [
              "spatial",
              "vertical",
              "temporal"
            ],
            "additionalProperties": false,
            "properties": {
              "spatial": {
                "type": "object",
                "required": [
                  "bbox",
                  "crs"
                ],
                "additionalProperties": false,
                "properties": {
                  "bbox": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 1,
                    "items": {
                      "type": "array",
                      "minItems": 4,
                      "maxItems": 4,
                      "items": {
                        "type": "number"
                      }
                    }
                  },
                  "crs": {
                    "type": "string"
                  }
                }
              },
              "vertical": {
                "type": "object",
                "required": [
                  "interval",
                  "vrs"
                ],
                "additionalProperties": false,
                "properties": {
                  "interval": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 1,
                    "items": {
                      "type": "array",
                      "minItems": 2,
                      "maxItems": 2,
                      "items": {
                        "type": "number"
                      }
                    }
                  },
                  "vrs": {
                    "type": "string",
                    "description": "States that depth is positive downwards; a vertical axis that leaves it implicit will be read upside down by somebody."
                  }
                }
              },
              "temporal": {
                "type": "object",
                "required": [
                  "interval",
                  "trs"
                ],
                "additionalProperties": false,
                "properties": {
                  "interval": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 1,
                    "items": {
                      "type": "array",
                      "minItems": 2,
                      "maxItems": 2,
                      "items": {
                        "type": "string"
                      }
                    }
                  },
                  "trs": {
                    "type": "string"
                  }
                }
              }
            }
          },
          "data_queries": {
            "type": "object",
            "additionalProperties": false,
            "description": "Exactly the query types genuinely served for this collection; an entry here is a capability, and an absent entry is refused by name when asked for.",
            "properties": {
              "position": {
                "$ref": "#/$defs/data_query"
              },
              "trajectory": {
                "$ref": "#/$defs/data_query"
              }
            }
          },
          "parameter_names": {
            "type": "object",
            "additionalProperties": {
              "type": "object",
              "required": [
                "type",
                "description",
                "unit",
                "observedProperty"
              ],
              "additionalProperties": false,
              "properties": {
                "type": {
                  "type": "string",
                  "const": "Parameter"
                },
                "description": {
                  "type": "object",
                  "additionalProperties": {
                    "type": "string"
                  }
                },
                "unit": {
                  "type": "object",
                  "required": [
                    "symbol"
                  ],
                  "additionalProperties": true,
                  "properties": {
                    "symbol": {
                      "type": "string"
                    }
                  }
                },
                "observedProperty": {
                  "type": "object",
                  "required": [
                    "id",
                    "label"
                  ],
                  "additionalProperties": false,
                  "properties": {
                    "id": {
                      "type": "string"
                    },
                    "label": {
                      "type": "object",
                      "additionalProperties": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          },
          "crs": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        }
      },
      "data_query": {
        "type": "object",
        "required": [
          "link"
        ],
        "additionalProperties": false,
        "properties": {
          "link": {
            "$ref": "#/$defs/link"
          }
        }
      },
      "link": {
        "type": "object",
        "required": [
          "href",
          "rel"
        ],
        "additionalProperties": false,
        "description": "hrefs are relative and same-origin by requirement (FR-04, E7): an absolute URL here would break behind a clearance at the preflight.",
        "properties": {
          "href": {
            "type": "string",
            "pattern": "^[^:]*$"
          },
          "rel": {
            "type": "string"
          },
          "type": {
            "type": "string"
          },
          "title": {
            "type": "string"
          }
        }
      }
    }
  },
  "heartbeat": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/heartbeat.schema.json",
    "title": "drogna component heartbeat",
    "description": "The message every long-lived component publishes on ctl/heartbeat at its declared interval, and the only thing that lights a component in the client (FR-45, FR-52, Constitution VII). The shape was settled by feature 001, which publishes the first one; this document is the neutral master and adopts that shape unchanged, extending it only with the two optional declarations FR-012 asks for. Note what is absent: no host timestamp. Cadence and liveness windows are real time by ADR-0006, but the sender does not tell the receiver what time the sender thinks it is; the receiver measures arrival against its own real time, and the simulation time carried here is payload, not schedule.",
    "type": "object",
    "required": [
      "component",
      "sim_time",
      "status"
    ],
    "additionalProperties": false,
    "properties": {
      "component": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$",
        "description": "The component id, matching config /component/id."
      },
      "sim_time": {
        "type": "string",
        "description": "Simulation time of the heartbeat, ISO-8601 UTC with microsecond precision."
      },
      "tick": {
        "type": [
          "integer",
          "null"
        ],
        "minimum": 0,
        "description": "The tick index the component had observed when it published. Present wherever the component holds a tick."
      },
      "status": {
        "type": "string",
        "enum": [
          "starting",
          "ok",
          "degraded",
          "stalled",
          "stopping"
        ],
        "description": "degraded and stalled are how a component says it is alive but not working, rather than going quiet and being read as dead."
      },
      "run_id": {
        "type": [
          "string",
          "null"
        ],
        "description": "The run this component is part of, matching the run manifest."
      },
      "config_digest": {
        "type": [
          "string",
          "null"
        ],
        "pattern": "^sha256:[0-9a-f]{64}$",
        "description": "SHA-256 of the configuration the component was started from. This is how a participant's digest reaches the run manifest: never the configuration itself."
      },
      "heartbeat_interval_seconds": {
        "type": "number",
        "exclusiveMinimum": 0,
        "description": "The interval, in host seconds, at which this component says it heartbeats (ADR-0006). Optional: a component that does not declare one is judged against the receiver's default tolerance, which is a tolerance and not a list of components."
      },
      "liveness_window_seconds": {
        "type": "number",
        "exclusiveMinimum": 0,
        "description": "How long, in host seconds, this heartbeat should be taken as evidence that its sender is alive. Declared by the sender because only the sender knows its own cadence; the receiver holds no table of expected intervals. Optional, as above."
      },
      "detail": {
        "type": "string",
        "description": "One line for a human. Never a substitute for status."
      }
    }
  },
  "holding-published": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/holding-published.schema.json",
    "title": "drogna holding-published announcement",
    "description": "Published by the coverage store on its declared topic each time a staged holding passes its digest check and becomes visible (SRD-v2 FR-21, FR-30's announce-not-poll discipline). Light on purpose: the descriptor and manifest are served by the inventory; this message says only that, and when, and under which digest, something became visible.",
    "type": "object",
    "required": [
      "component",
      "holding_id",
      "era",
      "run_id",
      "sim_time",
      "tick",
      "field_sha256"
    ],
    "additionalProperties": false,
    "properties": {
      "component": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$"
      },
      "holding_id": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_.-]*$"
      },
      "era": {
        "type": "string",
        "enum": [
          "archive",
          "nowcast",
          "instance"
        ]
      },
      "run_id": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]*$"
      },
      "sim_time": {
        "type": "string",
        "minLength": 1
      },
      "tick": {
        "type": "integer",
        "minimum": 0
      },
      "field_sha256": {
        "type": "string",
        "pattern": "^sha256:[0-9a-f]{64}$"
      }
    }
  },
  "holdings-inventory": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/holdings-inventory.schema.json",
    "title": "drogna holdings inventory",
    "description": "The HTTP answer to 'what does the coverage store hold': every holding's descriptor with its ground-truth manifest embedded (SRD-v2 FR-20's inspectability). Served through the seam and the release gate like everything else; the query components of feature 104 serve the same holdings through EDR, and this inventory is the control-plane view of them.",
    "type": "object",
    "required": [
      "schema_version",
      "holdings"
    ],
    "additionalProperties": false,
    "properties": {
      "schema_version": {
        "type": "integer",
        "const": 1
      },
      "holdings": {
        "type": "array",
        "items": {
          "$ref": "coverage-holding.schema.json"
        }
      }
    }
  },
  "ingest-telemetry": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/ingest-telemetry.schema.json",
    "title": "drogna ingest telemetry",
    "description": "What the ingest client (C-05) reports about itself on ctl/telemetry: queue depth against its bound, the rate it is writing at, how many messages it has refused as invalid, and any loss the broker reported. It exists so that degradation is visible without anyone reading a log file — the backpressure indicator appears here within one telemetry interval of the queue reaching its bound, and clears here when the backlog drains. The telemetry component (C-16) and the client consume it. This document describes one component's report; a general telemetry envelope, if the telemetry feature decides it wants one, is that feature's to define and this shape is what it will find in use.",
    "type": "object",
    "required": [
      "component",
      "scenario_run_id",
      "sim_time",
      "tick",
      "queue",
      "write",
      "rejections",
      "broker"
    ],
    "additionalProperties": false,
    "properties": {
      "component": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$",
        "description": "The component reporting, matching config /component/id."
      },
      "scenario_run_id": {
        "type": "string",
        "description": "The scenario run this report belongs to, as carried on every clock sample."
      },
      "sim_time": {
        "type": "string",
        "description": "Simulation time at which the report was composed, ISO-8601 UTC with microsecond precision. The telemetry interval is measured in simulation time like every interval in this component except the heartbeat, which is real time by ADR-0006."
      },
      "tick": {
        "type": "integer",
        "minimum": 0,
        "description": "The tick index the client had observed when it composed the report."
      },
      "queue": {
        "title": "The bounded queue",
        "description": "Depth against bound. At the bound the client stops acknowledging rather than discarding, so a depth equal to the bound is backpressure and not loss.",
        "type": "object",
        "required": [
          "depth",
          "bound",
          "at_bound",
          "high_water",
          "filled"
        ],
        "additionalProperties": false,
        "properties": {
          "depth": {
            "type": "integer",
            "minimum": 0,
            "description": "Messages held now."
          },
          "bound": {
            "type": "integer",
            "minimum": 1,
            "description": "The configured limit."
          },
          "at_bound": {
            "type": "boolean",
            "description": "The backpressure indicator. True when the queue is full now, and true when it filled at any point during the interval just ended — a loop that takes and writes within one turn is rarely caught full by an instantaneous sample, and an indicator that only reported the instant would say a system under sustained backpressure was comfortable. It clears when an interval passes with room to spare throughout."
          },
          "high_water": {
            "type": "integer",
            "minimum": 0,
            "description": "The deepest the queue has been this run. Never above the bound, and that is the claim SC-006 tests."
          },
          "filled": {
            "type": "integer",
            "minimum": 0,
            "description": "How many times the queue has reached its bound this run. Not a count of losses: reaching the bound stops the client taking more, and what it has not taken it has not acknowledged, so the broker still holds it. This is the figure the indicator is derived from, and it is carried so a reader can tell one long stall from a hundred short ones."
          }
        }
      },
      "write": {
        "title": "What has reached the store",
        "type": "object",
        "required": [
          "batches",
          "stored",
          "duplicates",
          "rate_per_simulation_second"
        ],
        "additionalProperties": false,
        "properties": {
          "batches": {
            "type": "integer",
            "minimum": 0,
            "description": "Transactions committed this run."
          },
          "stored": {
            "type": "integer",
            "minimum": 0,
            "description": "Observations written this run."
          },
          "duplicates": {
            "type": "integer",
            "minimum": 0,
            "description": "Redeliveries that found their row already there and changed nothing. Counted rather than absorbed in silence: a rising number says the broker is redelivering."
          },
          "rate_per_simulation_second": {
            "type": "number",
            "minimum": 0,
            "description": "Observations stored per second of simulation time since the previous report. A rate in simulation time rather than host time, because that is the time the rest of this component runs on."
          }
        }
      },
      "rejections": {
        "title": "What did not reach the store",
        "description": "Messages that failed validation. Never written, always counted, kept up to the configured bound so they can be inspected.",
        "type": "object",
        "required": [
          "count",
          "retained",
          "discarded"
        ],
        "additionalProperties": false,
        "properties": {
          "count": {
            "type": "integer",
            "minimum": 0,
            "description": "Every rejection this run, kept or not."
          },
          "retained": {
            "type": "integer",
            "minimum": 0,
            "description": "How many are still held for inspection."
          },
          "discarded": {
            "type": "integer",
            "minimum": 0,
            "description": "Rejections that fell off the end of the retention. Reported rather than silently forgotten, which is what reaching the bound means."
          }
        }
      },
      "broker": {
        "title": "What the broker did",
        "type": "object",
        "required": [
          "received",
          "lost"
        ],
        "additionalProperties": false,
        "properties": {
          "received": {
            "type": "integer",
            "minimum": 0,
            "description": "Messages delivered to this client this run."
          },
          "lost": {
            "type": "integer",
            "minimum": 0,
            "description": "Messages the broker reported dropping. A burst larger than the broker's retention for the in-flight window loses messages before this component sees them; the loss is counted and reported rather than found later as a hole in the data."
          }
        }
      }
    },
    "examples": [
      {
        "component": "ingest",
        "scenario_run_id": "run-20260901-a",
        "sim_time": "2026-09-01T02:20:00.000000Z",
        "tick": 560,
        "queue": {
          "depth": 5000,
          "bound": 5000,
          "at_bound": true,
          "high_water": 5000,
          "filled": 118
        },
        "write": {
          "batches": 41,
          "stored": 20500,
          "duplicates": 3,
          "rate_per_simulation_second": 341.6
        },
        "rejections": {
          "count": 2,
          "retained": 2,
          "discarded": 0
        },
        "broker": {
          "received": 25503,
          "lost": 0
        }
      }
    ]
  },
  "manifest": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/manifest.schema.json",
    "title": "drogna ground-truth manifest",
    "description": "Everything that produced one generated field: the grid, the background, the four seeded features with their parameters, the decorrelation timescale background and per-feature values with the rule that blends them, the seed, the generator version and the digests of what was written. It is the document AT-01 and AT-03 score against, and Constitution IX allows no claim of recovery that is not measured against it. Two properties are load-bearing. It is sufficient: with the generator version it names, the analytic field can be reconstructed at any point in the domain without the field file and without the generator running. And it records the evaluated form only: the authored per-feature representation is an authoring convenience and does not reach a consumer (ADR-0002). Distinct from run-manifest.schema.json, which records a run; this document refers to a run by run_id.",
    "type": "object",
    "required": [
      "schema_version",
      "generator",
      "run_id",
      "config_digest",
      "seed",
      "generated_at",
      "grid",
      "variables",
      "background",
      "pressure_relation",
      "sound_speed",
      "composition",
      "features",
      "timescale",
      "outputs",
      "normalised_attributes",
      "tolerance"
    ],
    "additionalProperties": false,
    "properties": {
      "schema_version": {
        "type": "integer",
        "const": 1,
        "description": "Bumped when the shape changes in a way a reader must notice."
      },
      "generator": {
        "type": "object",
        "required": [
          "name",
          "version",
          "analytic_form_version"
        ],
        "additionalProperties": false,
        "description": "Which generator, and which analytic form. Any change to the analytic form is a version bump here, so a manifest never describes a field it could not have produced.",
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1
          },
          "version": {
            "type": "string",
            "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$",
            "description": "Generator version, in the sense of the code that wrote this document."
          },
          "analytic_form_version": {
            "type": "integer",
            "minimum": 1,
            "description": "Version of the analytic form itself. A reader that understands this number can reconstruct the field; a reader that does not must refuse rather than guess."
          }
        }
      },
      "run_id": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]*$",
        "description": "The run this field belongs to, as recorded in the run manifest."
      },
      "config_digest": {
        "type": "string",
        "pattern": "^sha256:[0-9a-f]{64}$",
        "description": "Digest of the configuration that produced the field. A digest and never values, so publishing a manifest cannot leak what a config file happens to carry."
      },
      "seed": {
        "type": "object",
        "required": [
          "root",
          "stream",
          "derived_entropy",
          "derivation",
          "draw_order"
        ],
        "additionalProperties": false,
        "description": "Where every stochastic value came from. Randomness enters only as authored jitter on feature parameters; the jittered values are what this document records, which is why it stays sufficient on its own.",
        "properties": {
          "root": {
            "type": "integer",
            "minimum": 0
          },
          "stream": {
            "type": "string",
            "minLength": 1
          },
          "derived_entropy": {
            "type": "string",
            "pattern": "^[0-9a-f]+$",
            "description": "The stream's derived entropy in hexadecimal, so a reader can rebuild the sequence without repeating the derivation by hand."
          },
          "derivation": {
            "type": "object",
            "required": [
              "rule",
              "version"
            ],
            "additionalProperties": false,
            "properties": {
              "rule": {
                "type": "string",
                "minLength": 1
              },
              "version": {
                "type": "integer",
                "minimum": 1
              }
            }
          },
          "draw_order": {
            "type": "array",
            "description": "The names of the draws, in the exact order they were taken. Order is load-bearing: reordering it changes every world without changing any parameter.",
            "items": {
              "type": "string",
              "minLength": 1
            }
          }
        }
      },
      "generated_at": {
        "type": "object",
        "required": [
          "sim_time",
          "tick"
        ],
        "additionalProperties": false,
        "description": "Simulation time, taken from the clock port. There is no host time anywhere in this document.",
        "properties": {
          "sim_time": {
            "type": "string",
            "minLength": 1
          },
          "tick": {
            "type": "integer",
            "minimum": 0
          }
        }
      },
      "grid": {
        "type": "object",
        "required": [
          "latitude",
          "longitude",
          "depth",
          "time"
        ],
        "additionalProperties": false,
        "properties": {
          "latitude": {
            "$ref": "#/$defs/spatial_axis"
          },
          "longitude": {
            "$ref": "#/$defs/spatial_axis"
          },
          "depth": {
            "allOf": [
              {
                "$ref": "#/$defs/spatial_axis"
              }
            ],
            "description": "Depth increases downwards, as CF requires it to say explicitly."
          },
          "time": {
            "type": "object",
            "required": [
              "origin_sim_time",
              "start_offset_seconds",
              "step_seconds",
              "count",
              "units"
            ],
            "additionalProperties": false,
            "description": "The time axis is offsets in seconds from an origin in simulation time. The evaluator takes seconds from that origin, so a point between two steps is as evaluable as one on them.",
            "properties": {
              "origin_sim_time": {
                "type": "string",
                "minLength": 1
              },
              "start_offset_seconds": {
                "type": "number"
              },
              "step_seconds": {
                "type": "number",
                "exclusiveMinimum": 0
              },
              "count": {
                "type": "integer",
                "minimum": 2
              },
              "units": {
                "type": "string",
                "minLength": 1
              }
            }
          }
        }
      },
      "variables": {
        "type": "array",
        "minItems": 1,
        "description": "What the field carries, with the units and standard names a consumer reads it by, and the absolute tolerance within which the evaluator agrees with the stored value.",
        "items": {
          "type": "object",
          "required": [
            "name",
            "standard_name",
            "long_name",
            "units",
            "dtype",
            "tolerance_absolute"
          ],
          "additionalProperties": false,
          "properties": {
            "name": {
              "type": "string",
              "minLength": 1
            },
            "standard_name": {
              "type": [
                "string",
                "null"
              ],
              "description": "The CF standard name, or null where CF has none. Null is stated rather than invented: a standard name that is not in the table is a claim the vocabulary does not support."
            },
            "long_name": {
              "type": "string",
              "minLength": 1
            },
            "units": {
              "type": "string",
              "minLength": 1
            },
            "dtype": {
              "type": "string",
              "enum": [
                "float32",
                "float64"
              ]
            },
            "tolerance_absolute": {
              "type": "number",
              "minimum": 0,
              "description": "Derived from the stored width at this variable's largest magnitude, not chosen. It is the threshold a comparison against the stored field is entitled to use."
            }
          }
        }
      },
      "background": {
        "type": "object",
        "required": [
          "rule",
          "description",
          "parameters"
        ],
        "additionalProperties": false,
        "description": "The base state on which every feature is composed.",
        "properties": {
          "rule": {
            "type": "string",
            "minLength": 1
          },
          "description": {
            "type": "string",
            "minLength": 1
          },
          "parameters": {
            "type": "object",
            "required": [
              "surface_temperature_c",
              "deep_temperature_c",
              "temperature_scale_depth_m",
              "surface_salinity_psu",
              "deep_salinity_psu",
              "salinity_scale_depth_m"
            ],
            "additionalProperties": false,
            "properties": {
              "surface_temperature_c": {
                "type": "number"
              },
              "deep_temperature_c": {
                "type": "number"
              },
              "temperature_scale_depth_m": {
                "type": "number"
              },
              "surface_salinity_psu": {
                "type": "number"
              },
              "deep_salinity_psu": {
                "type": "number"
              },
              "salinity_scale_depth_m": {
                "type": "number"
              }
            }
          }
        }
      },
      "pressure_relation": {
        "type": "object",
        "required": [
          "name",
          "expression",
          "dbar_per_metre",
          "surface_dbar"
        ],
        "additionalProperties": false,
        "description": "Pressure is derived from depth, never generated beside it. A pressure generated independently of depth would be unphysical and would make the sound speed derivation meaningless.",
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1
          },
          "expression": {
            "type": "string",
            "minLength": 1
          },
          "dbar_per_metre": {
            "type": "number"
          },
          "surface_dbar": {
            "type": "number"
          }
        }
      },
      "sound_speed": {
        "type": "object",
        "required": [
          "method",
          "implementation",
          "validity",
          "outside_validity"
        ],
        "additionalProperties": false,
        "description": "ADR-0005: sound speed is derived at the point of use by one implementation, named here so a residual computed elsewhere can say which equation produced it.",
        "properties": {
          "method": {
            "type": "string",
            "minLength": 1
          },
          "implementation": {
            "type": "string",
            "minLength": 1,
            "description": "The single implementation in drogna, by module name. A second implementation would make a recovery error partly an artefact of the disagreement between copies."
          },
          "validity": {
            "type": "object",
            "required": [
              "min_temperature_c",
              "max_temperature_c",
              "min_salinity_psu",
              "max_salinity_psu",
              "min_depth_m",
              "max_depth_m"
            ],
            "additionalProperties": false,
            "properties": {
              "min_temperature_c": {
                "type": "number"
              },
              "max_temperature_c": {
                "type": "number"
              },
              "min_salinity_psu": {
                "type": "number"
              },
              "max_salinity_psu": {
                "type": "number"
              },
              "min_depth_m": {
                "type": "number"
              },
              "max_depth_m": {
                "type": "number"
              }
            }
          },
          "outside_validity": {
            "type": "object",
            "required": [
              "count",
              "first_point"
            ],
            "additionalProperties": false,
            "description": "Where the equation was used outside its stated range, and how often. The numerics are deliberately fake, but the fact of being used outside range must not be invisible.",
            "properties": {
              "count": {
                "type": "integer",
                "minimum": 0
              },
              "first_point": {
                "type": [
                  "object",
                  "null"
                ],
                "required": [
                  "latitude",
                  "longitude",
                  "depth_m",
                  "time_seconds"
                ],
                "additionalProperties": false,
                "properties": {
                  "latitude": {
                    "type": "number"
                  },
                  "longitude": {
                    "type": "number"
                  },
                  "depth_m": {
                    "type": "number"
                  },
                  "time_seconds": {
                    "type": "number"
                  }
                }
              }
            }
          }
        }
      },
      "composition": {
        "type": "object",
        "required": [
          "rule",
          "description"
        ],
        "additionalProperties": false,
        "description": "How features reach the background. Stated as a rule so the field is reproducible from this document's parameters alone.",
        "properties": {
          "rule": {
            "type": "string",
            "minLength": 1
          },
          "description": {
            "type": "string",
            "minLength": 1
          }
        }
      },
      "features": {
        "type": "array",
        "minItems": 4,
        "maxItems": 4,
        "description": "The four seeded features of SRD FR-03, with the parameters that produced them after jitter. These are the ground truth a recovery error is measured against.",
        "items": {
          "$ref": "#/$defs/feature"
        }
      },
      "timescale": {
        "type": "object",
        "required": [
          "background_seconds",
          "background_to_time_step_ratio",
          "floor_ratio",
          "blending_rule",
          "membership"
        ],
        "additionalProperties": false,
        "description": "ADR-0002. The timescale is a field: authored per feature over this background, evaluated per location, and advected with the feature that moves. Both the background and the per-feature values are ground truth.",
        "properties": {
          "background_seconds": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "background_to_time_step_ratio": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "floor_ratio": {
            "type": "number",
            "exclusiveMinimum": 0,
            "description": "The configured floor every ratio in this document was checked against."
          },
          "blending_rule": {
            "type": "object",
            "required": [
              "name",
              "version",
              "description",
              "parameters"
            ],
            "additionalProperties": false,
            "description": "ADR-0002 leaves the blending rule open and requires it to be named here, because two features may overlap and the answer where they do is a modelling choice rather than a fact.",
            "properties": {
              "name": {
                "type": "string",
                "minLength": 1
              },
              "version": {
                "type": "integer",
                "minimum": 1
              },
              "description": {
                "type": "string",
                "minLength": 1
              },
              "parameters": {
                "type": "object"
              }
            }
          },
          "membership": {
            "type": "object",
            "required": [
              "rule",
              "description"
            ],
            "additionalProperties": false,
            "description": "How a feature's weight at a location is obtained. It shares the anomaly's geometry so that a timescale and the anomaly it belongs to cannot drift apart.",
            "properties": {
              "rule": {
                "type": "string",
                "minLength": 1
              },
              "description": {
                "type": "string",
                "minLength": 1
              }
            }
          }
        }
      },
      "outputs": {
        "type": "object",
        "required": [
          "field",
          "manifest"
        ],
        "additionalProperties": false,
        "description": "What was written, by the names configuration gave them, so a cataloguing convention can be applied without the generator knowing it.",
        "properties": {
          "field": {
            "type": "object",
            "required": [
              "name",
              "format",
              "sha256"
            ],
            "additionalProperties": false,
            "properties": {
              "name": {
                "type": "string",
                "minLength": 1
              },
              "format": {
                "type": "string",
                "minLength": 1
              },
              "sha256": {
                "type": "string",
                "pattern": "^sha256:[0-9a-f]{64}$"
              }
            }
          },
          "manifest": {
            "type": "object",
            "required": [
              "name",
              "format"
            ],
            "additionalProperties": false,
            "description": "This document. It carries no digest of itself, which it could not compute without changing.",
            "properties": {
              "name": {
                "type": "string",
                "minLength": 1
              },
              "format": {
                "type": "string",
                "minLength": 1
              }
            }
          }
        }
      },
      "normalised_attributes": {
        "type": "array",
        "description": "The file attributes fixed or omitted so that two runs with one seed are byte-identical. Declared, because a comparison that silently skipped them would be proving less than it claims.",
        "items": {
          "type": "object",
          "required": [
            "name",
            "treatment",
            "reason"
          ],
          "additionalProperties": false,
          "properties": {
            "name": {
              "type": "string",
              "minLength": 1
            },
            "treatment": {
              "type": "string",
              "enum": [
                "omitted",
                "fixed"
              ]
            },
            "reason": {
              "type": "string",
              "minLength": 1
            }
          }
        }
      },
      "tolerance": {
        "type": "object",
        "required": [
          "basis",
          "stored_dtype",
          "description"
        ],
        "additionalProperties": false,
        "description": "Why the per-variable tolerances above are what they are. Derived from the stored width, so a comparison has a stated threshold rather than a chosen one.",
        "properties": {
          "basis": {
            "type": "string",
            "minLength": 1
          },
          "stored_dtype": {
            "type": "string",
            "enum": [
              "float32",
              "float64"
            ]
          },
          "description": {
            "type": "string",
            "minLength": 1
          }
        }
      }
    },
    "$defs": {
      "spatial_axis": {
        "type": "object",
        "required": [
          "minimum",
          "maximum",
          "count",
          "spacing",
          "units",
          "direction"
        ],
        "additionalProperties": false,
        "properties": {
          "minimum": {
            "type": "number"
          },
          "maximum": {
            "type": "number"
          },
          "count": {
            "type": "integer",
            "minimum": 2
          },
          "spacing": {
            "type": "number"
          },
          "units": {
            "type": "string",
            "minLength": 1
          },
          "direction": {
            "type": "string",
            "enum": [
              "north",
              "east",
              "down"
            ],
            "description": "Which way the axis increases. The vertical says down, because a field that leaves it implicit will be read upside down by somebody."
          }
        }
      },
      "resolution": {
        "type": "object",
        "required": [
          "scale",
          "scale_units",
          "grid_spacing",
          "ratio"
        ],
        "additionalProperties": false,
        "description": "How well the grid resolves this feature. A ratio below one means the field under-resolves it, and a recovery error can then be interpreted rather than merely reported.",
        "properties": {
          "scale": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "scale_units": {
            "type": "string",
            "minLength": 1
          },
          "grid_spacing": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "ratio": {
            "type": "number",
            "exclusiveMinimum": 0
          }
        }
      },
      "feature": {
        "type": "object",
        "required": [
          "id",
          "kind",
          "parameters",
          "timescale_seconds",
          "timescale_to_time_step_ratio",
          "resolution"
        ],
        "additionalProperties": false,
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_-]*$"
          },
          "kind": {
            "type": "string",
            "enum": [
              "eddy",
              "front",
              "thermocline",
              "moving"
            ]
          },
          "timescale_seconds": {
            "type": "number",
            "exclusiveMinimum": 0,
            "description": "This feature's authored decorrelation timescale. Ground truth, and scorable."
          },
          "timescale_to_time_step_ratio": {
            "type": "number",
            "exclusiveMinimum": 0,
            "description": "Recorded whether or not it passed the floor, because a ratio close to the floor is worth seeing."
          },
          "resolution": {
            "$ref": "#/$defs/resolution"
          },
          "parameters": {
            "type": "object"
          }
        },
        "oneOf": [
          {
            "properties": {
              "kind": {
                "const": "eddy"
              },
              "parameters": {
                "$ref": "#/$defs/eddy_parameters"
              }
            }
          },
          {
            "properties": {
              "kind": {
                "const": "front"
              },
              "parameters": {
                "$ref": "#/$defs/front_parameters"
              }
            }
          },
          {
            "properties": {
              "kind": {
                "const": "thermocline"
              },
              "parameters": {
                "$ref": "#/$defs/thermocline_parameters"
              }
            }
          },
          {
            "properties": {
              "kind": {
                "const": "moving"
              },
              "parameters": {
                "$ref": "#/$defs/moving_parameters"
              }
            }
          }
        ]
      },
      "eddy_parameters": {
        "type": "object",
        "required": [
          "centre_latitude",
          "centre_longitude",
          "radius_km",
          "strength_c",
          "salinity_strength_psu",
          "sign",
          "depth_centre_m",
          "depth_half_thickness_m"
        ],
        "additionalProperties": false,
        "properties": {
          "centre_latitude": {
            "type": "number"
          },
          "centre_longitude": {
            "type": "number"
          },
          "radius_km": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "strength_c": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "salinity_strength_psu": {
            "type": "number"
          },
          "sign": {
            "type": "integer",
            "enum": [
              -1,
              1
            ]
          },
          "depth_centre_m": {
            "type": "number"
          },
          "depth_half_thickness_m": {
            "type": "number",
            "exclusiveMinimum": 0
          }
        }
      },
      "front_parameters": {
        "type": "object",
        "required": [
          "anchor_latitude",
          "anchor_longitude",
          "bearing_degrees",
          "sharpness_km",
          "amplitude_c",
          "salinity_amplitude_psu",
          "depth_scale_m"
        ],
        "additionalProperties": false,
        "properties": {
          "anchor_latitude": {
            "type": "number"
          },
          "anchor_longitude": {
            "type": "number"
          },
          "bearing_degrees": {
            "type": "number"
          },
          "sharpness_km": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "amplitude_c": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "salinity_amplitude_psu": {
            "type": "number"
          },
          "depth_scale_m": {
            "type": "number",
            "exclusiveMinimum": 0
          }
        }
      },
      "thermocline_parameters": {
        "type": "object",
        "required": [
          "depth_m",
          "thickness_m",
          "temperature_drop_c",
          "salinity_rise_psu"
        ],
        "additionalProperties": false,
        "properties": {
          "depth_m": {
            "type": "number"
          },
          "thickness_m": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "temperature_drop_c": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "salinity_rise_psu": {
            "type": "number"
          }
        }
      },
      "moving_parameters": {
        "type": "object",
        "required": [
          "centre_latitude",
          "centre_longitude",
          "radius_km",
          "strength_c",
          "salinity_strength_psu",
          "sign",
          "depth_centre_m",
          "depth_half_thickness_m",
          "drift_east_km_per_day",
          "drift_north_km_per_day",
          "reference_latitude"
        ],
        "additionalProperties": false,
        "description": "The initial centre is the position at the time origin. Its position at any other time is that centre plus the drift velocity times the elapsed simulation time, computed about reference_latitude, so no consumer needs to step through the field to find it.",
        "properties": {
          "centre_latitude": {
            "type": "number"
          },
          "centre_longitude": {
            "type": "number"
          },
          "radius_km": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "strength_c": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "salinity_strength_psu": {
            "type": "number"
          },
          "sign": {
            "type": "integer",
            "enum": [
              -1,
              1
            ]
          },
          "depth_centre_m": {
            "type": "number"
          },
          "depth_half_thickness_m": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "drift_east_km_per_day": {
            "type": "number"
          },
          "drift_north_km_per_day": {
            "type": "number"
          },
          "reference_latitude": {
            "type": "number",
            "description": "The latitude the local plane is built about, so the advection is an exact affine map rather than an approximation that depends on where it is evaluated."
          }
        }
      }
    }
  },
  "observation": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/observation.schema.json",
    "title": "drogna observation",
    "description": "One measured value published by a simulated sensor on obs/<thing-id>/<datastream-id>, in SensorThings Part 1 vocabulary. SensorThings is the shape and vocabulary of the message and nothing more: no SensorThings server takes part in the write path, and this document is the single definition both the sensors and the ingest client are generated from (SRD FR-16, FR-17). The observed property is an enumeration of exactly three values. Sound speed is absent by decision: ADR-0005 derives it at the point of use from temperature, salinity and pressure, so it is never published and never stored, and a fourth datastream cannot arrive without amending that ADR. Every time here is simulation time taken from the clock port; no broker-assigned timestamp, database default or host clock value appears anywhere in the write path.",
    "type": "object",
    "required": [
      "observation_id",
      "scenario_run_id",
      "sim_time",
      "tick",
      "thing_id",
      "datastream_id",
      "sensor_id",
      "feature_of_interest_id",
      "observed_property",
      "result",
      "location",
      "context"
    ],
    "additionalProperties": false,
    "properties": {
      "observation_id": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_.-]*$",
        "description": "Deterministic identifier derived from the root seed and the observation's logical position — thing, datastream and sequence — never from entropy, arrival order or a database sequence. It is the store's primary key, which is what makes redelivery under at-least-once a no-op rather than a duplicate row."
      },
      "scenario_run_id": {
        "type": "string",
        "description": "The scenario run this observation belongs to, as carried on every clock sample."
      },
      "sim_time": {
        "type": "string",
        "description": "Phenomenon time: the simulation instant the value was measured at, ISO-8601 UTC with microsecond precision. This is the only time the store orders on. An observation that arrives late is stored on its own time, not on arrival order."
      },
      "tick": {
        "type": "integer",
        "minimum": 0,
        "description": "The tick index the sensor had observed when it sampled. Carried beside sim_time because a tick is the unit of causality and an instant is not."
      },
      "thing_id": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_.-]*$",
        "description": "The sampling platform this observation came from, and the first segment of the topic. A platform is a coordinate and a sampler; it carries no history and is not an entity of any other kind."
      },
      "datastream_id": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_.-]*$",
        "description": "The Datastream — the pairing of a Thing, a Sensor and an ObservedProperty with a unit — and the second segment of the topic."
      },
      "sensor_id": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_.-]*$",
        "description": "The simulated instrument that produced the value, carrying its noise characteristics in its metadata."
      },
      "feature_of_interest_id": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_.-]*$",
        "description": "The location the observation pertains to, in SensorThings terms. Derived deterministically from the sampled position, so two observations of the same place share one FeatureOfInterest."
      },
      "observed_property": {
        "$ref": "#/$defs/observed_property"
      },
      "result": {
        "type": "number",
        "description": "The measured value, in the unit the Datastream declares: degrees Celsius, practical salinity units or decibars. Seeded sensor noise is already applied; the value is what the instrument reported, not what the world held."
      },
      "location": {
        "$ref": "#/$defs/location"
      },
      "context": {
        "$ref": "#/$defs/context"
      }
    },
    "$defs": {
      "observed_property": {
        "title": "Observed property",
        "type": "string",
        "enum": [
          "temperature",
          "salinity",
          "pressure"
        ],
        "description": "What was measured. Exactly three, closed deliberately. Sound speed is not among them and is not a datastream: it is derived at the point of use by the one implementation in libs/harness_core, called by the monitor, by telemetry and by the environment generator (ADR-0005). A derived value stored beside its inputs is a second source of truth that can disagree with them after a change to the equation, and there would be no way to tell which was right."
      },
      "location": {
        "title": "Sampled position",
        "description": "Where the sample was taken. A position and a depth, and nothing that would make a series of them into anything other than a sampling path: no heading, no speed, no identity carried between them.",
        "type": "object",
        "required": [
          "latitude",
          "longitude",
          "depth_m"
        ],
        "additionalProperties": false,
        "properties": {
          "latitude": {
            "type": "number",
            "minimum": -90,
            "maximum": 90,
            "description": "Degrees north, WGS 84."
          },
          "longitude": {
            "type": "number",
            "minimum": -180,
            "maximum": 180,
            "description": "Degrees east, WGS 84."
          },
          "depth_m": {
            "type": "number",
            "minimum": 0,
            "description": "Depth below the surface in metres, positive downwards."
          }
        }
      },
      "context": {
        "title": "SensorThings entities",
        "description": "The entities this observation belongs to, carried on every message. The ingest client holds no vocabulary of its own: what the store's Thing, Sensor, ObservedProperty, Datastream and FeatureOfInterest rows say is what the sensors published, so the store is a function of the traffic rather than of a second table somebody has to keep in step. Writing them is idempotent — the same identifier carries the same content on every message of that datastream.",
        "type": "object",
        "required": [
          "thing",
          "sensor",
          "observed_property",
          "datastream",
          "feature_of_interest"
        ],
        "additionalProperties": false,
        "properties": {
          "thing": {
            "title": "Thing",
            "description": "The sampling platform: the simulated vessel or a fixed sampling point.",
            "type": "object",
            "required": [
              "name",
              "description"
            ],
            "additionalProperties": false,
            "properties": {
              "name": {
                "type": "string",
                "description": "Short name for a reader."
              },
              "description": {
                "type": "string",
                "description": "One line saying what the platform is."
              }
            }
          },
          "sensor": {
            "title": "Sensor",
            "description": "The simulated instrument, and where its noise characteristics are stated.",
            "type": "object",
            "required": [
              "name",
              "description",
              "encoding_type",
              "metadata"
            ],
            "additionalProperties": false,
            "properties": {
              "name": {
                "type": "string",
                "description": "Short name for a reader."
              },
              "description": {
                "type": "string",
                "description": "One line saying what the instrument simulates."
              },
              "encoding_type": {
                "type": "string",
                "description": "SensorThings encodingType of the metadata field. The instrument is synthetic, so the metadata is prose rather than a datasheet."
              },
              "metadata": {
                "type": "string",
                "description": "The instrument's declared noise model: distribution and standard deviation, stated so a stored value can be scored against the generator's field."
              }
            }
          },
          "observed_property": {
            "title": "ObservedProperty",
            "description": "The quantity, named as the query layer and the coverage store name it, so one vocabulary serves the read path and the write path.",
            "type": "object",
            "required": [
              "id",
              "name",
              "definition",
              "description"
            ],
            "additionalProperties": false,
            "properties": {
              "id": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_]*$",
                "description": "The CF-style name, for example sea_water_temperature."
              },
              "name": {
                "type": "string",
                "description": "The quantity in words."
              },
              "definition": {
                "type": "string",
                "description": "What the name means, as a definition a consumer can resolve to a vocabulary."
              },
              "description": {
                "type": "string",
                "description": "One line for a reader."
              }
            }
          },
          "datastream": {
            "title": "Datastream",
            "description": "The series this observation belongs to, and where the unit of measurement lives. SensorThings puts the unit on the Datastream and not on the Observation, and so does this.",
            "type": "object",
            "required": [
              "name",
              "description",
              "observation_type",
              "unit_of_measurement"
            ],
            "additionalProperties": false,
            "properties": {
              "name": {
                "type": "string",
                "description": "Short name for a reader."
              },
              "description": {
                "type": "string",
                "description": "One line saying what the series is."
              },
              "observation_type": {
                "type": "string",
                "description": "SensorThings observationType. Every series here is a measurement."
              },
              "unit_of_measurement": {
                "title": "Unit of measurement",
                "type": "object",
                "required": [
                  "name",
                  "symbol",
                  "definition"
                ],
                "additionalProperties": false,
                "properties": {
                  "name": {
                    "type": "string",
                    "description": "The unit in words, for example degree Celsius."
                  },
                  "symbol": {
                    "type": "string",
                    "description": "The unit's symbol, for example degC."
                  },
                  "definition": {
                    "type": "string",
                    "description": "The unit as the coverage store spells it, for example degree_C, so a reader can compare a stored observation with a forecast field without a conversion table."
                  }
                }
              }
            }
          },
          "feature_of_interest": {
            "title": "FeatureOfInterest",
            "description": "What the observation is of, in SensorThings terms: the sampled location. The geometry is derived from the message's own position by the ingest client, so it cannot disagree with it.",
            "type": "object",
            "required": [
              "name",
              "description",
              "encoding_type"
            ],
            "additionalProperties": false,
            "properties": {
              "name": {
                "type": "string",
                "description": "Short name for a reader."
              },
              "description": {
                "type": "string",
                "description": "One line saying what the location is. It is where a sample was taken and not a place anything went."
              },
              "encoding_type": {
                "type": "string",
                "description": "SensorThings encodingType of the geometry the ingest client derives, which is GeoJSON."
              }
            }
          }
        }
      }
    },
    "examples": [
      {
        "observation_id": "obs-3f2a91c40e7b5d68",
        "scenario_run_id": "run-20260901-a",
        "sim_time": "2026-09-01T02:15:00.000000Z",
        "tick": 540,
        "thing_id": "platform-a",
        "datastream_id": "ds-temperature",
        "sensor_id": "sensor-temperature",
        "feature_of_interest_id": "foi-6b1d0c2e",
        "observed_property": "temperature",
        "result": 12.418,
        "location": {
          "latitude": 49,
          "longitude": -4.5,
          "depth_m": 25
        },
        "context": {
          "thing": {
            "name": "sampling platform A",
            "description": "A simulated sampling platform. A coordinate and a sampler."
          },
          "sensor": {
            "name": "simulated temperature sensor",
            "description": "Simulated temperature instrument with a seeded noise model.",
            "encoding_type": "text/plain",
            "metadata": "Gaussian noise, standard deviation 0.02 degree Celsius, drawn from the seeded stream sensors.noise."
          },
          "observed_property": {
            "id": "sea_water_temperature",
            "name": "sea water temperature",
            "definition": "sea_water_temperature",
            "description": "Temperature of sea water."
          },
          "datastream": {
            "name": "temperature at platform A",
            "description": "Simulated temperature series.",
            "observation_type": "OM_Measurement",
            "unit_of_measurement": {
              "name": "degree Celsius",
              "symbol": "degC",
              "definition": "degree_C"
            }
          },
          "feature_of_interest": {
            "name": "sampling location 6b1d0c2e",
            "description": "Where an observation pertains to. Not a location history.",
            "encoding_type": "application/geo+json"
          }
        }
      }
    ]
  },
  "offload-telemetry": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/offload-telemetry.schema.json",
    "title": "drogna offload telemetry",
    "description": "What the offload packager (C-17) reports about itself on ctl/telemetry: how many bundles sit in each ledger state, how many verifications have been refused and why the most recent one was, and how full the staging area is against the bound the retention policy holds it to. The counts are the state machine's own tally rather than a second one kept beside it, so a state that stops moving is visible here without anyone reading a ledger file. Verification failures are carried as a count and a reason because a count alone says something is wrong and a reason says which of the six ways it is wrong. This document describes one component's report; a general telemetry envelope, if the telemetry feature decides it wants one, is that feature's to define and this shape is what it will find in use.",
    "type": "object",
    "required": [
      "component",
      "scenario_run_id",
      "sim_time",
      "tick",
      "bundles",
      "verification",
      "staging"
    ],
    "additionalProperties": false,
    "properties": {
      "component": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$",
        "description": "The component reporting, matching config /component/id."
      },
      "scenario_run_id": {
        "type": "string",
        "description": "The scenario run this report belongs to, as carried on every clock sample."
      },
      "sim_time": {
        "type": "string",
        "description": "Simulation time at which the report was composed, ISO-8601 UTC with microsecond precision. Every interval in this component except the heartbeat is measured in simulation time; the heartbeat is real time by ADR-0006."
      },
      "tick": {
        "type": "integer",
        "minimum": 0,
        "description": "The tick index the packager had observed when it composed the report."
      },
      "bundles": {
        "title": "Bundles by ledger state",
        "description": "One count per state the ledger admits. The states move forward only, so a run's bundles migrate rightwards through these counts and a bundle that stops moving is a bundle whose side effect did not complete.",
        "type": "object",
        "required": [
          "staged",
          "transferred",
          "verified",
          "evictable",
          "evicted",
          "failed"
        ],
        "additionalProperties": false,
        "properties": {
          "staged": {
            "type": "integer",
            "minimum": 0,
            "description": "Written to the staging area and not yet transferred."
          },
          "transferred": {
            "type": "integer",
            "minimum": 0,
            "description": "Sent and revealed at the destination, awaiting a receipt that verifies."
          },
          "verified": {
            "type": "integer",
            "minimum": 0,
            "description": "A receipt has matched a digest recomputed from the file on disk. Eligible for eviction, which is not the same as due for it."
          },
          "evictable": {
            "type": "integer",
            "minimum": 0,
            "description": "The retention policy has asked for this bundle's space and the delete has not been confirmed. A bundle sitting here across a restart is re-verified, never deleted on the strength of the record."
          },
          "evicted": {
            "type": "integer",
            "minimum": 0,
            "description": "Deleted locally, after a digest recomputed immediately before the delete matched the verified one."
          },
          "failed": {
            "type": "integer",
            "minimum": 0,
            "description": "A step did not complete. The local bytes are present in every case: no failure path deletes anything."
          }
        }
      },
      "verification": {
        "title": "What has been refused",
        "description": "Refusals are reported rather than swallowed (FR-016). A refusal never changes a local file, so this count rising is a statement about the destination and not about the staging area.",
        "type": "object",
        "required": [
          "refused",
          "verified"
        ],
        "additionalProperties": false,
        "properties": {
          "refused": {
            "type": "integer",
            "minimum": 0,
            "description": "Receipts refused this run, across every reason."
          },
          "verified": {
            "type": "integer",
            "minimum": 0,
            "description": "Receipts accepted this run."
          },
          "last_refusal": {
            "type": "string",
            "description": "Why the most recent refusal was refused, in the words the verifier used. Absent when nothing has been refused."
          }
        }
      },
      "staging": {
        "title": "The staging area against its bound",
        "description": "Bytes held against the bytes the retention policy permits. At or over the bound with nothing eligible for eviction, the packager stops producing bundles and says so here rather than making room.",
        "type": "object",
        "required": [
          "bytes",
          "bound_bytes",
          "at_bound",
          "producing"
        ],
        "additionalProperties": false,
        "properties": {
          "bytes": {
            "type": "integer",
            "minimum": 0,
            "description": "What the staging area holds now, partial files included."
          },
          "bound_bytes": {
            "type": "integer",
            "minimum": 1,
            "description": "The configured bound the retention policy holds it to."
          },
          "at_bound": {
            "type": "boolean",
            "description": "True when the staging area is at or over its bound."
          },
          "producing": {
            "type": "boolean",
            "description": "Whether the packager is still writing new bundles. False when the staging area is at its bound and nothing is eligible for eviction: eviction stays gated on a receipt, so the correct behaviour is to stop producing and report."
          }
        }
      }
    },
    "examples": [
      {
        "component": "offload",
        "scenario_run_id": "run-000000-7f80b47c7b91",
        "sim_time": "2026-09-01T01:00:05.000000Z",
        "tick": 3605,
        "bundles": {
          "staged": 1,
          "transferred": 0,
          "verified": 2,
          "evictable": 0,
          "evicted": 3,
          "failed": 0
        },
        "verification": {
          "refused": 1,
          "verified": 5,
          "last_refusal": "b-3f2a1c0d9e8b7a65: the destination returned success with no receipt body"
        },
        "staging": {
          "bytes": 12288,
          "bound_bytes": 1048576,
          "at_bound": false,
          "producing": true
        }
      }
    ]
  },
  "plan": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/plan.schema.json",
    "title": "drogna sampling recommendation",
    "description": "What the planner publishes on ctl/plan. It names the planning cells where sampling would reduce uncertainty most, states by how much, and states for every region in the domain when its confidence will lapse. What it is not is worth saying in the document rather than leaving to convention: it is not an instruction. There is no addressee, no recipient, no priority to be obeyed and no field naming anything that is to be done, because the harness is headless with respect to decisions and rendering and advice happen downstream (SRD FR-36, Constitution VIII). The stronger form of that guarantee is structural: every string property in this document is an enumeration, a constant, an identifier matching a declared pattern, or a simulation instant, so there is nowhere a sentence addressed to a person could be written. The route's value is collapse-aware — it already accounts for the sampling the route does on its way, so a consumer that summed the vertices' standalone values would obtain a larger and wrong number (SRD FR-32, FR-33).",
    "type": "object",
    "required": [
      "component",
      "scenario_run_id",
      "sim_time",
      "tick",
      "kind",
      "plan_id",
      "supersedes",
      "state",
      "empty_reason",
      "horizon",
      "uncertainty_field",
      "indexing",
      "platform",
      "route",
      "selection",
      "commitment",
      "projection"
    ],
    "additionalProperties": false,
    "properties": {
      "component": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$",
        "description": "The component id of the planner that produced it, matching config /component/id."
      },
      "scenario_run_id": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9_.-]*$",
        "description": "The scenario run this recommendation belongs to, as carried on every clock sample."
      },
      "sim_time": {
        "$ref": "#/$defs/sim_time",
        "description": "Simulation time at which the recommendation was produced."
      },
      "tick": {
        "type": "integer",
        "minimum": 0,
        "description": "The tick index the planner had observed. A tick is the unit of causality; an instant is not."
      },
      "kind": {
        "type": "string",
        "const": "sampling-recommendation",
        "description": "What this message is, stated in the payload so that a reader who has only the bytes knows it is a recommendation. There is deliberately no second value."
      },
      "plan_id": {
        "type": "string",
        "pattern": "^[0-9a-f]{8,64}$",
        "description": "Deterministic identifier derived from the run's root seed and this recommendation's ordinal, never from entropy or a host clock (Constitution II)."
      },
      "supersedes": {
        "type": [
          "string",
          "null"
        ],
        "pattern": "^[0-9a-f]{8,64}$",
        "description": "The plan_id this recommendation replaces, or null for the first of a scenario. Carried so a consumer can tell a replan from a first plan without keeping a history of its own."
      },
      "state": {
        "type": "string",
        "enum": [
          "planning",
          "no-field",
          "nothing-worth-sampling"
        ],
        "description": "What the planner was able to do. The same three states the planner's heartbeat carries, so a reader of either can say why a route is empty."
      },
      "empty_reason": {
        "type": [
          "string",
          "null"
        ],
        "enum": [
          "no-field",
          "budget-too-small",
          "nothing-worth-sampling",
          null
        ],
        "description": "Why the route is empty, or null when it is not. An empty route is stated with its reason rather than replaced by the nearest cell as a consolation: a planner that always recommends motion is a planner nobody can trust when it recommends motion."
      },
      "horizon": {
        "$ref": "#/$defs/horizon"
      },
      "uncertainty_field": {
        "$ref": "#/$defs/uncertainty_field"
      },
      "indexing": {
        "$ref": "#/$defs/indexing"
      },
      "platform": {
        "$ref": "#/$defs/platform"
      },
      "route": {
        "$ref": "#/$defs/route"
      },
      "selection": {
        "$ref": "#/$defs/selection"
      },
      "commitment": {
        "$ref": "#/$defs/commitment"
      },
      "projection": {
        "$ref": "#/$defs/projection"
      }
    },
    "$defs": {
      "sim_time": {
        "title": "Simulation instant",
        "type": "string",
        "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$",
        "description": "A simulation instant, ISO-8601 UTC with microsecond precision, taken from the clock port. Never a host clock value, and never a format that would invite one (Constitution I)."
      },
      "h3_index": {
        "title": "H3 cell index",
        "type": "string",
        "pattern": "^[0-9a-f]{15,16}$",
        "description": "An H3 cell index in its usual lower-case hexadecimal spelling. The resolution it belongs to is stated once, under indexing, rather than implied per vertex."
      },
      "horizon": {
        "title": "Planning horizon",
        "description": "The span of simulation time this recommendation reasons over. The horizon recedes: each replan moves both ends forward, and the projection is computed to its far end.",
        "type": "object",
        "required": [
          "start_sim_time",
          "end_sim_time",
          "span_seconds"
        ],
        "additionalProperties": false,
        "properties": {
          "start_sim_time": {
            "$ref": "#/$defs/sim_time"
          },
          "end_sim_time": {
            "$ref": "#/$defs/sim_time"
          },
          "span_seconds": {
            "type": "number",
            "exclusiveMinimum": 0,
            "description": "The horizon's length in seconds of simulation time."
          }
        }
      },
      "uncertainty_field": {
        "title": "The field planned against",
        "description": "Which published uncertainty field this recommendation was computed from, read through the coverage read port. A recommendation is never produced against a field that has already been superseded, and naming the field here is what lets a reader check that rather than trust it.",
        "type": "object",
        "required": [
          "run_id",
          "variable",
          "digest"
        ],
        "additionalProperties": false,
        "properties": {
          "run_id": {
            "type": "string",
            "pattern": "^[A-Za-z0-9][A-Za-z0-9_.-]*$",
            "description": "The model run whose per-cell ensemble spread was read."
          },
          "variable": {
            "type": "string",
            "enum": [
              "temperature_spread",
              "salinity_spread"
            ],
            "description": "Which published spread variable the planner scored. One scalar field is scored, not both: combining degrees Celsius with practical salinity units needs a weighting between them that nothing in the requirements supplies, so none is invented here."
          },
          "digest": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^sha256:[0-9a-f]{64}$",
            "description": "Digest of the field's bytes where the announcement carried one, so a reader with the same bytes can say it read the same field. Null when the field was supplied without one."
          }
        }
      },
      "indexing": {
        "title": "How the domain is indexed",
        "description": "H3 in the horizontal at one stated resolution, layered with a separate depth index (SRD FR-35). The resolution is stated in every recommendation so the granularity of a recommendation is visible rather than implied: a route through resolution-6 cells is a coarser claim than one through resolution-9 cells, and the difference is not recoverable from the vertices.",
        "type": "object",
        "required": [
          "h3_resolution",
          "depth_bands"
        ],
        "additionalProperties": false,
        "properties": {
          "h3_resolution": {
            "type": "integer",
            "minimum": 0,
            "maximum": 15,
            "description": "The H3 resolution every h3_index in this message belongs to."
          },
          "depth_bands": {
            "type": "array",
            "minItems": 1,
            "description": "The vertical index, shallowest first. A planning cell is the pairing of an H3 index with one of these bands.",
            "items": {
              "$ref": "#/$defs/depth_band"
            }
          }
        }
      },
      "depth_band": {
        "title": "Depth band",
        "type": "object",
        "required": [
          "index",
          "minimum_depth_m",
          "maximum_depth_m"
        ],
        "additionalProperties": false,
        "properties": {
          "index": {
            "type": "integer",
            "minimum": 0,
            "description": "Position in the vertical index, shallowest first. This is what a vertex's depth_band refers to."
          },
          "minimum_depth_m": {
            "type": "number",
            "minimum": 0,
            "description": "Shallow edge of the band in metres, positive downwards."
          },
          "maximum_depth_m": {
            "type": "number",
            "minimum": 0,
            "description": "Deep edge of the band in metres, positive downwards."
          }
        }
      },
      "platform": {
        "title": "Where the sampling platform is",
        "description": "A position, a depth and a budget. Nothing else: no heading, no speed, no identity carried between one recommendation and the next, and no history. A sampling platform in drogna is a coordinate and a sampler (Constitution V).",
        "type": "object",
        "required": [
          "latitude",
          "longitude",
          "depth_m"
        ],
        "additionalProperties": false,
        "properties": {
          "latitude": {
            "type": "number",
            "minimum": -90,
            "maximum": 90,
            "description": "Degrees north, WGS 84."
          },
          "longitude": {
            "type": "number",
            "minimum": -180,
            "maximum": 180,
            "description": "Degrees east, WGS 84."
          },
          "depth_m": {
            "type": "number",
            "minimum": 0,
            "description": "Depth below the surface in metres, positive downwards."
          }
        }
      },
      "route": {
        "title": "The recommended route",
        "description": "One ordered sequence of planning cells, chosen under a budget. It is not a tour: most candidates are deliberately left unvisited, there is no return to the origin, and the count of what was considered against what was chosen is carried under selection so that the difference is checkable. Each vertex is four-dimensional — an H3 index, a depth band and an arrival instant — so the recommendation is a curve through the forecast volume rather than a line on a chart.",
        "type": "object",
        "required": [
          "vertices",
          "value",
          "value_without_collapse",
          "budget_seconds",
          "consumed_seconds",
          "distance_m"
        ],
        "additionalProperties": false,
        "properties": {
          "vertices": {
            "type": "array",
            "description": "The route in order. Empty when there is nothing worth recommending, in which case empty_reason says why.",
            "items": {
              "$ref": "#/$defs/vertex"
            }
          },
          "value": {
            "type": "number",
            "minimum": 0,
            "description": "The route's collapse-aware value: the sum of the marginal uncertainty reductions in traversal order, each measured against the field as it stands after every earlier visit has collapsed it and after regrowth to that arrival instant. Diminishing returns are already inside this number and must not be applied again by a consumer."
          },
          "value_without_collapse": {
            "type": "number",
            "minimum": 0,
            "description": "What the same route would have been worth had each vertex been scored against the field as it stood at the horizon's start, with no earlier visit having collapsed it — the sum a consumer would reach from standalone per-cell values. It is carried because the gap between the two is the size of the error the arrival-time scoring avoids, and a number nobody can see is a number nobody checks. On a field that does not change across the horizon it is never smaller than value. Where it is smaller, the field itself grew between the horizon's start and the arrivals, and the gap is the same error in the other direction: a planner scoring against the present would have undervalued the route. That case is why the naive figure is published beside the collapse-aware one rather than left to be inferred."
          },
          "budget_seconds": {
            "type": "number",
            "minimum": 0,
            "description": "The traversal budget in seconds of simulation time, at the configured nominal speeds."
          },
          "consumed_seconds": {
            "type": "number",
            "minimum": 0,
            "description": "What the route consumes of that budget. A route consuming more than its budget is a defect, not a suggestion."
          },
          "distance_m": {
            "type": "number",
            "minimum": 0,
            "description": "Great-circle distance along the route, in metres. Horizontal only; the vertical component of the cost is in consumed_seconds."
          }
        }
      },
      "vertex": {
        "title": "Route vertex",
        "description": "One planning cell on the route, with the simulation instant at which it would be reached. The instant is what makes the collapse simulation reproducible by a reader: regrowth between two vertices is a function of the interval between their arrival instants and the local decorrelation timescale.",
        "type": "object",
        "required": [
          "sequence",
          "h3_index",
          "depth_band",
          "arrival_sim_time",
          "latitude",
          "longitude",
          "depth_m",
          "marginal_value"
        ],
        "additionalProperties": false,
        "properties": {
          "sequence": {
            "type": "integer",
            "minimum": 0,
            "description": "Position along the route, counting from zero. Carried explicitly so that array order is not the only thing asserting it."
          },
          "h3_index": {
            "$ref": "#/$defs/h3_index"
          },
          "depth_band": {
            "type": "integer",
            "minimum": 0,
            "description": "Index into indexing/depth_bands."
          },
          "arrival_sim_time": {
            "$ref": "#/$defs/sim_time"
          },
          "latitude": {
            "type": "number",
            "minimum": -90,
            "maximum": 90,
            "description": "Centre of the H3 cell, degrees north."
          },
          "longitude": {
            "type": "number",
            "minimum": -180,
            "maximum": 180,
            "description": "Centre of the H3 cell, degrees east."
          },
          "depth_m": {
            "type": "number",
            "minimum": 0,
            "description": "Centre of the depth band in metres, positive downwards."
          },
          "marginal_value": {
            "type": "number",
            "minimum": 0,
            "description": "What this vertex adds to the route's value, measured against the field as it stands when the vertex is reached. A vertex reached after a nearer one has already resolved the water around it carries a small number here, and that is the whole of the diminishing-returns behaviour, visible per vertex."
          }
        }
      },
      "selection": {
        "title": "How the route was chosen",
        "description": "The problem formulation and the heuristic, carried so that a reader can say what kind of answer this is. Route selection is orienteering — cells carry prizes, traversal carries cost, a subset is chosen under a budget — and explicitly not travelling-salesman: there is no requirement that every candidate be visited and no tour to close.",
        "type": "object",
        "required": [
          "formulation",
          "heuristic",
          "candidate_cell_count",
          "visited_cell_count",
          "restarts"
        ],
        "additionalProperties": false,
        "properties": {
          "formulation": {
            "type": "string",
            "const": "orienteering-prize-collecting",
            "description": "The problem this is a solution to. There is deliberately no second value: a tour formulation would be a different component."
          },
          "heuristic": {
            "type": "string",
            "const": "greedy-insertion-seeded-restarts",
            "description": "Orienteering is NP-hard and nothing here requires optimality. What it requires is the right formulation and determinism, so the search is a greedy insertion with a fixed number of seeded randomised restarts and seeded tie-breaks."
          },
          "candidate_cell_count": {
            "type": "integer",
            "minimum": 0,
            "description": "How many planning cells were considered."
          },
          "visited_cell_count": {
            "type": "integer",
            "minimum": 0,
            "description": "How many were chosen. Smaller than candidate_cell_count whenever the budget binds, which is what prize-collecting looks like from outside."
          },
          "restarts": {
            "type": "integer",
            "minimum": 1,
            "description": "How many randomised restarts the search ran, every draw taken from the seeded generator so the same field, budget and seed give the same route."
          }
        }
      },
      "commitment": {
        "title": "What was held to, and what was abandoned",
        "description": "The planner replans on a receding horizon and holds its commitment: the part of the previous route falling inside the commitment window is retained unless changing it improves the value by more than the configured margin. Commitment without hysteresis is not commitment, and a departure is recorded with its margin so that a reader can see the planner changed its mind and by how much.",
        "type": "object",
        "required": [
          "window_seconds",
          "retained_vertex_count",
          "departed_from_previous",
          "improvement_over_retained",
          "margin"
        ],
        "additionalProperties": false,
        "properties": {
          "window_seconds": {
            "type": "number",
            "minimum": 0,
            "description": "The commitment window in seconds of simulation time, measured forward from this recommendation's start."
          },
          "retained_vertex_count": {
            "type": "integer",
            "minimum": 0,
            "description": "How many vertices of the previous route survive unchanged at the head of this one."
          },
          "departed_from_previous": {
            "type": "boolean",
            "description": "Whether the committed prefix was abandoned. False for a first recommendation, which has no predecessor to depart from."
          },
          "improvement_over_retained": {
            "type": "number",
            "minimum": 0,
            "description": "Value of the freely replanned route minus the value of the route that keeps the committed prefix. Zero when there was no predecessor."
          },
          "margin": {
            "type": "number",
            "minimum": 0,
            "description": "The improvement the free route had to beat to justify departing, as an absolute value in the same units as route/value."
          }
        }
      },
      "projection": {
        "title": "When confidence lapses",
        "description": "Uncertainty projected forward from the current field to the end of the horizon, region by region, so the output is schedulable rather than merely reactive: a consumer can reason about a stated future instant instead of waiting for a present condition. Every region in the domain appears here. Omission is not permitted, because an absent region reads as a healthy one.",
        "type": "object",
        "required": [
          "step_seconds",
          "horizon_seconds",
          "usable_threshold",
          "region_count",
          "regions"
        ],
        "additionalProperties": false,
        "properties": {
          "step_seconds": {
            "type": "number",
            "exclusiveMinimum": 0,
            "description": "The forward march's step in seconds of simulation time. A crossing instant is resolved to this step: the growth law has a closed form, but the projection is marched so that a growth law without one would need no new machinery."
          },
          "horizon_seconds": {
            "type": "number",
            "exclusiveMinimum": 0,
            "description": "How far forward the march ran, in seconds of simulation time."
          },
          "usable_threshold": {
            "type": "number",
            "exclusiveMinimum": 0,
            "description": "The uncertainty above which confidence is no longer usable, in the units of the scored spread variable. Scenario configuration; nothing in the requirements fixes a value."
          },
          "region_count": {
            "type": "integer",
            "minimum": 0,
            "description": "How many regions the domain has. Equal to the length of regions, carried so that a truncated message is detectable rather than merely shorter."
          },
          "regions": {
            "type": "array",
            "description": "One entry per region, ordered by H3 index so two replays produce the same bytes.",
            "items": {
              "$ref": "#/$defs/projection_entry"
            }
          }
        }
      },
      "projection_entry": {
        "title": "One region's projection",
        "description": "A region is one H3 cell. Its state is decided by whichever of its depth bands lapses first, and that band is named, because a region that is usable at the surface and blind at depth is not a usable region.",
        "type": "object",
        "required": [
          "h3_index",
          "depth_band",
          "state",
          "crossing_sim_time",
          "uncertainty_now",
          "saturated_uncertainty",
          "timescale_seconds"
        ],
        "additionalProperties": false,
        "properties": {
          "h3_index": {
            "$ref": "#/$defs/h3_index"
          },
          "depth_band": {
            "type": "integer",
            "minimum": 0,
            "description": "The band whose confidence lapses first, or the band with the largest projected uncertainty where none lapses."
          },
          "state": {
            "type": "string",
            "enum": [
              "crossing",
              "already-lapsed",
              "no-crossing-within-horizon"
            ],
            "description": "crossing: confidence falls below usable at crossing_sim_time. already-lapsed: it is already below now, which is what arriving cold looks like. no-crossing-within-horizon: it does not lapse before the horizon ends, stated explicitly rather than by absence."
          },
          "crossing_sim_time": {
            "oneOf": [
              {
                "$ref": "#/$defs/sim_time"
              },
              {
                "type": "null"
              }
            ],
            "description": "The simulation instant at which confidence falls below usable, resolved to one projection step. Null when the state is no-crossing-within-horizon."
          },
          "uncertainty_now": {
            "type": "number",
            "minimum": 0,
            "description": "The region's uncertainty at sim_time, in the units of the scored spread variable."
          },
          "saturated_uncertainty": {
            "type": "number",
            "minimum": 0,
            "description": "What the region's uncertainty grows back to given unlimited time without a measurement: the published ensemble spread there. A region whose saturated uncertainty is below the threshold never lapses however long it is left, and says so."
          },
          "timescale_seconds": {
            "type": "number",
            "exclusiveMinimum": 0,
            "description": "The decorrelation timescale evaluated at this region, in seconds. It is a field with a domain-wide background, so every region has one — including open water outside every seeded feature — and there is no fallback constant anywhere in this message (ADR-0002, SRD FR-05)."
          }
        }
      }
    },
    "examples": [
      {
        "component": "planner",
        "scenario_run_id": "run-20260901-a",
        "sim_time": "2026-09-01T04:00:00.000000Z",
        "tick": 960,
        "kind": "sampling-recommendation",
        "plan_id": "9a1c7f04d2b3e558",
        "supersedes": "3d0b6e91a7c4f210",
        "state": "planning",
        "empty_reason": null,
        "horizon": {
          "start_sim_time": "2026-09-01T04:00:00.000000Z",
          "end_sim_time": "2026-09-01T07:00:00.000000Z",
          "span_seconds": 10800
        },
        "uncertainty_field": {
          "run_id": "run-000017-3c1aead663b1",
          "variable": "temperature_spread",
          "digest": "sha256:0f4c1e5b6a2d8397f0c1b2a3948576e5d4c3b2a1908172635445362718293a0b"
        },
        "indexing": {
          "h3_resolution": 6,
          "depth_bands": [
            {
              "index": 0,
              "minimum_depth_m": 0,
              "maximum_depth_m": 50
            },
            {
              "index": 1,
              "minimum_depth_m": 50,
              "maximum_depth_m": 150
            }
          ]
        },
        "platform": {
          "latitude": 49,
          "longitude": -4.5,
          "depth_m": 0
        },
        "route": {
          "vertices": [
            {
              "sequence": 0,
              "h3_index": "861968a07ffffff",
              "depth_band": 0,
              "arrival_sim_time": "2026-09-01T04:41:40.000000Z",
              "latitude": 49.05,
              "longitude": -4.41,
              "depth_m": 25,
              "marginal_value": 18.4
            },
            {
              "sequence": 1,
              "h3_index": "861968a0fffffff",
              "depth_band": 1,
              "arrival_sim_time": "2026-09-01T05:35:00.000000Z",
              "latitude": 49.11,
              "longitude": -4.33,
              "depth_m": 100,
              "marginal_value": 6.1
            }
          ],
          "value": 24.5,
          "value_without_collapse": 37.2,
          "budget_seconds": 10800,
          "consumed_seconds": 5700,
          "distance_m": 21400
        },
        "selection": {
          "formulation": "orienteering-prize-collecting",
          "heuristic": "greedy-insertion-seeded-restarts",
          "candidate_cell_count": 96,
          "visited_cell_count": 2,
          "restarts": 8
        },
        "commitment": {
          "window_seconds": 1800,
          "retained_vertex_count": 1,
          "departed_from_previous": false,
          "improvement_over_retained": 0.3,
          "margin": 2
        },
        "projection": {
          "step_seconds": 300,
          "horizon_seconds": 10800,
          "usable_threshold": 0.35,
          "region_count": 2,
          "regions": [
            {
              "h3_index": "861968a07ffffff",
              "depth_band": 1,
              "state": "crossing",
              "crossing_sim_time": "2026-09-01T05:50:00.000000Z",
              "uncertainty_now": 0.18,
              "saturated_uncertainty": 0.62,
              "timescale_seconds": 5400
            },
            {
              "h3_index": "861968a0fffffff",
              "depth_band": 0,
              "state": "no-crossing-within-horizon",
              "crossing_sim_time": null,
              "uncertainty_now": 0.09,
              "saturated_uncertainty": 0.21,
              "timescale_seconds": 43200
            }
          ]
        }
      }
    ]
  },
  "query-subsets": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/query-subsets.schema.json",
    "title": "drogna query subset statement",
    "description": "The served account of exactly which subset of each standard the query component implements (SRD-v2 FR-27, E9, Constitution VI). Served on the control plane, and held equal to the documented account (docs/architecture/query-subsets.md) by a test — the conformance statement is amended in the same commit as the code, and a divergence between the served and documented accounts fails the build.",
    "type": "object",
    "required": [
      "schema_version",
      "edr",
      "sensorthings"
    ],
    "additionalProperties": false,
    "properties": {
      "schema_version": {
        "type": "integer",
        "const": 1
      },
      "edr": {
        "type": "object",
        "required": [
          "standard",
          "query_types",
          "parameters",
          "interpolation",
          "refused_by_name"
        ],
        "additionalProperties": false,
        "properties": {
          "standard": {
            "type": "string"
          },
          "query_types": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "parameters": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "interpolation": {
            "type": "string"
          },
          "refused_by_name": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Query types and options that exist in the standard, are not implemented, and are refused with their own name in the refusal."
          }
        }
      },
      "sensorthings": {
        "type": "object",
        "required": [
          "standard",
          "resources",
          "query_options",
          "refused_by_name"
        ],
        "additionalProperties": false,
        "properties": {
          "standard": {
            "type": "string"
          },
          "resources": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "query_options": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "refused_by_name": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        }
      }
    }
  },
  "run-manifest": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/run-manifest.schema.json",
    "title": "drogna run manifest",
    "description": "The record from which a run can be started again. Together with the code version it names, this document is sufficient input to a replay: no other file, flag or environment is consulted. It records digests of configuration and never configuration values, so a manifest can be published without leaking whatever a config file happens to carry. Named run-manifest to distinguish it from the environment generator's ground-truth manifest, which refers to a run by run_id. Two components write a document of this shape and they do not write the same one: C-01 writes the run's own manifest as the run starts, and the offload packager writes the copy that travels beside a bundle. The difference between them is measurement_geometry, which only the second one is in a position to know, which is why it is optional here and why a manifest is withheld rather than released — a manifest carrying the geometry is the document that says where the measurements were taken (FR-42).",
    "type": "object",
    "required": [
      "schema_version",
      "run_id",
      "root_seed",
      "seed_derivation",
      "clock",
      "code_version",
      "participants",
      "exit_state",
      "non_reproducible"
    ],
    "additionalProperties": false,
    "properties": {
      "schema_version": {
        "type": "integer",
        "const": 1,
        "description": "Bumped when the shape changes in a way a reader must notice."
      },
      "run_id": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]*$",
        "description": "Identity of the run. Deterministic: derived from seed and scenario, never from entropy or a host clock."
      },
      "root_seed": {
        "type": "integer",
        "minimum": 0,
        "description": "The seed every generator in the run derives from."
      },
      "seed_derivation": {
        "type": "object",
        "required": [
          "rule",
          "version"
        ],
        "additionalProperties": false,
        "description": "How per-stream seeds come from the root seed. Recorded as a rule rather than a table of seeds, because the rule is a pure function of root seed and stream name and so recomputes exactly.",
        "properties": {
          "rule": {
            "type": "string",
            "description": "Rule name, for example harness-rng."
          },
          "version": {
            "type": "integer",
            "minimum": 1,
            "description": "Rule version. A change here changes every sequence in every replay."
          }
        }
      },
      "clock": {
        "type": "object",
        "required": [
          "epoch",
          "tick_interval_us",
          "mode",
          "rate"
        ],
        "additionalProperties": false,
        "description": "The clock configuration the run started with. Tick values follow from epoch and interval alone.",
        "properties": {
          "epoch": {
            "type": "string",
            "description": "Simulation epoch, ISO-8601 UTC with microsecond precision."
          },
          "tick_interval_us": {
            "type": "integer",
            "exclusiveMinimum": 0,
            "description": "Simulation microseconds between ticks."
          },
          "mode": {
            "type": "string",
            "enum": [
              "realtime",
              "accelerated",
              "paused",
              "lockstep"
            ],
            "description": "Byte-identical replay is claimed for lockstep only. The free-running modes reproduce drawn values, not interleaving."
          },
          "rate": {
            "type": "number",
            "minimum": 0,
            "description": "Emission rate. Zero means pinned."
          },
          "min_rate": {
            "type": "number",
            "minimum": 0
          },
          "max_rate": {
            "type": "number",
            "minimum": 0
          },
          "lockstep_deadline_seconds": {
            "type": "number",
            "exclusiveMinimum": 0,
            "description": "How long the clock waits for an outstanding acknowledgement before reporting a stall. It never skips the tick."
          }
        }
      },
      "code_version": {
        "type": "object",
        "required": [
          "revision"
        ],
        "additionalProperties": false,
        "description": "The code the run executed. A replay claims byte-identical output only against the same revision.",
        "properties": {
          "revision": {
            "type": "string",
            "description": "Commit identifier, or a build identifier where there is no commit."
          },
          "dirty": {
            "type": "boolean",
            "description": "True when the working tree carried uncommitted changes, in which case the revision does not identify the code and the replay claim does not hold."
          }
        }
      },
      "participants": {
        "type": "array",
        "description": "Components that registered with the clock, with the digest of the configuration each was started from. Digests only: never values.",
        "items": {
          "type": "object",
          "required": [
            "id",
            "role",
            "config_digest"
          ],
          "additionalProperties": false,
          "properties": {
            "id": {
              "type": "string",
              "pattern": "^[a-z][a-z0-9_-]*$"
            },
            "role": {
              "type": "string",
              "enum": [
                "observer",
                "lockstep"
              ]
            },
            "config_digest": {
              "type": "string",
              "pattern": "^sha256:[0-9a-f]{64}$",
              "description": "SHA-256 of the configuration file as read."
            },
            "registered_tick": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 0,
              "description": "The tick at which the registration was observed."
            }
          }
        }
      },
      "streams": {
        "type": "array",
        "description": "Named RNG streams the run is expected to use. Listed so that two call sites accidentally sharing one stream shows up in the document rather than as a puzzle in the output.",
        "items": {
          "type": "string"
        }
      },
      "exit_state": {
        "type": "object",
        "required": [
          "state"
        ],
        "additionalProperties": false,
        "description": "How the run ended. Written atomically, so no reader sees a partial document.",
        "properties": {
          "state": {
            "type": "string",
            "enum": [
              "running",
              "completed",
              "failed",
              "stalled"
            ]
          },
          "final_tick": {
            "type": [
              "integer",
              "null"
            ],
            "minimum": 0,
            "description": "The last tick emitted."
          },
          "detail": {
            "type": "string",
            "x-non-reproducible": true,
            "description": "Free-text diagnostic. Declared non-reproducible: it may name a host, a duration or an exception message, none of which a replay is expected to match."
          }
        }
      },
      "non_reproducible": {
        "type": "array",
        "description": "JSON pointers a replay comparison excludes. Declared in the document as well as annotated in the schema, so a comparison needs the manifest alone.",
        "items": {
          "type": "string",
          "pattern": "^/"
        }
      },
      "measurement_geometry": {
        "$ref": "#/$defs/measurement_geometry",
        "description": "Where the run's measurements were taken, and the terms a release of that run is scored on. Optional, and the reason is the thing a reader will otherwise get wrong: C-01 writes the run's own manifest and holds no observations, so the manifest on the run-data volume does not carry this block and is complete without it; the offload packager writes the copy that travels beside a bundle and does know the geometry, so that copy carries it. A consumer that needs the geometry — the updated-region half of the leakage gate is the only one — must refuse a manifest without this block rather than read the absence as an empty geometry, because an empty geometry makes every comparison inconclusive and an inconclusive result nobody reads is indistinguishable from a pass (FR-015, FR-017)."
      }
    },
    "$defs": {
      "measurement_geometry": {
        "title": "Measurement geometry",
        "description": "The ground truth the change mask between two successive released products is scored against. Held in the manifest rather than beside the products because it is the same class of thing as the seeds: the record of what the run actually did, which is what makes a claim about a release checkable, and which is exactly what a release must not contain.",
        "type": "object",
        "required": [
          "identification_radius_m",
          "interval_seconds",
          "measurements"
        ],
        "additionalProperties": false,
        "properties": {
          "identification_radius_m": {
            "type": "number",
            "exclusiveMinimum": 0,
            "description": "How close to a measurement a released value has to be before it identifies where that measurement was taken. It travels with the geometry rather than being read from a deployment's policy alone, so a run scored long after it finished is scored on the radius it was released under and not on whatever the boundary has been widened to since."
          },
          "interval_seconds": {
            "type": "integer",
            "exclusiveMinimum": 0,
            "description": "How long the interval between two successive released products is, in simulation seconds. Stated rather than inferred from the measurements: a geometry covering a shorter span than the products it is scored against would leave the cells that moved unaccounted for, and a mask nobody can account for scores at chance for the wrong reason."
          },
          "measurements": {
            "type": "array",
            "minItems": 1,
            "description": "Every place a measurement was taken in the interval. At least one, because a geometry with none is not a geometry: it buffers to no cells, every comparison against it is inconclusive, and a document that could produce that silently is worse than one that is refused.",
            "items": {
              "$ref": "#/$defs/measurement"
            }
          }
        }
      },
      "measurement": {
        "title": "Measurement position",
        "description": "One place a measurement was taken, and when in the interval. Position and simulation time only: what was measured is an observation and lives in the observation store, and repeating it here would put a second copy of the values in the one document that must never be released.",
        "type": "object",
        "required": [
          "longitude",
          "latitude",
          "simulation_seconds"
        ],
        "additionalProperties": false,
        "properties": {
          "longitude": {
            "type": "number",
            "minimum": -180,
            "maximum": 180,
            "description": "Degrees east. Bounded so that a pair written the other way round, or in radians, is refused here rather than scored as a geometry somewhere else entirely — which would put the buffered cells nowhere near the mask and read as a clean release."
          },
          "latitude": {
            "type": "number",
            "minimum": -90,
            "maximum": 90,
            "description": "Degrees north. Bounded for the same reason as the longitude beside it, and separately because the metres-per-degree conversion the buffer uses is only meaningful inside this range."
          },
          "simulation_seconds": {
            "type": "integer",
            "minimum": 0,
            "description": "When in the interval the measurement was taken, counted in simulation seconds from the interval's start. Simulation time and not a host clock, so that a replay of the run produces the same geometry and the gate's verdict is reproducible (Constitution I, Constitution II)."
          }
        }
      }
    }
  },
  "run-published": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/run-published.schema.json",
    "title": "drogna model run published",
    "description": "The message the publisher publishes on ctl/run-published once a completed run has become visible in one indivisible step. It is how every consumer learns that a new forecast exists: nothing in drogna polls the query layer to ask whether anything has changed. It carries the collection identifiers under which the two fields are servable, so a consumer can address them without a configuration file having been edited anywhere.",
    "type": "object",
    "required": [
      "component",
      "scenario_run_id",
      "sim_time",
      "tick",
      "run_id",
      "current",
      "valid_time",
      "grid_bounds",
      "collections",
      "digests"
    ],
    "additionalProperties": false,
    "properties": {
      "component": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$",
        "description": "The publisher, matching config /component/id."
      },
      "scenario_run_id": {
        "type": "string",
        "description": "The scenario run this belongs to."
      },
      "sim_time": {
        "type": "string",
        "description": "Simulation time at which the run became visible, ISO-8601 UTC with microsecond precision."
      },
      "tick": {
        "type": "integer",
        "minimum": 0,
        "description": "The tick index the publisher had observed."
      },
      "run_id": {
        "type": "string",
        "description": "The model run that has been published."
      },
      "current": {
        "type": "boolean",
        "description": "Whether this run is now the current one. Announced rather than assumed, because a run can be published for inspection without being made current."
      },
      "valid_time": {
        "$ref": "#/$defs/valid_time"
      },
      "grid_bounds": {
        "$ref": "#/$defs/grid_bounds"
      },
      "collections": {
        "$ref": "#/$defs/collections"
      },
      "digests": {
        "$ref": "#/$defs/digests"
      }
    },
    "$defs": {
      "valid_time": {
        "title": "Valid time range",
        "description": "The simulation-time span the forecast covers, inclusive of both ends.",
        "type": "object",
        "required": [
          "start_sim_time",
          "end_sim_time"
        ],
        "additionalProperties": false,
        "properties": {
          "start_sim_time": {
            "type": "string",
            "description": "Simulation time of the first forecast step."
          },
          "end_sim_time": {
            "type": "string",
            "description": "Simulation time of the last forecast step."
          }
        }
      },
      "grid_bounds": {
        "title": "Grid bounds",
        "description": "The extent of the published grid on all three spatial axes. Depth increases downwards, as the field itself says explicitly.",
        "type": "object",
        "required": [
          "minimum_latitude",
          "maximum_latitude",
          "minimum_longitude",
          "maximum_longitude",
          "minimum_depth_m",
          "maximum_depth_m"
        ],
        "additionalProperties": false,
        "properties": {
          "minimum_latitude": {
            "type": "number",
            "minimum": -90,
            "maximum": 90
          },
          "maximum_latitude": {
            "type": "number",
            "minimum": -90,
            "maximum": 90
          },
          "minimum_longitude": {
            "type": "number",
            "minimum": -180,
            "maximum": 180
          },
          "maximum_longitude": {
            "type": "number",
            "minimum": -180,
            "maximum": 180
          },
          "minimum_depth_m": {
            "type": "number",
            "minimum": 0
          },
          "maximum_depth_m": {
            "type": "number",
            "minimum": 0
          }
        }
      },
      "collections": {
        "title": "Servable collections",
        "description": "The identifiers under which the query layer serves this run's two fields. They are resolved from the store's layout at request time, so publishing a run adds collections without editing any configuration.",
        "type": "object",
        "required": [
          "forecast",
          "uncertainty"
        ],
        "additionalProperties": false,
        "properties": {
          "forecast": {
            "type": "string",
            "minLength": 1,
            "description": "Collection identifier of the ensemble mean."
          },
          "uncertainty": {
            "type": "string",
            "minLength": 1,
            "description": "Collection identifier of the per-cell ensemble spread."
          }
        }
      },
      "digests": {
        "title": "Field digests",
        "description": "SHA-256 digests of the two published fields. A reader that has both bytes and digest can say which run it read, which is what makes the atomicity claim checkable rather than merely asserted.",
        "type": "object",
        "required": [
          "forecast",
          "uncertainty"
        ],
        "additionalProperties": false,
        "properties": {
          "forecast": {
            "type": "string",
            "pattern": "^sha256:[0-9a-f]{64}$"
          },
          "uncertainty": {
            "type": "string",
            "pattern": "^sha256:[0-9a-f]{64}$"
          }
        }
      }
    }
  },
  "run-request": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/run-request.schema.json",
    "title": "drogna model run request",
    "description": "The message the scheduler publishes on ctl/run-request, and the only route by which a model run begins. It carries the divergence that justified it in full rather than by reference, so that the reason a run was spent is legible from the request alone and does not depend on another message still being retained. The run identifier is derived from the root seed and the run sequence by the coverage store's own rule, so a replay requests the same run under the same name and a published run's name can be read back as the sequence it was. Amended for V2 (SRD-v2 FR-31, E1 resolved plan §9.7): the scheduler holds a cadence floor, so a run can be warranted on schedule alone — such a request carries cause \"scheduled\" with divergence and region null, and every display labels runs by this cause.",
    "type": "object",
    "required": [
      "component",
      "scenario_run_id",
      "sim_time",
      "tick",
      "run_id",
      "run_sequence",
      "initialisation_sim_time",
      "ensemble_size",
      "region",
      "divergence",
      "cause"
    ],
    "additionalProperties": false,
    "properties": {
      "component": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$",
        "description": "The scheduler that published the request, matching config /component/id."
      },
      "scenario_run_id": {
        "type": "string",
        "description": "The scenario run this request belongs to, as carried on every clock sample."
      },
      "sim_time": {
        "type": "string",
        "description": "Simulation time at which the request was published, ISO-8601 UTC with microsecond precision."
      },
      "tick": {
        "type": "integer",
        "minimum": 0,
        "description": "The tick index the scheduler had observed."
      },
      "run_id": {
        "type": "string",
        "description": "Deterministic model run identifier, derived from the root seed and the logical run ordinal. It names the run in every later message and in the coverage store."
      },
      "run_sequence": {
        "type": "integer",
        "minimum": 0,
        "description": "Which run of this scenario this is, counting from zero. It is the other half of the identifier rule — run_id is a function of the root seed and this number — and it is carried rather than left to be read back out of the name, so that a manifest can record it as a fact rather than as a parse. Before it was carried the run manifest recorded a null here for want of anything to record."
      },
      "initialisation_sim_time": {
        "type": "string",
        "description": "The simulation instant the run initialises from. The forecast is valid forward of it."
      },
      "ensemble_size": {
        "type": "integer",
        "minimum": 2,
        "description": "How many perturbed members the run is asked for. At least two, or there is no spread to publish and the uncertainty field would be a fiction."
      },
      "region": {
        "oneOf": [
          {
            "$ref": "https://schemas.harness.invalid/divergence.schema.json#/$defs/region"
          },
          {
            "type": "null"
          }
        ],
        "description": "The region that diverged, or null for a scheduled run. It does not bound the run’s domain, which is the whole grid."
      },
      "divergence": {
        "oneOf": [
          {
            "$ref": "https://schemas.harness.invalid/divergence.schema.json"
          },
          {
            "type": "null"
          }
        ],
        "description": "The divergence event that justified this request, carried whole; null exactly when cause is \"scheduled\"."
      },
      "cause": {
        "type": "string",
        "enum": [
          "divergence",
          "scheduled"
        ],
        "description": "Why this run is warranted: a sustained divergence, or the cadence floor alone (FR-31). Labelled wherever runs are shown."
      }
    }
  },
  "run-started": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/run-started.schema.json",
    "title": "drogna model run started",
    "description": "The message the model runner publishes on ctl/run-started before it computes anything. It is published first so that a run which then fails is still visible as a run that was attempted: a loop whose second step leaves no trace is a loop nobody can debug. It names the kernel that will do the work, because the kernel is a port with more than one implementation and which one ran is not otherwise recoverable from the output.",
    "type": "object",
    "required": [
      "component",
      "scenario_run_id",
      "sim_time",
      "tick",
      "run_id",
      "divergence_id",
      "member_count",
      "kernel",
      "initialisation_sim_time"
    ],
    "additionalProperties": false,
    "properties": {
      "component": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$",
        "description": "The model runner, matching config /component/id."
      },
      "scenario_run_id": {
        "type": "string",
        "description": "The scenario run this belongs to."
      },
      "sim_time": {
        "type": "string",
        "description": "Simulation time at which work began, ISO-8601 UTC with microsecond precision."
      },
      "tick": {
        "type": "integer",
        "minimum": 0,
        "description": "The tick index the runner had observed."
      },
      "run_id": {
        "type": "string",
        "description": "The model run identifier from the request that caused this run."
      },
      "divergence_id": {
        "type": [
          "string",
          "null"
        ],
        "description": "The divergence that justified the request, or null for a run warranted by the cadence floor alone (FR-31), so the chain from observation to field is followable through the control namespace alone."
      },
      "member_count": {
        "type": "integer",
        "minimum": 2,
        "description": "Ensemble members this run will execute. A member that fails invalidates the run rather than shrinking it."
      },
      "kernel": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$",
        "description": "The model kernel implementation selected by configuration, behind the kernel port."
      },
      "initialisation_sim_time": {
        "type": "string",
        "description": "The simulation instant the run initialises from, echoed from the request."
      }
    }
  },
  "sensorthings-subset": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/sensorthings-subset.schema.json",
    "title": "drogna SensorThings subset responses",
    "description": "The OGC SensorThings (Part 1, Sensing) responses the query component serves over the observation store (SRD-v2 FR-26): the service root, and value collections of Things, Datastreams and Observations. Read-only, and a genuine subset with the subset stated: entity shapes carry exactly what the observation master carries, because the store is a function of the traffic and nothing else.",
    "type": "object",
    "$defs": {
      "service_root": {
        "type": "object",
        "required": [
          "value"
        ],
        "additionalProperties": false,
        "properties": {
          "value": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "name",
                "url"
              ],
              "additionalProperties": false,
              "properties": {
                "name": {
                  "type": "string"
                },
                "url": {
                  "type": "string",
                  "pattern": "^[^:]*$"
                }
              }
            }
          }
        }
      },
      "things_response": {
        "type": "object",
        "required": [
          "@iot.count",
          "value"
        ],
        "additionalProperties": false,
        "properties": {
          "@iot.count": {
            "type": "integer",
            "minimum": 0
          },
          "value": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/thing"
            }
          }
        }
      },
      "thing": {
        "type": "object",
        "required": [
          "@iot.id",
          "name",
          "description"
        ],
        "additionalProperties": false,
        "properties": {
          "@iot.id": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "description": {
            "type": "string"
          }
        }
      },
      "datastreams_response": {
        "type": "object",
        "required": [
          "@iot.count",
          "value"
        ],
        "additionalProperties": false,
        "properties": {
          "@iot.count": {
            "type": "integer",
            "minimum": 0
          },
          "value": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/datastream"
            }
          }
        }
      },
      "datastream": {
        "type": "object",
        "required": [
          "@iot.id",
          "name",
          "description",
          "observationType",
          "unitOfMeasurement",
          "observedProperty"
        ],
        "additionalProperties": false,
        "properties": {
          "@iot.id": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "observationType": {
            "type": "string"
          },
          "unitOfMeasurement": {
            "type": "object",
            "required": [
              "name",
              "symbol",
              "definition"
            ],
            "additionalProperties": false,
            "properties": {
              "name": {
                "type": "string"
              },
              "symbol": {
                "type": "string"
              },
              "definition": {
                "type": "string"
              }
            }
          },
          "observedProperty": {
            "type": "object",
            "required": [
              "name",
              "definition"
            ],
            "additionalProperties": false,
            "properties": {
              "name": {
                "type": "string"
              },
              "definition": {
                "type": "string"
              }
            }
          }
        }
      },
      "observations_response": {
        "type": "object",
        "required": [
          "@iot.count",
          "value"
        ],
        "additionalProperties": false,
        "properties": {
          "@iot.count": {
            "type": "integer",
            "minimum": 0,
            "description": "The total matching the query before $top/$skip, so a consumer can page honestly."
          },
          "value": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/observation_entity"
            }
          }
        }
      },
      "observation_entity": {
        "type": "object",
        "required": [
          "@iot.id",
          "phenomenonTime",
          "result",
          "resultTime",
          "Datastream@iot.navigationLink",
          "FeatureOfInterest"
        ],
        "additionalProperties": false,
        "properties": {
          "@iot.id": {
            "type": "string"
          },
          "phenomenonTime": {
            "type": "string"
          },
          "resultTime": {
            "type": [
              "string",
              "null"
            ],
            "description": "Null, stated: the harness records phenomenon time only, and inventing a result time would be a claim the write path never made."
          },
          "result": {
            "type": "number"
          },
          "Datastream@iot.navigationLink": {
            "type": "string",
            "pattern": "^[^:]*$"
          },
          "FeatureOfInterest": {
            "type": "object",
            "required": [
              "name",
              "feature"
            ],
            "additionalProperties": false,
            "properties": {
              "name": {
                "type": "string"
              },
              "feature": {
                "type": "object",
                "required": [
                  "type",
                  "coordinates"
                ],
                "additionalProperties": false,
                "properties": {
                  "type": {
                    "type": "string",
                    "const": "Point"
                  },
                  "coordinates": {
                    "type": "array",
                    "minItems": 3,
                    "maxItems": 3,
                    "items": {
                      "type": "number"
                    },
                    "description": "lon, lat, depth in metres positive down — the third coordinate is depth, stated here because GeoJSON's default reading is altitude."
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  "telemetry": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/telemetry.schema.json",
    "title": "drogna telemetry",
    "description": "Every payload on the ctl/telemetry branch, defined once and discriminated by kind. The telemetry component (C-16) owns this document, which inverts the repository's usual rule that the earlier feature owns a shared file: features 007, 009 and 013 publish here first, and the alternative was each of them defining a telemetry shape that C-16 would immediately have had to widen. The shapes recorded here are therefore descriptions of what is already published, not proposals — residual-summary, scheduler-decision, run-failed and publication-refused were read out of the four control-loop services and transcribed. residual-sample, residual-statistics and forecast-skill are new: the first is the per-residual report a producer sends when a consumer needs the individual numbers rather than a count, and the last two are what C-16 itself publishes. The ingest client's report carries no kind at all, and rather than force a discriminator onto a shape already in use it is admitted by reference to its own master.",
    "oneOf": [
      {
        "$ref": "#/$defs/residual_sample_report"
      },
      {
        "$ref": "#/$defs/residual_summary"
      },
      {
        "$ref": "#/$defs/scheduler_decision"
      },
      {
        "$ref": "#/$defs/run_failed"
      },
      {
        "$ref": "#/$defs/publication_refused"
      },
      {
        "$ref": "#/$defs/residual_statistics"
      },
      {
        "$ref": "#/$defs/forecast_skill"
      },
      {
        "$ref": "https://schemas.harness.invalid/ingest-telemetry.schema.json"
      },
      {
        "$ref": "https://schemas.harness.invalid/offload-telemetry.schema.json"
      }
    ],
    "$defs": {
      "component_id": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$",
        "description": "The component reporting, matching config /component/id."
      },
      "scenario_run_id": {
        "type": "string",
        "minLength": 1,
        "description": "The scenario run this report belongs to, as carried on every clock sample."
      },
      "sim_instant": {
        "type": "string",
        "description": "A simulation instant, ISO-8601 UTC with microsecond precision. Simulation time, never host time: every interval in this branch except heartbeat cadence is measured on the clock port (Constitution I, ADR-0006)."
      },
      "nullable_sim_instant": {
        "type": [
          "string",
          "null"
        ],
        "description": "A simulation instant, or null where the thing it would date has not happened yet. Null rather than a zero instant: a default here would read as a real moment."
      },
      "tick_index": {
        "type": "integer",
        "minimum": 0,
        "description": "The tick index the reporter had observed when it composed the message."
      },
      "forecast_run_id": {
        "type": "string",
        "minLength": 1,
        "description": "The model run whose field the residuals were scored against. Attribution is to the run scored against, not to whichever run happens to be current when the message is read."
      },
      "sound_speed_equation": {
        "type": "string",
        "minLength": 1,
        "description": "The named sound-speed fit that produced the numbers, from the single implementation in libs/harness_core (ADR-0005). Carried so a stored residual can say which equation made it."
      },
      "freshness": {
        "type": "string",
        "enum": [
          "fresh",
          "stale"
        ],
        "description": "Whether the figure beside it was updated within the configured staleness window of simulation time. A statistic whose input has dried up says stale and keeps saying its last update time; it does not go on presenting its last value as current."
      },
      "region_bounds": {
        "title": "Region bounds",
        "description": "The geographic extent of one region-level scope. A region is an area of water, given by its bounds and by its index in the configured grid. It says where residuals were scored and says nothing whatever about what was in the water (Constitution V).",
        "type": "object",
        "required": [
          "minimum_latitude",
          "maximum_latitude",
          "minimum_longitude",
          "maximum_longitude"
        ],
        "additionalProperties": false,
        "properties": {
          "minimum_latitude": {
            "type": "number",
            "minimum": -90,
            "maximum": 90
          },
          "maximum_latitude": {
            "type": "number",
            "minimum": -90,
            "maximum": 90
          },
          "minimum_longitude": {
            "type": "number",
            "minimum": -180,
            "maximum": 180
          },
          "maximum_longitude": {
            "type": "number",
            "minimum": -180,
            "maximum": 180
          }
        }
      },
      "statistics_scope": {
        "title": "Statistics scope",
        "description": "What one running statistic is about: the whole scenario, or one cell of the region grid. Region-level figures below the minimum sample count are reported per region rather than folded silently into the scenario figure.",
        "type": "object",
        "required": [
          "level",
          "region_id",
          "bounds"
        ],
        "additionalProperties": false,
        "properties": {
          "level": {
            "type": "string",
            "enum": [
              "scenario",
              "region"
            ],
            "description": "scenario covers every residual seen; region covers one grid cell."
          },
          "region_id": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^r[0-9]+c[0-9]+$",
            "description": "The grid index of the region, row then column, within the bounded grid the configuration declares. The grid has a fixed number of rows and columns, so the number of region scopes a run can hold is fixed before it starts and cannot grow with the scenario. Null at scenario level."
          },
          "bounds": {
            "anyOf": [
              {
                "$ref": "#/$defs/region_bounds"
              },
              {
                "type": "null"
              }
            ],
            "description": "The cell's extent, so a reader need not hold the grid definition to know where the figure came from. Null at scenario level."
          }
        }
      },
      "residual_point": {
        "title": "One scored residual",
        "description": "A single measured-minus-forecast difference on sound speed, at the four-dimensional position it was taken at. The measured value travels beside the difference because a consumer scoring the same measurement against a second field — a persistence reference, say — needs the measurement and not only the residual.",
        "type": "object",
        "required": [
          "sim_time",
          "latitude",
          "longitude",
          "depth_m",
          "residual_m_per_s",
          "measured_m_per_s"
        ],
        "additionalProperties": false,
        "properties": {
          "sim_time": {
            "$ref": "#/$defs/sim_instant"
          },
          "latitude": {
            "type": "number",
            "minimum": -90,
            "maximum": 90
          },
          "longitude": {
            "type": "number",
            "minimum": -180,
            "maximum": 180
          },
          "depth_m": {
            "type": "number",
            "minimum": 0,
            "description": "Depth in metres, positive downwards."
          },
          "residual_m_per_s": {
            "type": "number",
            "description": "Measured sound speed minus forecast sound speed, signed, in metres per second. Signed rather than absolute: a bias and a scatter are different faults and averaging magnitudes hides the first."
          },
          "measured_m_per_s": {
            "type": "number",
            "description": "The measured sound speed itself, derived from the observed temperature, salinity and pressure by the one implementation in libs/harness_core."
          },
          "platform": {
            "type": "string",
            "minLength": 1,
            "description": "The sampling platform the observation came from: an instrument and a coordinate. Carried so a residual can be attributed to the sensor that produced it, and carrying nothing further about the platform (Constitution V)."
          }
        }
      },
      "residual_sample_report": {
        "title": "Residual sample report",
        "description": "One residual or a short batch of them, with position and the run scored against. This is the shape a consumer needs to maintain root-mean-square, extremes and a skill score against a second field; a count and a mean of magnitudes cannot be turned back into any of the three. Feature 009's monitor publishes residual-summary today and not this, which is recorded in the telemetry component's README as a gap rather than papered over here.",
        "type": "object",
        "required": [
          "component",
          "scenario_run_id",
          "sim_time",
          "tick",
          "kind",
          "forecast_run_id",
          "samples",
          "sound_speed_equation"
        ],
        "additionalProperties": false,
        "properties": {
          "component": {
            "$ref": "#/$defs/component_id"
          },
          "scenario_run_id": {
            "$ref": "#/$defs/scenario_run_id"
          },
          "sim_time": {
            "$ref": "#/$defs/sim_instant"
          },
          "tick": {
            "$ref": "#/$defs/tick_index"
          },
          "kind": {
            "const": "residual-sample"
          },
          "forecast_run_id": {
            "$ref": "#/$defs/forecast_run_id"
          },
          "samples": {
            "type": "array",
            "minItems": 1,
            "items": {
              "$ref": "#/$defs/residual_point"
            },
            "description": "A short batch. Bounded by the producer, because a batch that grows with the clock rate would move the cost of acceleration into the broker."
          },
          "sound_speed_equation": {
            "$ref": "#/$defs/sound_speed_equation"
          }
        }
      },
      "residual_summary": {
        "title": "Residual summary",
        "description": "What the monitor (C-11) has seen since its last summary: counts and the mean magnitude, reset each time. Published at forecast-run boundaries on ctl/run-published rather than on a timer, which is why the monitor needs no reporting-cadence knob. The summary describes the field being superseded, because the monitor reports before it takes the new one.",
        "type": "object",
        "required": [
          "component",
          "scenario_run_id",
          "sim_time",
          "tick",
          "kind",
          "scored",
          "exceeding",
          "outside_domain",
          "shed",
          "mean_absolute_m_per_s",
          "sound_speed_equation"
        ],
        "additionalProperties": false,
        "properties": {
          "component": {
            "$ref": "#/$defs/component_id"
          },
          "scenario_run_id": {
            "$ref": "#/$defs/scenario_run_id"
          },
          "sim_time": {
            "$ref": "#/$defs/sim_instant"
          },
          "tick": {
            "$ref": "#/$defs/tick_index"
          },
          "kind": {
            "const": "residual-summary"
          },
          "forecast_run_id": {
            "type": [
              "string",
              "null"
            ],
            "description": "The run the summarised residuals were scored against. Optional, and null or absent in what the monitor publishes today: the summary is emitted at a run boundary and the shape carried no attribution when it was transcribed here. A consumer that receives one without it attributes it to the run open when it arrived, which is a guess where residual-sample carries a fact. Declared so the attribution has somewhere to go when the monitor is ready to carry it."
          },
          "scored": {
            "type": "integer",
            "minimum": 0,
            "description": "Soundings scored against the forecast in the interval just ended."
          },
          "exceeding": {
            "type": "integer",
            "minimum": 0,
            "description": "Of those, how many exceeded the monitor's residual threshold."
          },
          "outside_domain": {
            "type": "integer",
            "minimum": 0,
            "description": "Soundings the forecast did not cover. Counted rather than absorbed: a sample that could not be scored is not a sample that agreed."
          },
          "shed": {
            "type": "integer",
            "minimum": 0,
            "description": "Observations dropped at the monitor's bounds. A reported drop is better than falling behind unboundedly."
          },
          "mean_absolute_m_per_s": {
            "type": "number",
            "minimum": 0,
            "description": "Mean residual magnitude over the scored samples, in metres per second, or zero when none were scored. Magnitudes, so this carries no bias and no scatter."
          },
          "sound_speed_equation": {
            "$ref": "#/$defs/sound_speed_equation"
          }
        }
      },
      "scheduler_decision": {
        "title": "Scheduler decision record",
        "description": "The accepted-or-declined outcome the scheduler (C-12) records for every divergence, so that a declined divergence is visible rather than merely absent.",
        "type": "object",
        "required": [
          "component",
          "scenario_run_id",
          "sim_time",
          "tick",
          "kind",
          "divergence_id",
          "decision",
          "detail",
          "run_id"
        ],
        "additionalProperties": false,
        "properties": {
          "component": {
            "$ref": "#/$defs/component_id"
          },
          "scenario_run_id": {
            "$ref": "#/$defs/scenario_run_id"
          },
          "sim_time": {
            "$ref": "#/$defs/sim_instant"
          },
          "tick": {
            "$ref": "#/$defs/tick_index"
          },
          "kind": {
            "const": "scheduler-decision"
          },
          "divergence_id": {
            "type": "string",
            "minLength": 1,
            "description": "The divergence this decision was about."
          },
          "decision": {
            "type": "string",
            "enum": [
              "accepted",
              "minimum-interval",
              "duplicate-outstanding"
            ],
            "description": "accepted means a run was requested. The other two name the rule that declined it, rather than collapsing every refusal into one word."
          },
          "detail": {
            "type": "string",
            "description": "Enough of why for the record to stand alone."
          },
          "run_id": {
            "type": [
              "string",
              "null"
            ],
            "description": "The run requested, or null when the divergence was declined. Null rather than an empty string, because a declined divergence has no run and should not appear to name one."
          }
        }
      },
      "run_failed": {
        "title": "Model run failure",
        "description": "A run the model runner (C-13) could not complete. Recorded rather than merely absent: the one thing worse than a run that fails is a run that fails silently.",
        "type": "object",
        "required": [
          "component",
          "scenario_run_id",
          "sim_time",
          "tick",
          "kind",
          "run_id",
          "detail"
        ],
        "additionalProperties": false,
        "properties": {
          "component": {
            "$ref": "#/$defs/component_id"
          },
          "scenario_run_id": {
            "$ref": "#/$defs/scenario_run_id"
          },
          "sim_time": {
            "$ref": "#/$defs/sim_instant"
          },
          "tick": {
            "$ref": "#/$defs/tick_index"
          },
          "kind": {
            "const": "run-failed"
          },
          "run_id": {
            "type": "string",
            "minLength": 1
          },
          "detail": {
            "type": "string",
            "description": "What went wrong, in one line."
          }
        }
      },
      "publication_refused": {
        "title": "Publication refusal",
        "description": "A completed run the publisher (C-14) would not announce, with every reason it would not. All the reasons, not the first: a run that fails two checks and reports one gets fixed once and fails again.",
        "type": "object",
        "required": [
          "component",
          "scenario_run_id",
          "sim_time",
          "tick",
          "kind",
          "run_id",
          "refusals"
        ],
        "additionalProperties": false,
        "properties": {
          "component": {
            "$ref": "#/$defs/component_id"
          },
          "scenario_run_id": {
            "$ref": "#/$defs/scenario_run_id"
          },
          "sim_time": {
            "$ref": "#/$defs/sim_instant"
          },
          "tick": {
            "$ref": "#/$defs/tick_index"
          },
          "kind": {
            "const": "publication-refused"
          },
          "run_id": {
            "type": "string",
            "minLength": 1
          },
          "refusals": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Every check the run failed."
          }
        }
      },
      "residual_statistics": {
        "title": "Residual statistics",
        "description": "The running aggregate of one scope's residuals, maintained incrementally in bounded memory by C-16 and attributed to the forecast run the residuals were scored against. Every field that cannot be derived from the inputs actually seen is null and says so through `basis`, because a zero standing in for an unknown is the failure this component exists to prevent.",
        "type": "object",
        "required": [
          "component",
          "scenario_run_id",
          "sim_time",
          "tick",
          "kind",
          "forecast_run_id",
          "state",
          "closed",
          "scope",
          "basis",
          "count",
          "mean_m_per_s",
          "mean_absolute_m_per_s",
          "root_mean_square_m_per_s",
          "minimum_m_per_s",
          "maximum_m_per_s",
          "first_sim_time",
          "last_sim_time",
          "last_updated_sim_time",
          "freshness",
          "stale_span_seconds",
          "implausible",
          "implausible_reason"
        ],
        "additionalProperties": false,
        "properties": {
          "component": {
            "$ref": "#/$defs/component_id"
          },
          "scenario_run_id": {
            "$ref": "#/$defs/scenario_run_id"
          },
          "sim_time": {
            "$ref": "#/$defs/sim_instant"
          },
          "tick": {
            "$ref": "#/$defs/tick_index"
          },
          "kind": {
            "const": "residual-statistics"
          },
          "forecast_run_id": {
            "type": [
              "string",
              "null"
            ],
            "description": "The run these residuals were scored against, or null when no forecast has ever been published."
          },
          "state": {
            "type": "string",
            "enum": [
              "reporting",
              "insufficient-samples",
              "warming",
              "no-forecast"
            ],
            "description": "warming follows a restart: running statistics live in memory, are lost with the process, and are not reconstructed from any store. insufficient-samples is a scope below the configured minimum count, reported as such rather than folded into a larger scope."
          },
          "closed": {
            "type": "boolean",
            "description": "True when this is the completed record of a superseded run. A closed record is retained as it stood and never merged into the run that replaced it."
          },
          "scope": {
            "$ref": "#/$defs/statistics_scope"
          },
          "basis": {
            "type": "string",
            "enum": [
              "samples",
              "summaries",
              "mixed",
              "none"
            ],
            "description": "Which inputs the figures were built from. A per-residual sample supports every moment; a producer's own summary supports a count and a mean magnitude and nothing else, so a statistic built partly or wholly from summaries reports null for the moments it cannot honestly claim."
          },
          "count": {
            "type": "integer",
            "minimum": 0,
            "description": "Residuals folded in."
          },
          "mean_m_per_s": {
            "type": [
              "number",
              "null"
            ],
            "description": "Signed mean, which is the bias. Null unless every input was a per-residual sample: a mean of magnitudes is not a bias and must not be published as one."
          },
          "mean_absolute_m_per_s": {
            "type": [
              "number",
              "null"
            ],
            "description": "Mean residual magnitude. Available from either kind of input."
          },
          "root_mean_square_m_per_s": {
            "type": [
              "number",
              "null"
            ],
            "description": "Root mean square, or null when the inputs did not carry the second moment."
          },
          "minimum_m_per_s": {
            "type": [
              "number",
              "null"
            ],
            "description": "Smallest signed residual seen, or null when the inputs did not carry extremes."
          },
          "maximum_m_per_s": {
            "type": [
              "number",
              "null"
            ],
            "description": "Largest signed residual seen, or null when the inputs did not carry extremes."
          },
          "first_sim_time": {
            "$ref": "#/$defs/nullable_sim_instant"
          },
          "last_sim_time": {
            "$ref": "#/$defs/nullable_sim_instant"
          },
          "last_updated_sim_time": {
            "type": [
              "string",
              "null"
            ],
            "description": "The simulation instant of the last real update. It does not move when a statistic is republished unchanged, which is what makes staleness detectable."
          },
          "freshness": {
            "$ref": "#/$defs/freshness"
          },
          "stale_span_seconds": {
            "type": [
              "number",
              "null"
            ],
            "minimum": 0,
            "description": "How long, in seconds of simulation time, this statistic was most recently stale, measured from the instant the staleness window expired to the instant an input revived it. Null until it has been stale once. Recorded so that a recovery is visible as a recovery rather than as a figure that quietly started moving again."
          },
          "implausible": {
            "type": "boolean",
            "description": "Set when the figures are arithmetically fine and physically suspect — a root mean square of exactly zero in a harness with seeded noise almost certainly means the residual stream is a constant rather than a measurement. Flagged for review, never suppressed."
          },
          "implausible_reason": {
            "type": [
              "string",
              "null"
            ],
            "description": "Why, in one line. Null when the figures are not flagged."
          }
        }
      },
      "forecast_skill": {
        "title": "Forecast skill",
        "description": "Skill against a persistence reference — the forecast field that was current immediately before the latest publication, held constant, which is the claim that conditions stay the same. Both mean-square errors and the sample count travel with the score so that a reader can recompute it rather than believe it (Constitution IX). Below the configured minimum sample count no score is published at all: no default, no zero, no carried-forward previous value. A model that loses to the reference says so in a state and in words, rather than leaving a negative number to be interpreted downstream.",
        "type": "object",
        "required": [
          "component",
          "scenario_run_id",
          "sim_time",
          "tick",
          "kind",
          "forecast_run_id",
          "reference_run_id",
          "reference_changed",
          "sample_count",
          "minimum_sample_count",
          "model_mean_square_error",
          "persistence_mean_square_error",
          "skill_score",
          "formula",
          "state",
          "statement",
          "last_updated_sim_time",
          "freshness",
          "sound_speed_equation"
        ],
        "additionalProperties": false,
        "properties": {
          "component": {
            "$ref": "#/$defs/component_id"
          },
          "scenario_run_id": {
            "$ref": "#/$defs/scenario_run_id"
          },
          "sim_time": {
            "$ref": "#/$defs/sim_instant"
          },
          "tick": {
            "$ref": "#/$defs/tick_index"
          },
          "kind": {
            "const": "forecast-skill"
          },
          "forecast_run_id": {
            "type": [
              "string",
              "null"
            ],
            "description": "The run being scored, or null when none has been published."
          },
          "reference_run_id": {
            "type": [
              "string",
              "null"
            ],
            "description": "The run whose field is held constant as the persistence reference, or null when only one run has ever been published and there is nothing prior to hold."
          },
          "reference_changed": {
            "type": "boolean",
            "description": "True in the first message published after the reference moved, so that the comparison is never ambiguous about which field it was against."
          },
          "sample_count": {
            "type": "integer",
            "minimum": 0,
            "description": "Measurements scored against both fields. The denominator of both mean-square errors, carried so the score is checkable."
          },
          "minimum_sample_count": {
            "type": "integer",
            "minimum": 1,
            "description": "The configured count below which no score is published. Carried so a reader can see the rule that was applied rather than infer it."
          },
          "model_mean_square_error": {
            "type": [
              "number",
              "null"
            ],
            "minimum": 0,
            "description": "Mean square of measured minus forecast sound speed, in (m/s) squared."
          },
          "persistence_mean_square_error": {
            "type": [
              "number",
              "null"
            ],
            "minimum": 0,
            "description": "Mean square of measured minus reference sound speed, over the same samples, in (m/s) squared."
          },
          "skill_score": {
            "type": [
              "number",
              "null"
            ],
            "description": "The score, or null when there is no score to give. Never zero as a stand-in: zero means the model matched the reference exactly."
          },
          "formula": {
            "const": "1 - model_mean_square_error / persistence_mean_square_error",
            "description": "The stated formula, carried in the message rather than only in documentation, so that the arithmetic a reader checks is the arithmetic that was done."
          },
          "state": {
            "type": "string",
            "enum": [
              "beating-persistence",
              "not-beating-persistence",
              "insufficient-samples",
              "insufficient-reference",
              "reference-without-error",
              "no-forecast"
            ],
            "description": "not-beating-persistence is set whenever the model's error is not smaller than the reference's, including when they are equal. insufficient-reference is the state immediately after the first ever publication, when there is no prior field to hold constant. reference-without-error is the degenerate case in which the persistence reference reproduced every measurement exactly: the ratio the formula takes has a zero denominator, so there is no score to publish and an infinity is not one."
          },
          "statement": {
            "type": "string",
            "minLength": 1,
            "description": "The plain-language sentence that goes with the state. Emitted here rather than assembled by the display, so that every consumer says the same thing about a model that is not earning its compute."
          },
          "last_updated_sim_time": {
            "$ref": "#/$defs/nullable_sim_instant"
          },
          "freshness": {
            "$ref": "#/$defs/freshness"
          },
          "sound_speed_equation": {
            "$ref": "#/$defs/sound_speed_equation"
          }
        },
        "oneOf": [
          {
            "title": "Scored",
            "description": "A score was published, so both errors and the count that produced it are present and are numbers.",
            "properties": {
              "state": {
                "type": "string",
                "enum": [
                  "beating-persistence",
                  "not-beating-persistence"
                ]
              },
              "skill_score": {
                "type": "number"
              },
              "model_mean_square_error": {
                "type": "number",
                "minimum": 0
              },
              "persistence_mean_square_error": {
                "type": "number",
                "minimum": 0
              },
              "forecast_run_id": {
                "type": "string",
                "minLength": 1
              },
              "reference_run_id": {
                "type": "string",
                "minLength": 1
              }
            },
            "required": [
              "skill_score",
              "model_mean_square_error",
              "persistence_mean_square_error",
              "sample_count"
            ]
          },
          {
            "title": "Not scored",
            "description": "No score, and the state says why. A payload carrying a score without both errors and a count matches neither branch and is refused, which is the point of splitting them.",
            "properties": {
              "state": {
                "type": "string",
                "enum": [
                  "insufficient-samples",
                  "insufficient-reference",
                  "reference-without-error",
                  "no-forecast"
                ]
              },
              "skill_score": {
                "type": "null"
              }
            },
            "required": [
              "skill_score"
            ]
          }
        ]
      }
    },
    "examples": [
      {
        "component": "monitor",
        "scenario_run_id": "run-20260901-a",
        "sim_time": "2026-09-01T02:20:00.000000Z",
        "tick": 560,
        "kind": "residual-summary",
        "scored": 412,
        "exceeding": 17,
        "outside_domain": 3,
        "shed": 0,
        "mean_absolute_m_per_s": 0.8134,
        "sound_speed_equation": "mackenzie-1981"
      },
      {
        "component": "monitor",
        "scenario_run_id": "run-20260901-a",
        "sim_time": "2026-09-01T02:20:00.000000Z",
        "tick": 560,
        "kind": "residual-sample",
        "forecast_run_id": "forecast-0003",
        "samples": [
          {
            "sim_time": "2026-09-01T02:19:58.000000Z",
            "latitude": 48.5,
            "longitude": -8.25,
            "depth_m": 120,
            "residual_m_per_s": 1.92,
            "measured_m_per_s": 1503.44,
            "platform": "glider-a"
          }
        ],
        "sound_speed_equation": "mackenzie-1981"
      },
      {
        "component": "scheduler",
        "scenario_run_id": "run-20260901-a",
        "sim_time": "2026-09-01T02:20:05.000000Z",
        "tick": 561,
        "kind": "scheduler-decision",
        "divergence_id": "divergence-0007",
        "decision": "minimum-interval",
        "detail": "a run was requested 240.0 s of simulation time ago and the minimum interval is 900.0 s",
        "run_id": null
      },
      {
        "component": "model_runner",
        "scenario_run_id": "run-20260901-a",
        "sim_time": "2026-09-01T02:21:00.000000Z",
        "tick": 572,
        "kind": "run-failed",
        "run_id": "forecast-0004",
        "detail": "two of four members did not complete; truncating the ensemble would misreport spread"
      },
      {
        "component": "publisher",
        "scenario_run_id": "run-20260901-a",
        "sim_time": "2026-09-01T02:21:30.000000Z",
        "tick": 578,
        "kind": "publication-refused",
        "run_id": "forecast-0004",
        "refusals": [
          "the uncertainty field is absent",
          "the forecast field declares no run_id"
        ]
      },
      {
        "component": "telemetry",
        "scenario_run_id": "run-20260901-a",
        "sim_time": "2026-09-01T02:22:00.000000Z",
        "tick": 584,
        "kind": "residual-statistics",
        "forecast_run_id": "forecast-0003",
        "state": "reporting",
        "closed": false,
        "scope": {
          "level": "region",
          "region_id": "r2c5",
          "bounds": {
            "minimum_latitude": 48.5,
            "maximum_latitude": 49,
            "minimum_longitude": -8.5,
            "maximum_longitude": -8
          }
        },
        "basis": "samples",
        "count": 412,
        "mean_m_per_s": 0.2114,
        "mean_absolute_m_per_s": 0.8134,
        "root_mean_square_m_per_s": 1.0442,
        "minimum_m_per_s": -2.81,
        "maximum_m_per_s": 3.06,
        "first_sim_time": "2026-09-01T02:05:00.000000Z",
        "last_sim_time": "2026-09-01T02:21:58.000000Z",
        "last_updated_sim_time": "2026-09-01T02:21:58.000000Z",
        "freshness": "fresh",
        "stale_span_seconds": null,
        "implausible": false,
        "implausible_reason": null
      },
      {
        "component": "telemetry",
        "scenario_run_id": "run-20260901-a",
        "sim_time": "2026-09-01T02:22:00.000000Z",
        "tick": 584,
        "kind": "forecast-skill",
        "forecast_run_id": "forecast-0003",
        "reference_run_id": "forecast-0002",
        "reference_changed": false,
        "sample_count": 412,
        "minimum_sample_count": 30,
        "model_mean_square_error": 1.9,
        "persistence_mean_square_error": 1.2,
        "skill_score": -0.5833333333333333,
        "formula": "1 - model_mean_square_error / persistence_mean_square_error",
        "state": "not-beating-persistence",
        "statement": "the forecast is not beating persistence: its mean square error of 1.9 (m/s)^2 over 412 samples is above the persistence reference's 1.2 (m/s)^2, so this run is not earning its compute",
        "last_updated_sim_time": "2026-09-01T02:21:58.000000Z",
        "freshness": "fresh",
        "sound_speed_equation": "mackenzie-1981"
      },
      {
        "component": "telemetry",
        "scenario_run_id": "run-20260901-a",
        "sim_time": "2026-09-01T02:05:00.000000Z",
        "tick": 300,
        "kind": "forecast-skill",
        "forecast_run_id": "forecast-0003",
        "reference_run_id": "forecast-0002",
        "reference_changed": true,
        "sample_count": 4,
        "minimum_sample_count": 30,
        "model_mean_square_error": null,
        "persistence_mean_square_error": null,
        "skill_score": null,
        "formula": "1 - model_mean_square_error / persistence_mean_square_error",
        "state": "insufficient-samples",
        "statement": "4 samples have been scored against both fields and 30 are required, so no skill score is published",
        "last_updated_sim_time": "2026-09-01T02:04:52.000000Z",
        "freshness": "fresh",
        "sound_speed_equation": "mackenzie-1981"
      }
    ]
  },
  "topology": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/topology.schema.json",
    "title": "drogna broker topology",
    "description": "Who may say what to whom on the broker, and where the tree says it. Derived from the repository by scripts/derive-topology.ts and written to contracts/topology.json, which is generated and gated: scripts/gates/check-topology-drift.ts fails when the committed instance no longer matches a fresh scan, for the same reason the generated type trees have a drift check. Two layers, and they are deliberately not the same thing. The publishers and subscribers of a topic are permissions, read in V2 from the broker component’s configured role rules, which the broker enforces and which are therefore the complete statement of the boundary (E14: the scanner reads component configuration, never a hand-maintained file); they are coarse wherever that file is coarse, and the control role's readwrite over the whole control namespace is the coarsest place. What narrows them is named_by, the places in the tree that actually name the topic. Neither layer is a claim about a running system: nothing here says a component exists, is alive, or has ever sent anything, and a display built on it must light a cell from received traffic and never from this document (Constitution VII).",
    "type": "object",
    "required": [
      "generator",
      "roles",
      "components",
      "topics"
    ],
    "additionalProperties": false,
    "properties": {
      "generator": {
        "type": "string",
        "description": "The repository-relative script that writes this document. Recorded so a reader who finds the file first can find the derivation second. No version and no time of generation: a document that carried either would differ on every run and the drift gate would report a change nobody made."
      },
      "roles": {
        "type": "array",
        "description": "The broker roles, and what the access control list grants each. Roles are per role and not per client instance, so ten sensors share one and adding a sensor grants nothing new.",
        "items": {
          "$ref": "#/$defs/broker_role"
        }
      },
      "components": {
        "type": "array",
        "description": "The components that hold a broker identity, and the role each authenticates as. Read from the destination configurations, which is where a component's role is written down and is what the broker actually authenticates. A component with no broker section is absent from this list, which is a fact about it rather than an omission.",
        "items": {
          "$ref": "#/$defs/component_identity"
        }
      },
      "topics": {
        "type": "array",
        "description": "Every topic or topic filter the harness uses, sorted by name.",
        "items": {
          "$ref": "#/$defs/topic_entry"
        }
      }
    },
    "$defs": {
      "broker_role": {
        "type": "object",
        "description": "One authenticated identity at the broker, and its rules.",
        "required": [
          "role",
          "rules"
        ],
        "additionalProperties": false,
        "properties": {
          "role": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_-]*$",
            "description": "The user name in the access control list. The password that authenticates it is produced at deploy time, appears in no tracked file, and is not read by the scanner."
          },
          "rules": {
            "type": "array",
            "description": "The role's rules in the order the access control list states them. Mosquitto denies by default, so an absent rule is a refusal rather than a gap.",
            "items": {
              "$ref": "#/$defs/access_rule"
            }
          }
        }
      },
      "access_rule": {
        "type": "object",
        "description": "One line of the access control list: a direction and the topic filter it applies to.",
        "required": [
          "access",
          "filter"
        ],
        "additionalProperties": false,
        "properties": {
          "access": {
            "type": "string",
            "enum": [
              "read",
              "write",
              "readwrite"
            ],
            "description": "read is subscribe, write is publish, readwrite is both. The spelling is mosquitto's."
          },
          "filter": {
            "type": "string",
            "description": "An MQTT topic filter, which may carry the single-level wildcard + or the multi-level wildcard #."
          }
        }
      },
      "component_identity": {
        "type": "object",
        "description": "A component and the broker role it presents.",
        "required": [
          "id",
          "role",
          "source_root"
        ],
        "additionalProperties": false,
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_-]*$",
            "description": "The component id, as its configuration declares it and as its heartbeat carries it."
          },
          "role": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_-]*$",
            "description": "The role named in the component's broker URL. Both destinations are read and are required to agree; a disagreement stops the scan rather than being resolved in favour of one."
          },
          "source_root": {
            "type": [
              "string",
              "null"
            ],
            "description": "The repository-relative directory holding this component's own source, which is what the scan walks for the topics it names. Null where the component has no source tree of its own."
          }
        }
      },
      "topic_entry": {
        "type": "object",
        "description": "One topic, its governing shape, who may speak on it, and where the tree names it.",
        "required": [
          "topic",
          "namespace",
          "schema",
          "publishers",
          "subscribers",
          "named_by"
        ],
        "additionalProperties": false,
        "properties": {
          "topic": {
            "type": "string",
            "description": "The topic or filter. A component that names a branch prefix and a component that names the branch filter mean the same branch, and both are recorded here in the filter's spelling."
          },
          "namespace": {
            "type": "string",
            "enum": [
              "obs",
              "ctl",
              "cov",
              "adv"
            ],
            "description": "The two namespaces are conventions of the harness rather than configuration: obs carries observations, ctl carries control events, and the access control list is what makes the separation a control rather than a custom."
          },
          "schema": {
            "type": [
              "string",
              "null"
            ],
            "description": "The repository-relative master that governs payloads on this topic, resolved by the repository layout's naming convention. Null where no master claims the topic, which is a finding for a reader rather than a permitted state for a message."
          },
          "publishers": {
            "type": "array",
            "description": "The components whose role the access control list permits to publish here. A permission, not an observation: it says the broker would accept the message, not that anything sends one. Where the list grants a whole namespace, every component holding that role appears.",
            "items": {
              "type": "string",
              "pattern": "^[a-z][a-z0-9_-]*$"
            }
          },
          "subscribers": {
            "type": "array",
            "description": "The components whose role the access control list permits to subscribe here, read the same way as publishers.",
            "items": {
              "type": "string",
              "pattern": "^[a-z][a-z0-9_-]*$"
            }
          },
          "named_by": {
            "type": "array",
            "description": "Every place in the tree that names this topic, with the component the source belongs to. This is the narrowing the access control list does not enforce: nine components may publish a run request and one names it. A site in a shared library carries a null component, because a library publishes on behalf of whoever calls it and guessing which components those are would be an unchecked claim of exactly the kind this artefact exists to abolish.",
            "items": {
              "$ref": "#/$defs/source_site"
            }
          }
        }
      },
      "source_site": {
        "type": "object",
        "description": "One place in the tree that names a topic.",
        "required": [
          "component",
          "path",
          "line",
          "constant"
        ],
        "additionalProperties": false,
        "properties": {
          "component": {
            "type": [
              "string",
              "null"
            ],
            "description": "The component whose source tree this site is in, or null for a shared library."
          },
          "path": {
            "type": "string",
            "description": "Repository-relative path of the file holding the declaration."
          },
          "line": {
            "type": "integer",
            "minimum": 1,
            "description": "The line the declaration is on, so a reader can open it."
          },
          "constant": {
            "type": "string",
            "description": "The name the declaration binds the topic to."
          }
        }
      }
    },
    "examples": [
      {
        "generator": "scripts/derive-topology.ts",
        "roles": [
          {
            "role": "drogna_sensor",
            "rules": [
              {
                "access": "write",
                "filter": "obs/#"
              }
            ]
          }
        ],
        "components": [
          {
            "id": "sensors",
            "role": "drogna_sensor",
            "source_root": "services/sensors"
          }
        ],
        "topics": [
          {
            "topic": "obs/#",
            "namespace": "obs",
            "schema": "contracts/schemas/observation.schema.json",
            "publishers": [
              "sensors"
            ],
            "subscribers": [],
            "named_by": [
              {
                "component": "sensors",
                "path": "services/sensors/src/harness_sensors/publisher.py",
                "line": 34,
                "constant": "OBSERVATION_BRANCH"
              }
            ]
          }
        ]
      }
    ]
  },
};
