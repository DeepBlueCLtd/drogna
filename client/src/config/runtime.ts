/**
 * The runtime configuration document, and the client's one permitted literal.
 *
 * A browser reads no environment variable, so Constitution IV's single-variable rule
 * becomes a single served document reached by one relative bootstrap URL. That URL is
 * the only location named in this client's source; everything else — the broker
 * endpoint, the clock endpoint, the tolerances — arrives inside the document, which is
 * validated against the client configuration schema in contracts before any transport
 * opens.
 *
 * Nothing in the document can light a component. It says where to listen and how long a
 * heard-from component stays believed. Illumination comes from received heartbeats and
 * from nothing else (Constitution VII), and the unit tests assert exactly that.
 */
import { rejectionReason, validateClientConfig } from "../contracts/schemas";

/** What the client needs to know before it can listen to anything. */
export interface RuntimeConfig {
  readonly broker: {
    readonly url: string;
    readonly clientId: string;
    readonly keepaliveSeconds: number | undefined;
    readonly reconnectPeriodSeconds: number | undefined;
  };
  readonly clock: {
    readonly staleAfterSeconds: number;
    readonly snapshotUrl: string | undefined;
    /**
     * Where a rate change is asked for, or undefined where the destination serves a page
     * that may watch the clock and not set it. Undefined is a state the speed control
     * renders and explains rather than a state it hides (FR-012).
     */
    readonly controlUrl: string | undefined;
  };
  readonly query: {
    /** Where a collection is addressed, assembled from the served document alone. */
    readonly collectionsUrl: string;
    /** The path under a collection at which a trajectory query is served, or undefined. */
    readonly trajectoryPath: string | undefined;
    /** Which forecast parameters to ask for along a route. */
    readonly routeParameters: readonly string[];
  };
  readonly liveness: {
    readonly defaultWindowSeconds: number;
    readonly windowMultiplier: number;
    readonly disconnectedIsIndeterminate: boolean;
  };
  readonly display: {
    readonly frameIntervalMs: number;
    /** How many messages each control topic keeps before evicting the oldest (FR-006). */
    readonly bufferDepth: number | undefined;
    /** How many arrivals in one frame before transits are coalesced (FR-008). */
    readonly coalescingThreshold: number | undefined;
    /** The largest uncertainty field drawn before it is downsampled (FR-024). */
    readonly maximumDrawnCells: number | undefined;
    /** Whether the render path may smooth between two clock samples (ADR-0007). */
    readonly interpolateBetweenSamples: boolean;
  };
}

export type ConfigOutcome =
  | { readonly ok: true; readonly config: RuntimeConfig }
  | { readonly ok: false; readonly reason: string };

/** The shape of a fetch, narrowed to what this module uses, so a test can supply one. */
export type DocumentFetcher = (url: string) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}>;

// harness:allow-literal-path FR-018, the one bootstrap URL a browser cannot avoid; every other location the client uses arrives inside the document this fetches
const CONFIGURATION_DOCUMENT = "./config.json";

/** Where the client will look for its configuration, for a message that says so. */
export const configurationDocumentUrl = CONFIGURATION_DOCUMENT;

function section(document: Record<string, unknown>, name: string): Record<string, unknown> {
  return document[name] as Record<string, unknown>;
}

function optionalNumber(from: Record<string, unknown>, key: string): number | undefined {
  const value = from[key];
  return typeof value === "number" ? value : undefined;
}

function optionalString(from: Record<string, unknown>, key: string): string | undefined {
  const value = from[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Adapt a validated document into the client's own vocabulary.
 *
 * The schema has already refused anything of the wrong shape, so the reads here are
 * narrowing rather than checking. The names differ from the document's on purpose: this
 * is the client's internal model, not a second declaration of the contract.
 */
function adopt(document: Record<string, unknown>): RuntimeConfig {
  const broker = section(document, "broker");
  const clock = section(document, "clock");
  const liveness = section(document, "liveness");
  const display = section(document, "display");
  const routes = clock["routes"] as Record<string, unknown> | undefined;
  const endpoint = optionalString(clock, "endpoint");
  const snapshot = routes === undefined ? undefined : optionalString(routes, "snapshot");
  const control = routes === undefined ? undefined : optionalString(routes, "control");
  const join = (route: string | undefined): string | undefined =>
    endpoint !== undefined && route !== undefined ? `${endpoint}${route}` : undefined;
  const interpolate = display["interpolate_between_samples"];
  const query = section(document, "query");
  const parameters = query["route_parameters"];

  return {
    broker: {
      url: broker["url"] as string,
      clientId: broker["client_id"] as string,
      keepaliveSeconds: optionalNumber(broker, "keepalive_seconds"),
      reconnectPeriodSeconds: optionalNumber(broker, "reconnect_period_seconds"),
    },
    clock: {
      staleAfterSeconds: clock["stale_after_seconds"] as number,
      snapshotUrl: join(snapshot),
      controlUrl: join(control),
    },
    query: {
      collectionsUrl: `${query["endpoint"] as string}${query["collections_path"] as string}`,
      trajectoryPath: optionalString(query, "trajectory_path"),
      routeParameters: Array.isArray(parameters) ? (parameters as string[]) : [],
    },
    liveness: {
      defaultWindowSeconds: liveness["default_window_seconds"] as number,
      // A sender that declares an interval but no window is believed for a small
      // multiple of it, so one dropped message is not read as death.
      windowMultiplier: optionalNumber(liveness, "window_multiplier") ?? 3,
      // A client that has gone deaf cannot honestly say a component died.
      disconnectedIsIndeterminate: (liveness["disconnected_is_indeterminate"] as boolean) ?? true,
    },
    display: {
      frameIntervalMs: display["frame_interval_ms"] as number,
      bufferDepth: optionalNumber(display, "buffer_depth"),
      coalescingThreshold: optionalNumber(display, "coalescing_threshold"),
      maximumDrawnCells: optionalNumber(display, "maximum_drawn_cells"),
      // Smoothing is on unless the document turns it off. ADR-0007 keeps the
      // render-on-clock-samples path selectable; it costs smoothness and nothing else.
      interpolateBetweenSamples: typeof interpolate === "boolean" ? interpolate : true,
    },
  };
}

/** Validate a fetched document and adapt it. Pure: no I/O, no transport. */
export function readRuntimeConfig(document: unknown): ConfigOutcome {
  if (!validateClientConfig(document)) {
    return { ok: false, reason: `configuration document rejected: ${rejectionReason(validateClientConfig)}` };
  }
  return { ok: true, config: adopt(document as Record<string, unknown>) };
}

/**
 * Fetch the configuration document and validate it.
 *
 * A failure is returned rather than thrown: the shell and the honesty statement render
 * before this is called and must survive it failing (FR-019). What must not happen is a
 * transport opening against an unvalidated document, which is why this is the only way
 * to obtain one.
 */
export async function loadRuntimeConfig(
  fetchDocument: DocumentFetcher = (url) => globalThis.fetch(url),
): Promise<ConfigOutcome> {
  let document: unknown;
  try {
    const response = await fetchDocument(CONFIGURATION_DOCUMENT);
    if (!response.ok) {
      return { ok: false, reason: `configuration document unavailable (status ${response.status})` };
    }
    document = await response.json();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `configuration document unreachable: ${detail}` };
  }
  return readRuntimeConfig(document);
}
