/**
 * A validated configuration, as the adapter hands it to the rest of the client.
 *
 * Built once here rather than three times in three test files, so that adding a section to
 * the served document is one edit rather than a scavenger hunt through the suite. It is
 * the client's internal model and not a second declaration of the contract: what the
 * document itself must look like is asserted in `bootstrap.test.ts`, against the master.
 */
import type { RuntimeConfig } from "../src/config/runtime";

export interface ConfigOverrides {
  readonly controlUrl?: string | undefined;
  readonly trajectoryPath?: string | undefined;
  readonly interpolate?: boolean;
  readonly cubePath?: string | undefined;
  readonly fieldParameter?: string | undefined;
  /** Passing `null` is a destination that declares no extent, which the map states. */
  readonly map?: RuntimeConfig["map"] | null;
  /** Passing `null` is a destination that declares no site root, which the badges state. */
  readonly site?: RuntimeConfig["site"] | null;
}

/** What a destination that declares an extent declares, so a test says so in one word. */
export const DECLARED_MAP = {
  extent: {
    minimumLongitude: -6,
    minimumLatitude: 48,
    maximumLongitude: -3,
    maximumLatitude: 50,
  },
  vertical: { minimumDepthM: 0, maximumDepthM: 1000 },
  graticuleSpacingDegrees: 0.5,
} as const;

export function runtimeConfig(overrides: ConfigOverrides = {}): RuntimeConfig {
  return {
    broker: {
      url: "ws://broker.invalid/ctl",
      clientId: "client_test",
      keepaliveSeconds: 30,
      reconnectPeriodSeconds: 5,
    },
    clock: {
      staleAfterSeconds: 10,
      snapshotUrl: undefined,
      controlUrl: overrides.controlUrl,
    },
    query: {
      collectionsUrl: "http://query.invalid/released",
      trajectoryPath: overrides.trajectoryPath,
      routeParameters: ["sea_water_temperature"],
      cubePath: overrides.cubePath,
      fieldParameter: overrides.fieldParameter,
    },
    liveness: { defaultWindowSeconds: 15, windowMultiplier: 3, disconnectedIsIndeterminate: true },
    display: {
      frameIntervalMs: 100,
      bufferDepth: undefined,
      coalescingThreshold: undefined,
      maximumDrawnCells: undefined,
      interpolateBetweenSamples: overrides.interpolate ?? true,
    },
    map: overrides.map === null ? undefined : (overrides.map ?? DECLARED_MAP),
    site:
      overrides.site === null
        ? undefined
        : (overrides.site ?? { standardsUrl: "http://site.invalid/standards" }),
  };
}
