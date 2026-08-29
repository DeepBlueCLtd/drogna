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
      "id": "observation-store",
      "role": "observation-store",
      "source_root": "app/src/backend/observation-store"
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
          "line": 144,
          "constant": "/coverage_store/topics/published"
        },
        {
          "component": "shell",
          "path": "app/config/run.json",
          "line": 269,
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
          "line": 48,
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
        "observation-store",
        "sensors",
        "shell"
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
        "observation-store",
        "sensors"
      ],
      "subscribers": [
        "shell"
      ],
      "named_by": [
        {
          "component": "shell",
          "path": "app/config/run.json",
          "line": 14,
          "constant": "/shell/topics/heartbeat"
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
        "shell"
      ],
      "named_by": [
        {
          "component": "ingest",
          "path": "app/config/run.json",
          "line": 202,
          "constant": "/ingest/topics/observations"
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
        "shell"
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
        "shell"
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
        "shell"
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
        "shell"
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
