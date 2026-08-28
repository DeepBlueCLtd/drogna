/**
 * The one wrapper a read-path request goes through, and the only source of crossings.
 *
 * Feature 012 lets a viewer read the byte that crossed a command boundary; this is the
 * read side's equivalent seam. The client's two reads — the trajectory query and the
 * field-cube fetch — are issued through here, and the only thing this module adds to the
 * request is observation: the crossing delivered to the caller is assembled from the
 * request the client composed and the response that genuinely came back, byte for byte
 * the same response the caller then parses. There is no cache, no retry, no timer, and no
 * request this module composes on its own — a crossing exists because a read happened,
 * and for no other reason (Constitution VII, FR-003).
 *
 * A read that fails is delivered as a crossing marked failed, carrying the refusal or
 * error actually received. Suppressing it would leave the read-path view claiming a quiet
 * boundary during exactly the failure a viewer most needs to see.
 *
 * The response body is read as text once, measured, excerpted under a stated bound, and
 * then parsed; the parsed document is handed to the caller so the observation cannot
 * diverge from what the caller acts on. The simulation time recorded is the one the
 * response itself carried, found where CoverageJSON carries time — the domain's `t` axis,
 * or the composite axis a trajectory answers with — and null, said as null, where the
 * body carries neither.
 */
import type { CrossingOutcome, ObservedCrossing, ReadKind } from "./crossings";

/** How much of a response body the history retains. Truncation is declared, never silent. */
export const EXCERPT_BYTES = 2_048;

/** What the caller gets back: the same facts the crossing recorded, plus the document. */
export interface ReadOutcome {
  /** True when the response arrived with an OK status. */
  readonly ok: boolean;
  readonly status: number | null;
  /** The parsed response body, or null where none arrived or none parsed. */
  readonly body: unknown;
  /** Why there is no usable body, where there is none. */
  readonly failure: string | null;
}

/**
 * The simulation time a response carried, where this reader recognises the shape.
 *
 * CoverageJSON puts time in the domain: a `t` axis with ISO values for a grid, or the
 * first ordinate of each composite-axis row for a trajectory. The first value is reported
 * — the instant the coverage begins at — which for the cube read is the one step that was
 * asked for. A body of any other shape returns null, and the display says "none was
 * recognised" rather than pretending the response was timeless.
 */
export function simTimeCarried(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const domain = (body as Record<string, unknown>)["domain"];
  if (typeof domain !== "object" || domain === null) {
    return null;
  }
  const axes = (domain as Record<string, unknown>)["axes"];
  if (typeof axes !== "object" || axes === null) {
    return null;
  }
  const record = axes as Record<string, unknown>;
  const t = record["t"] as { values?: unknown } | undefined;
  if (t !== undefined && Array.isArray(t.values) && typeof t.values[0] === "string") {
    return t.values[0];
  }
  const composite = record["composite"] as { values?: unknown } | undefined;
  if (composite !== undefined && Array.isArray(composite.values)) {
    const first = composite.values[0];
    if (Array.isArray(first) && typeof first[0] === "string") {
      return first[0];
    }
  }
  return null;
}

function excerptOf(text: string): { excerpt: string; droppedBytes: number } {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= EXCERPT_BYTES) {
    return { excerpt: text, droppedBytes: 0 };
  }
  const kept = new TextDecoder().decode(bytes.slice(0, EXCERPT_BYTES));
  return { excerpt: kept, droppedBytes: bytes.length - EXCERPT_BYTES };
}

/**
 * Issue one genuine request and deliver its crossing.
 *
 * The caller supplies where to ask and what kind of read this is; the delivery callback
 * is how the crossing reaches the page's state. The request itself is the caller's — this
 * module composes no URL, so it cannot ask a question nobody else asked.
 */
export async function observedRead(
  kind: ReadKind,
  url: string,
  deliver: (crossing: ObservedCrossing) => void,
): Promise<ReadOutcome> {
  const requestLine = `GET ${url}`;
  let response: Response;
  try {
    response = await globalThis.fetch(url);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    deliver({
      kind,
      requestLine,
      outcome: "failed",
      status: null,
      declaredType: null,
      bodyBytes: null,
      simTime: null,
      excerpt: null,
      excerptDroppedBytes: 0,
      failure: `the request did not complete: ${detail}`,
    });
    return { ok: false, status: null, body: null, failure: `the request did not complete: ${detail}` };
  }

  const declaredType = response.headers?.get("content-type") ?? null;
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    deliver({
      kind,
      requestLine,
      outcome: "failed",
      status: response.status,
      declaredType,
      bodyBytes: null,
      simTime: null,
      excerpt: null,
      excerptDroppedBytes: 0,
      failure: `the response body could not be read: ${detail}`,
    });
    return { ok: false, status: response.status, body: null, failure: `the response body could not be read: ${detail}` };
  }

  const bytes = new TextEncoder().encode(text).length;
  const { excerpt, droppedBytes } = excerptOf(text);
  let body: unknown = null;
  let failure: string | null = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text) as unknown;
    } catch (error) {
      failure = `the response was not JSON: ${error instanceof Error ? error.message : "unreadable"}`;
    }
  }
  const outcome: CrossingOutcome = response.ok ? "answered" : "refused";
  deliver({
    kind,
    requestLine,
    outcome,
    status: response.status,
    declaredType,
    bodyBytes: bytes,
    simTime: body === null ? null : simTimeCarried(body),
    excerpt,
    excerptDroppedBytes: droppedBytes,
    failure,
  });
  return { ok: response.ok, status: response.status, body, failure };
}
