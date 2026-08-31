// GENERATED — DO NOT EDIT.
// Source of truth: contracts/schemas/*.schema.json (Constitution III).
// Regenerate with: pnpm generate. CI fails on drift.

import type { Topology } from './types.js';

export const topology: Topology = {
  "generator": "scripts/derive-topology.ts",
  "roles": [
    {
      "role": "clock",
      "rules": [
        {
          "access": "write",
          "filter": "ctl/clock"
        },
        {
          "access": "write",
          "filter": "ctl/heartbeat"
        }
      ]
    },
    {
      "role": "broker",
      "rules": [
        {
          "access": "write",
          "filter": "ctl/heartbeat"
        },
        {
          "access": "read",
          "filter": "ctl/clock"
        }
      ]
    },
    {
      "role": "boundary",
      "rules": [
        {
          "access": "write",
          "filter": "ctl/boundary/denial"
        },
        {
          "access": "write",
          "filter": "ctl/heartbeat"
        },
        {
          "access": "read",
          "filter": "ctl/clock"
        }
      ]
    },
    {
      "role": "env-generator",
      "rules": [
        {
          "access": "write",
          "filter": "ctl/heartbeat"
        },
        {
          "access": "read",
          "filter": "ctl/operator/command"
        },
        {
          "access": "read",
          "filter": "ctl/clock"
        }
      ]
    },
    {
      "role": "snapshot-source",
      "rules": [
        {
          "access": "write",
          "filter": "ctl/heartbeat"
        },
        {
          "access": "read",
          "filter": "ctl/clock"
        }
      ]
    },
    {
      "role": "platform",
      "rules": [
        {
          "access": "write",
          "filter": "obs/ownship/+"
        },
        {
          "access": "write",
          "filter": "ctl/platform/state"
        },
        {
          "access": "write",
          "filter": "ctl/heartbeat"
        },
        {
          "access": "read",
          "filter": "ctl/operator/command"
        },
        {
          "access": "read",
          "filter": "ctl/platform/demand"
        },
        {
          "access": "read",
          "filter": "ctl/clock"
        }
      ]
    },
    {
      "role": "sensors",
      "rules": [
        {
          "access": "write",
          "filter": "obs/+/+"
        },
        {
          "access": "write",
          "filter": "ctl/heartbeat"
        },
        {
          "access": "read",
          "filter": "ctl/operator/command"
        },
        {
          "access": "read",
          "filter": "obs/ownship/+"
        },
        {
          "access": "read",
          "filter": "ctl/clock"
        }
      ]
    },
    {
      "role": "ingest",
      "rules": [
        {
          "access": "write",
          "filter": "ctl/heartbeat"
        },
        {
          "access": "read",
          "filter": "obs/#"
        },
        {
          "access": "read",
          "filter": "ctl/clock"
        }
      ]
    },
    {
      "role": "feature-store",
      "rules": [
        {
          "access": "write",
          "filter": "ctl/heartbeat"
        },
        {
          "access": "read",
          "filter": "ctl/clock"
        }
      ]
    },
    {
      "role": "observation-store",
      "rules": [
        {
          "access": "write",
          "filter": "ctl/heartbeat"
        },
        {
          "access": "read",
          "filter": "ctl/clock"
        }
      ]
    },
    {
      "role": "query",
      "rules": [
        {
          "access": "write",
          "filter": "ctl/heartbeat"
        },
        {
          "access": "read",
          "filter": "ctl/clock"
        }
      ]
    },
    {
      "role": "monitor",
      "rules": [
        {
          "access": "write",
          "filter": "ctl/divergence"
        },
        {
          "access": "write",
          "filter": "ctl/telemetry"
        },
        {
          "access": "write",
          "filter": "ctl/heartbeat"
        },
        {
          "access": "read",
          "filter": "ctl/operator/command"
        },
        {
          "access": "read",
          "filter": "obs/#"
        },
        {
          "access": "read",
          "filter": "ctl/clock"
        }
      ]
    },
    {
      "role": "scheduler",
      "rules": [
        {
          "access": "write",
          "filter": "ctl/run/request"
        },
        {
          "access": "write",
          "filter": "ctl/telemetry"
        },
        {
          "access": "write",
          "filter": "ctl/heartbeat"
        },
        {
          "access": "read",
          "filter": "ctl/operator/command"
        },
        {
          "access": "read",
          "filter": "ctl/divergence"
        },
        {
          "access": "read",
          "filter": "ctl/run/published"
        },
        {
          "access": "read",
          "filter": "ctl/clock"
        }
      ]
    },
    {
      "role": "planner",
      "rules": [
        {
          "access": "write",
          "filter": "ctl/plan"
        },
        {
          "access": "write",
          "filter": "ctl/heartbeat"
        },
        {
          "access": "read",
          "filter": "ctl/operator/command"
        },
        {
          "access": "read",
          "filter": "obs/#"
        },
        {
          "access": "read",
          "filter": "ctl/analysis/published"
        },
        {
          "access": "read",
          "filter": "ctl/clock"
        }
      ]
    },
    {
      "role": "analyst",
      "rules": [
        {
          "access": "write",
          "filter": "ctl/analysis/published"
        },
        {
          "access": "write",
          "filter": "ctl/heartbeat"
        },
        {
          "access": "read",
          "filter": "obs/#"
        },
        {
          "access": "read",
          "filter": "ctl/run/request"
        },
        {
          "access": "read",
          "filter": "ctl/run/published"
        },
        {
          "access": "read",
          "filter": "ctl/clock"
        }
      ]
    },
    {
      "role": "model-runner",
      "rules": [
        {
          "access": "write",
          "filter": "ctl/run/started"
        },
        {
          "access": "write",
          "filter": "ctl/run/published"
        },
        {
          "access": "write",
          "filter": "ctl/heartbeat"
        },
        {
          "access": "read",
          "filter": "ctl/analysis/published"
        },
        {
          "access": "read",
          "filter": "ctl/clock"
        }
      ]
    },
    {
      "role": "coverage-store",
      "rules": [
        {
          "access": "write",
          "filter": "cov/holdings"
        },
        {
          "access": "write",
          "filter": "ctl/heartbeat"
        },
        {
          "access": "read",
          "filter": "ctl/operator/command"
        },
        {
          "access": "read",
          "filter": "ctl/clock"
        }
      ]
    },
    {
      "role": "advisory-source",
      "rules": [
        {
          "access": "write",
          "filter": "adv/advisories"
        },
        {
          "access": "write",
          "filter": "ctl/heartbeat"
        },
        {
          "access": "read",
          "filter": "ctl/operator/command"
        },
        {
          "access": "read",
          "filter": "ctl/clock"
        }
      ]
    },
    {
      "role": "advisory-store",
      "rules": [
        {
          "access": "write",
          "filter": "ctl/heartbeat"
        },
        {
          "access": "read",
          "filter": "adv/advisories"
        },
        {
          "access": "read",
          "filter": "ctl/clock"
        }
      ]
    },
    {
      "role": "offload",
      "rules": [
        {
          "access": "write",
          "filter": "ctl/offload"
        },
        {
          "access": "write",
          "filter": "ctl/heartbeat"
        },
        {
          "access": "read",
          "filter": "ctl/operator/command"
        },
        {
          "access": "read",
          "filter": "ctl/run/published"
        },
        {
          "access": "read",
          "filter": "ctl/clock"
        }
      ]
    },
    {
      "role": "telemetry",
      "rules": [
        {
          "access": "write",
          "filter": "ctl/telemetry"
        },
        {
          "access": "write",
          "filter": "ctl/heartbeat"
        },
        {
          "access": "read",
          "filter": "ctl/operator/command"
        },
        {
          "access": "read",
          "filter": "ctl/telemetry"
        },
        {
          "access": "read",
          "filter": "ctl/run/published"
        },
        {
          "access": "read",
          "filter": "obs/#"
        },
        {
          "access": "read",
          "filter": "ctl/clock"
        }
      ]
    },
    {
      "role": "operator",
      "rules": [
        {
          "access": "write",
          "filter": "ctl/heartbeat"
        },
        {
          "access": "write",
          "filter": "ctl/platform/demand"
        },
        {
          "access": "write",
          "filter": "ctl/operator/command"
        },
        {
          "access": "read",
          "filter": "ctl/heartbeat"
        },
        {
          "access": "read",
          "filter": "ctl/clock"
        }
      ]
    },
    {
      "role": "shell",
      "rules": [
        {
          "access": "read",
          "filter": "#"
        }
      ]
    }
  ],
  "components": [
    {
      "id": "advisory-source",
      "role": "advisory-source",
      "source_root": null
    },
    {
      "id": "advisory-store",
      "role": "advisory-store",
      "source_root": null
    },
    {
      "id": "analyst",
      "role": "analyst",
      "source_root": "app/src/backend/analyst"
    },
    {
      "id": "boundary",
      "role": "boundary",
      "source_root": "app/src/backend/boundary"
    },
    {
      "id": "broker",
      "role": "broker",
      "source_root": "app/src/backend/broker"
    },
    {
      "id": "clock",
      "role": "clock",
      "source_root": "app/src/backend/clock"
    },
    {
      "id": "coverage-store",
      "role": "coverage-store",
      "source_root": "app/src/backend/coverage-store"
    },
    {
      "id": "env-generator",
      "role": "env-generator",
      "source_root": "app/src/backend/env-generator"
    },
    {
      "id": "feature-store",
      "role": "feature-store",
      "source_root": "app/src/backend/feature-store"
    },
    {
      "id": "ingest",
      "role": "ingest",
      "source_root": "app/src/backend/ingest"
    },
    {
      "id": "model-runner",
      "role": "model-runner",
      "source_root": "app/src/backend/model-runner"
    },
    {
      "id": "monitor",
      "role": "monitor",
      "source_root": "app/src/backend/monitor"
    },
    {
      "id": "observation-store",
      "role": "observation-store",
      "source_root": "app/src/backend/observation-store"
    },
    {
      "id": "offload",
      "role": "offload",
      "source_root": "app/src/backend/offload"
    },
    {
      "id": "operator",
      "role": "operator",
      "source_root": "app/src/backend/operator"
    },
    {
      "id": "planner",
      "role": "planner",
      "source_root": "app/src/backend/planner"
    },
    {
      "id": "platform",
      "role": "platform",
      "source_root": "app/src/backend/platform"
    },
    {
      "id": "query",
      "role": "query",
      "source_root": "app/src/backend/query"
    },
    {
      "id": "scheduler",
      "role": "scheduler",
      "source_root": "app/src/backend/scheduler"
    },
    {
      "id": "sensors",
      "role": "sensors",
      "source_root": "app/src/backend/sensors"
    },
    {
      "id": "shell",
      "role": "shell",
      "source_root": "app/src/shell"
    },
    {
      "id": "snapshot-source",
      "role": "snapshot-source",
      "source_root": null
    },
    {
      "id": "telemetry",
      "role": "telemetry",
      "source_root": "app/src/backend/telemetry"
    }
  ],
  "topics": [
    {
      "topic": "adv/advisories",
      "namespace": "adv",
      "schema": "contracts/schemas/advisory.schema.json",
      "publishers": [
        "advisory-source"
      ],
      "subscribers": [
        "advisory-store",
        "shell"
      ],
      "named_by": [
        {
          "component": "advisory-source",
          "path": "app/config/run.json",
          "line": 1030,
          "constant": "/advisory_source/topics/advisory"
        },
        {
          "component": "advisory-store",
          "path": "app/config/run.json",
          "line": 1030,
          "constant": "/advisory_store/topics/advisory"
        },
        {
          "component": "shell",
          "path": "app/config/run.json",
          "line": 1392,
          "constant": "/shell/topics/advisories"
        }
      ]
    },
    {
      "topic": "cov/holdings",
      "namespace": "cov",
      "schema": "contracts/schemas/holding-published.schema.json",
      "publishers": [
        "coverage-store"
      ],
      "subscribers": [
        "shell"
      ],
      "named_by": [
        {
          "component": "coverage-store",
          "path": "app/config/run.json",
          "line": 435,
          "constant": "/coverage_store/topics/published"
        },
        {
          "component": "shell",
          "path": "app/config/run.json",
          "line": 1388,
          "constant": "/shell/topics/holdings"
        }
      ]
    },
    {
      "topic": "ctl/analysis/published",
      "namespace": "ctl",
      "schema": null,
      "publishers": [
        "analyst"
      ],
      "subscribers": [
        "model-runner",
        "planner",
        "shell"
      ],
      "named_by": [
        {
          "component": "model-runner",
          "path": "app/config/run.json",
          "line": 689,
          "constant": "/model_runner/topics/analysis_published"
        },
        {
          "component": "analyst",
          "path": "app/config/run.json",
          "line": 689,
          "constant": "/analyst/topics/analysis_published"
        },
        {
          "component": "shell",
          "path": "app/config/run.json",
          "line": 689,
          "constant": "/shell/topics/analysis_published"
        }
      ]
    },
    {
      "topic": "ctl/boundary/denial",
      "namespace": "ctl",
      "schema": "contracts/schemas/boundary-denial.schema.json",
      "publishers": [
        "boundary"
      ],
      "subscribers": [
        "shell"
      ],
      "named_by": [
        {
          "component": "boundary",
          "path": "app/config/run.json",
          "line": 294,
          "constant": "/boundary/topics/denial"
        }
      ]
    },
    {
      "topic": "ctl/clock",
      "namespace": "ctl",
      "schema": "contracts/schemas/clock.schema.json",
      "publishers": [
        "clock"
      ],
      "subscribers": [
        "advisory-source",
        "advisory-store",
        "analyst",
        "boundary",
        "broker",
        "coverage-store",
        "env-generator",
        "feature-store",
        "ingest",
        "model-runner",
        "monitor",
        "observation-store",
        "offload",
        "operator",
        "planner",
        "platform",
        "query",
        "scheduler",
        "sensors",
        "shell",
        "snapshot-source",
        "telemetry"
      ],
      "named_by": [
        {
          "component": "clock",
          "path": "app/config/run.json",
          "line": 13,
          "constant": "/clock/topics/clock"
        },
        {
          "component": "env-generator",
          "path": "app/config/run.json",
          "line": 13,
          "constant": "/env_generator/topics/clock"
        },
        {
          "component": "coverage-store",
          "path": "app/config/run.json",
          "line": 13,
          "constant": "/coverage_store/topics/clock"
        },
        {
          "component": "platform",
          "path": "app/config/run.json",
          "line": 13,
          "constant": "/platform/topics/clock"
        },
        {
          "component": "sensors",
          "path": "app/config/run.json",
          "line": 13,
          "constant": "/sensors/topics/clock"
        },
        {
          "component": "ingest",
          "path": "app/config/run.json",
          "line": 13,
          "constant": "/ingest/topics/clock"
        },
        {
          "component": "observation-store",
          "path": "app/config/run.json",
          "line": 13,
          "constant": "/observation_store/topics/clock"
        },
        {
          "component": "query",
          "path": "app/config/run.json",
          "line": 13,
          "constant": "/query/topics/clock"
        },
        {
          "component": "monitor",
          "path": "app/config/run.json",
          "line": 13,
          "constant": "/monitor/topics/clock"
        },
        {
          "component": "scheduler",
          "path": "app/config/run.json",
          "line": 13,
          "constant": "/scheduler/topics/clock"
        },
        {
          "component": "model-runner",
          "path": "app/config/run.json",
          "line": 13,
          "constant": "/model_runner/topics/clock"
        },
        {
          "component": "analyst",
          "path": "app/config/run.json",
          "line": 13,
          "constant": "/analyst/topics/clock"
        },
        {
          "component": "planner",
          "path": "app/config/run.json",
          "line": 13,
          "constant": "/planner/topics/clock"
        },
        {
          "component": "telemetry",
          "path": "app/config/run.json",
          "line": 13,
          "constant": "/telemetry/topics/clock"
        },
        {
          "component": "operator",
          "path": "app/config/run.json",
          "line": 13,
          "constant": "/operator/topics/clock"
        },
        {
          "component": "advisory-source",
          "path": "app/config/run.json",
          "line": 13,
          "constant": "/advisory_source/topics/clock"
        },
        {
          "component": "advisory-store",
          "path": "app/config/run.json",
          "line": 13,
          "constant": "/advisory_store/topics/clock"
        },
        {
          "component": "offload",
          "path": "app/config/run.json",
          "line": 13,
          "constant": "/offload/topics/clock"
        },
        {
          "component": "feature-store",
          "path": "app/config/run.json",
          "line": 13,
          "constant": "/feature_store/topics/clock"
        },
        {
          "component": "shell",
          "path": "app/config/run.json",
          "line": 13,
          "constant": "/shell/topics/clock"
        },
        {
          "component": "snapshot-source",
          "path": "app/config/run.json",
          "line": 13,
          "constant": "/snapshot_source/topics/clock"
        }
      ]
    },
    {
      "topic": "ctl/divergence",
      "namespace": "ctl",
      "schema": "contracts/schemas/divergence.schema.json",
      "publishers": [
        "monitor"
      ],
      "subscribers": [
        "scheduler",
        "shell"
      ],
      "named_by": [
        {
          "component": "monitor",
          "path": "app/config/run.json",
          "line": 639,
          "constant": "/monitor/topics/divergence"
        },
        {
          "component": "scheduler",
          "path": "app/config/run.json",
          "line": 639,
          "constant": "/scheduler/topics/divergence"
        }
      ]
    },
    {
      "topic": "ctl/heartbeat",
      "namespace": "ctl",
      "schema": "contracts/schemas/heartbeat.schema.json",
      "publishers": [
        "advisory-source",
        "advisory-store",
        "analyst",
        "boundary",
        "broker",
        "clock",
        "coverage-store",
        "env-generator",
        "feature-store",
        "ingest",
        "model-runner",
        "monitor",
        "observation-store",
        "offload",
        "operator",
        "planner",
        "platform",
        "query",
        "scheduler",
        "sensors",
        "snapshot-source",
        "telemetry"
      ],
      "subscribers": [
        "operator",
        "shell"
      ],
      "named_by": [
        {
          "component": "operator",
          "path": "app/config/run.json",
          "line": 822,
          "constant": "/operator/topics/heartbeat"
        },
        {
          "component": "shell",
          "path": "app/config/run.json",
          "line": 822,
          "constant": "/shell/topics/heartbeat"
        }
      ]
    },
    {
      "topic": "ctl/offload",
      "namespace": "ctl",
      "schema": "contracts/schemas/offload-telemetry.schema.json",
      "publishers": [
        "offload"
      ],
      "subscribers": [
        "shell"
      ],
      "named_by": [
        {
          "component": "offload",
          "path": "app/config/run.json",
          "line": 1063,
          "constant": "/offload/topics/offload"
        }
      ]
    },
    {
      "topic": "ctl/operator/command",
      "namespace": "ctl",
      "schema": "contracts/schemas/operator-command.schema.json",
      "publishers": [
        "operator"
      ],
      "subscribers": [
        "advisory-source",
        "coverage-store",
        "env-generator",
        "monitor",
        "offload",
        "planner",
        "platform",
        "scheduler",
        "sensors",
        "shell",
        "telemetry"
      ],
      "named_by": [
        {
          "component": "env-generator",
          "path": "app/config/run.json",
          "line": 307,
          "constant": "/env_generator/topics/command"
        },
        {
          "component": "coverage-store",
          "path": "app/config/run.json",
          "line": 307,
          "constant": "/coverage_store/topics/command"
        },
        {
          "component": "platform",
          "path": "app/config/run.json",
          "line": 307,
          "constant": "/platform/topics/command"
        },
        {
          "component": "sensors",
          "path": "app/config/run.json",
          "line": 307,
          "constant": "/sensors/topics/command"
        },
        {
          "component": "monitor",
          "path": "app/config/run.json",
          "line": 307,
          "constant": "/monitor/topics/command"
        },
        {
          "component": "scheduler",
          "path": "app/config/run.json",
          "line": 307,
          "constant": "/scheduler/topics/command"
        },
        {
          "component": "planner",
          "path": "app/config/run.json",
          "line": 307,
          "constant": "/planner/topics/command"
        },
        {
          "component": "telemetry",
          "path": "app/config/run.json",
          "line": 307,
          "constant": "/telemetry/topics/command"
        },
        {
          "component": "operator",
          "path": "app/config/run.json",
          "line": 307,
          "constant": "/operator/topics/command"
        },
        {
          "component": "advisory-source",
          "path": "app/config/run.json",
          "line": 307,
          "constant": "/advisory_source/topics/command"
        },
        {
          "component": "offload",
          "path": "app/config/run.json",
          "line": 307,
          "constant": "/offload/topics/command"
        }
      ]
    },
    {
      "topic": "ctl/plan",
      "namespace": "ctl",
      "schema": "contracts/schemas/plan.schema.json",
      "publishers": [
        "planner"
      ],
      "subscribers": [
        "shell"
      ],
      "named_by": [
        {
          "component": "planner",
          "path": "app/config/run.json",
          "line": 748,
          "constant": "/planner/topics/plan"
        },
        {
          "component": "shell",
          "path": "app/config/run.json",
          "line": 748,
          "constant": "/shell/topics/plan"
        }
      ]
    },
    {
      "topic": "ctl/platform/demand",
      "namespace": "ctl",
      "schema": "contracts/schemas/platform-demand.schema.json",
      "publishers": [
        "operator"
      ],
      "subscribers": [
        "platform",
        "shell"
      ],
      "named_by": [
        {
          "component": "platform",
          "path": "app/config/run.json",
          "line": 453,
          "constant": "/platform/topics/demand"
        },
        {
          "component": "operator",
          "path": "app/config/run.json",
          "line": 823,
          "constant": "/operator/topics/platform_demand"
        }
      ]
    },
    {
      "topic": "ctl/platform/state",
      "namespace": "ctl",
      "schema": "contracts/schemas/platform-state.schema.json",
      "publishers": [
        "platform"
      ],
      "subscribers": [
        "shell"
      ],
      "named_by": [
        {
          "component": "platform",
          "path": "app/config/run.json",
          "line": 454,
          "constant": "/platform/topics/state"
        },
        {
          "component": "shell",
          "path": "app/config/run.json",
          "line": 1394,
          "constant": "/shell/topics/platform_state"
        }
      ]
    },
    {
      "topic": "ctl/run/published",
      "namespace": "ctl",
      "schema": "contracts/schemas/run-published.schema.json",
      "publishers": [
        "model-runner"
      ],
      "subscribers": [
        "analyst",
        "offload",
        "scheduler",
        "shell",
        "telemetry"
      ],
      "named_by": [
        {
          "component": "scheduler",
          "path": "app/config/run.json",
          "line": 669,
          "constant": "/scheduler/topics/run_published"
        },
        {
          "component": "model-runner",
          "path": "app/config/run.json",
          "line": 669,
          "constant": "/model_runner/topics/run_published"
        },
        {
          "component": "analyst",
          "path": "app/config/run.json",
          "line": 669,
          "constant": "/analyst/topics/run_published"
        },
        {
          "component": "planner",
          "path": "app/config/run.json",
          "line": 669,
          "constant": "/planner/topics/run_published"
        },
        {
          "component": "telemetry",
          "path": "app/config/run.json",
          "line": 669,
          "constant": "/telemetry/topics/run_published"
        },
        {
          "component": "offload",
          "path": "app/config/run.json",
          "line": 669,
          "constant": "/offload/topics/run_published"
        },
        {
          "component": "shell",
          "path": "app/config/run.json",
          "line": 669,
          "constant": "/shell/topics/run_published"
        }
      ]
    },
    {
      "topic": "ctl/run/request",
      "namespace": "ctl",
      "schema": "contracts/schemas/run-request.schema.json",
      "publishers": [
        "scheduler"
      ],
      "subscribers": [
        "analyst",
        "shell"
      ],
      "named_by": [
        {
          "component": "scheduler",
          "path": "app/config/run.json",
          "line": 668,
          "constant": "/scheduler/topics/run_request"
        },
        {
          "component": "model-runner",
          "path": "app/config/run.json",
          "line": 668,
          "constant": "/model_runner/topics/run_request"
        },
        {
          "component": "analyst",
          "path": "app/config/run.json",
          "line": 668,
          "constant": "/analyst/topics/run_request"
        }
      ]
    },
    {
      "topic": "ctl/run/started",
      "namespace": "ctl",
      "schema": "contracts/schemas/run-started.schema.json",
      "publishers": [
        "model-runner"
      ],
      "subscribers": [
        "shell"
      ],
      "named_by": [
        {
          "component": "model-runner",
          "path": "app/config/run.json",
          "line": 690,
          "constant": "/model_runner/topics/run_started"
        }
      ]
    },
    {
      "topic": "ctl/telemetry",
      "namespace": "ctl",
      "schema": "contracts/schemas/telemetry.schema.json",
      "publishers": [
        "monitor",
        "scheduler",
        "telemetry"
      ],
      "subscribers": [
        "shell",
        "telemetry"
      ],
      "named_by": [
        {
          "component": "monitor",
          "path": "app/config/run.json",
          "line": 640,
          "constant": "/monitor/topics/telemetry"
        },
        {
          "component": "scheduler",
          "path": "app/config/run.json",
          "line": 640,
          "constant": "/scheduler/topics/telemetry"
        },
        {
          "component": "telemetry",
          "path": "app/config/run.json",
          "line": 640,
          "constant": "/telemetry/topics/telemetry"
        },
        {
          "component": "shell",
          "path": "app/config/run.json",
          "line": 640,
          "constant": "/shell/topics/telemetry"
        }
      ]
    },
    {
      "topic": "obs/#",
      "namespace": "obs",
      "schema": "contracts/schemas/observation.schema.json",
      "publishers": [],
      "subscribers": [
        "analyst",
        "ingest",
        "monitor",
        "planner",
        "shell",
        "telemetry"
      ],
      "named_by": [
        {
          "component": "ingest",
          "path": "app/config/run.json",
          "line": 598,
          "constant": "/ingest/topics/observations"
        },
        {
          "component": "monitor",
          "path": "app/config/run.json",
          "line": 598,
          "constant": "/monitor/topics/observations"
        },
        {
          "component": "analyst",
          "path": "app/config/run.json",
          "line": 598,
          "constant": "/analyst/topics/observations"
        },
        {
          "component": "planner",
          "path": "app/config/run.json",
          "line": 598,
          "constant": "/planner/topics/observations"
        },
        {
          "component": "telemetry",
          "path": "app/config/run.json",
          "line": 598,
          "constant": "/telemetry/topics/observations"
        },
        {
          "component": "shell",
          "path": "app/config/run.json",
          "line": 598,
          "constant": "/shell/topics/observations"
        }
      ]
    },
    {
      "topic": "obs/ownship/+",
      "namespace": "obs",
      "schema": "contracts/schemas/observation.schema.json",
      "publishers": [
        "platform",
        "sensors"
      ],
      "subscribers": [
        "analyst",
        "ingest",
        "monitor",
        "planner",
        "sensors",
        "shell",
        "telemetry"
      ],
      "named_by": [
        {
          "component": "sensors",
          "path": "app/config/run.json",
          "line": 526,
          "constant": "/sensors/topics/ownship"
        }
      ]
    },
    {
      "topic": "obs/platform-a/pressure-200m",
      "namespace": "obs",
      "schema": "contracts/schemas/observation.schema.json",
      "publishers": [
        "sensors"
      ],
      "subscribers": [
        "analyst",
        "ingest",
        "monitor",
        "planner",
        "shell",
        "telemetry"
      ],
      "named_by": [
        {
          "component": "sensors",
          "path": "app/config/run.json",
          "line": 1,
          "constant": "/sensors/instruments/3/datastream_id"
        }
      ]
    },
    {
      "topic": "obs/platform-a/salinity-050m",
      "namespace": "obs",
      "schema": "contracts/schemas/observation.schema.json",
      "publishers": [
        "sensors"
      ],
      "subscribers": [
        "analyst",
        "ingest",
        "monitor",
        "planner",
        "shell",
        "telemetry"
      ],
      "named_by": [
        {
          "component": "sensors",
          "path": "app/config/run.json",
          "line": 1,
          "constant": "/sensors/instruments/1/datastream_id"
        }
      ]
    },
    {
      "topic": "obs/platform-a/temperature-050m",
      "namespace": "obs",
      "schema": "contracts/schemas/observation.schema.json",
      "publishers": [
        "sensors"
      ],
      "subscribers": [
        "analyst",
        "ingest",
        "monitor",
        "planner",
        "shell",
        "telemetry"
      ],
      "named_by": [
        {
          "component": "sensors",
          "path": "app/config/run.json",
          "line": 1,
          "constant": "/sensors/instruments/0/datastream_id"
        }
      ]
    },
    {
      "topic": "obs/platform-a/temperature-200m",
      "namespace": "obs",
      "schema": "contracts/schemas/observation.schema.json",
      "publishers": [
        "sensors"
      ],
      "subscribers": [
        "analyst",
        "ingest",
        "monitor",
        "planner",
        "shell",
        "telemetry"
      ],
      "named_by": [
        {
          "component": "sensors",
          "path": "app/config/run.json",
          "line": 1,
          "constant": "/sensors/instruments/2/datastream_id"
        }
      ]
    }
  ]
};
