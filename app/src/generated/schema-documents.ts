// GENERATED — DO NOT EDIT.
// Source of truth: contracts/schemas/*.schema.json (Constitution III).
// Regenerate with: pnpm generate. CI fails on drift.

export const schemaDocuments: Record<string, Record<string, unknown>> = {
  "advisory": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/advisory.schema.json",
    "title": "drogna shore advisory",
    "description": "One shore advisory (SRD-v2 FR-37), authored deterministically from seeds and simulation time on a configured cadence, travelling on its declared control topic into the append-only advisory store. The shape's one structural rule, held by a test over this document itself: NO field admits free text — every string is an enum, a bounded pattern, or a timestamp — so no field is capable of naming an entity the harness did not place (Constitution V). Advice travels light: the size ceiling is enforced at the store's seam with the limit named, and measured against the smallest comparable gridded update by test.",
    "type": "object",
    "required": [
      "advisory_id",
      "scenario_run_id",
      "sim_time",
      "tick",
      "sequence",
      "kind",
      "valid_time",
      "region",
      "guidance"
    ],
    "additionalProperties": false,
    "properties": {
      "advisory_id": {
        "type": "string",
        "pattern": "^adv-[a-z0-9][a-z0-9-]*-[0-9]+$",
        "description": "Deterministic: the source id and the sequence, never entropy."
      },
      "scenario_run_id": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]*$"
      },
      "sim_time": {
        "type": "string",
        "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$"
      },
      "tick": {
        "type": "integer",
        "minimum": 0
      },
      "sequence": {
        "type": "integer",
        "minimum": 0
      },
      "kind": {
        "type": "string",
        "enum": [
          "sound-speed-outlook",
          "sampling-window",
          "caution-region"
        ],
        "description": "Closed deliberately; a new kind is an amendment to this master, never a free label."
      },
      "valid_time": {
        "type": "object",
        "required": [
          "start_sim_time",
          "end_sim_time"
        ],
        "additionalProperties": false,
        "properties": {
          "start_sim_time": {
            "type": "string",
            "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$"
          },
          "end_sim_time": {
            "type": "string",
            "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$"
          }
        }
      },
      "region": {
        "type": "object",
        "required": [
          "bbox"
        ],
        "additionalProperties": false,
        "properties": {
          "bbox": {
            "type": "array",
            "minItems": 4,
            "maxItems": 4,
            "items": {
              "type": "number"
            },
            "description": "west, south, east, north — degrees, WGS 84."
          }
        }
      },
      "guidance": {
        "type": "object",
        "required": [
          "confidence",
          "recommended_minimum_depth_m",
          "recommended_maximum_depth_m",
          "expected_sound_speed_minimum_m_per_s",
          "expected_sound_speed_maximum_m_per_s"
        ],
        "additionalProperties": false,
        "properties": {
          "confidence": {
            "type": "string",
            "enum": [
              "low",
              "moderate",
              "high"
            ]
          },
          "recommended_minimum_depth_m": {
            "type": "number",
            "minimum": 0
          },
          "recommended_maximum_depth_m": {
            "type": "number",
            "minimum": 0
          },
          "expected_sound_speed_minimum_m_per_s": {
            "type": "number"
          },
          "expected_sound_speed_maximum_m_per_s": {
            "type": "number"
          }
        }
      }
    }
  },
  "analysis-contributions": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/analysis-contributions.schema.json",
    "title": "drogna analysis contributions",
    "description": "What a column's values were made from, source by source (feature 124, SRD-v2 FR-111, FR-122, FR-130): the columns of the analysis gain the kernel has always computed and, until this feature, discarded. The root shape is the column document the query layer serves for one water column of one analysis cycle; `$defs/header` is the header the holding's own bytes open with (format `drogna-contributions-v1`, a second format `coverage-holding.schema.json` admits). A SOURCE is an instrument at the cell its observations were attributed to, not an observation: under nearest-neighbour H every observation a datastream makes inside one cell shares that cell's covariance row exactly, so their gains sum without approximation — and per observation the holding measured at ~9 MB a cycle against a store of ~9 MB. Every contribution here is Σⱼ K_aj over the source's observations, read off the published analysis and never recomputed. The support bounds the covariance and not the gain: the inverse couples observations within reach of each other, so a cast beyond a level's reach still moves it through one within, and that coupling — real, positionless, not a ray — is carried per level as the REMAINDER. The identity a consumer may hold, at float32's own tolerance: Σ contributions + remainder = observation_weight. A level no source reaches has observation_weight exactly nought and says `reached: false`, which is a different fact from a level that was reached and whose contributions summed to nothing (FR-129).",
    "type": "object",
    "required": [
      "schema_version",
      "holding_id",
      "run_id",
      "variable",
      "correlation",
      "column",
      "sources",
      "levels"
    ],
    "additionalProperties": false,
    "properties": {
      "schema_version": {
        "type": "integer",
        "const": 1
      },
      "holding_id": {
        "type": "string",
        "minLength": 1
      },
      "run_id": {
        "type": "string",
        "minLength": 1,
        "description": "The model run this analysis initialises — the announcement's `run_id`, not its `scenario_run_id` — read from the holding's own header, because the coverage descriptor's `run_id` is the scenario's for every analysis holding."
      },
      "variable": {
        "$ref": "#/$defs/variable"
      },
      "correlation": {
        "$ref": "#/$defs/correlation"
      },
      "column": {
        "type": "object",
        "required": [
          "longitude",
          "latitude",
          "longitude_index",
          "latitude_index"
        ],
        "additionalProperties": false,
        "description": "The column served: the grid cell nearest the position asked for, as EDR's position query snaps, stated so the reader knows which column answered.",
        "properties": {
          "longitude": {
            "type": "number"
          },
          "latitude": {
            "type": "number"
          },
          "longitude_index": {
            "type": "integer",
            "minimum": 0
          },
          "latitude_index": {
            "type": "integer",
            "minimum": 0
          }
        }
      },
      "sources": {
        "type": "array",
        "description": "The sources some level of this column has an entry for, and no others. `levels[].contributions[].source` indexes this array.",
        "items": {
          "$ref": "#/$defs/source"
        }
      },
      "levels": {
        "type": "array",
        "minItems": 1,
        "description": "One per depth level of the grid, in the grid's order, surface first.",
        "items": {
          "$ref": "#/$defs/level"
        }
      }
    },
    "$defs": {
      "variable": {
        "type": "string",
        "enum": [
          "temperature"
        ],
        "description": "Contributions are published for temperature alone, for the reason the provenance shares are: nothing reads salinity's, and publishing them would double a holding kept for the life of the run to answer a question nothing asks."
      },
      "correlation": {
        "type": "object",
        "required": [
          "horizontal_km",
          "vertical_m"
        ],
        "additionalProperties": false,
        "description": "The Gaspari–Cohn half-widths the analysis was built with, from the analyst's configuration; the support — the distance beyond which a source holds no entry — is exactly twice each.",
        "properties": {
          "horizontal_km": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "vertical_m": {
            "type": "number",
            "exclusiveMinimum": 0
          }
        }
      },
      "source": {
        "type": "object",
        "required": [
          "source_id",
          "datastream_id",
          "sensor_id",
          "kind",
          "cell",
          "observed",
          "observation_count",
          "error_std",
          "background_error_std",
          "mean_innovation"
        ],
        "additionalProperties": false,
        "properties": {
          "source_id": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9_.-]*$",
            "description": "Stable within a cycle: the datastream and the cell index."
          },
          "datastream_id": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9_.-]*$"
          },
          "sensor_id": {
            "type": "string",
            "pattern": "^[a-z0-9][a-z0-9_.-]*$"
          },
          "kind": {
            "type": "string",
            "enum": [
              "measured",
              "modelled"
            ],
            "description": "Measured: the vessel's own sensing. Modelled: another party's model output admitted as an observation. In this harness every observation the analyst assimilates is a vessel instrument's — the shore broadcast enters as background, never as an observation (SRD-v2 FR-125) — so every source is measured; the distinction is stated here so a consumer reads it rather than assumes it."
          },
          "cell": {
            "type": "object",
            "required": [
              "index",
              "longitude",
              "latitude",
              "depth_m"
            ],
            "additionalProperties": false,
            "description": "The cell the source's observations were attributed to, and its centre: where the ray is drawn from.",
            "properties": {
              "index": {
                "type": "integer",
                "minimum": 0
              },
              "longitude": {
                "type": "number"
              },
              "latitude": {
                "type": "number"
              },
              "depth_m": {
                "type": "number"
              }
            }
          },
          "observed": {
            "type": "object",
            "required": [
              "longitude",
              "latitude",
              "depth_m"
            ],
            "additionalProperties": false,
            "description": "Where the instrument was, on average over the source's observations, when it made them.",
            "properties": {
              "longitude": {
                "type": "number"
              },
              "latitude": {
                "type": "number"
              },
              "depth_m": {
                "type": "number"
              }
            }
          },
          "observation_count": {
            "type": "integer",
            "minimum": 1
          },
          "error_std": {
            "type": "number",
            "minimum": 0,
            "description": "R's diagonal: the instrument's declared error, shared by every observation of the source."
          },
          "background_error_std": {
            "type": "number",
            "minimum": 0,
            "description": "B's diagonal at the attributed cell: what the declared error was weighed against there."
          },
          "mean_innovation": {
            "type": "number",
            "description": "The mean of y − Hxᵇ over the source's observations: what the instruments said, less what the background expected."
          }
        }
      },
      "level": {
        "type": "object",
        "required": [
          "depth_index",
          "depth_m",
          "cell_index",
          "reached",
          "observation_weight",
          "remainder",
          "background_error_std",
          "contributions"
        ],
        "additionalProperties": false,
        "properties": {
          "depth_index": {
            "type": "integer",
            "minimum": 0
          },
          "depth_m": {
            "type": "number"
          },
          "cell_index": {
            "type": "integer",
            "minimum": 0
          },
          "reached": {
            "type": "boolean",
            "description": "Whether any source's support covers this cell. False is a level nobody sampled within reach, and its weight is exactly nought; a level that was reached and whose contributions summed to nothing says true, which is the other fact (FR-129)."
          },
          "observation_weight": {
            "type": "number",
            "description": "ω = Σⱼ K_aj over every observation: the measurement share this cycle added at the cell, not confined to [0, 1]."
          },
          "remainder": {
            "type": "number",
            "description": "ω less the in-support sources' contributions: what observations beyond this cell's reach did to it through their coupling with those within reach. Not attributable to a position and never drawn as a ray."
          },
          "background_error_std": {
            "type": [
              "number",
              "null"
            ],
            "description": "B's diagonal at this cell — the second of FR-130's two numbers, beside each source's declared error. Null where the level was not reached: the holding carries a row for every cell some source reaches and for no other, so there is nothing to state, and null is that fact rather than a nought pretending to be a measurement."
          },
          "contributions": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/contribution"
            }
          }
        }
      },
      "contribution": {
        "type": "object",
        "required": [
          "source",
          "contribution",
          "separation"
        ],
        "additionalProperties": false,
        "properties": {
          "source": {
            "type": "integer",
            "minimum": 0,
            "description": "An index into the document's `sources`."
          },
          "contribution": {
            "type": "number",
            "description": "Σⱼ K_aj over the source's observations, at this cell."
          },
          "separation": {
            "type": "object",
            "required": [
              "horizontal_km",
              "vertical_m"
            ],
            "additionalProperties": false,
            "description": "The distance the taper was evaluated on, from the source's cell to this one — the first of FR-130's two numbers.",
            "properties": {
              "horizontal_km": {
                "type": "number",
                "minimum": 0
              },
              "vertical_m": {
                "type": "number",
                "minimum": 0
              }
            }
          }
        }
      },
      "header": {
        "title": "drogna analysis contributions header",
        "type": "object",
        "required": [
          "schema_version",
          "format",
          "run_id",
          "variable",
          "correlation",
          "sources",
          "cells",
          "entries",
          "layout"
        ],
        "additionalProperties": false,
        "description": "The header a `drogna-contributions-v1` holding opens with: a little-endian u32 byte length, then this document as UTF-8 padded with spaces to a multiple of four bytes, then the sections `layout` names, each four bytes an element, in order.",
        "properties": {
          "schema_version": {
            "type": "integer",
            "const": 1
          },
          "format": {
            "type": "string",
            "const": "drogna-contributions-v1"
          },
          "run_id": {
            "type": "string",
            "minLength": 1,
            "description": "The model run this analysis initialises, as the analysis announcement names it."
          },
          "variable": {
            "$ref": "#/$defs/variable"
          },
          "correlation": {
            "$ref": "#/$defs/correlation"
          },
          "sources": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/source"
            }
          },
          "cells": {
            "type": "integer",
            "minimum": 0,
            "description": "The count of corrected cells — cells some source reaches — each a row of the holding."
          },
          "entries": {
            "type": "integer",
            "minimum": 0,
            "description": "The count of (cell, source) entries across every row."
          },
          "layout": {
            "type": "string",
            "const": "u32[cells] cell; f32[cells] observation_weight; f32[cells] remainder; f32[cells] background_error_std; u32[cells+1] offsets; u32[entries] source; f32[entries] contribution; f32[entries] horizontal_km; f32[entries] vertical_m",
            "description": "The sections after the header, stated in the header so the bytes are readable from the holding alone. Rows are compressed: the entries of the i-th cell run from offsets[i] to offsets[i+1]."
          }
        }
      }
    }
  },
  "analysis-published": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/analysis-published.schema.json",
    "title": "drogna analysis published",
    "description": "The message the analyst publishes when a cycle has landed, and the only route by which a model run begins (feature 116). Until this message existed the model runner subscribed to the run request directly and initialised from a now-cast the environment generator had evaluated from the true ocean, so no measurement ever changed a field value. The runner now waits for this instead: the analysis is a transition you can watch, and the ordering between analysing and forecasting is stated by a message rather than left to the order two components happened to subscribe in. The request's own fields are carried forward whole so the runner needs nothing else to proceed.",
    "type": "object",
    "required": [
      "component",
      "scenario_run_id",
      "sim_time",
      "tick",
      "run_id",
      "initialisation_sim_time",
      "ensemble_size",
      "background",
      "collections",
      "digests",
      "observations"
    ],
    "additionalProperties": false,
    "properties": {
      "component": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$",
        "description": "The analyst that published it, matching config /component/id."
      },
      "scenario_run_id": {
        "type": "string"
      },
      "sim_time": {
        "type": "string"
      },
      "tick": {
        "type": "integer",
        "minimum": 0
      },
      "run_id": {
        "type": "string",
        "description": "The run this analysis initialises, carried from the request it answered."
      },
      "initialisation_sim_time": {
        "type": "string"
      },
      "ensemble_size": {
        "type": "integer",
        "minimum": 2
      },
      "background": {
        "type": "object",
        "required": [
          "holding_id",
          "era"
        ],
        "additionalProperties": false,
        "description": "What was corrected. The era is carried because the first cycle of a scenario has no forecast to use and initialises from the now-cast instead — one deliberate reading of the true field, at the instant the platform leaves, made legible here and in the manifest rather than hidden.",
        "properties": {
          "holding_id": {
            "type": "string"
          },
          "era": {
            "type": "string",
            "enum": [
              "archive",
              "nowcast",
              "analysis",
              "instance"
            ]
          }
        }
      },
      "collections": {
        "type": "object",
        "required": [
          "analysis",
          "error",
          "provenance",
          "contributions"
        ],
        "additionalProperties": false,
        "properties": {
          "analysis": {
            "type": "string"
          },
          "error": {
            "type": "string"
          },
          "provenance": {
            "type": "string"
          },
          "contributions": {
            "type": "string",
            "description": "Feature 124: what each cell's value was made from, source by source — the columns of the gain the provenance's measurement share is the row sum of. A `drogna-contributions-v1` holding (analysis-contributions.schema.json), served by the query component at its configured contributions prefix rather than through EDR, because a sparse per-source holding is not a coverage."
          }
        }
      },
      "digests": {
        "type": "object",
        "required": [
          "analysis",
          "error",
          "provenance",
          "contributions"
        ],
        "additionalProperties": false,
        "properties": {
          "analysis": {
            "type": "string"
          },
          "error": {
            "type": "string"
          },
          "provenance": {
            "type": "string"
          },
          "contributions": {
            "type": "string"
          }
        }
      },
      "observations": {
        "type": "object",
        "required": [
          "assimilated",
          "clamped",
          "worst_displacement_km"
        ],
        "additionalProperties": false,
        "description": "What the cycle was given. An observation outside the grid is clamped to the edge and still assimilated — the domain boundary is where the harness stopped authoring a field, not where the ocean stops — so the count and the worst distance travelled are carried rather than left silent.",
        "properties": {
          "assimilated": {
            "type": "integer",
            "minimum": 0
          },
          "clamped": {
            "type": "integer",
            "minimum": 0
          },
          "worst_displacement_km": {
            "type": "number",
            "minimum": 0
          }
        }
      }
    }
  },
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
  "config.advisory-source": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.advisory-source.schema.json",
    "title": "drogna shore advisory source configuration (V2-C16)",
    "description": "The shore advisory source (SRD-v2 FR-37): authors advisories deterministically from its seed stream and simulation time on the cadence below, cycling the closed kinds, with guidance values derived from the background profiles' sound speed plus seeded jitter. It publishes on its declared topic and holds nothing back for a second channel: what the store refuses is refused observably at the store's seam, not silently here. It may also be prompted from the operator plane to author the next advisory now; prompted or on cadence, the advisory is the same deterministic next one in its sequence.",
    "type": "object",
    "required": [
      "id",
      "stream",
      "topics",
      "heartbeat",
      "cadence_ticks",
      "valid_seconds",
      "region_feature",
      "depth_span_m",
      "sound_speed_half_width_m_per_s",
      "prompt_event"
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
          "advisory",
          "command"
        ],
        "additionalProperties": false,
        "properties": {
          "clock": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "advisory": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "command": {
            "$ref": "config.common.schema.json#/$defs/topic",
            "description": "Operator commands (operator-command.schema.json). The source acts on an event addressed to it and ignores everything else on the topic."
          }
        }
      },
      "heartbeat": {
        "$ref": "config.common.schema.json#/$defs/heartbeat"
      },
      "cadence_ticks": {
        "type": "integer",
        "exclusiveMinimum": 0
      },
      "valid_seconds": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "region_feature": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_.-]*$",
        "description": "The feature-store feature whose bounding box advisories cover."
      },
      "depth_span_m": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "sound_speed_half_width_m_per_s": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "prompt_event": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]*$",
        "description": "Which operator event id this source answers to (operator-command.schema.json). Named on both sides, as a topic is."
      }
    }
  },
  "config.advisory-store": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.advisory-store.schema.json",
    "title": "drogna advisory store configuration (V2-C17)",
    "description": "The advisory store (SRD-v2 FR-37, FR-12): append-only, written only through its own ingestion seam — the subscription below — which validates every advisory against its master, absorbs redelivery on the deterministic id, and enforces the size ceiling with a refusal that names the limit. Read by the query components alone.",
    "type": "object",
    "required": [
      "id",
      "topics",
      "heartbeat",
      "size_ceiling_bytes"
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
          "advisory"
        ],
        "additionalProperties": false,
        "properties": {
          "clock": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "advisory": {
            "$ref": "config.common.schema.json#/$defs/topic_filter"
          }
        }
      },
      "heartbeat": {
        "$ref": "config.common.schema.json#/$defs/heartbeat"
      },
      "size_ceiling_bytes": {
        "type": "integer",
        "exclusiveMinimum": 0,
        "description": "The wire-bytes ceiling. Advice travels light: the ceiling is held far below the smallest gridded update, and a test measures the two rather than trusting this sentence."
      }
    }
  },
  "config.analyst": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.analyst.schema.json",
    "title": "drogna analyst configuration (V2-C19)",
    "description": "The analyst (SRD-v2 FR-30, amended by feature 116): on a run request, takes the current forecast as background and the observations since its last cycle, and publishes an analysis — the field corrected by what was measured, the error that correction left, and where every cell's value came from. Until feature 116 the model runner initialised from a now-cast the environment generator evaluated from the true ocean, so no measurement ever changed a field value and the loop converged because truth leaked in on a timer. This document configures the step that replaced that.",
    "type": "object",
    "required": [
      "id",
      "stream",
      "topics",
      "heartbeat",
      "correlation",
      "excluded_datastreams",
      "shares",
      "restate_every_ticks"
    ],
    "additionalProperties": false,
    "properties": {
      "id": {
        "$ref": "config.common.schema.json#/$defs/component_id"
      },
      "stream": {
        "type": "string",
        "minLength": 1,
        "description": "The RNG stream the analyst draws from, for the perturbations the model runner's ensemble is initialised with."
      },
      "topics": {
        "type": "object",
        "required": [
          "clock",
          "observations",
          "run_request",
          "run_published",
          "analysis_published",
          "analysis_standing"
        ],
        "additionalProperties": false,
        "properties": {
          "clock": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "observations": {
            "$ref": "config.common.schema.json#/$defs/topic_filter"
          },
          "run_request": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "run_published": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "analysis_published": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "analysis_standing": {
            "$ref": "config.common.schema.json#/$defs/topic",
            "description": "Where the standing analysis is DECLARED, which is deliberately not where it is ANNOUNCED. `analysis_published` is a trigger: the model runner starts a forecast on it (feature 116) and the planner re-plans on it, so repeating it repeats the work — measured, when it was tried: ten tests across seven files, replay determinism among them. A declaration carries the same message and commands nothing, which is the same separation the model runner already keeps between `run_started` and `run_cost`. It is published beside each cycle and restated on the cadence, so a console that mounts after a cycle can still name the collections it should read."
          }
        }
      },
      "heartbeat": {
        "$ref": "config.common.schema.json#/$defs/heartbeat"
      },
      "correlation": {
        "type": "object",
        "required": [
          "horizontal_km",
          "vertical_m"
        ],
        "additionalProperties": false,
        "description": "The background error correlation: Gaspari–Cohn half-widths, so the taper reaches exactly zero at twice each value and a cell beyond that owes a measurement nothing at all — a fact rather than a small number. This is the harness's ONE declaration of how far a measurement's influence reaches: the planner reads it from here rather than restating it, because a planner that scores a collapse of uncertainty at one scale while the analysis applies it at another is scoring a system that does not exist. It is a modelling assumption and is meant to be: the analyst may not read the world's own feature scales, since that document describes the truth. specs/116 argues the values.",
        "properties": {
          "horizontal_km": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "vertical_m": {
            "type": "number",
            "exclusiveMinimum": 0
          }
        }
      },
      "excluded_datastreams": {
        "type": "array",
        "description": "Datastreams that measure the platform rather than the sea, excluded by name as the monitor and planner exclude them. An ownship course is not a sample of the ocean and cannot inform a field.",
        "items": {
          "type": "string",
          "pattern": "^[a-z0-9][a-z0-9_.-]*$"
        }
      },
      "shares": {
        "type": "object",
        "required": [
          "archive",
          "departure",
          "measurement",
          "model"
        ],
        "additionalProperties": false,
        "description": "The provenance vocabulary, in the order the shares are stored and drawn. Four, and each is a different kind of claim: what was known before the scenario began; what the state held when the platform left; what the instruments have since measured; and the error successive forecasts have added, which belongs to no observation. The departure share's content is archive — the model propagates information without creating any — so that bar is a convention kept for the operator's benefit, and specs/116 requires the explainer to say so.",
        "properties": {
          "archive": {
            "type": "string",
            "minLength": 1
          },
          "departure": {
            "type": "string",
            "minLength": 1
          },
          "measurement": {
            "type": "string",
            "minLength": 1
          },
          "model": {
            "type": "string",
            "minLength": 1
          }
        }
      },
      "restate_every_ticks": {
        "type": "integer",
        "exclusiveMinimum": 0,
        "description": "How often the last analysis announcement is repeated, in ticks of simulation time. An analysis cycle's collections are a STANDING fact about the analysis that is current, not an event that happened once: the provenance of a cell is still what it was until another cycle replaces it. Announced on the cycle alone, a console that mounted afterwards — which every console does, since the shell opens after the pre-roll — had no way to name the collections it should read, and the surface that shows what a cell's value was made from said so for up to a whole cadence. The same argument the model runner's cost and feature statements already make for themselves. Nothing is recomputed: the message published on the cycle is republished with the instant it is said at, so no component ever holds two opinions about one analysis. It is a publication on the component's own clock and not a poll."
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
      "heartbeat",
      "announce_event"
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
          "published",
          "command"
        ],
        "additionalProperties": false,
        "properties": {
          "clock": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "published": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "command": {
            "$ref": "config.common.schema.json#/$defs/topic",
            "description": "Operator commands (operator-command.schema.json). The store acts on an announcement prompt addressed to it and ignores everything else on the topic."
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
      },
      "announce_event": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]*$",
        "description": "Which operator event id asks the store to announce its current era pointers again (SRD-v2 FR-65). It publishes no holding and changes none: the announcement names holdings that are already published, so consumers that missed the first one — or a reader who wants to watch the announcement cross — get the same message about the same bytes. With nothing published there is nothing to announce, and the store says so rather than announcing an absence."
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
      "departure",
      "background",
      "features",
      "timescale",
      "prompt_event"
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
          "clock",
          "command"
        ],
        "additionalProperties": false,
        "properties": {
          "clock": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "command": {
            "$ref": "config.common.schema.json#/$defs/topic",
            "description": "Operator commands (operator-command.schema.json). This component acts on a command addressed to it and ignores everything else on the topic."
          }
        }
      },
      "prompt_event": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]*$",
        "description": "Which operator event id asks this generator to author its next now-cast now rather than on its cadence. The prompt moves when a now-cast is authored and never what it says: the field is the same deterministic function of simulation time either way. Named on both sides — here and in the operator surface's declared events — as a topic is."
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
      "departure": {
        "type": "object",
        "required": [
          "grid",
          "time_steps",
          "step_seconds"
        ],
        "additionalProperties": false,
        "description": "The forecast the vessel was issued at the quay-side (feature 121): authored once at provisioning, valid forward from the scenario origin, and never refreshed. It is a persistence forecast — the true field at the origin held constant across every step — because this component evaluates the true ocean, and a brief evaluated from truth at each step would be right about the future, which no forecast is. Its error grows on its own as the world moves away from it.",
        "properties": {
          "grid": {
            "$ref": "#/$defs/grid_counts"
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
      "noise_std",
      "two_layer",
      "cost"
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
          "analysis_published",
          "run_started",
          "run_published",
          "run_cost",
          "forecast_features",
          "telemetry"
        ],
        "additionalProperties": false,
        "properties": {
          "clock": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "run_request": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "analysis_published": {
            "$ref": "config.common.schema.json#/$defs/topic",
            "description": "Where the analyst announces a cycle. The runner initialises from what this message names and from nothing else: feature 116 replaced a subscription to the run request, under which the runner initialised from a field evaluated from the true ocean."
          },
          "run_started": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "run_published": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "run_cost": {
            "$ref": "config.common.schema.json#/$defs/topic",
            "description": "Where this component states what a run costs, in ticks of simulation time. It is the sole publisher of that figure (SRD-v2 FR-115): the scheduler subscribes here rather than holding a second copy, and check-declared-cost fails the build if any other component's configuration declares one."
          },
          "telemetry": {
            "$ref": "config.common.schema.json#/$defs/topic",
            "description": "Where this component reports a run it did not finish. A run occupies the ticks it costs before it publishes (FR-114), so there is now an interval in which the runner can be stopped with a run staged and unpublished. A run that leaves no trace is a run the scheduler waits on for ever — the permanently becalmed loop FR-31 forbids — so the runner says so on its way out, and the scheduler releases what it was holding."
          },
          "forecast_features": {
            "$ref": "config.common.schema.json#/$defs/topic",
            "description": "Where the run announces the seeded features it forecast as features (SRD-v2 FR-113) — the eddy, the front, the thermocline and the drifting feature, each with an uncertainty growing with lead."
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
      "two_layer": {
        "type": "object",
        "required": [
          "interface_depth_m",
          "upper",
          "lower",
          "horizontal_diffusivity_m2_per_s",
          "interfacial_exchange_per_day",
          "max_courant",
          "max_sub_steps"
        ],
        "additionalProperties": false,
        "description": "The shallow two-layer advection–diffusion step (SRD-v2 FR-112). Deliberately impoverished physics that nonetheless propagates state forward rather than sliding a field sideways: upwind advection and explicit horizontal diffusion within each layer, and an interfacial exchange between them. It is not an implementation of, port of, or wrapper around NEMO, ROMS, MITgcm, PDAF, DART, OceanVar or OpenDA (FR-107); those are named in the explainer as what the real thing is.",
        "properties": {
          "interface_depth_m": {
            "type": "number",
            "exclusiveMinimum": 0,
            "description": "Depth of the interface splitting the upper layer from the lower. A cell is in whichever layer its depth falls in; the interface is a modelling assumption and deliberately not the analysed thermocline, so a forecast that puts the thermocline somewhere else is saying something."
          },
          "upper": {
            "$ref": "#/$defs/layer_velocity"
          },
          "lower": {
            "$ref": "#/$defs/layer_velocity"
          },
          "horizontal_diffusivity_m2_per_s": {
            "type": "number",
            "minimum": 0,
            "description": "Explicit horizontal diffusivity, applied per layer. Bounded by the kernel's own stability condition: a configuration that violates it is refused with the numbers named, never integrated."
          },
          "interfacial_exchange_per_day": {
            "type": "number",
            "minimum": 0,
            "description": "Rate at which the two layers exchange, per day. Zero makes the layers independent, which is a legitimate configuration and says so."
          },
          "max_courant": {
            "type": "number",
            "exclusiveMinimum": 0,
            "maximum": 1,
            "description": "The Courant number the kernel sub-steps to stay under. The sub-step count is derived from this, the grid and the velocities — never configured, because a configured count is a number that can disagree with the grid it runs on."
          },
          "max_sub_steps": {
            "type": "integer",
            "exclusiveMinimum": 0,
            "description": "The ceiling on sub-steps per forecast step. Reaching it is a REFUSAL and not a clamp: the kernel names the Courant number, the diffusion number, the exchange number, the sub-steps they require and this ceiling, and integrates nothing. Clamping instead would integrate unstably and publish the result as a forecast, which is the fault this bound exists to make impossible."
          }
        }
      },
      "cost": {
        "type": "object",
        "required": [
          "work_per_sub_step",
          "rate_work_per_tick",
          "nominal_cell_km",
          "restate_every_ticks"
        ],
        "additionalProperties": false,
        "description": "What a run costs, as simulation time (SRD-v2 FR-114, ADR-0043). The magnitude is a declared rate and not a measurement — a host-clock duration is a fact about the machine the tab is open on, and admitting one would put a figure inside a run that differs between two replays of the same manifest (AT-04). What is kept is that the cost is spent rather than merely stated: the run occupies the ticks it comes to.",
        "properties": {
          "work_per_sub_step": {
            "type": "number",
            "exclusiveMinimum": 0,
            "description": "Declared work one integration sub-step covers, in work units. A declaration, not a measurement."
          },
          "rate_work_per_tick": {
            "type": "number",
            "exclusiveMinimum": 0,
            "description": "Work units one tick of simulation time buys. Cost in ticks is the work the run covers divided by this, rounded up."
          },
          "restate_every_ticks": {
            "type": "integer",
            "exclusiveMinimum": 0,
            "description": "How often the cost statement is repeated, in ticks of simulation time. A cost is a DECLARATION rather than an event: every restatement carries the same figures, so repeating it tells a listener that arrived late what the first statement said and tells one that heard it nothing new. Without it the figure would be published once, before the shell had mounted, and the surface that must state cost beside need (FR-118) could never have heard it. Measured in ticks and driven by the clock subscription this component already holds, so the repetition is deterministic and replays identically — it is a publication on the component's own clock and not a poll. No default: it is required, so a default here would be a value nothing can ever read."
          },
          "nominal_cell_km": {
            "type": "number",
            "exclusiveMinimum": 0,
            "description": "The horizontal cell size the cost DECLARATION assumes, so that a cost can be stated before any analysis has arrived and the scheduler can weigh it. The integration itself sub-steps from the grid it is handed, and the run-started message reports the sub-step count that actually ran — a declared figure and a reported one, never the same figure twice (ADR-0036).\n\n**Keep it near the grid the run is actually handed, and a test says so.** The declaration and the occupancy are only the same amount of work while the two agree on the sub-step count. It was first set to 11 km against a now-cast whose cells are about 4.9 by 5.6 km at this domain's latitude — a factor of two, invisible only because both round to one sub-step at this step length. `features`-adjacent tests compare the two, so a grid refined past where the nominal stops being representative fails rather than quietly making FR-114's 'the run occupies the ticks its cost comes to' untrue."
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
    },
    "$defs": {
      "layer_velocity": {
        "type": "object",
        "required": [
          "east_km_per_day",
          "north_km_per_day"
        ],
        "additionalProperties": false,
        "description": "One layer's advecting velocity. Two layers moving differently is the whole of what makes this a propagation rather than a translation: the field shears, and the shear is what the old kernel could not produce.",
        "properties": {
          "east_km_per_day": {
            "type": "number"
          },
          "north_km_per_day": {
            "type": "number"
          }
        }
      }
    }
  },
  "config.monitor": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.monitor.schema.json",
    "title": "drogna monitor configuration (V2-C11)",
    "description": "The monitor (SRD-v2 FR-30): subscribes to the observation namespace, pairs co-located temperature and salinity samples, derives sound speed by the one implementation, scores the residual against the current forecast instance, and raises a divergence event only on sustained persistence — never a single spike. Evidence gathered against a superseded forecast is discarded, not carried. The threshold and the persistence count are tunable from the operator plane while the run is going (operator-command.schema.json): the values here are what the monitor starts with and returns to when it is restarted, and the values in force are reported in its own heartbeat figures and on every residual sample.",
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
          "divergence",
          "telemetry",
          "command",
          "indicator"
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
          },
          "telemetry": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "command": {
            "$ref": "config.common.schema.json#/$defs/topic",
            "description": "Operator commands. The monitor acts on a tuning addressed to it and ignores the rest."
          },
          "indicator": {
            "$ref": "config.common.schema.json#/$defs/topic",
            "description": "The declared topic an indicator that re-forecasting is becoming valuable publishes on (SRD-v2 FR-117). The indicator itself is environmental science and belongs to the environmental-indicators workstream; what drogna provides is this socket, a gauge that renders whatever is published here, and a refusal that names the absence when nothing is. Drogna's own residual statistic is wired in as the reference implementation, published by this component because it already holds both the running residual and the threshold in force — any other publisher would hold a second copy of the threshold, and the mark on the gauge could then disagree with the rule that fires a run."
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
  "config.offload": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.offload.schema.json",
    "title": "drogna offload packager configuration (V2-C20)",
    "description": "The offload packager (SRD-v2 FR-39): announcement-only in V2, keeping the export's shape. On each published run it stages the bundle (bundle-manifest.schema.json beside the released field bytes) and the run-manifest SIBLING carrying the measurement geometry — the identification radius and every sampled position and simulation time in the window, beside the bundle and never inside it (E11) — then announces the staged departure on its declared topic (offload-telemetry.schema.json). No real transfer and no verified-receipt eviction until V3.",
    "type": "object",
    "required": [
      "id",
      "topics",
      "heartbeat",
      "identification_radius_m",
      "format_version",
      "staging_bound_bytes",
      "prompt_event"
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
          "run_published",
          "offload",
          "command"
        ],
        "additionalProperties": false,
        "properties": {
          "clock": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "run_published": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "offload": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "command": {
            "$ref": "config.common.schema.json#/$defs/topic",
            "description": "Operator commands (operator-command.schema.json). The packager acts on a prompt addressed to it and ignores everything else on the topic."
          }
        }
      },
      "prompt_event": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]*$",
        "description": "Which operator event id asks this packager to stage a window now, over the release it last heard, rather than waiting for the next one. It stages under exactly the rules it already has: declined at the staging bound, and declined where the interval holds no measurements, because a bundle nobody can score is not staged — prompted or not. Named on both sides, as a topic is."
      },
      "heartbeat": {
        "$ref": "config.common.schema.json#/$defs/heartbeat"
      },
      "identification_radius_m": {
        "type": "number",
        "exclusiveMinimum": 0,
        "description": "Travels in the sibling's measurement geometry, so a release is scored on the radius it was released under; producer/boundary parity is held by a test (E11)."
      },
      "format_version": {
        "type": "string",
        "minLength": 1
      },
      "staging_bound_bytes": {
        "type": "integer",
        "exclusiveMinimum": 0
      }
    }
  },
  "config.operator": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.operator.schema.json",
    "title": "drogna operator surface configuration (V2-C18)",
    "description": "The operator surface (SRD-v2 FR-36): aggregates what components report about themselves — a component never heard from is reported unheard, not absent — and dispatches commands: clock step, and stop/start/restart of in-browser components. A refused command names the bound or rule; a stopped component goes dark because its heartbeats cease, never because this surface says so. Commands are ephemeral and outside AT-04's replay claim. Beyond stop and start it declares what else the plane offers: how far one step command may advance the clock, the settings a reader may tune and the bound each is refused outside, and the events a component may be prompted to consider now. Those declarations are served verbatim as the controls statement (operator-controls.schema.json), so the shell offers exactly what the surface would accept; the commands themselves go on one broker topic (operator-command.schema.json) addressed to a target, and the surface publishes and counts while the target decides and reports.",
    "type": "object",
    "required": [
      "id",
      "topics",
      "http",
      "heartbeat",
      "protected",
      "step",
      "demand",
      "tunables",
      "events"
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
          "heartbeat",
          "platform_demand",
          "command"
        ],
        "additionalProperties": false,
        "properties": {
          "clock": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "heartbeat": {
            "$ref": "config.common.schema.json#/$defs/topic_filter"
          },
          "platform_demand": {
            "$ref": "config.common.schema.json#/$defs/topic",
            "description": "Where a demand is published. The operator surface is the only publisher today; the broker's rules are written so an adaptive sampler could be a second without a change here."
          },
          "command": {
            "$ref": "config.common.schema.json#/$defs/topic",
            "description": "Where tuning and event commands are published (operator-command.schema.json). One topic for both, addressed by the command's target: a topic per command would draw the same reach as a fan of near-identical wires, and bury the ones carrying meaning."
          }
        }
      },
      "http": {
        "type": "object",
        "required": [
          "components_path",
          "step_path",
          "command_prefix",
          "platform_demand_path",
          "controls_path",
          "tuning_path",
          "event_prefix"
        ],
        "additionalProperties": false,
        "properties": {
          "components_path": {
            "$ref": "config.common.schema.json#/$defs/relative_path"
          },
          "step_path": {
            "$ref": "config.common.schema.json#/$defs/relative_path",
            "description": "POST to advance the clock. An optional { ticks } body asks for a burst, bounded by /step/maximum_ticks; an absent body is one tick, which is what this endpoint has always meant."
          },
          "command_prefix": {
            "$ref": "config.common.schema.json#/$defs/relative_path",
            "description": "POST <prefix>/<component-id>/stop|start|restart."
          },
          "platform_demand_path": {
            "$ref": "config.common.schema.json#/$defs/relative_path",
            "description": "POST a demanded course, speed and depth (platform-demand.schema.json). The surface publishes it on the demand topic; it does not apply it, and the response says only what was dispatched. Whether the platform can reach the demand is the platform's own answer, and it arrives on the state topic like everything else a component says about itself (FR-048)."
          },
          "controls_path": {
            "$ref": "config.common.schema.json#/$defs/relative_path",
            "description": "GET the controls statement: the step bound, the tunables and the events, exactly as declared below. The shell draws its console from that statement and holds no list of its own, so a control it offers is one this surface would accept."
          },
          "tuning_path": {
            "$ref": "config.common.schema.json#/$defs/relative_path",
            "description": "POST { target, setting, value }. Refused by name outside the declared bound, and refused for a setting no tunable declares — a bound stated in a panel and enforced nowhere is not a bound."
          },
          "event_prefix": {
            "$ref": "config.common.schema.json#/$defs/relative_path",
            "description": "POST <prefix>/<event-id>. The surface publishes the prompt and says what it published; whether the component acts is that component's answer, on that component's own topics."
          }
        }
      },
      "heartbeat": {
        "$ref": "config.common.schema.json#/$defs/heartbeat"
      },
      "protected": {
        "type": "array",
        "items": {
          "$ref": "config.common.schema.json#/$defs/component_id"
        },
        "description": "Components a stop command is refused for, by the rule this list is: stopping the clock stops time itself, stopping the broker silences every heartbeat including the evidence of the stopping, and the boundary and this surface must outlive their own commands."
      },
      "step": {
        "$ref": "operator-controls.schema.json#/$defs/step"
      },
      "demand": {
        "$ref": "operator-controls.schema.json#/$defs/demand"
      },
      "tunables": {
        "type": "array",
        "description": "The settings this plane will accept a change to, each naming the component that holds it, the bound outside which a change is refused, and the heartbeat figure that component reports the value in force under. Declared here so the rule has one home: this surface enforces it, the controls statement publishes it, and the panel draws it.",
        "items": {
          "$ref": "operator-controls.schema.json#/$defs/tunable"
        }
      },
      "events": {
        "type": "array",
        "description": "The events a component may be prompted to consider now. The prompt is published; the component decides, and a decline is as ordinary an outcome as an acceptance.",
        "items": {
          "$ref": "operator-controls.schema.json#/$defs/event"
        }
      }
    }
  },
  "config.planner": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.planner.schema.json",
    "title": "drogna planner configuration (V2-C14)",
    "description": "The planner (SRD-v2 FR-33, FR-34): combines the published ensemble spread with an observation-age deficit decaying at the local tau, prices candidate routes by walking them against the state as it stands at each arrival instant, selects by prize-collecting orienteering under a time budget with seeded restarts, and emits recommendations only. The formulation is docs/algorithms/informative-path-planning.md, carried whole from V1; every constant it names is configuration here, never a number in code. Feature 116 removed this document's footprint block: how far a measurement's influence reaches is the analysis's covariance, declared once in config.analyst.schema.json, and the planner reads it from there. Two declarations of one physical claim, only one of them ever applied, is the fault this repository keeps paying for.",
    "type": "object",
    "required": [
      "id",
      "stream",
      "topics",
      "heartbeat",
      "replan_interval_ticks",
      "region_feature",
      "h3_resolution",
      "depth_bands",
      "budget_seconds",
      "speeds",
      "usable_threshold",
      "restarts",
      "shortlist",
      "projection",
      "prompt_event"
    ],
    "additionalProperties": false,
    "properties": {
      "id": {
        "$ref": "config.common.schema.json#/$defs/component_id"
      },
      "stream": {
        "type": "string",
        "minLength": 1,
        "description": "The stream the restart draws come from; with restarts = 1 no draw is taken at all."
      },
      "topics": {
        "type": "object",
        "required": [
          "clock",
          "observations",
          "run_published",
          "plan",
          "command"
        ],
        "additionalProperties": false,
        "properties": {
          "clock": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "observations": {
            "$ref": "config.common.schema.json#/$defs/topic_filter"
          },
          "run_published": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "plan": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "command": {
            "$ref": "config.common.schema.json#/$defs/topic",
            "description": "Operator commands (operator-command.schema.json). The planner acts on a tuning or a prompt addressed to it and ignores everything else on the topic."
          }
        }
      },
      "prompt_event": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]*$",
        "description": "Which operator event id asks the planner to recompute now rather than at its replan interval. It recommends either way: a prompt changes when a recommendation is made, never what it is worth, and never turns one into an order (Constitution VIII)."
      },
      "heartbeat": {
        "$ref": "config.common.schema.json#/$defs/heartbeat"
      },
      "excluded_datastreams": {
        "type": "array",
        "items": {
          "type": "string",
          "pattern": "^[a-z0-9][a-z0-9_.-]*$"
        },
        "description": "Datastreams on the observation namespace that the planner must not treat as measurements of the ocean — the platform's own ownship series (FR-56). The planner informs its observation-age field from whatever arrives, so what it must ignore has to be named; counting an ownship row would refresh confidence everywhere the platform went without a single sounding being taken. Named rather than pattern-matched, because a rule that guesses which datastreams are about the sea will one day guess wrong. The monitor needs no such list: its pairs name the thing and datastreams it scores outright, which is an allowlist and stronger. A test fails when a name here is removed."
      },
      "replan_interval_ticks": {
        "type": "integer",
        "exclusiveMinimum": 0
      },
      "region_feature": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_.-]*$",
        "description": "The feature-store feature whose polygon the planning cover is built over — the loiter region in the shipped scenario. Read through the store interface; the cover is by overlap, so edge water is inside it."
      },
      "h3_resolution": {
        "type": "integer",
        "minimum": 0,
        "maximum": 15
      },
      "depth_bands": {
        "type": "array",
        "minItems": 1,
        "items": {
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
              "minimum": 0
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
        }
      },
      "budget_seconds": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "speeds": {
        "type": "object",
        "required": [
          "horizontal_m_per_s",
          "vertical_m_per_s"
        ],
        "additionalProperties": false,
        "description": "Traversal cost is time: horizontal and vertical added, the conservative reading of a budget.",
        "properties": {
          "horizontal_m_per_s": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "vertical_m_per_s": {
            "type": "number",
            "exclusiveMinimum": 0
          }
        }
      },
      "usable_threshold": {
        "type": "number",
        "exclusiveMinimum": 0,
        "description": "θ: the usable-confidence threshold excess is measured against. Where nothing exceeds it, the honest recommendation is no route at all, stated with its reason."
      },
      "restarts": {
        "type": "integer",
        "minimum": 1
      },
      "shortlist": {
        "type": "integer",
        "minimum": 1
      },
      "projection": {
        "type": "object",
        "required": [
          "step_seconds",
          "horizon_seconds"
        ],
        "additionalProperties": false,
        "properties": {
          "step_seconds": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "horizon_seconds": {
            "type": "number",
            "exclusiveMinimum": 0
          }
        }
      }
    }
  },
  "config.platform": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.platform.schema.json",
    "title": "drogna platform configuration (V2-C21)",
    "description": "The platform component's configuration document (SRD-v2 FR-52, FR-53): the motion simulator's initial state, the limits it integrates under, the demand topic it listens on, and the SensorThings identity its ownship observations carry. Before feature 113 the platform was a closed-form loiter evaluated inside the sensors, which is why it could not be commanded and held no state between ticks. It is a component now: it can be stopped, and when it is, the sensors have no position and say so.",
    "type": "object",
    "required": [
      "id",
      "stream",
      "topics",
      "heartbeat",
      "initial",
      "limits",
      "instruments",
      "thing",
      "fault_event",
      "report_event"
    ],
    "additionalProperties": false,
    "properties": {
      "id": {
        "$ref": "config.common.schema.json#/$defs/component_id"
      },
      "stream": {
        "type": "string",
        "minLength": 1,
        "description": "The RNG stream the navigation instruments' noise draws from. The integrator itself is deterministic and draws nothing: only the reported values carry noise."
      },
      "topics": {
        "type": "object",
        "required": [
          "clock",
          "demand",
          "state",
          "observation_prefix",
          "command"
        ],
        "additionalProperties": false,
        "properties": {
          "clock": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "demand": {
            "$ref": "config.common.schema.json#/$defs/topic",
            "description": "Where demanded course, speed and depth arrive (platform-demand.schema.json). The broker's rules decide who may publish here; today that is the operator surface alone, and the rules are written so a future adaptive-sampling component can be a second publisher without amending this document. The planner is not among them and may not become one without amending Constitution VIII."
          },
          "state": {
            "$ref": "config.common.schema.json#/$defs/topic",
            "description": "Where the platform reports demanded beside current, and the limit that is binding (platform-state.schema.json). Separate from the observation namespace on purpose: this is the component reporting about itself, not a measurement."
          },
          "observation_prefix": {
            "type": "string",
            "pattern": "^[a-z0-9]+$",
            "description": "The namespace ownship observations are published under, matching the sensors' own: the topic is <prefix>/<thing_id>/<datastream_id>. The same namespace because these are ordinary measurements through the ordinary path (FR-54)."
          },
          "command": {
            "$ref": "config.common.schema.json#/$defs/topic",
            "description": "Operator commands (operator-command.schema.json). The platform acts on a fault prompt addressed to it and ignores everything else on the topic; a demand still arrives on the demand topic, because a demand is a domain message and not a command."
          }
        }
      },
      "fault_event": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]*$",
        "description": "Which operator event id asks the platform to publish ONE deliberately faulty message (SRD-v2 FR-67): a depth reading beyond the maximum this document declares. The fault originates here, in the component a real instrument fault would come from, rather than being published into the ownship namespace by a control plane that does not own it — which is also what makes the ingestion seam's answer the genuine one, since it range-checks against these very limits. The platform counts what it was asked to produce and reports the count, so a faulty reading is never mistaken for a platform that has started lying on its own account."
      },
      "heartbeat": {
        "$ref": "config.common.schema.json#/$defs/heartbeat"
      },
      "thing": {
        "type": "object",
        "required": [
          "thing_id",
          "name",
          "description"
        ],
        "additionalProperties": false,
        "description": "The SensorThings Thing the ownship datastreams belong to. Distinct from the sensors' sampling platform Thing, because a series of ownship observations is a track and a series of sampling locations is not (observation.schema.json's location note, amended by FR-027).",
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
          }
        }
      },
      "initial": {
        "type": "object",
        "required": [
          "latitude",
          "longitude",
          "course_degrees",
          "speed_m_per_s",
          "depth_m"
        ],
        "additionalProperties": false,
        "description": "Where the platform starts, and how it is moving when the first tick arrives. Configuration, not state: the run manifest records what a replay needs.",
        "properties": {
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
          "course_degrees": {
            "type": "number",
            "minimum": 0,
            "exclusiveMaximum": 360
          },
          "speed_m_per_s": {
            "type": "number",
            "minimum": 0
          },
          "depth_m": {
            "type": "number",
            "minimum": 0
          }
        }
      },
      "limits": {
        "type": "object",
        "required": [
          "maximum_speed_m_per_s",
          "maximum_depth_m",
          "turn_rate_degrees_per_second",
          "acceleration_m_per_s2",
          "dive_rate_m_per_s"
        ],
        "additionalProperties": false,
        "description": "What the platform can do, and therefore what it will refuse to pretend to do. A demand beyond a limit is applied as far as the limit allows and the shortfall is stated in the state message — never silently clipped (FR-53).",
        "properties": {
          "maximum_speed_m_per_s": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "maximum_depth_m": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "turn_rate_degrees_per_second": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "acceleration_m_per_s2": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "dive_rate_m_per_s": {
            "type": "number",
            "exclusiveMinimum": 0
          }
        }
      },
      "report_event": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]*$",
        "description": "Which operator event id asks the platform to report where it is now, outside its reporting interval (SRD-v2 FR-65). The report is the ordinary one, from the same navigation instruments under the same declared noise; only its timing is asked for. It is the other half of the sensors' prompted sample: instruments starved of a fresh position are waiting on exactly this message, and this is how a reader supplies it without changing either cadence."
      },
      "report_interval_ticks": {
        "type": "integer",
        "exclusiveMinimum": 0,
        "description": "How often ownship observations are published, in ticks. Absent means every tick, which is honest but noisy."
      },
      "instruments": {
        "type": "array",
        "minItems": 1,
        "description": "The navigation instruments. Each is a genuine Datastream on the ownship Thing, with its own declared noise, exactly like the sensors' instruments — which is what makes ownship state a measurement rather than a declaration (FR-54).",
        "items": {
          "type": "object",
          "required": [
            "sensor_id",
            "datastream_id",
            "observed_property",
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
                "platform_course",
                "platform_speed",
                "platform_depth"
              ],
              "description": "One of the three ownship quantities the observation master admits. The ocean properties are not available here: an ownship instrument measures the platform, not the sea."
            },
            "noise_std": {
              "type": "number",
              "minimum": 0
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
          "subsets_path",
          "features_prefix",
          "contributions_prefix"
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
          },
          "features_prefix": {
            "$ref": "config.common.schema.json#/$defs/relative_path"
          },
          "contributions_prefix": {
            "$ref": "config.common.schema.json#/$defs/relative_path",
            "description": "Feature 124: where an analysis cycle's contributions holding is served — its header at `<prefix>/<holding_id>`, and one water column at `<prefix>/<holding_id>/column?coords=POINT(lon lat)`, spelled as EDR's position query spells a position. Its own prefix and not a query type under the EDR prefix: the standard has no such query, and the EDR component refuses unknown types by name, which is an honesty this must not spend."
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
      "platform",
      "sensors",
      "ingest",
      "observation_store",
      "feature_store",
      "query",
      "monitor",
      "scheduler",
      "model_runner",
      "analyst",
      "planner",
      "telemetry",
      "operator",
      "advisory_source",
      "advisory_store",
      "offload",
      "shell",
      "start_conditions",
      "snapshot_source"
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
      "platform": {
        "$ref": "config.platform.schema.json"
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
      "analyst": {
        "$ref": "config.analyst.schema.json"
      },
      "planner": {
        "$ref": "config.planner.schema.json"
      },
      "telemetry": {
        "$ref": "config.telemetry.schema.json"
      },
      "operator": {
        "$ref": "config.operator.schema.json"
      },
      "advisory_source": {
        "$ref": "config.advisory-source.schema.json"
      },
      "advisory_store": {
        "$ref": "config.advisory-store.schema.json"
      },
      "offload": {
        "$ref": "config.offload.schema.json"
      },
      "feature_store": {
        "$ref": "config.feature-store.schema.json"
      },
      "shell": {
        "$ref": "config.shell.schema.json"
      },
      "start_conditions": {
        "$ref": "config.start-conditions.schema.json"
      },
      "snapshot_source": {
        "$ref": "config.snapshot-source.schema.json"
      }
    }
  },
  "config.scheduler": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.scheduler.schema.json",
    "title": "drogna scheduler configuration (V2-C12)",
    "description": "The scheduler (SRD-v2 FR-30 to FR-32): decides whether a run is warranted. A divergence inside the minimum interval is declined by policy, observably; the cadence floor — the maximum interval — means the loop cannot be permanently becalmed (E1, resolved plan §9.7): when no run has been requested within it, a run is warranted on schedule alone, labelled 'scheduled'. From feature 123 that warrant is then weighed for affordability rather than gated on the lapse: the run is HELD while the standing forecast has more life left than the run costs plus release_margin_ticks, and released as that headroom decays, so it lands as the old one lapses. A zero cost is still weighed — the margin alone is a validity rule — so a kernel that declares no work does not lose the gate. One request may be in flight at a time; duplicates are declined by name. Both intervals are tunable from the operator plane while the run is going, and a run may be prompted from there: a prompt is considered under exactly the policy a divergence is, so it can be declined by the minimum interval or by a run already outstanding, and the decline is recorded like any other.",
    "type": "object",
    "required": [
      "id",
      "topics",
      "heartbeat",
      "min_interval_ticks",
      "max_interval_ticks",
      "ensemble_size",
      "prompt_event",
      "release_margin_ticks"
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
          "run_published",
          "telemetry",
          "command",
          "run_cost"
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
          },
          "telemetry": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "command": {
            "$ref": "config.common.schema.json#/$defs/topic",
            "description": "Operator commands: tuning of the two intervals, and a prompt to consider a run now."
          },
          "run_cost": {
            "$ref": "config.common.schema.json#/$defs/topic",
            "description": "Where the model runner states what a run costs, in ticks. This scheduler subscribes and holds no cost figure of its own — the component that will spend the compute is the one that declares it (SRD-v2 FR-115), and check-declared-cost fails the build if a cost appears in this document."
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
        "description": "The cadence floor (FR-31): the interval after which a run is warranted on schedule alone, whatever the water has done. Whether it is requested at once or held is then decided by release_margin_ticks against the cost the model runner published — never here."
      },
      "ensemble_size": {
        "type": "integer",
        "minimum": 2
      },
      "release_margin_ticks": {
        "type": "integer",
        "minimum": 0,
        "description": "How far ahead of the standing forecast's lapse a held run is released, in ticks. A warranted scheduled or prompted run is HELD while the standing forecast has more life left than the run costs plus this margin, and released as that headroom decays, so the new run lands as the old one lapses (SRD-v2 FR-115). The rule runs the opposite way to the obvious reading on purpose: 'affordable when the run fits inside the remaining validity' becalms the loop permanently, because the cadence floor fires precisely when validity has lapsed and there is then no headroom at all. This is a margin and never a cost — the cost arrives on the run_cost topic from the component that will spend it. No default: it is required, so a default here would be a value nothing can ever read."
      },
      "prompt_event": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]*$",
        "description": "Which operator event id this scheduler answers to (operator-command.schema.json). Named on both sides — here and in the operator surface's declared events — as a topic is, rather than compiled into either component."
      }
    }
  },
  "config.sensors": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.sensors.schema.json",
    "title": "drogna sensors configuration (V2-C04)",
    "description": "The sensors component's configuration document (SRD-v2 FR-22, amended by FR-55): instruments that sample the true field on a tick cadence, add their declared seeded noise, and publish observations of observation.schema.json shape on obs/<thing_id>/<datastream_id>. Until feature 113 this document also carried a loiter, and the sensors evaluated the platform's position from it in closed form. That block is gone: position now comes from the platform component, over the broker, and no component computes it twice. Sensors read the clock and the ownship datastreams, and nothing else (ADR-0012, widened by FR-55 and stated rather than assumed — sampling now depends on delivery order, which is deterministic in lockstep and is named in AT-04's boundary).",
    "type": "object",
    "required": [
      "id",
      "stream",
      "topics",
      "heartbeat",
      "platform",
      "sample_interval_ticks",
      "instruments",
      "fault_event",
      "sample_event"
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
          "observation_prefix",
          "ownship",
          "command"
        ],
        "additionalProperties": false,
        "properties": {
          "clock": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "ownship": {
            "$ref": "config.common.schema.json#/$defs/topic_filter",
            "description": "The filter the sensors take the platform's position from. Before a position has been heard on it the sensors publish nothing and say so in their heartbeat: sampling the ocean at a place nobody has reported would be inventing the place."
          },
          "observation_prefix": {
            "type": "string",
            "pattern": "^[a-z0-9]+$",
            "description": "The namespace observations are published under; the topic is <prefix>/<thing_id>/<datastream_id>."
          },
          "command": {
            "$ref": "config.common.schema.json#/$defs/topic",
            "description": "Operator commands (operator-command.schema.json). The sensors act on a tuning or a fault prompt addressed to them and ignore everything else on the topic."
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
          "description"
        ],
        "additionalProperties": false,
        "description": "The sampling platform these instruments are mounted on: the SensorThings Thing the ocean observations belong to. A coordinate and a sampler, no history, no identity beyond its id (Constitution V). Where it IS is not here — that is the platform component's business, and the loiter this block used to carry retired with feature 113 (FR-55).",
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
          }
        }
      },
      "fault_event": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]*$",
        "description": "Which operator event id asks this component to publish ONE deliberately faulty message (SRD-v2 FR-67). The fault originates here, in the component a real one would come from, rather than being published into this namespace by a control plane that does not own it: what a reader then watches refuse it is the genuine seam doing its genuine work. The component counts what it was asked to produce and reports the count, so a faulty message is never mistaken for a component that has started lying on its own account. The fault here is a sample that fails the observation master, so the ingestion seam refuses it and names the fault."
      },
      "sample_event": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]*$",
        "description": "Which operator event id asks these instruments to sample once now, outside their cadence (SRD-v2 FR-65). The sample is taken by the sampling path that takes every other one, at the position the platform last reported, and is refused by the component itself when that position is stale — a prompt does not buy an instrument a place to have been. The count of prompted samples is reported as its own figure, so a sample taken on request is never mistaken for the cadence quickening."
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
      "flow",
      "liveness",
      "messages",
      "consumers"
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
            },
            "kind": {
              "type": "string",
              "enum": [
                "harness",
                "consumer"
              ],
              "description": "What the view is a face of (feature 116, FR-91). 'harness' is drogna's own; 'consumer' is a downstream system that is not part of drogna and is drawn in its own chrome, under a strip that says so. Declared here so the shell holds no list of which views are which — a fourth consumer is a line in this document. Absent means 'harness': every view that existed before this property did is one."
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
            "beat",
            "band",
            "rank"
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
              "maximum": 120,
              "description": "The narrative beat (feature number) at which this component lands. The ceiling is the highest landed feature rather than absent: a component declared at a beat that does not exist is a typo worth catching. Raised to 120 by the snapshot source, which is the first component to land outside the arc."
            },
            "band": {
              "type": "string",
              "enum": [
                "plane",
                "loop",
                "path",
                "downstream"
              ],
              "description": "Which band of the Operator flow chart this component sits in (FR-052): the plane every component runs on, the assimilation loop, the observation path, or what comes after it. Structure from declaration; nothing here can light anything (Constitution VII)."
            },
            "rank": {
              "type": "integer",
              "minimum": 0,
              "description": "Left-to-right position within the band. Declared rather than solved for: a layout that moves between renders cannot be learned and cannot be tested."
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
          "all",
          "plan",
          "run_published",
          "analysis_published",
          "advisories",
          "platform_state",
          "observations",
          "telemetry",
          "run_started",
          "run_request",
          "run_cost",
          "forecast_features",
          "forecast_indicator",
          "analysis_standing"
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
          },
          "plan": {
            "$ref": "config.common.schema.json#/$defs/topic_filter"
          },
          "run_published": {
            "$ref": "config.common.schema.json#/$defs/topic_filter"
          },
          "analysis_published": {
            "$ref": "config.common.schema.json#/$defs/topic",
            "description": "Where the analyst announces a cycle. The Map reads the provenance holding it names, so the display learns of an analysis by hearing it announced rather than by polling the store."
          },
          "advisories": {
            "$ref": "config.common.schema.json#/$defs/topic_filter"
          },
          "platform_state": {
            "$ref": "config.common.schema.json#/$defs/topic_filter",
            "description": "The platform's own report of demanded beside current (FR-047). Read by the Operator flow chart's platform face and by the Map's demanded-course ray; the track itself is a query, not this."
          },
          "telemetry": {
            "$ref": "config.common.schema.json#/$defs/topic_filter",
            "description": "The telemetry branch. The monitor's residual samples carry the threshold it scores against and how far its streak has got, so the Operator's drift face draws the monitor's own numbers rather than a second implementation of the rule (FR-58)."
          },
          "observations": {
            "$ref": "config.common.schema.json#/$defs/topic_filter",
            "description": "The observation namespace, for the sensors' and stores' faces to count what genuinely crossed the broker. Counted here and marked as counted here, never presented as a figure a component reported (FR-008)."
          },
          "run_request": {
            "$ref": "config.common.schema.json#/$defs/topic_filter",
            "description": "Where the scheduler asks for a run, and the one place a run's CAUSE is declared — scheduled, divergence, or operator. The Forecast tab's timeline labels each run by cause (FR-132) and reads it from here rather than inferring it from a decision's prose, because a display that parses a sentence is a display inventing figures."
          },
          "run_started": {
            "$ref": "config.common.schema.json#/$defs/topic_filter",
            "description": "Where the model runner announces a run before it computes anything (SRD-v2 FR-114). The Forecast tab's timeline needs the announcement and not only the publication, because the whole of what feature 123 added is the interval between them: a run that occupies its cost is visible only if its start is heard."
          },
          "run_cost": {
            "$ref": "config.common.schema.json#/$defs/topic_filter",
            "description": "The model runner's cost statement (FR-115). The gauge states the cost beneath the need, in the same frame, from the figure the runner published — never from a configured expectation."
          },
          "forecast_features": {
            "$ref": "config.common.schema.json#/$defs/topic_filter",
            "description": "The seeded features forecast as features (FR-113). Read by the Forecast tab's centre region, which feature 124 builds."
          },
          "forecast_indicator": {
            "$ref": "config.common.schema.json#/$defs/topic_filter",
            "description": "The declared socket an indicator that re-forecasting is becoming valuable publishes on (FR-117). The gauge renders whatever is published here and names what it is showing; with the topic silent it states the absence and draws no gauge. An empty gauge and an unheard indicator are different facts (FR-119)."
          },
          "analysis_standing": {
            "$ref": "config.common.schema.json#/$defs/topic",
            "description": "Where the standing analysis is declared. The Forecast tab's centre region reads the collection names from here rather than from `analysis_published`, because that topic is the model runner's trigger and a surface has no business listening to a command."
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
          "holdings",
          "components",
          "telemetry",
          "clock_step",
          "component_command",
          "platform_demand",
          "sensorthings",
          "edr",
          "features",
          "query_subsets",
          "operator_controls",
          "operator_tuning",
          "operator_event",
          "undeclared_probe",
          "contributions"
        ],
        "additionalProperties": false,
        "description": "Relative seam paths the shell calls. Relative and same-origin by requirement (FR-04).",
        "properties": {
          "clock_rate": {
            "$ref": "config.common.schema.json#/$defs/relative_path"
          },
          "holdings": {
            "$ref": "config.common.schema.json#/$defs/relative_path"
          },
          "components": {
            "$ref": "config.common.schema.json#/$defs/relative_path"
          },
          "telemetry": {
            "$ref": "config.common.schema.json#/$defs/relative_path"
          },
          "clock_step": {
            "$ref": "config.common.schema.json#/$defs/relative_path"
          },
          "component_command": {
            "$ref": "config.common.schema.json#/$defs/relative_path"
          },
          "platform_demand": {
            "$ref": "config.common.schema.json#/$defs/relative_path",
            "description": "Where the shell POSTs a demanded course, speed and depth. It goes to the operator surface, which publishes it on the broker: the shell connects under a role that may never publish (E13), so a front-end reaching the demand topic directly would be a front-end that had stopped being one."
          },
          "sensorthings": {
            "$ref": "config.common.schema.json#/$defs/relative_path",
            "description": "The SensorThings prefix. The Map reads the ownship track from it as ordinary Observations — the same read any client would make (FR-055)."
          },
          "edr": {
            "$ref": "config.common.schema.json#/$defs/relative_path",
            "description": "The EDR prefix the Map panel and the composer issue genuine GETs against."
          },
          "undeclared_probe": {
            "$ref": "config.common.schema.json#/$defs/relative_path",
            "description": "A seam path the release gate is expected to refuse, so the Operator tab can demonstrate default-deny by asking for it. It is declared here rather than typed into the panel for the ordinary reason every path is (Constitution IV), and because 'a path nothing serves' is a fact about the boundary's configuration and not about the shell: it must sit under the api prefix and outside every one of the gate's allow_prefixes, and the operator panel's test asserts exactly that against the boundary's own document. A change to allow_prefixes that swallowed this path would turn the demonstration into a request that quietly succeeded, and the assertion is what stops that landing unnoticed."
          },
          "features": {
            "$ref": "config.common.schema.json#/$defs/relative_path",
            "description": "The Features prefix the Map panel reads advisories and reference geometry from."
          },
          "query_subsets": {
            "$ref": "config.common.schema.json#/$defs/relative_path",
            "description": "Where the subset statement is served; the composer offers only what it states."
          },
          "contributions": {
            "$ref": "config.common.schema.json#/$defs/relative_path",
            "description": "Feature 124: the contributions prefix the forecast view reads a column's sources from, matching the query component's own declaration."
          },
          "operator_controls": {
            "$ref": "config.common.schema.json#/$defs/relative_path",
            "description": "Where the operator surface states what its plane offers (operator-controls.schema.json): the step bound, the tunables with their bounds, and the promptable events. The console is drawn from that statement, so the shell offers no control the surface would refuse and holds no bound of its own."
          },
          "operator_tuning": {
            "$ref": "config.common.schema.json#/$defs/relative_path",
            "description": "Where the shell POSTs a tuning change. What comes back is what was dispatched; the value in force arrives in the target component's own heartbeat, never from this response."
          },
          "operator_event": {
            "$ref": "config.common.schema.json#/$defs/relative_path",
            "description": "The prefix a prompted event is POSTed under: <prefix>/<event-id>. The component prompted decides, and may decline."
          }
        }
      },
      "flow": {
        "type": "object",
        "required": [
          "suppressed_filters",
          "ports",
          "series_samples",
          "pulse"
        ],
        "additionalProperties": false,
        "description": "What the Operator flow chart needs that the topology master cannot supply (FR-052 to FR-054). Edges themselves are NOT here: topic edges are derived from contracts/topology.json, so the picture cannot disagree with the wiring, and a gate fails the build when a declared component is undrawn or a topology edge is neither drawn nor suppressed.",
        "properties": {
          "suppressed_filters": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Topic filters drawn as the plane the flow runs on rather than as edges. Exactly two earn it: every component subscribes to the clock and publishes heartbeats, so drawing them is forty edges that hide the ones carrying meaning. The panel names the suppression on screen; a third entry here needs FR-004 amended."
          },
          "ports": {
            "type": "array",
            "description": "Couplings that carry no broker traffic and therefore never pulse: the world-sampler port and the store interfaces. Declared because they cannot be derived from a topology of topics — without them the environment generator, which publishes nothing but heartbeats, sits isolated in a picture of a system it is the source of.",
            "items": {
              "type": "object",
              "required": [
                "from",
                "to",
                "label"
              ],
              "additionalProperties": false,
              "properties": {
                "from": {
                  "$ref": "config.common.schema.json#/$defs/component_id"
                },
                "to": {
                  "$ref": "config.common.schema.json#/$defs/component_id"
                },
                "label": {
                  "type": "string",
                  "minLength": 1
                }
              }
            }
          },
          "series_samples": {
            "type": "integer",
            "exclusiveMinimum": 0,
            "description": "How many samples each face's rolling series holds. In memory, discarded on reload, never persisted and never served: a window that outlived the page would be a second store. The bound is here rather than in the panel so it is not a number typed into a component (Constitution IV)."
          },
          "pulse": {
            "type": "object",
            "required": [
              "fade_ms",
              "hold_above_rate"
            ],
            "additionalProperties": false,
            "description": "How a wire says traffic crossed it. Both numbers are here rather than in the panel for the reason series_samples is (Constitution IV), and both are host milliseconds and a clock rate respectively: a fade is a fact about the render path, not about simulated time, so it does not accelerate with the clock (ADR-0007).",
            "properties": {
              "fade_ms": {
                "type": "integer",
                "exclusiveMinimum": 0,
                "description": "How long a wire stays lit after a message crosses it, in host milliseconds. Ports are excluded by kind: a coupling carries no broker traffic and can never pulse."
              },
              "hold_above_rate": {
                "type": "number",
                "minimum": 0,
                "description": "The clock rate above which a lit wire is held lit while traffic continues rather than re-lit per message. Above real time a message crosses a wire dozens of times a second, and a highlight restarted that often is a flicker that says less than a steady light does. The rate is the clock's own reported figure, so the picture changes when the clock does and not when anything here decides."
              }
            }
          }
        }
      },
      "consumers": {
        "type": "object",
        "title": "The downstream consumer views (feature 116)",
        "description": "Everything the three consumer views are bounded and populated by. It is here, and not in the views themselves, for the ordinary reason (Constitution IV) and for one specific to this feature: a consumer synthesises inputs drogna does not model (ADR-0038), and a synthesised quantity written into a component would be a fixture nobody could find. Written into a configuration document it is a declaration a reader can read, change and disagree with.",
        "required": [
          "notice",
          "hexes",
          "sampling",
          "courses",
          "feasibility"
        ],
        "additionalProperties": false,
        "properties": {
          "notice": {
            "type": "string",
            "minLength": 1,
            "description": "The provenance strip's words, carried by every consumer view and never dismissible (FR-91). Here rather than in the frame so the sentence exists once."
          },
          "hexes": {
            "type": "object",
            "required": [
              "minimum_resolution",
              "maximum_resolution",
              "default_resolution",
              "cell_ceiling"
            ],
            "additionalProperties": false,
            "description": "The hex grid the map-bearing consumers resample onto. Resolutions are H3's, the same index the planner already publishes in (SRD FR-35).",
            "properties": {
              "minimum_resolution": {
                "type": "integer",
                "minimum": 0,
                "maximum": 15
              },
              "maximum_resolution": {
                "type": "integer",
                "minimum": 0,
                "maximum": 15,
                "description": "The finest grid the control offers. 7 covers this domain with 37,400 hexes and is the finest that is affordable over the whole of it; 8 needs 278,000, which no ceiling worth having would admit, so offering it only ever produced a refusal."
              },
              "default_resolution": {
                "type": "integer",
                "minimum": 0,
                "maximum": 15
              },
              "cell_ceiling": {
                "type": "integer",
                "exclusiveMinimum": 0,
                "description": "How many hexes a consumer will cover the *view* with before it refuses the resolution and says why. Recomputation is synchronous and on the interaction path (FR-79); a ceiling here is what stops a resolution control freezing the page. The finest resolutions on offer exceed it over the whole domain on purpose: zooming in is what makes them affordable, and the refusal names both remedies. Measured over this scenario's domain (about 205,000 km2): resolution 5 covers it with 761 hexes, resolution 6 with 5,345, and resolution 7 with 37,400 — so 45,000 is the smallest ceiling that offers every resolution on the scale at full extent, with room for the estimate to differ from the real count. Resolution 7 at full extent settles in about 1.3 s, which is the honest cost of the finest grid over the widest view; every other combination is well under 700 ms. It was 5.3 s before the hex layer was keyed on its resolution and the per-hex tooltip dropped where a hex is too small to point at."
              }
            }
          },
          "sampling": {
            "type": "object",
            "required": [
              "time_budget_hours",
              "default_time_budget_hours",
              "expendable_interval_hours",
              "default_expendable_interval_hours",
              "depth_zones",
              "uncertainty",
              "nominal_speed_m_per_s",
              "observation_backfill"
            ],
            "additionalProperties": false,
            "properties": {
              "time_budget_hours": {
                "type": "array",
                "minItems": 2,
                "items": {
                  "type": "number",
                  "exclusiveMinimum": 0
                },
                "description": "The budgets offered. More than one, because the requirement is that the plan changes shape between them (FR-83)."
              },
              "default_time_budget_hours": {
                "type": "number",
                "exclusiveMinimum": 0
              },
              "expendable_interval_hours": {
                "type": "array",
                "minItems": 2,
                "items": {
                  "type": "number",
                  "exclusiveMinimum": 0
                },
                "description": "Expendables are offered as a rate — one per this many hours — never as a stock, so the drop count is the budget divided by the interval and changes when either does."
              },
              "default_expendable_interval_hours": {
                "type": "number",
                "exclusiveMinimum": 0
              },
              "depth_zones": {
                "type": "integer",
                "exclusiveMinimum": 0,
                "description": "How many zones the water column is divided into for display. The column's depth is not here: it arrives on the published run's grid bounds, and which zones the vessel can reach arrives on the planner's own depth bands (FR-92)."
              },
              "observation_backfill": {
                "type": "integer",
                "minimum": 0,
                "description": "How many recently served observations the view reads from the SensorThings service when it opens, before it starts hearing them over the broker. A consumer that only counted what arrived after it opened would draw an empty ocean for its first hour and call it uncertainty; reading the served history is the ordinary thing a downstream client does, and it is a genuine paged GET rather than a store read. The bound is here because the page is parsed on the way in."
              },
              "nominal_speed_m_per_s": {
                "type": "number",
                "exclusiveMinimum": 0,
                "description": "The transit speed used until the platform has reported one of its own, which it does on its state topic. The view says which of the two it is using; it never presents this as the platform's speed."
              },
              "uncertainty": {
                "type": "object",
                "required": [
                  "saturation",
                  "recency_timescale_seconds",
                  "density_halving_count"
                ],
                "additionalProperties": false,
                "description": "The coverage proxy of FR-80: observation-driven uncertainty, never forecast uncertainty and never ensemble spread.",
                "properties": {
                  "saturation": {
                    "type": "number",
                    "exclusiveMinimum": 0,
                    "description": "The value an unobserved cell sits at, and the ceiling growth approaches. A cell nothing has been heard from is at saturation rather than at zero: an absent observation is the opposite of a confident one."
                  },
                  "recency_timescale_seconds": {
                    "type": "number",
                    "exclusiveMinimum": 0,
                    "description": "The e-folding time of regrowth in seconds of simulation time. Growth is monotonic in time since the last observation and asymptotic to saturation."
                  },
                  "density_halving_count": {
                    "type": "integer",
                    "exclusiveMinimum": 0,
                    "description": "How many observations in a cell halve the uncertainty a single one leaves. Density and recency are separate ingredients and are named separately on screen."
                  }
                }
              }
            }
          },
          "courses": {
            "type": "object",
            "required": [
              "classes",
              "objectives",
              "default_objective",
              "candidate_count",
              "steps",
              "step_seconds",
              "samples_per_likelihood",
              "default_exposure_weight",
              "bank_count"
            ],
            "additionalProperties": false,
            "description": "The comparative-courses view. It holds no third party: what is configured here is a set of vessel *classes* and how a hypothesis about each of them moves, seeded across the whole domain from a likelihood the reader sets (Constitution V, and the spec's §3.1).",
            "properties": {
              "classes": {
                "type": "array",
                "minItems": 1,
                "items": {
                  "type": "object",
                  "required": [
                    "id",
                    "label",
                    "motion",
                    "default_likelihood",
                    "included",
                    "speed_m_per_s"
                  ],
                  "additionalProperties": false,
                  "properties": {
                    "id": {
                      "$ref": "config.common.schema.json#/$defs/component_id"
                    },
                    "label": {
                      "type": "string",
                      "minLength": 1
                    },
                    "motion": {
                      "type": "string",
                      "enum": [
                        "corridor",
                        "loiter",
                        "evasive"
                      ],
                      "description": "How a hypothesis of this class moves. Behaviour drives motion rather than a score multiplier: a roster that only weighted a score would produce three identical clouds and be cosmetic (the source SRD's §4.3, kept as a requirement)."
                    },
                    "default_likelihood": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 10
                    },
                    "included": {
                      "type": "boolean",
                      "description": "Whether the class starts in the roster. A class may be excluded entirely."
                    },
                    "speed_m_per_s": {
                      "type": "number",
                      "exclusiveMinimum": 0
                    }
                  }
                }
              },
              "objectives": {
                "type": "array",
                "minItems": 1,
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
                      "type": "string",
                      "minLength": 1
                    }
                  }
                }
              },
              "default_objective": {
                "$ref": "config.common.schema.json#/$defs/component_id",
                "description": "Which objective the view opens on. It is not simply the first in the list: under some objectives the two component scores move together — evading and staying clear of the density are the same thing — and no weighting reorders the candidates. The view says so when it happens, and opens on an objective where the trade is real."
              },
              "candidate_count": {
                "type": "integer",
                "minimum": 3,
                "maximum": 4,
                "description": "Three or four, never one: a single black-box answer invites disagreement with the whole idea rather than with the weighting, which is the argument worth having."
              },
              "steps": {
                "type": "integer",
                "exclusiveMinimum": 0,
                "description": "How many steps each hypothesis is marched. A bound on the interaction path (FR-79)."
              },
              "step_seconds": {
                "type": "number",
                "exclusiveMinimum": 0
              },
              "samples_per_likelihood": {
                "type": "integer",
                "exclusiveMinimum": 0,
                "description": "Hypotheses seeded per point of likelihood. Likelihood 9 is nine times the seeding density of likelihood 1, which is what makes the roster's contrast visible."
              },
              "default_exposure_weight": {
                "type": "number",
                "minimum": 0,
                "maximum": 1
              },
              "bank_count": {
                "type": "integer",
                "exclusiveMinimum": 0,
                "description": "How many shallow banks the loitering class is drawn to. Synthesised by the view and labelled as such: drogna models no bathymetry (ADR-0038)."
              }
            }
          },
          "feasibility": {
            "type": "object",
            "required": [
              "horizon_hours",
              "step_minutes",
              "set_count",
              "confidence_weights",
              "veto_weight",
              "forecast_samples",
              "lanes",
              "tasks"
            ],
            "additionalProperties": false,
            "description": "The temporal-feasibility view. Its horizon is not here: it is the published forecast's own validity span, so the tab reasons over exactly the window drogna claims to know about.",
            "properties": {
              "horizon_hours": {
                "type": "number",
                "exclusiveMinimum": 0,
                "description": "How far ahead the tab reasons, from the published forecast's own validity start. It is longer than the forecast is valid for, deliberately and visibly: the served lane stops where the forecast stops, and a task that needs it cannot be scheduled past that point. A horizon cut to the forecast's validity would have hidden that, and the whole subject of this tab is what you are giving up."
              },
              "step_minutes": {
                "type": "number",
                "exclusiveMinimum": 0,
                "description": "The resolution the lanes are evaluated at."
              },
              "forecast_samples": {
                "type": "integer",
                "exclusiveMinimum": 0,
                "description": "How many genuine position queries the served lane is built from, spread across the forecast's validity span. A bound on the interaction path (FR-79): the lane is a real time series of real queries, and this says how many."
              },
              "set_count": {
                "type": "integer",
                "minimum": 2,
                "maximum": 3,
                "description": "How many maximal feasible sets are shown. Two or three, never one: one set hides the trade it exists to reveal."
              },
              "confidence_weights": {
                "type": "object",
                "required": [
                  "high",
                  "medium",
                  "low"
                ],
                "additionalProperties": false,
                "description": "What each confidence setting is worth. Off is not here because Off is not a weight: it removes the source from the computation entirely.",
                "properties": {
                  "high": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "medium": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "low": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  }
                }
              },
              "veto_weight": {
                "type": "number",
                "exclusiveMinimum": 0,
                "maximum": 1,
                "description": "The weight of unmet requirements that closes a window. Above the medium weight and at or below the high one, so that a high-confidence source can close a window on its own and a lower-confidence one cannot — which is the whole of 'a low-confidence source may not veto a task'."
              },
              "lanes": {
                "type": "array",
                "minItems": 1,
                "items": {
                  "type": "object",
                  "required": [
                    "id",
                    "label",
                    "kind",
                    "provenance",
                    "default_confidence"
                  ],
                  "additionalProperties": false,
                  "properties": {
                    "id": {
                      "$ref": "config.common.schema.json#/$defs/component_id"
                    },
                    "label": {
                      "type": "string",
                      "minLength": 1
                    },
                    "kind": {
                      "type": "string",
                      "enum": [
                        "boolean",
                        "continuous"
                      ],
                      "description": "A plain bar implies a boolean yes/no, which is wrong for a tide. Boolean lanes are bars; continuous lanes are traces carrying each task's own threshold."
                    },
                    "provenance": {
                      "type": "string",
                      "enum": [
                        "seam",
                        "seam-derived",
                        "synthesised"
                      ],
                      "description": "Where the lane's values come from, stated on the lane itself (ADR-0038): served over the seam, computed by the view from something that was, or synthesised by the view because drogna does not model it."
                    },
                    "unit": {
                      "type": "string"
                    },
                    "default_confidence": {
                      "type": "string",
                      "enum": [
                        "high",
                        "medium",
                        "low",
                        "off"
                      ]
                    },
                    "period_minutes": {
                      "type": "number",
                      "exclusiveMinimum": 0,
                      "description": "For a synthesised lane: the cycle it repeats on."
                    },
                    "on_minutes": {
                      "type": "number",
                      "exclusiveMinimum": 0,
                      "description": "For a synthesised boolean lane: how much of each cycle it is present for."
                    },
                    "minimum": {
                      "type": "number",
                      "description": "For a continuous lane: the bottom of its range."
                    },
                    "maximum": {
                      "type": "number",
                      "description": "For a continuous lane: the top of its range."
                    }
                  }
                }
              },
              "tasks": {
                "type": "array",
                "minItems": 2,
                "description": "A fixed list with editable thresholds — the cheaper of the two options the source SRD left open, and the one that keeps the demonstration reproducible.",
                "items": {
                  "type": "object",
                  "required": [
                    "id",
                    "label",
                    "duration_minutes",
                    "requirements"
                  ],
                  "additionalProperties": false,
                  "properties": {
                    "id": {
                      "$ref": "config.common.schema.json#/$defs/component_id"
                    },
                    "label": {
                      "type": "string",
                      "minLength": 1
                    },
                    "duration_minutes": {
                      "type": "number",
                      "exclusiveMinimum": 0
                    },
                    "requirements": {
                      "type": "array",
                      "minItems": 1,
                      "items": {
                        "type": "object",
                        "required": [
                          "lane",
                          "sense"
                        ],
                        "additionalProperties": false,
                        "properties": {
                          "lane": {
                            "$ref": "config.common.schema.json#/$defs/component_id"
                          },
                          "sense": {
                            "type": "string",
                            "enum": [
                              "present",
                              "absent",
                              "at-least",
                              "at-most"
                            ],
                            "description": "present/absent for a boolean lane; at-least/at-most for a continuous one, against this task's own threshold."
                          },
                          "threshold": {
                            "type": "number",
                            "description": "The task's starting threshold on a continuous lane. It is draggable in the view: two tasks may hold different thresholds against one lane and both be right."
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
  "config.snapshot-source": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.snapshot-source.schema.json",
    "title": "drogna snapshot source configuration (V2-C22)",
    "description": "The component that republishes a committed seed-data artefact into the coverage store (feature 120, ADR-0041). It is a component and not a loader in the composition root on purpose: the holdings go in through the store's one write path, published by something that subscribes to the clock, heartbeats, appears in the Operator flow chart and can be stopped — so the digest check, the atomicity and the announcement are the same ones a live publication passes, and a reader can see that the ocean came from an artefact rather than having to be told. Where a start condition declares no artefact this component runs and says so, rather than being absent: a node missing from the picture reads as a beat that has not landed, and 'the ocean was authored live here' is information.",
    "type": "object",
    "required": [
      "id",
      "topics",
      "heartbeat",
      "artefacts",
      "authors"
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
      "artefacts": {
        "type": "object",
        "required": [
          "path_prefix",
          "path_suffix"
        ],
        "additionalProperties": false,
        "description": "Where a condition's artefact is fetched from: prefix, the condition id, suffix. A relative same-origin path like every other address the page uses (FR-04) — the estate serves an instance from an arbitrary path, so an absolute one would be portable to exactly one deployment.",
        "properties": {
          "path_prefix": {
            "type": "string",
            "pattern": "^[A-Za-z0-9_./-]*$",
            "description": "Relative to the page. Not the seam's api prefix: an artefact is a build asset the page loads, like its own script, and it does not cross the wire-protocol seam."
          },
          "path_suffix": {
            "type": "string",
            "pattern": "^[A-Za-z0-9_.-]*$"
          }
        }
      },
      "authors": {
        "type": "object",
        "required": [
          "archive",
          "nowcast",
          "analysis",
          "instance"
        ],
        "additionalProperties": false,
        "description": "Which component authors each coverage era. Declared rather than inferred, and it earns its place twice: the build knows which component's output an artefact stands for, and the page knows which component to hold back while the artefact stands in for it. Getting this wrong in either direction is silent — a component left running beside its own artefact republishes what is already there, and one held back with no artefact behind it leaves an era missing — so it is written down once and read by both.",
        "properties": {
          "archive": {
            "$ref": "config.common.schema.json#/$defs/component_id"
          },
          "nowcast": {
            "$ref": "config.common.schema.json#/$defs/component_id"
          },
          "analysis": {
            "$ref": "config.common.schema.json#/$defs/component_id"
          },
          "instance": {
            "$ref": "config.common.schema.json#/$defs/component_id"
          }
        }
      }
    }
  },
  "config.start-conditions": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.start-conditions.schema.json",
    "title": "drogna start conditions",
    "description": "The situations a visit may begin in, offered on the welcome page before the shell is mounted. A start condition is configuration and not state: it says where the platform is when the first tick arrives, and it scripts a pre-roll — a sequence of legs the composition root drives through the operator plane's own HTTP endpoints, exactly as a reader could drive them by hand. Nothing here writes into a store: the archive, the measurements, the analyses, the forecasts and the advisories a condition promises are authored by the components that author them during a run, on the clock's own step (SRD-v2 FR-11, FR-09). What a condition changes is therefore only how much of the run has already happened when the reader arrives, and which components were running while it did — both stated here, on disk, rather than left to be inferred from the result.",
    "type": "object",
    "required": [
      "default",
      "conditions"
    ],
    "additionalProperties": false,
    "properties": {
      "default": {
        "$ref": "#/$defs/condition_id",
        "description": "The condition a visit starts in when the address names a view rather than a choice, and the one the welcome page offers first. It names a condition in the list below; a default naming no condition is a welcome page whose first card does not exist."
      },
      "conditions": {
        "type": "array",
        "minItems": 1,
        "description": "The conditions offered, in the order the welcome page draws them. The order is the arc — quayside, arrival, station, return — because a reader choosing between four situations is choosing a point in a passage, not an item from a menu.",
        "items": {
          "$ref": "#/$defs/condition"
        }
      }
    },
    "$defs": {
      "condition_id": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]*$"
      },
      "condition": {
        "title": "Start condition",
        "type": "object",
        "required": [
          "id",
          "label",
          "situation",
          "holds",
          "root_seed",
          "platform",
          "legs"
        ],
        "additionalProperties": false,
        "properties": {
          "id": {
            "$ref": "#/$defs/condition_id",
            "description": "Identity of the condition. It joins the scenario name and the root seed in deriving the run id, so two visits that chose differently can never share one — and it is recorded in the run manifest, so an imported manifest replays the condition it was exported from rather than whichever one the reader happens to be sitting in."
          },
          "label": {
            "type": "string",
            "minLength": 1,
            "description": "The card's heading on the welcome page."
          },
          "situation": {
            "type": "string",
            "minLength": 1,
            "description": "One sentence saying where the platform is and what it has been doing. Written for the reader choosing, not for the machinery."
          },
          "holds": {
            "type": "array",
            "minItems": 1,
            "description": "What the run will hold when the shell opens, in the reader's terms — and what it will not. Drawn on the card and asserted by test against the stores the pre-roll actually leaves behind, so a card that promises measurements in the work area is a claim the suite can fail.",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "root_seed": {
            "type": "integer",
            "minimum": 0,
            "description": "The seed this condition's run is built from, declared rather than drawn. Before feature 120's snapshots a fresh visit drew one from entropy and every visit got a different ocean; a committed artefact is a function of the seed, so a visit that drew its own would have the sensors sampling an ocean the artefact does not describe. Declaring it is also the stronger position under Constitution II — the one place entropy entered the harness is now no places — and it makes an instance link reproducible, which for a demonstration harness is most of the point: two people opening the same address see the same run."
          },
          "snapshot_eras": {
            "type": "array",
            "description": "Which coverage eras this condition's committed artefact carries. The components that would have authored them are held back for the pre-roll and the snapshot source republishes them instead. Absent or empty means no artefact: the condition is authored live, start to finish, and the source says so. Which eras are worth committing is a measured trade and is meant to be edited — the ocean eras compress to a fraction of a megabyte and buy about half the pre-roll, the forecast eras carry ensemble noise and cost megabytes for the rest (ADR-0041).",
            "items": {
              "type": "string",
              "enum": [
                "archive",
                "nowcast",
                "analysis",
                "instance"
              ]
            }
          },
          "platform": {
            "type": "object",
            "required": [
              "latitude",
              "longitude",
              "course_degrees",
              "speed_m_per_s",
              "depth_m"
            ],
            "additionalProperties": false,
            "description": "Where the platform is, and how it is moving, when the first tick arrives. Replaces the platform document's own initial vector for this visit — configuration, on the same footing as the vector it replaces, and digested into the manifest's participant entry like any other configuration.",
            "properties": {
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
              "course_degrees": {
                "type": "number",
                "minimum": 0,
                "exclusiveMaximum": 360
              },
              "speed_m_per_s": {
                "type": "number",
                "minimum": 0
              },
              "depth_m": {
                "type": "number",
                "minimum": 0
              }
            }
          },
          "legs": {
            "type": "array",
            "minItems": 1,
            "description": "The pre-roll, in order. Each leg is a stretch of simulation time with a stated crew: which components are running, what the platform has been told to do, and what it was asked to do now. A condition with one empty leg is a cold start, which is what the harness did before this document existed.",
            "items": {
              "$ref": "#/$defs/leg"
            }
          }
        }
      },
      "leg": {
        "title": "Pre-roll leg",
        "type": "object",
        "required": [
          "note",
          "ticks"
        ],
        "additionalProperties": false,
        "properties": {
          "note": {
            "type": "string",
            "minLength": 1,
            "description": "What this leg is, in one phrase. Shown while the pre-roll runs, so the reader watching the progress is reading what is happening rather than a bar."
          },
          "ticks": {
            "type": "integer",
            "minimum": 0,
            "description": "Simulation ticks the leg advances, each one stepped through the clock's own step operation and published, heard and acted on exactly as a free-running tick is (FR-09). Zero is legitimate: a leg that only issues a demand or a prompt still costs a leg to say so."
          },
          "stopped": {
            "type": "array",
            "description": "Component ids not running during this leg, stopped and started through the operator plane's own control endpoints (FR-36). A leg that stops the analyst is a leg during which nothing was assimilated, and the card says so; the honesty is that the fact is declared here rather than achieved by not calling something.",
            "items": {
              "$ref": "config.common.schema.json#/$defs/component_id"
            }
          },
          "demand": {
            "type": "object",
            "additionalProperties": false,
            "description": "A demanded course, speed and depth, published at the head of the leg through the operator surface's demand endpoint. The platform applies it under its own limits and says what is binding; nothing here claims it was reached.",
            "properties": {
              "course_degrees": {
                "type": "number",
                "minimum": 0,
                "exclusiveMaximum": 360
              },
              "speed_m_per_s": {
                "type": "number",
                "minimum": 0
              },
              "depth_m": {
                "type": "number",
                "minimum": 0
              },
              "note": {
                "type": "string",
                "minLength": 1
              }
            }
          },
          "tune": {
            "type": "array",
            "description": "Settings to put in force for this leg, through the operator plane's tuning endpoint, named by the tunable id that plane declares. A pre-roll uses this for what a vessel uses it for: a passage samples on a coarser cadence than a box worked on station, and the last leg puts back what the configuration declares so the console opens at the cadence the run ships with. It is the plane's own control, published as a command and visible in the Messages tab, and the plane enforces its own declared bounds — a leg cannot ask for something a reader could not ask for by hand.",
            "items": {
              "type": "object",
              "required": [
                "id",
                "value"
              ],
              "additionalProperties": false,
              "properties": {
                "id": {
                  "type": "string",
                  "pattern": "^[a-z][a-z0-9-]*$",
                  "description": "The tunable's id in the operator's configuration, which is what carries the target and the setting. Named by id rather than by target-and-setting so a leg cannot address a setting the plane does not offer."
                },
                "value": {
                  "type": "number"
                }
              }
            }
          },
          "prompt": {
            "type": "array",
            "description": "Operator event ids asked for at the head of the leg, in order, through the event endpoint. The target component decides: a prompted run goes through the scheduler's ordinary policy and may be declined, and a decline is published like any other decision. Naming an event this plane does not offer is refused by the plane, not silently ignored.",
            "items": {
              "type": "string",
              "pattern": "^[a-z][a-z0-9-]*$"
            }
          }
        }
      }
    },
    "examples": [
      {
        "default": "arriving",
        "conditions": [
          {
            "id": "arriving",
            "label": "Arriving in the work area",
            "situation": "Closing the work area from the north-east, instruments streaming since the quay.",
            "holds": [
              "the archive",
              "a now-cast",
              "measurements along the passage",
              "no measurement inside the work area"
            ],
            "platform": {
              "latitude": 46.72,
              "longitude": -10.35,
              "course_degrees": 233,
              "speed_m_per_s": 2.4,
              "depth_m": 60
            },
            "legs": [
              {
                "note": "the passage in",
                "ticks": 4800,
                "stopped": [
                  "analyst",
                  "model-runner",
                  "advisory-source"
                ],
                "demand": {
                  "course_degrees": 233,
                  "speed_m_per_s": 2.4,
                  "depth_m": 60,
                  "note": "close the work area"
                }
              }
            ]
          }
        ]
      }
    ]
  },
  "config.telemetry": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/config.telemetry.schema.json",
    "title": "drogna telemetry configuration (V2-C15)",
    "description": "The telemetry component (SRD-v2 FR-35): aggregates the residual samples the monitor reports, computes running statistics and forecast skill against a persistence reference — saying plainly when the model is not earning its compute — counts throughput per simulation second, and serves the current account on its seam path. Skill's persistence baseline holds the forecast run's initial step constant across its validity; the formula is stated in every message.",
    "type": "object",
    "required": [
      "id",
      "topics",
      "http",
      "heartbeat",
      "cadence_ticks",
      "staleness_window_seconds",
      "minimum_skill_samples",
      "regions",
      "skill_event",
      "statistics_event"
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
          "telemetry",
          "run_published",
          "observations",
          "command"
        ],
        "additionalProperties": false,
        "properties": {
          "clock": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "telemetry": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "run_published": {
            "$ref": "config.common.schema.json#/$defs/topic"
          },
          "observations": {
            "$ref": "config.common.schema.json#/$defs/topic_filter"
          },
          "command": {
            "$ref": "config.common.schema.json#/$defs/topic",
            "description": "Operator commands (operator-command.schema.json). Telemetry acts on the two publication prompts addressed to it and ignores everything else on the topic."
          }
        }
      },
      "http": {
        "type": "object",
        "required": [
          "report_path"
        ],
        "additionalProperties": false,
        "properties": {
          "report_path": {
            "$ref": "config.common.schema.json#/$defs/relative_path"
          }
        }
      },
      "heartbeat": {
        "$ref": "config.common.schema.json#/$defs/heartbeat"
      },
      "cadence_ticks": {
        "type": "integer",
        "exclusiveMinimum": 0
      },
      "staleness_window_seconds": {
        "type": "number",
        "exclusiveMinimum": 0,
        "description": "A figure not updated within this much simulation time says stale and keeps saying its last update time — it does not go on presenting its last value as current."
      },
      "minimum_skill_samples": {
        "type": "integer",
        "minimum": 2
      },
      "skill_event": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]*$",
        "description": "Which operator event id asks telemetry to publish its skill statement now rather than at its cadence (SRD-v2 FR-65). The statement is recomputed from the residuals folded so far and says exactly what a statement on cadence says, including that there are too few samples to score."
      },
      "statistics_event": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]*$",
        "description": "Which operator event id asks telemetry to publish its residual statistics now rather than at its cadence (SRD-v2 FR-65). With nothing folded it publishes the state it would publish on cadence — a named absence, never a zero."
      },
      "regions": {
        "type": "object",
        "required": [
          "rows",
          "columns",
          "minimum_samples"
        ],
        "additionalProperties": false,
        "description": "The bounded grid the region-level statistics scope is defined over (telemetry.schema.json's statistics_scope). Rows and columns are fixed before a run starts, so the number of region scopes a run can hold is fixed with them and cannot grow with the scenario. The grid's extent is deliberately not stated here: it is the extent of the forecast holding the residuals were scored against, which this component already reads through the store, and a second copy of the domain in configuration is a second thing to keep in step.",
        "properties": {
          "rows": {
            "type": "integer",
            "minimum": 1,
            "description": "Cells north to south."
          },
          "columns": {
            "type": "integer",
            "minimum": 1,
            "description": "Cells west to east."
          },
          "minimum_samples": {
            "type": "integer",
            "minimum": 1,
            "description": "Below this many residuals a region reports state 'insufficient-samples' and its figures stand as they are, rather than being folded into the scenario figure where nobody could tell they were thin."
          }
        }
      }
    }
  },
  "coverage-holding": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/coverage-holding.schema.json",
    "title": "drogna coverage holding",
    "description": "One holding in the coverage store (V2-C08): the descriptor a reader catalogues it by, with the ground-truth manifest that produced it embedded whole. The eras (SRD-v2 FR-21): the historic archive authored at provisioning; the departure forecast issued at the scenario origin and never refreshed — authored as persistence, because a forecast evaluated from the true field at each of its steps would be a perfect forecast and so not a forecast at all (feature 121); the now-cast replaced on its cadence; the analysis an assimilation cycle publishes; and the forecast instances that accumulate once the loop turns — an instance's manifest names the model runner as its generator, and the run-level facts (validity, cause, ensemble) travel in the run-published announcement rather than a second descriptor (V1's coverage-run-manifest, retired with the reason in feature 105's record). The field digest is what publication was checked against (FR-13): a staged holding whose bytes do not match it was refused with the mismatch named and never became one of these.",
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
          "departure",
          "nowcast",
          "analysis",
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
        "description": "The stored bytes. `drogna-f32-v1`: every variable's float32 values in the manifest's variable order, each in C order [time][depth][latitude][longitude], little-endian, concatenated — the gridded format every coverage is, and the only one EDR serves. `drogna-contributions-v1` (feature 124): a sparse per-source holding the analyst publishes beside its analysis, laid out as analysis-contributions.schema.json's `$defs/header` states, held by the same store under the same digest check and served by the query component at its contributions prefix. Not a coverage, and EDR does not list it.",
        "properties": {
          "format": {
            "type": "string",
            "enum": [
              "drogna-f32-v1",
              "drogna-contributions-v1"
            ]
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
    "description": "The CoverageJSON the EDR component serves (SRD-v2 FR-26): the honest subset, stated — Coverage documents with Point, Trajectory and Grid domains, NdArray ranges, and the harness's two parameters. This master is the shape a response is validated against in tests and behind the debug flag; it deliberately closes what the harness emits rather than describing everything CoverageJSON permits, so an accidental extra field is a finding, not a feature.",
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
              "Trajectory",
              "Grid"
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
              },
              "area": {
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
  "features-response": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/features-response.schema.json",
    "title": "drogna Features subset responses",
    "description": "The OGC API-Features (Part 1, Core, read-only) responses the query component serves (SRD-v2 FR-37's collection, and the reference geometry deferred there from 104): the collections list and one items page as a GeoJSON FeatureCollection subset. The advisories collection is present-and-stating-empty before any advisory exists — an empty collection is an answer, not an error.",
    "type": "object",
    "$defs": {
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
          "itemType",
          "links"
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
          "itemType": {
            "type": "string",
            "const": "feature"
          },
          "links": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/link"
            }
          }
        }
      },
      "feature_collection": {
        "type": "object",
        "required": [
          "type",
          "features",
          "numberReturned"
        ],
        "additionalProperties": false,
        "properties": {
          "type": {
            "type": "string",
            "const": "FeatureCollection"
          },
          "features": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/feature"
            }
          },
          "numberReturned": {
            "type": "integer",
            "minimum": 0
          }
        }
      },
      "feature": {
        "type": "object",
        "required": [
          "type",
          "id",
          "geometry",
          "properties"
        ],
        "additionalProperties": false,
        "properties": {
          "type": {
            "type": "string",
            "const": "Feature"
          },
          "id": {
            "type": "string"
          },
          "geometry": {
            "type": "object",
            "required": [
              "type",
              "coordinates"
            ],
            "additionalProperties": false,
            "properties": {
              "type": {
                "type": "string",
                "const": "Polygon"
              },
              "coordinates": {
                "type": "array",
                "minItems": 1,
                "maxItems": 1,
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
          },
          "properties": {
            "type": "object",
            "description": "For an advisory: the advisory document minus its region (the geometry carries it). For reference geometry: the declared name and kind. Governed content either way — nothing here escapes its own master."
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
  "forecast-features": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/forecast-features.schema.json",
    "title": "drogna forecast features",
    "description": "The seeded features forecast AS FEATURES rather than merely carried in the field (SRD-v2 FR-113): the eddy's centre, radius and strength; the front's position and orientation; the thermocline's depth and gradient; and the drifting feature's track — each published per forecast step with an uncertainty that grows with lead, so that a forecast makes a falsifiable claim about next week rather than a picture of it.\n\n**The parameters are estimated from the analysis the run initialises from, and from nothing else.** A run never reads the true field. That is feature 116's lesson — before it, the model runner initialised from a now-cast the environment generator evaluated from the true ocean, so nothing the platform measured ever reached a forecast — and it is why the runner subscribes to the analysis announcement rather than to the run request.\n\nProperty names follow `manifest.schema.json`'s own `eddy_parameters`, `front_parameters`, `thermocline_parameters` and `moving_parameters` **only where the quantity is the same quantity**, so a scoring test compares like with like against the ground-truth manifest rather than against a translation. The bound such a test holds to is derived from the authoring jitter or the grid's own resolution, read on disk, and never typed into the test (AT-03, AT-06; Constitution IX).\n\n**Where the quantity is not the same, the name is not the same either, and the difference is declared.** The magnitudes a horizontal estimator over a coarse grid produces — an anomaly peak, a step across a front, a drop across a grid interval — are not the authored three-dimensional amplitudes, and cannot be converted into them without depth structure no estimator here recovers. They are published under names of their own (`anomaly_peak_c`, `anomaly_step_c`, `layer_drop_c`), and the authored quantity they resemble is named in `not_estimated` with the reason. The first draft published them under the manifest's names at up to sixteen times the uncertainty it declared for them, which is what this separation exists to prevent.",
    "type": "object",
    "required": [
      "component",
      "scenario_run_id",
      "sim_time",
      "tick",
      "run_id",
      "kernel",
      "initialisation_sim_time",
      "step_seconds",
      "steps"
    ],
    "additionalProperties": false,
    "properties": {
      "component": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$"
      },
      "scenario_run_id": {
        "type": "string",
        "minLength": 1
      },
      "sim_time": {
        "type": "string"
      },
      "tick": {
        "type": "integer",
        "minimum": 0
      },
      "run_id": {
        "type": "string",
        "minLength": 1,
        "description": "The model run these features belong to, the same identifier the forecast holding carries."
      },
      "kernel": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$",
        "description": "The kernel that carried them forward. A tracked feature is a claim about a propagation, so which propagation is not optional."
      },
      "initialisation_sim_time": {
        "type": "string"
      },
      "step_seconds": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "steps": {
        "type": "array",
        "minItems": 1,
        "description": "One entry per forecast step, in lead order.",
        "items": {
          "$ref": "#/$defs/step"
        }
      },
      "not_estimated": {
        "type": "array",
        "description": "What this run could not estimate, and why, in the runner's own words. Absent, null and declined are three different facts (FR-41).\n\nOn the message rather than on each step, because it is a property of the ESTIMATE and not of the lead: the features are estimated once, from the analysis the run initialises from, and carried forward — so nothing about what could not be recovered can differ between step 0 and step 3. It was per-step first, which put the same few hundred words of reasoning in the document four times over and left four copies that had to agree.",
        "items": {
          "$ref": "#/$defs/not_estimated_entry"
        }
      }
    },
    "$defs": {
      "step": {
        "type": "object",
        "required": [
          "step",
          "lead_seconds",
          "features"
        ],
        "additionalProperties": false,
        "properties": {
          "step": {
            "type": "integer",
            "minimum": 0
          },
          "lead_seconds": {
            "type": "number",
            "minimum": 0,
            "description": "Simulation seconds from initialisation. Lead, never host elapsed time."
          },
          "features": {
            "type": "array",
            "description": "The features this step could be estimated for. A feature an estimator could not recover honestly is ABSENT with its reason in `not_estimated`, never present with a widened uncertainty — softening a bound until it passes is the failure mode this document exists to make visible.",
            "items": {
              "$ref": "#/$defs/feature"
            }
          }
        }
      },
      "not_estimated_entry": {
        "type": "object",
        "required": [
          "kind",
          "reason"
        ],
        "additionalProperties": false,
        "properties": {
          "kind": {
            "$ref": "#/$defs/kind"
          },
          "quantity": {
            "type": "string",
            "minLength": 1,
            "description": "The single quantity not recovered, named as the ground-truth manifest names it. Absent means the whole feature was not estimated. Two different facts: a thermocline nobody could place, and a thermocline placed to the grid's resolution whose authored temperature drop is finer than the grid can see."
          },
          "reason": {
            "type": "string",
            "minLength": 1
          }
        }
      },
      "kind": {
        "type": "string",
        "enum": [
          "eddy",
          "front",
          "thermocline",
          "moving"
        ],
        "description": "The four seeded features of SRD-v2 FR-03, named as the ground-truth manifest names them."
      },
      "feature": {
        "type": "object",
        "required": [
          "id",
          "kind",
          "parameters",
          "uncertainty"
        ],
        "additionalProperties": false,
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_-]*$"
          },
          "kind": {
            "$ref": "#/$defs/kind"
          },
          "parameters": {
            "type": "object"
          },
          "uncertainty": {
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
              },
              "uncertainty": {
                "$ref": "#/$defs/positional_uncertainty"
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
              },
              "uncertainty": {
                "$ref": "#/$defs/front_uncertainty"
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
              },
              "uncertainty": {
                "$ref": "#/$defs/thermocline_uncertainty"
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
              },
              "uncertainty": {
                "$ref": "#/$defs/positional_uncertainty"
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
          "anomaly_peak_c"
        ],
        "additionalProperties": false,
        "description": "What an estimator over a gridded analysis can recover of the eddy: where the anomaly is, how far it reaches, and how strong the anomaly it left in a depth-averaged field is. The authored depth structure and salinity strength are deliberately absent — an estimate nobody can make honestly is worse than none.",
        "properties": {
          "centre_latitude": {
            "type": "number",
            "description": "Scorable against the manifest's own centre_latitude."
          },
          "centre_longitude": {
            "type": "number",
            "description": "Scorable against the manifest's own centre_longitude."
          },
          "radius_km": {
            "type": "number",
            "exclusiveMinimum": 0,
            "description": "The equivalent radius of the region still above the anomaly peak over e, after the high pass that separates the blob from the front's plateau. Smaller than the authored radius, because the high pass shrinks it — published because the surface needs a scale to draw, and not scored as if it were the authored figure."
          },
          "anomaly_peak_c": {
            "type": "number",
            "description": "The peak of the high-passed, depth-averaged temperature anomaly. NOT the manifest's strength_c, which is a three-dimensional amplitude at the feature's own depth; see not_estimated."
          }
        }
      },
      "front_parameters": {
        "type": "object",
        "required": [
          "anchor_latitude",
          "anchor_longitude",
          "bearing_degrees",
          "anomaly_step_c"
        ],
        "additionalProperties": false,
        "description": "The front's position and orientation. The anchor is a point ON the line — where the horizontal gradient is steepest outside both blobs — and is scored as a perpendicular distance to the authored front, never as a distance between two anchors: a line has no distinguished point.",
        "properties": {
          "anchor_latitude": {
            "type": "number"
          },
          "anchor_longitude": {
            "type": "number"
          },
          "bearing_degrees": {
            "type": "number",
            "minimum": 0,
            "exclusiveMaximum": 180,
            "description": "The direction the front runs, in the manifest's own convention, folded into a half turn because a front and its reverse are the same line. Averaged in doubled angles over every cell within half the peak gradient and weighted by it — one cell of a noisy field is one sample, and taking the steepest cell alone was wrong by up to 39 degrees. Scorable against the manifest's bearing_degrees, folded the same way."
          },
          "anomaly_step_c": {
            "type": "number",
            "description": "Half the range of the depth-averaged anomaly across the front, outside both blobs. NOT the manifest's amplitude_c, which is a surface figure decaying with depth on a scale this estimator does not recover; see not_estimated."
          }
        }
      },
      "thermocline_parameters": {
        "type": "object",
        "required": [
          "depth_m",
          "thickness_m",
          "layer_drop_c"
        ],
        "additionalProperties": false,
        "description": "Where the domain-mean profile falls fastest, and by how much over the interval it was measured on. Depth is the midpoint of the steepest level pair and is scorable against the manifest's depth_m to the grid's own depth spacing and no finer.",
        "properties": {
          "depth_m": {
            "type": "number",
            "minimum": 0,
            "description": "Scorable against the manifest's depth_m, to a bound that is the grid's depth spacing."
          },
          "thickness_m": {
            "type": "number",
            "exclusiveMinimum": 0,
            "description": "The grid interval the drop was taken over — the resolution of the claim, carried with it rather than left to be looked up."
          },
          "layer_drop_c": {
            "type": "number",
            "description": "The domain-mean temperature drop across that interval. NOT the manifest's temperature_drop_c, which is taken across a thermocline an order of magnitude thinner; see not_estimated."
          }
        }
      },
      "moving_parameters": {
        "type": "object",
        "required": [
          "centre_latitude",
          "centre_longitude",
          "radius_km",
          "anomaly_peak_c"
        ],
        "additionalProperties": false,
        "description": "The drifting feature's track: its position at this step, with the same recoverable subset the eddy carries, separated from the eddy by the sign of its anomaly rather than by a hint from the manifest. The drift velocity is not restated — it is what the succession of positions across the steps IS, and a velocity published beside them would be a second claim free to disagree.",
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
          "anomaly_peak_c": {
            "type": "number",
            "description": "As the eddy's, and not the manifest's strength_c; see not_estimated."
          }
        }
      },
      "positional_uncertainty": {
        "type": "object",
        "required": [
          "centre_km",
          "radius_km",
          "anomaly_peak_c"
        ],
        "additionalProperties": false,
        "description": "One standard deviation on each quantity beside it, growing with lead. Derived from the analysis error the run initialised from and the root of the lead, so a longer forecast makes a weaker claim — which is what an uncertainty is for. It covers the figures actually published; a quantity in not_estimated has no uncertainty here, because an uncertainty on a figure nobody produced would be the emptiest claim in the document.",
        "properties": {
          "centre_km": {
            "type": "number",
            "minimum": 0
          },
          "radius_km": {
            "type": "number",
            "minimum": 0
          },
          "anomaly_peak_c": {
            "type": "number",
            "minimum": 0
          }
        }
      },
      "front_uncertainty": {
        "type": "object",
        "required": [
          "anchor_km",
          "bearing_degrees",
          "anomaly_step_c"
        ],
        "additionalProperties": false,
        "properties": {
          "anchor_km": {
            "type": "number",
            "minimum": 0
          },
          "bearing_degrees": {
            "type": "number",
            "minimum": 0
          },
          "anomaly_step_c": {
            "type": "number",
            "minimum": 0
          }
        }
      },
      "thermocline_uncertainty": {
        "type": "object",
        "required": [
          "depth_m",
          "layer_drop_c"
        ],
        "additionalProperties": false,
        "properties": {
          "depth_m": {
            "type": "number",
            "minimum": 0,
            "description": "Half the grid's depth spacing — the nearest a level-pair midpoint can be wrong. It does not grow with lead: this kernel has no vertical velocity, so a widening claim about the depth would be a claim the physics does not make."
          },
          "layer_drop_c": {
            "type": "number",
            "minimum": 0
          }
        }
      }
    }
  },
  "forecast-indicator": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/forecast-indicator.schema.json",
    "title": "drogna re-forecast indicator",
    "description": "The message on the declared indicator topic (SRD-v2 FR-117): a figure saying that re-forecasting is becoming valuable, the threshold at which it becomes warranted, and what the figure actually is.\n\n**This is a socket, not science.** The indicator that re-forecasting is becoming valuable is environmental science and belongs to the environmental-indicators workstream. What drogna provides is this declared shape, a gauge that renders whatever is published on the topic, and a refusal that names the absence when nothing is — an empty gauge and an unheard indicator are different facts and are drawn differently (FR-119).\n\nDrogna's own residual statistic is wired in as the reference implementation, published by the monitor because it already holds both the running residual and the threshold in force. Any other publisher would hold a second copy of the threshold, and the mark on the gauge could then disagree with the rule that fires a run — which is the fault class this repository keeps finding.",
    "type": "object",
    "required": [
      "component",
      "scenario_run_id",
      "sim_time",
      "tick",
      "indicator",
      "label",
      "value",
      "threshold",
      "unit",
      "streak"
    ],
    "additionalProperties": false,
    "properties": {
      "component": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$",
        "description": "Whoever published it, matching config /component/id. The gauge names this, so a reader can see which indicator they are looking at rather than assuming the one they expected."
      },
      "scenario_run_id": {
        "type": "string",
        "minLength": 1
      },
      "sim_time": {
        "type": "string",
        "description": "Simulation time at which the figure was current, ISO-8601 UTC with microsecond precision."
      },
      "tick": {
        "type": "integer",
        "minimum": 0
      },
      "indicator": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$",
        "description": "A stable identifier for which indicator this is. The surface states it: a gauge that does not say what it is showing is a number with a shape around it."
      },
      "label": {
        "type": "string",
        "minLength": 1,
        "description": "What a reader is told the figure is, in the publisher's own words."
      },
      "value": {
        "type": "number",
        "description": "The figure. Reported, never derived by the surface from a configured expectation (FR-119)."
      },
      "threshold": {
        "type": "number",
        "description": "The value at which a run becomes warranted, in the same unit, as the publisher holds it. Marked on the gauge, and read from the same place the rule that fires a run reads it."
      },
      "unit": {
        "type": "string",
        "minLength": 1,
        "description": "The unit both figures are in."
      },
      "streak": {
        "type": "object",
        "required": [
          "count",
          "of"
        ],
        "additionalProperties": false,
        "description": "How close the publisher is to acting on the figure, in its own counting. A consumer that recomputed this from the samples it happened to receive would be a second implementation of the rule, free to disagree about whether the loop is about to turn (FR-58).",
        "properties": {
          "count": {
            "type": "integer",
            "minimum": 0
          },
          "of": {
            "type": "integer",
            "minimum": 1
          }
        }
      }
    }
  },
  "heartbeat": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/heartbeat.schema.json",
    "title": "drogna component heartbeat",
    "description": "The message every long-lived component publishes on ctl/heartbeat at its declared interval, and the only thing that lights a component in the client (FR-45, FR-57, Constitution VII). The shape was settled by feature 001, which publishes the first one; this document is the neutral master and adopts that shape unchanged, extending it only with the two optional declarations FR-012 asks for. Note what is absent: no host timestamp. Cadence and liveness windows are real time by ADR-0006, but the sender does not tell the receiver what time the sender thinks it is; the receiver measures arrival against its own real time, and the simulation time carried here is payload, not schedule.",
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
      },
      "figures": {
        "type": "array",
        "maxItems": 8,
        "description": "What this component reports about itself, as numbers rather than as prose (SRD-v2 FR-58). The detail line above is for a reader; these are for a display that wants to draw a bar, a stack or a sparkline without parsing a sentence — and parsing a sentence is exactly how a display starts inventing figures nobody published. Optional: a component with nothing countable to say omits it, and a face with no figures says so rather than drawing zeroes.",
        "items": {
          "type": "object",
          "required": [
            "key",
            "value"
          ],
          "additionalProperties": false,
          "properties": {
            "key": {
              "type": "string",
              "pattern": "^[a-z][a-z0-9_]*$",
              "description": "Names the quantity, stable across heartbeats so a consumer can follow one figure over time."
            },
            "value": {
              "type": "number"
            },
            "unit": {
              "type": "string",
              "description": "The unit as a reader would write it, so a display need hold no table of units."
            },
            "of": {
              "type": "number",
              "description": "The bound this value is measured against, where one exists — a staging limit, a cadence, an ensemble size. A bar without a bound is a bar that means nothing, so a face draws one only where this is present."
            },
            "label": {
              "type": "string",
              "description": "Short caption for a reader. Absent means the key, spaced out, will do."
            }
          }
        }
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
          "analysis",
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
                "minimum": 1,
                "description": "How many steps the axis carries. One is a real axis and not a degenerate one: an analysis is a correction at a single instant, and feature 116 lowered this bound from an unargued 2 to admit that. A one-step axis still declares its step_seconds, because the step says what the next instant would have been and a consumer snapping a query to the axis needs it either way."
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
    "description": "One measured value published by a simulated instrument on obs/<thing-id>/<datastream-id>, in SensorThings Part 1 vocabulary. SensorThings is the shape and vocabulary of the message and nothing more: no SensorThings server takes part in the write path, and this document is the single definition the sensors, the platform and the ingest client are generated from (SRD FR-16, FR-17). The observed property is a closed enumeration: three ocean properties, and — since feature 113 — three ownship ones, whose admission is argued at that enumeration. Sound speed is absent by decision: ADR-0005 derives it at the point of use from temperature, salinity and pressure, so it is never published and never stored, and no derived quantity may join the list without amending that ADR. Every time here is simulation time taken from the clock port; no broker-assigned timestamp, database default or host clock value appears anywhere in the write path.",
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
        "description": "The Thing this observation came from, and the first segment of the topic. A sampling platform is a coordinate and a sampler, carrying no history. The platform component’s own Thing is the exception feature 113 argues for at /$defs/location: it moves, and its observations are therefore a track. Neither is an entity of any other kind (Constitution V)."
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
        "description": "The measured value, in the unit the Datastream declares — degrees Celsius, practical salinity units, decibars, and for the ownship datastreams degrees true, metres per second and metres. Seeded instrument noise is already applied; the value is what the instrument reported, not what the world held or what the simulator holds."
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
          "pressure",
          "platform_course",
          "platform_speed",
          "platform_depth"
        ],
        "description": "What was measured: three ocean properties, and three ownship ones added by feature 113 (FR-54). Sound speed is not among them and is not a datastream — it is derived at the point of use by the one implementation the monitor, telemetry and the environment generator all call (ADR-0005), because a derived value stored beside its inputs is a second source of truth that can disagree with them after a change to the equation, with no way to tell which was right. The ownship three do not reopen that closure, and the difference is the argument: what ADR-0005 closed the list against is quantities derived from other stored values. Course, speed and depth over ground are the motion simulator’s own primary state, measured by the platform’s navigation instruments under a declared noise model exactly as the ocean instruments measure the sea, and nothing else in the harness holds them — so there is no second source for them to disagree with. Position is deliberately not among them: a latitude is not a measurement result, and position is carried in /location as it is on every observation. Nor is an ownship observation a sample of the ocean: consumers that reason about where the sea has been measured — the monitor’s pairing, the planner’s observation-age field — exclude these datastreams by name, and a test fails when that exclusion is removed (FR-56)."
      },
      "location": {
        "title": "Sampled position",
        "description": "Where the value pertains to. A position and a depth, and nothing else in this object: no heading, no speed, no identity carried between them. Feature 113 admits one history here and names it, rather than leaving the reader to infer the change. On the ocean datastreams nothing moves: a series of sampling locations is a sampling path, and the FeatureOfInterest is still not a place anything went. On the platform’s own datastreams the series is the ownship track, because those observations come from one moving Thing which is the harness’s own vehicle — Constitution V keeps ‘track’ as ordinary navigational English for exactly this path, and forbids the third party whose position the harness would infer rather than know. The track therefore has no representation of its own: it is these locations in phenomenon-time order, served through the ordinary Observations resource. HistoricalLocations stays outside the served subset for that reason, since a second representation of one fact is two answers that can disagree (FR-54).",
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
  "operator-command": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/operator-command.schema.json",
    "title": "drogna operator command",
    "description": "What the operator surface says on the broker when a reader asks the machinery to do something beyond stop and start: tune a setting a component scores against, or prompt a component to act now. One topic and one master rather than a topic per command, so the flow chart draws the operator reaching the components it can reach rather than a fan of near-identical wires, and every command is one entry in the Messages tab. The surface publishes and counts; it applies nothing and lights nothing (Constitution VII). What the command did is the target component's own answer, and it arrives in that component's heartbeat and telemetry like everything else it says about itself. Commands are ephemeral and outside AT-04's replay claim, on the same rule as stop and start: a restarted component is rebuilt from its configuration document, so a tuning it was carrying is gone and the component says so by reporting the configured value again.",
    "oneOf": [
      {
        "$ref": "#/$defs/tuning_command"
      },
      {
        "$ref": "#/$defs/event_command"
      }
    ],
    "$defs": {
      "component_id": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$"
      },
      "tuning_command": {
        "title": "Tuning command",
        "description": "Set one named numeric setting on one component, within the bound the operator surface declares for it. The value here is what was asked for; the value in force is what the target reports.",
        "type": "object",
        "required": [
          "component",
          "scenario_run_id",
          "sim_time",
          "tick",
          "kind",
          "target",
          "setting",
          "value"
        ],
        "additionalProperties": false,
        "properties": {
          "component": {
            "$ref": "#/$defs/component_id",
            "description": "The operator surface that published this, matching config /operator/id."
          },
          "scenario_run_id": {
            "type": "string",
            "minLength": 1
          },
          "sim_time": {
            "type": "string",
            "description": "Simulation time at which the command was published, ISO-8601 UTC with microsecond precision."
          },
          "tick": {
            "type": "integer",
            "minimum": 0
          },
          "kind": {
            "const": "tuning"
          },
          "target": {
            "$ref": "#/$defs/component_id",
            "description": "The component the setting belongs to. A component ignores a command addressed to another: the topic is one, the address is here."
          },
          "setting": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_]*$",
            "description": "The setting's name, matching the key in that component's configuration document. Named rather than positional so a component can refuse a setting it does not hold."
          },
          "value": {
            "type": "number"
          }
        }
      },
      "event_command": {
        "title": "Event command",
        "description": "Ask a component to do now what it would otherwise do on its own schedule. The component decides: a prompted forecast run goes through the scheduler's ordinary policy and can be declined by it, which is the point of routing the prompt through the component rather than publishing a run request from here.",
        "type": "object",
        "required": [
          "component",
          "scenario_run_id",
          "sim_time",
          "tick",
          "kind",
          "target",
          "event"
        ],
        "additionalProperties": false,
        "properties": {
          "component": {
            "$ref": "#/$defs/component_id",
            "description": "The operator surface that published this, matching config /operator/id."
          },
          "scenario_run_id": {
            "type": "string",
            "minLength": 1
          },
          "sim_time": {
            "type": "string",
            "description": "Simulation time at which the command was published, ISO-8601 UTC with microsecond precision."
          },
          "tick": {
            "type": "integer",
            "minimum": 0
          },
          "kind": {
            "const": "event"
          },
          "target": {
            "$ref": "#/$defs/component_id",
            "description": "The component asked to act."
          },
          "event": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9-]*$",
            "description": "Which of the events the operator surface declares this is."
          }
        }
      }
    }
  },
  "operator-components": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/operator-components.schema.json",
    "title": "drogna operator components report",
    "description": "The operator surface's answer to 'what do the components say about themselves': every declared component, with the last heartbeat genuinely heard from it or the honest statement that none was. Aggregation, never invention — nothing here can light a display (Constitution VII); the shell still lights only from heartbeats it hears itself.",
    "type": "object",
    "required": [
      "schema_version",
      "components"
    ],
    "additionalProperties": false,
    "properties": {
      "schema_version": {
        "type": "integer",
        "const": 1
      },
      "components": {
        "type": "array",
        "items": {
          "type": "object",
          "required": [
            "id",
            "heard",
            "stoppable",
            "running",
            "last_heartbeat"
          ],
          "additionalProperties": false,
          "properties": {
            "id": {
              "type": "string",
              "pattern": "^[a-z][a-z0-9_-]*$"
            },
            "heard": {
              "type": "boolean",
              "description": "Whether any heartbeat has ever arrived from this component. Never heard is reported unheard, not absent (FR-36)."
            },
            "stoppable": {
              "type": "boolean"
            },
            "running": {
              "type": "boolean",
              "description": "The control registry's record of whether the component is currently scheduled. A record of commands, not of life: life is the heartbeat column."
            },
            "last_heartbeat": {
              "oneOf": [
                {
                  "$ref": "heartbeat.schema.json"
                },
                {
                  "type": "null"
                }
              ]
            }
          }
        }
      }
    }
  },
  "operator-controls": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/operator-controls.schema.json",
    "title": "drogna operator controls statement",
    "description": "What the operator plane offers a reader, stated by the plane itself: how far the clock may be stepped in one ask, which settings may be tuned and between which bounds, and which events may be prompted. The shell renders what it is told here and offers nothing else — a control the surface would refuse is a control that should never have been drawn, and a bound typed into a panel is a second copy of a rule (Constitution IV). Declared configuration only: no value in force appears here, because the value in force is the target component's own answer and arrives in its heartbeat (Constitution VII).",
    "type": "object",
    "required": [
      "schema_version",
      "step",
      "demand",
      "tunables",
      "events"
    ],
    "additionalProperties": false,
    "properties": {
      "schema_version": {
        "type": "integer",
        "const": 1
      },
      "step": {
        "$ref": "#/$defs/step"
      },
      "demand": {
        "$ref": "#/$defs/demand"
      },
      "tunables": {
        "type": "array",
        "description": "The settings a reader may change while the run is going, each with the bound the surface will refuse outside.",
        "items": {
          "$ref": "#/$defs/tunable"
        }
      },
      "events": {
        "type": "array",
        "description": "The things a reader may ask a component to do now. Each names its target, and the target decides.",
        "items": {
          "$ref": "#/$defs/event"
        }
      }
    },
    "$defs": {
      "step": {
        "type": "object",
        "required": [
          "maximum_ticks"
        ],
        "additionalProperties": false,
        "properties": {
          "maximum_ticks": {
            "type": "integer",
            "minimum": 1,
            "description": "The most ticks one step command may advance the clock. A bound rather than no bound: a burst is a loop over the clock's own step, and an unbounded one would block the page it is drawing."
          }
        },
        "title": "Clock step bound"
      },
      "demand": {
        "title": "Demand target",
        "description": "Which component a platform demand is published to. Declared rather than assumed by the panel: the demand control belongs on that component's node, and a front-end that knew which one by name would be a front-end holding a copy of the wiring.",
        "type": "object",
        "required": [
          "target"
        ],
        "additionalProperties": false,
        "properties": {
          "target": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_-]*$"
          }
        }
      },
      "tunable": {
        "type": "object",
        "required": [
          "id",
          "target",
          "setting",
          "label",
          "minimum",
          "maximum",
          "step",
          "integer",
          "figure",
          "description"
        ],
        "additionalProperties": false,
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9-]*$"
          },
          "target": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_-]*$"
          },
          "setting": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_]*$"
          },
          "label": {
            "type": "string",
            "minLength": 1
          },
          "unit": {
            "type": "string"
          },
          "minimum": {
            "type": "number"
          },
          "maximum": {
            "type": "number"
          },
          "step": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "integer": {
            "type": "boolean",
            "description": "Whether the setting counts things. A count of 2.5 samples is not a stricter setting, it is a nonsense, and the surface refuses it by name."
          },
          "figure": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_]*$",
            "description": "The heartbeat figure key the target reports the value in force under (heartbeat.schema.json 'figures'). The shell reads the value in force from there and never from what was typed."
          },
          "description": {
            "type": "string",
            "minLength": 1
          }
        },
        "title": "Tunable setting"
      },
      "event": {
        "type": "object",
        "required": [
          "id",
          "target",
          "label",
          "description"
        ],
        "additionalProperties": false,
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9-]*$"
          },
          "target": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_-]*$"
          },
          "label": {
            "type": "string",
            "minLength": 1
          },
          "description": {
            "type": "string",
            "minLength": 1,
            "description": "What the component will consider, in terms that admit a decline: an event that reads as a guarantee is a display promising on a component's behalf."
          }
        },
        "title": "Promptable event"
      }
    }
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
              "salinity_spread",
              "temperature_error",
              "salinity_error"
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
          "variable": "temperature_error",
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
  "platform-demand": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/platform-demand.schema.json",
    "title": "drogna platform demand",
    "description": "A demanded course, speed and depth, published on the platform's demand topic (SRD-v2 FR-53). The platform applies the last demand it heard; a demand beyond a declared limit is applied as far as the limit allows and the shortfall is stated in the platform's own state message, so an unreachable demand is never silently turned into a reachable one. Who may publish this is a broker rule, not a field: today the operator surface, and the rules are written to admit a future adaptive-sampling component. The planner is not a publisher and may not become one without amending Constitution VIII — it emits recommendations, and turning a recommendation into a demand is a decision.",
    "type": "object",
    "required": [
      "component",
      "scenario_run_id",
      "sim_time",
      "tick"
    ],
    "additionalProperties": false,
    "properties": {
      "component": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$",
        "description": "The component id of whoever issued the demand. Carried so the platform's state can say where its current demand came from, and so a reader can tell an operator's demand from a sampler's."
      },
      "scenario_run_id": {
        "type": "string",
        "description": "The scenario run this demand belongs to."
      },
      "sim_time": {
        "type": "string",
        "description": "Simulation time the demand was issued at, ISO-8601 UTC with microsecond precision. No host clock takes part."
      },
      "tick": {
        "type": "integer",
        "minimum": 0
      },
      "course_degrees": {
        "type": "number",
        "minimum": 0,
        "exclusiveMaximum": 360,
        "description": "Demanded course over ground, degrees true. Absent leaves the standing demand untouched — a demand for speed alone is a speed demand, not an implicit order to steer north."
      },
      "speed_m_per_s": {
        "type": "number",
        "minimum": 0,
        "description": "Demanded speed over ground. Absent leaves the standing demand untouched."
      },
      "depth_m": {
        "type": "number",
        "minimum": 0,
        "description": "Demanded depth below the surface, positive downwards. Absent leaves the standing demand untouched."
      },
      "note": {
        "type": "string",
        "description": "One line for a human, carried into the platform's state report. Never a substitute for the numbers."
      }
    },
    "examples": [
      {
        "component": "operator",
        "scenario_run_id": "loiter-a1b2c3d4",
        "sim_time": "2026-01-01T04:12:30.000000Z",
        "tick": 4812,
        "course_degrees": 90,
        "speed_m_per_s": 3,
        "depth_m": 120,
        "note": "turn east and go deeper"
      }
    ]
  },
  "platform-state": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/platform-state.schema.json",
    "title": "drogna platform state",
    "description": "What the platform reports about itself (SRD-v2 FR-52): demanded beside current, never conflated, and the limit that is binding where the two differ. This is the component's own account for the Operator view, not a measurement — the measurements are ownship observations on the observation namespace, and position appears here for the reader rather than as the record. A consumer that wants where the platform has been reads the observations through the query layer, because a state message is the present and a track is a history.",
    "type": "object",
    "required": [
      "component",
      "scenario_run_id",
      "sim_time",
      "tick",
      "current",
      "demanded",
      "limits",
      "binding_limit"
    ],
    "additionalProperties": false,
    "properties": {
      "component": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$"
      },
      "scenario_run_id": {
        "type": "string"
      },
      "sim_time": {
        "type": "string",
        "description": "ISO-8601 UTC with microsecond precision."
      },
      "tick": {
        "type": "integer",
        "minimum": 0
      },
      "current": {
        "$ref": "#/$defs/vector"
      },
      "demanded": {
        "oneOf": [
          {
            "$ref": "#/$defs/demanded"
          },
          {
            "type": "null"
          }
        ],
        "description": "The standing demand, or null where none has ever been heard. Null is a statement: it means the platform is holding what it was configured with, not that it has been told to."
      },
      "demand_from": {
        "type": [
          "string",
          "null"
        ],
        "description": "The component id that issued the standing demand. Null with no demand standing."
      },
      "limits": {
        "$ref": "#/$defs/limits"
      },
      "binding_limit": {
        "type": "string",
        "enum": [
          "none",
          "turn_rate",
          "acceleration",
          "dive_rate",
          "maximum_speed",
          "maximum_depth"
        ],
        "description": "Which limit is holding current away from demanded right now. 'none' means the platform is where it was asked to be, or has not been asked. This is why a platform that is not obeying can never be mistaken on screen for one that is."
      },
      "shortfall": {
        "oneOf": [
          {
            "$ref": "#/$defs/shortfall"
          },
          {
            "type": "null"
          }
        ],
        "description": "Where the standing demand asked for something outside a declared limit, what was asked and what the limit allowed. Null when the demand is reachable. A clipped demand that said nothing would be the platform quietly rewriting its orders."
      },
      "note": {
        "type": "string",
        "description": "The note carried on the standing demand, if it had one."
      }
    },
    "$defs": {
      "vector": {
        "title": "Ownship state",
        "type": "object",
        "required": [
          "latitude",
          "longitude",
          "course_degrees",
          "speed_m_per_s",
          "depth_m"
        ],
        "additionalProperties": false,
        "properties": {
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
          "course_degrees": {
            "type": "number",
            "minimum": 0,
            "exclusiveMaximum": 360
          },
          "speed_m_per_s": {
            "type": "number",
            "minimum": 0
          },
          "depth_m": {
            "type": "number",
            "minimum": 0
          }
        }
      },
      "demanded": {
        "title": "Demanded state",
        "description": "What was asked for. Position is absent by design: a demand names a way to go, not a place to be — routing is the planner's business, and the planner does not publish demands.",
        "type": "object",
        "required": [
          "course_degrees",
          "speed_m_per_s",
          "depth_m"
        ],
        "additionalProperties": false,
        "properties": {
          "course_degrees": {
            "type": "number",
            "minimum": 0,
            "exclusiveMaximum": 360
          },
          "speed_m_per_s": {
            "type": "number",
            "minimum": 0
          },
          "depth_m": {
            "type": "number",
            "minimum": 0
          }
        }
      },
      "limits": {
        "title": "Declared limits",
        "description": "Restated on every report so a reader of the message alone can judge the gap between demanded and current without holding the configuration.",
        "type": "object",
        "required": [
          "maximum_speed_m_per_s",
          "maximum_depth_m",
          "turn_rate_degrees_per_second",
          "acceleration_m_per_s2",
          "dive_rate_m_per_s"
        ],
        "additionalProperties": false,
        "properties": {
          "maximum_speed_m_per_s": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "maximum_depth_m": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "turn_rate_degrees_per_second": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "acceleration_m_per_s2": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "dive_rate_m_per_s": {
            "type": "number",
            "exclusiveMinimum": 0
          }
        }
      },
      "shortfall": {
        "title": "Unreachable demand",
        "type": "object",
        "required": [
          "quantity",
          "asked",
          "allowed",
          "statement"
        ],
        "additionalProperties": false,
        "properties": {
          "quantity": {
            "type": "string",
            "enum": [
              "speed_m_per_s",
              "depth_m"
            ]
          },
          "asked": {
            "type": "number"
          },
          "allowed": {
            "type": "number"
          },
          "statement": {
            "type": "string",
            "description": "The shortfall in the platform's own words, so every consumer says the same thing about it."
          }
        }
      }
    }
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
      "sensorthings",
      "features"
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
      },
      "features": {
        "type": "object",
        "required": [
          "standard",
          "resources",
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
  "run-cost": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/run-cost.schema.json",
    "title": "drogna model run cost statement",
    "description": "What a forecast run costs, in ticks of simulation time (SRD-v2 FR-114, FR-115; ADR-0043). Published by the model runner and by no other component: the thing that will spend the compute is the thing that declares what it comes to, so the figure the scheduler holds a run against and the figure the run actually occupies cannot disagree. `scripts/gates/check-declared-cost.ts` fails the build if any other component's configuration master declares one.\n\nThe cost is simulation time and never host time. A host-clock duration is a fact about the machine the tab happens to be open on, and admitting one would put a figure inside a run that differs between two replays of the same manifest — AT-04's byte-identical claim is the property that cannot be retrofitted at acceptable cost. What is given up is stated rather than glossed: the magnitude is a declared rate and not a measurement. What is kept is that the cost is spent rather than merely stated.",
    "type": "object",
    "required": [
      "component",
      "scenario_run_id",
      "sim_time",
      "tick",
      "kernel",
      "cost_ticks",
      "work_units",
      "rate_work_per_tick",
      "basis"
    ],
    "additionalProperties": false,
    "properties": {
      "component": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$",
        "description": "The model runner, matching config /component/id. The only component entitled to publish this message."
      },
      "scenario_run_id": {
        "type": "string",
        "minLength": 1,
        "description": "The scenario run this statement belongs to."
      },
      "sim_time": {
        "type": "string",
        "description": "Simulation time at which the statement was made, ISO-8601 UTC with microsecond precision."
      },
      "tick": {
        "type": "integer",
        "minimum": 0,
        "description": "The tick index the runner had observed."
      },
      "kernel": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$",
        "description": "The kernel behind the port whose work this states. A cost is a fact about an implementation, not about the port."
      },
      "cost_ticks": {
        "type": "integer",
        "minimum": 0,
        "description": "Ticks of simulation time a run will occupy. Zero where the configured kernel declares no work — true of a kernel that translates a field rather than propagating a state, and said plainly rather than hidden behind a nominal figure."
      },
      "work_units": {
        "type": "number",
        "minimum": 0,
        "description": "Work the run covers, in the declared units the rate below is expressed in. Carried so the arithmetic that produced cost_ticks is readable rather than trusted."
      },
      "rate_work_per_tick": {
        "type": "number",
        "exclusiveMinimum": 0,
        "description": "Work units one tick buys, from configuration. A declaration about an afloat appliance nobody here has measured."
      },
      "basis": {
        "type": "string",
        "minLength": 1,
        "description": "How the work was arrived at, in the runner's own words, including the nominal cell size the declaration assumed. A reader who disagrees with the cost should be able to see which assumption to argue with."
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
      "start_condition",
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
      "start_condition": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]*$",
        "description": "Which of the offered start conditions this run began in (config.start-conditions.schema.json). Required, and required for the same reason the root seed is: a condition scripts a pre-roll, so a manifest that did not name one would replay a different world under the same run id — silently, since everything downstream of the pre-roll would still be derived correctly from the seed. It also appears inside run_id, which is how two visits that chose differently are kept from sharing an identity; it is recorded here as a field as well because reading meaning out of an identifier is not reading a record."
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
    "description": "The message the publisher publishes on ctl/run-published once a completed run has become visible in one indivisible step. It is how every consumer learns that a forecast exists: nothing in drogna polls the query layer to ask whether anything has changed. From feature 125 the message is also **restated**: the model runner republishes the standing run, read back from the coverage store's own descriptors, when it starts and finds a forecast it did not publish — a reader restarting it from the operator plane, or a start condition whose committed artefact carries the forecast eras and so holds it back for the whole pre-roll. Without that, four components that hold nothing but what this message told them (the scheduler its remaining validity, the offload packager the run it would stage, the analyst its background spread, telemetry its skill ledger) spend the visit believing no forecast exists. A restatement carries the same run_id as the release it restates, which is how a consumer tells the two apart: a consumer that must not act twice on one run compares that id against what it already holds, and one that only needs the standing facts can act on either. It carries the collection identifiers under which the two fields are servable, so a consumer can address them without a configuration file having been edited anywhere.",
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
        "description": "Simulation time at which the run became visible, ISO-8601 UTC with microsecond precision. A restatement carries this same instant, read off the holding's descriptor — not the instant it is being said at, which an earlier version of this description claimed on the grounds that nothing reasoning about the forecast read the field. Two panels did: the Forecast timeline renders how long a run took as the distance from its request to this instant, and drew a 9-tick run as a 510-tick one; the consumers frame renders it as when the basis was published. A restatement is a statement about when the run happened, and the run happened when it happened — which is the convention the coverage store already re-announces a standing holding under. Every field of a restatement therefore equals the release it restates."
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
        "description": "Deterministic model run identifier: the scenario run identifier and the simulation tick the run was requested at. It names the run in every later message and in the coverage store. It was a function of the root seed and the run ordinal until the ordinal was found to be a counter held in the scheduler's memory — which resets when a reader restarts that component from the operator plane, so a restarted scheduler reissued identifiers an earlier instance had already used, and holdings published under them replaced their predecessors silently (ADR-0041 named this as the blocker on committing the forecast eras). Simulation time is the monotonic thing the scheduler hears rather than keeps: it survives a restart, and within one scheduler instance a run is requested at most once per tick. Across instances this narrows the fault rather than closing it — restarting the scheduler at the very tick a run was requested at reissues that identifier, where the counter collided on every restart — and the remainder is closed by the coverage store, which refuses a second set of bytes under a holding id it already holds."
      },
      "run_sequence": {
        "type": "integer",
        "minimum": 0,
        "description": "Which run of this scenario the requesting scheduler instance has reached, counting from zero. It was once the other half of the identifier rule and is not any longer — run_id is derived from the request tick, for the reason recorded there — so this is an ordinal and not an identity: a restarted scheduler counts from zero again while the identifiers it issues keep moving forward. It is carried and currently read by nothing. The earlier description justified it by a run manifest recording it as a fact rather than as a parse; no manifest schema has such a field, so that justification is withdrawn rather than repeated. It stays because removing a required property of a published master is a wire change owed its own reason, and because the ordinal is the one thing the identifier no longer says."
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
          "scheduled",
          "operator"
        ],
        "description": "Why this run is warranted: a sustained divergence, the cadence floor alone (FR-31), or an operator prompt considered under the same policy as a divergence. Labelled wherever runs are shown, so a run a reader asked for is never mistaken for one the world asked for. A prompted request carries divergence and region null, as a scheduled one does."
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
      "initialisation_sim_time",
      "cost_ticks",
      "sub_steps_per_step"
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
      },
      "cost_ticks": {
        "type": "integer",
        "minimum": 0,
        "description": "Ticks of simulation time this run will occupy before it publishes (SRD-v2 FR-114). Zero where the configured kernel declares no work, which is a true statement about a kernel that only translates a field and is drawn as such rather than hidden."
      },
      "sub_steps_per_step": {
        "type": [
          "integer",
          "null"
        ],
        "minimum": 1,
        "description": "Integration sub-steps the kernel took per forecast step on the grid it was actually handed, reported rather than declared. The cost above is a declaration made against a nominal cell size before any analysis arrived; this is what ran. Two different kinds of figure, never collapsed into one (ADR-0036).\n\nNull where the configured kernel integrates nothing — `shift-advect-v1` translates a field, and reporting one sub-step for it would have the same component saying it did no work on the cost topic and one step of work here, about the same run. Absent is not zero and neither is one."
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
  "snapshot": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/snapshot.schema.json",
    "title": "drogna seed-data snapshot header",
    "description": "The header of a committed seed-data artefact: what it holds, what produced it, and what it is only valid against. A snapshot is not a fixture — it is the output of the same components the running system uses, driven at build time by the same pre-roll the browser drives, and a drift gate regenerates it and fails on any difference (Constitution, Data, as amended at 2.1.0). This document is what makes that checkable at load rather than only at build: the run it was made for, the seed it was made from, the digest of the configuration it was made under and the code revision that made it are all recorded here, so a page opening a stale artefact refuses it by name instead of opening a console over fields no component would have authored today. The field bytes follow the header in the order the holdings are listed, byte-plane shuffled and the whole file gzipped; shuffling is lossless and is worth its line because a float32 field's exponent plane is nearly constant while its low mantissa plane is noise, and a compressor that sees them apart does several times better on the smooth eras.",
    "type": "object",
    "required": [
      "format",
      "start_condition",
      "run_id",
      "root_seed",
      "config_digest",
      "code_revision",
      "holdings"
    ],
    "additionalProperties": false,
    "properties": {
      "format": {
        "type": "string",
        "const": "drogna-snapshot-1",
        "description": "The layout of the bytes after this header. A const rather than a version range: a reader that does not know a layout must refuse it, never guess at it."
      },
      "start_condition": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]*$",
        "description": "The start condition this artefact was built for (config.start-conditions.schema.json). A snapshot is specific to one: the pre-roll that produced it is that condition's script."
      },
      "run_id": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]*$",
        "description": "The run identity the holdings carry, stamped into every holding id inside them. Recorded so a page can refuse an artefact whose holdings name a different run than the one it is about to open."
      },
      "root_seed": {
        "type": "integer",
        "minimum": 0,
        "description": "The seed the run was built from. A snapshot fixes it: the fields are a function of it, and a visit that drew a fresh one would sample an ocean the fields do not describe. This is the seed the condition declares, and the reason it declares one."
      },
      "config_digest": {
        "type": "string",
        "pattern": "^sha256:[0-9a-f]{64}$",
        "description": "SHA-256 of the environment generator's configuration document as the build read it. It was once the one thing that decided what the fields contain besides the seed, and the source refuses a mismatch on that basis — which was total coverage while an artefact carried only the ocean. Since feature 125 an artefact also carries the analyst's and the model runner's output, whose contents follow config.analyst and config.model_runner, and neither is in this digest: an artefact built before a change to either is accepted, and the store's own digest check cannot see it because a stale artefact is perfectly self-consistent. check-snapshot-drift is what actually holds the bytes to the code and is unaffected; this field is a narrower guard than it was, and says so rather than claiming a guarantee it no longer gives. Widening it to cover every author is an artefact-format change and is recorded in specs/125-forecast-eras/spec.md."
      },
      "code_revision": {
        "type": "string",
        "description": "The commit the artefact was generated at, for the record. Not enforced at load: the drift gate is what holds the bytes to the code, and a revision comparison would refuse every artefact on every uncommitted working tree while proving nothing the gate does not prove better."
      },
      "holdings": {
        "type": "array",
        "minItems": 1,
        "description": "The holdings this artefact carries, in publication order — the order the source republishes them in, which is the order the era pointers were moved in the run that produced them.",
        "items": {
          "type": "object",
          "required": [
            "descriptor",
            "byte_length"
          ],
          "additionalProperties": false,
          "properties": {
            "descriptor": {
              "$ref": "coverage-holding.schema.json",
              "description": "The holding's descriptor, whole and unaltered — including the ground-truth manifest and the digest of its field. The digest is what the coverage store checks the bytes against when the source publishes them, which is how an artefact whose bytes were corrupted in transit is refused by the same check that refuses a corrupted live publication."
            },
            "byte_length": {
              "type": "integer",
              "minimum": 0,
              "description": "Length of this holding's field bytes in the body, repeated here so the body can be cut into holdings before any descriptor is trusted."
            }
          }
        }
      }
    }
  },
  "telemetry-report": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.harness.invalid/telemetry-report.schema.json",
    "title": "drogna telemetry report",
    "description": "The telemetry component's current account, served on its seam path (SRD-v2 FR-35): the latest residual statistics and forecast skill exactly as last published on the telemetry topic (telemetry.schema.json shapes, embedded whole), and throughput counted per simulation second — the only rate that means anything in a harness whose pace is a dial.",
    "type": "object",
    "required": [
      "schema_version",
      "statistics",
      "skill",
      "throughput",
      "regions",
      "latency"
    ],
    "additionalProperties": false,
    "properties": {
      "schema_version": {
        "type": "integer",
        "const": 1
      },
      "statistics": {
        "oneOf": [
          {
            "$ref": "telemetry.schema.json#/$defs/residual_statistics"
          },
          {
            "type": "null"
          }
        ]
      },
      "skill": {
        "oneOf": [
          {
            "$ref": "telemetry.schema.json#/$defs/forecast_skill"
          },
          {
            "type": "null"
          }
        ]
      },
      "throughput": {
        "type": "object",
        "required": [
          "window_sim_seconds",
          "observations_per_sim_second",
          "telemetry_messages_per_sim_second"
        ],
        "additionalProperties": false,
        "properties": {
          "window_sim_seconds": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "observations_per_sim_second": {
            "type": "number",
            "minimum": 0
          },
          "telemetry_messages_per_sim_second": {
            "type": "number",
            "minimum": 0
          }
        }
      },
      "regions": {
        "type": "array",
        "description": "The region-level statistics as last published, one entry per region of the configured grid that has seen at least one residual. A region nobody sampled is absent rather than present with zeroes: an unsampled region and a region scoring zero are different facts and only one of them is a measurement. Empty until residuals arrive.",
        "items": {
          "$ref": "telemetry.schema.json#/$defs/residual_statistics"
        }
      },
      "latency": {
        "type": "object",
        "required": [
          "basis",
          "sample_count",
          "mean_sim_seconds",
          "maximum_sim_seconds"
        ],
        "additionalProperties": false,
        "description": "End-to-end latency in SIMULATION seconds: from the instant an observation was taken to the instant its residual was folded into these statistics. Simulation time throughout — a wall-clock figure would measure the host's mood and the position of the rate dial, neither of which is the harness's subject (Constitution I, ADR-0006).",
        "properties": {
          "basis": {
            "type": "string",
            "minLength": 1,
            "description": "What the figure measures, in words, so a reader need not infer it from the field name."
          },
          "sample_count": {
            "type": "integer",
            "minimum": 0,
            "description": "Residuals the figures were measured over, since the current forecast run was published."
          },
          "mean_sim_seconds": {
            "type": [
              "number",
              "null"
            ],
            "description": "Mean, or null when no residual has been folded yet: a zero here would read as instantaneous."
          },
          "maximum_sim_seconds": {
            "type": [
              "number",
              "null"
            ],
            "description": "Worst seen, or null on the same terms."
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
          },
          "breach": {
            "$ref": "#/$defs/breach_state"
          }
        }
      },
      "breach_state": {
        "title": "How close this is to raising a divergence",
        "description": "The monitor's own account of the drift that will trigger a new forecast: the threshold it is scoring against, and how far the persistence streak has got toward the run length that raises the event. Optional, and carried on the sample rather than derived by a consumer, because a display that recomputed the streak from the samples it happened to receive would be a second implementation of the rule, free to disagree with the monitor about whether the loop is about to turn (SRD-v2 FR-58).",
        "type": "object",
        "required": [
          "threshold_m_per_s",
          "streak",
          "persistence_count"
        ],
        "additionalProperties": false,
        "properties": {
          "threshold_m_per_s": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "streak": {
            "type": "integer",
            "minimum": 0,
            "description": "Consecutive breaching samples so far. Reset by a sample inside the threshold, and by a new forecast run: evidence against a superseded field is discarded rather than carried."
          },
          "persistence_count": {
            "type": "integer",
            "exclusiveMinimum": 0,
            "description": "How long the streak must run before a divergence is raised. A single spike is never sufficient."
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
        "description": "The accepted-or-declined outcome the scheduler (C-12) records for every divergence, so that a declined divergence is visible rather than merely absent. An operator prompt is recorded the same way and decided under the same policy, which is why divergence_id is nullable: a prompt has no divergence, and naming one would be an invention.",
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
          "run_id",
          "shortfall_ticks"
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
            "type": [
              "string",
              "null"
            ],
            "description": "The divergence this decision was about, or null where the scheduler was deciding on an operator prompt rather than on a divergence."
          },
          "decision": {
            "type": "string",
            "enum": [
              "accepted",
              "minimum-interval",
              "duplicate-outstanding",
              "held-for-cost",
              "abandoned"
            ],
            "description": "accepted means a run was requested. The others name the rule that held, declined or ended it, rather than collapsing every refusal into one word. held-for-cost is not a decline (SRD-v2 FR-115): the run is warranted and affordable later, and it is released as the standing forecast's remaining validity decays toward the run's cost. A divergence is never held — the world has already contradicted the standing forecast, so its nominal remaining validity is worth nothing. abandoned is not a decision about a new run but the end of an old one: the scheduler waited longer than the run's declared cost plus the release margin and released it, because nothing was ever going to publish it. It is published rather than merely counted because a run that vanished for want of a listener is otherwise indistinguishable from a quiet loop, which is the confusion FR-32 exists to prevent."
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
          },
          "shortfall_ticks": {
            "type": [
              "integer",
              "null"
            ],
            "description": "For held-for-cost, how many ticks of the standing forecast's validity must still decay before the run is released — the hold said in the units the hold is measured in, so a reader need not subtract two instants to learn how long. Null for every other decision, because they have no shortfall and a zero would read as one that had just expired."
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
