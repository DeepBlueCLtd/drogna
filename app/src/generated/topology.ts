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
          "filter": "obs/#"
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
          "filter": "ctl/run/request"
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
      "id": "telemetry",
      "role": "telemetry",
      "source_root": "app/src/backend/telemetry"
    }
  ],
  "topics": [
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
          "line": 175,
          "constant": "/coverage_store/topics/published"
        },
        {
          "component": "shell",
          "path": "app/config/run.json",
          "line": 418,
          "constant": "/shell/topics/holdings"
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
          "line": 79,
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
        "boundary",
        "broker",
        "coverage-store",
        "env-generator",
        "feature-store",
        "ingest",
        "model-runner",
        "monitor",
        "observation-store",
        "operator",
        "planner",
        "query",
        "scheduler",
        "sensors",
        "shell",
        "telemetry"
      ],
      "named_by": [
        {
          "component": "clock",
          "path": "app/config/run.json",
          "line": 12,
          "constant": "/clock/topics/clock"
        },
        {
          "component": "env-generator",
          "path": "app/config/run.json",
          "line": 12,
          "constant": "/env_generator/topics/clock"
        },
        {
          "component": "coverage-store",
          "path": "app/config/run.json",
          "line": 12,
          "constant": "/coverage_store/topics/clock"
        },
        {
          "component": "sensors",
          "path": "app/config/run.json",
          "line": 12,
          "constant": "/sensors/topics/clock"
        },
        {
          "component": "ingest",
          "path": "app/config/run.json",
          "line": 12,
          "constant": "/ingest/topics/clock"
        },
        {
          "component": "observation-store",
          "path": "app/config/run.json",
          "line": 12,
          "constant": "/observation_store/topics/clock"
        },
        {
          "component": "query",
          "path": "app/config/run.json",
          "line": 12,
          "constant": "/query/topics/clock"
        },
        {
          "component": "monitor",
          "path": "app/config/run.json",
          "line": 12,
          "constant": "/monitor/topics/clock"
        },
        {
          "component": "scheduler",
          "path": "app/config/run.json",
          "line": 12,
          "constant": "/scheduler/topics/clock"
        },
        {
          "component": "model-runner",
          "path": "app/config/run.json",
          "line": 12,
          "constant": "/model_runner/topics/clock"
        },
        {
          "component": "planner",
          "path": "app/config/run.json",
          "line": 12,
          "constant": "/planner/topics/clock"
        },
        {
          "component": "telemetry",
          "path": "app/config/run.json",
          "line": 12,
          "constant": "/telemetry/topics/clock"
        },
        {
          "component": "operator",
          "path": "app/config/run.json",
          "line": 12,
          "constant": "/operator/topics/clock"
        },
        {
          "component": "feature-store",
          "path": "app/config/run.json",
          "line": 12,
          "constant": "/feature_store/topics/clock"
        },
        {
          "component": "shell",
          "path": "app/config/run.json",
          "line": 12,
          "constant": "/shell/topics/clock"
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
          "line": 256,
          "constant": "/monitor/topics/divergence"
        },
        {
          "component": "scheduler",
          "path": "app/config/run.json",
          "line": 256,
          "constant": "/scheduler/topics/divergence"
        }
      ]
    },
    {
      "topic": "ctl/heartbeat",
      "namespace": "ctl",
      "schema": "contracts/schemas/heartbeat.schema.json",
      "publishers": [
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
        "operator",
        "planner",
        "query",
        "scheduler",
        "sensors",
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
          "line": 14,
          "constant": "/operator/topics/heartbeat"
        },
        {
          "component": "shell",
          "path": "app/config/run.json",
          "line": 14,
          "constant": "/shell/topics/heartbeat"
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
          "line": 309,
          "constant": "/planner/topics/plan"
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
        "planner",
        "scheduler",
        "shell",
        "telemetry"
      ],
      "named_by": [
        {
          "component": "scheduler",
          "path": "app/config/run.json",
          "line": 278,
          "constant": "/scheduler/topics/run_published"
        },
        {
          "component": "model-runner",
          "path": "app/config/run.json",
          "line": 278,
          "constant": "/model_runner/topics/run_published"
        },
        {
          "component": "planner",
          "path": "app/config/run.json",
          "line": 278,
          "constant": "/planner/topics/run_published"
        },
        {
          "component": "telemetry",
          "path": "app/config/run.json",
          "line": 278,
          "constant": "/telemetry/topics/run_published"
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
        "model-runner",
        "shell"
      ],
      "named_by": [
        {
          "component": "scheduler",
          "path": "app/config/run.json",
          "line": 277,
          "constant": "/scheduler/topics/run_request"
        },
        {
          "component": "model-runner",
          "path": "app/config/run.json",
          "line": 277,
          "constant": "/model_runner/topics/run_request"
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
          "line": 292,
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
          "line": 257,
          "constant": "/monitor/topics/telemetry"
        },
        {
          "component": "scheduler",
          "path": "app/config/run.json",
          "line": 257,
          "constant": "/scheduler/topics/telemetry"
        },
        {
          "component": "telemetry",
          "path": "app/config/run.json",
          "line": 257,
          "constant": "/telemetry/topics/telemetry"
        }
      ]
    },
    {
      "topic": "obs/#",
      "namespace": "obs",
      "schema": "contracts/schemas/observation.schema.json",
      "publishers": [],
      "subscribers": [
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
          "line": 233,
          "constant": "/ingest/topics/observations"
        },
        {
          "component": "monitor",
          "path": "app/config/run.json",
          "line": 233,
          "constant": "/monitor/topics/observations"
        },
        {
          "component": "planner",
          "path": "app/config/run.json",
          "line": 233,
          "constant": "/planner/topics/observations"
        },
        {
          "component": "telemetry",
          "path": "app/config/run.json",
          "line": 233,
          "constant": "/telemetry/topics/observations"
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
