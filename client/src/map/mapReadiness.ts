/**
 * What the map has drawn, readable from outside the React tree.
 *
 * Feature 016's FR-019 forbids a fixed sleep anywhere in a capture path, and FR-010 of this
 * feature is that rule landing on the map: a capture must be able to determine that the
 * surface has drawn its *current* data without waiting an interval and hoping. A sleep is a
 * host-clock dependency wearing a different hat — it passes on a fast machine, fails on a
 * slow one, and, worst of the three, succeeds on a slow one by photographing a half-drawn
 * field that nobody notices until the picture is on a blog.
 *
 * The record is published under one stable name on the page's global scope, beside
 * `drognaRate`, and the same facts are rendered as data attributes on the map region.
 * Either surface will do; both are here because the attributes survive a page that has not
 * finished running its scripts and the global survives a region that has been scrolled or
 * restyled.
 *
 * `drawn` is the one a capture waits on, and it means what it says: the surface has drawn
 * the inputs it currently holds. It is false while a fetch is outstanding and false again
 * the moment a new announcement arrives, so a capture that waits on it waits for the *new*
 * field rather than settling for the old one.
 *
 * What this is not: a way to set anything. Nothing reads back out of here into the client,
 * and a capture tool that wrote to it would change nothing. It reports, and that is all —
 * the same rule `captureReadiness` follows, and for the same reason. A capture surface that
 * could make the page draw would be Constitution VII broken by the tooling rather than by
 * the client.
 */
import type { ExtentSource } from "./extent";

/** The name the map's readiness record is published under on the page's global scope. */
export const MAP_READINESS_KEY = "drognaMap";

/** Which presentation the surface is showing. */
export type MapMode = "flat" | "volume";

export interface MapReadiness {
  /** True when a drawing surface was obtained; false when the region is a statement. */
  readonly renderable: boolean;
  /** Where the extent in force came from, or "none". */
  readonly extentSource: ExtentSource;
  /** The run whose field is drawn, or null where none is. */
  readonly fieldRunId: string | null;
  /** How many cells the surface has drawn. Zero is a legitimate, stated answer. */
  readonly drawnCells: number;
  /** One cell in every `stride` on each axis is drawn. One means the field entire. */
  readonly stride: number;
  /** The plan whose route is drawn, or null where none is. */
  readonly routePlanId: string | null;
  readonly mode: MapMode;
  /** True when the surface has drawn the inputs it currently holds. */
  readonly drawn: boolean;
  /** Why the surface has drawn nothing, where it has. Null where it has drawn something. */
  readonly emptyBecause: string | null;
}

/** Before anything has been received or attempted. */
export const NOTHING_DRAWN: MapReadiness = {
  renderable: false,
  extentSource: "none",
  fieldRunId: null,
  drawnCells: 0,
  stride: 1,
  routePlanId: null,
  mode: "flat",
  drawn: false,
  emptyBecause: "the map has not rendered yet",
};

/** Where the record is written. Narrowed to what this module uses, so a test can pass one. */
export type ReadinessHost = Record<string, unknown>;

/** Write the record where a capture tool can read it. Returns what it wrote. */
export function exposeMapReadiness(
  readiness: MapReadiness,
  host: ReadinessHost = globalThis as unknown as ReadinessHost,
): MapReadiness {
  host[MAP_READINESS_KEY] = readiness;
  return readiness;
}

/** The record a capture tool would read, or null if the page has not written one yet. */
export function readMapReadiness(
  host: ReadinessHost = globalThis as unknown as ReadinessHost,
): MapReadiness | null {
  const value = host[MAP_READINESS_KEY];
  return value === undefined ? null : (value as MapReadiness);
}

/**
 * The record as data attributes, for the surface that survives an unfinished page.
 *
 * Spelt out one key at a time rather than assembled from the record's own keys, so that
 * adding a field to the record is a deliberate decision about what a capture may read
 * rather than an accident of serialisation.
 */
export function readinessAttributes(readiness: MapReadiness): Record<string, string> {
  return {
    "data-map-renderable": String(readiness.renderable),
    "data-map-extent-source": readiness.extentSource,
    "data-map-run": readiness.fieldRunId ?? "",
    "data-map-drawn-cells": String(readiness.drawnCells),
    "data-map-stride": String(readiness.stride),
    "data-map-plan": readiness.routePlanId ?? "",
    "data-map-mode": readiness.mode,
    "data-map-drawn": String(readiness.drawn),
  };
}
