// DO NOT EDIT.
// Generated from contracts/openapi/harness.openapi.yaml by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

export type { DrognaSimulationTimeSample } from "../messages/clock";

export type HarnessPath =
  | "/clock/control"
  | "/clock/snapshot"
  ;

export const HARNESS_PATHS = [
  "/clock/control",
  "/clock/snapshot",
] as const;

export const HARNESS_OPERATIONS = {
  "/clock/control": { "post": "clockControl" },
  "/clock/snapshot": { "get": "clockSnapshot" },
} as const;
