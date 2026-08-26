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
  };
  readonly liveness: {
    readonly defaultWindowSeconds: number;
    readonly windowMultiplier: number;
    readonly disconnectedIsIndeterminate: boolean;
  };
  readonly display: {
    readonly frameIntervalMs: number;
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

  return {
    broker: {
      url: broker["url"] as string,
      clientId: broker["client_id"] as string,
      keepaliveSeconds: optionalNumber(broker, "keepalive_seconds"),
      reconnectPeriodSeconds: optionalNumber(broker, "reconnect_period_seconds"),
    },
    clock: {
      staleAfterSeconds: clock["stale_after_seconds"] as number,
      snapshotUrl:
        endpoint !== undefined && snapshot !== undefined ? `${endpoint}${snapshot}` : undefined,
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
