/**
 * The HTTP carriageway of the seam: a fetch-level shim (ADR-0029).
 *
 * Installed exactly once, at the composition root, before any component or panel
 * runs. Requests whose path falls under the configured API prefix are serialised to
 * wire shape and answered by the seam backend (the release gate in front of the query
 * components); everything else passes to the real fetch. Removing the installation is
 * the V3 swap: callers know nothing but `fetch` and a relative URL (FR-04).
 */

export interface SeamRequest {
  readonly method: string;
  /** Path plus query, relative and same-origin, e.g. "/api/ctl/clock/rate". */
  readonly path: string;
  /** The request body as wire bytes decoded to text; empty string when absent. */
  readonly body: string;
}

export interface SeamHttpResponse {
  readonly status: number;
  readonly headers?: Record<string, string>;
  readonly body: string;
}

export interface SeamHttpBackend {
  handle(request: SeamRequest): Promise<SeamHttpResponse>;
}

function isSeamPath(input: string, apiPrefix: string): boolean {
  return input.startsWith(apiPrefix) && !/^[a-z][a-z0-9+.-]*:/i.test(input);
}

/**
 * Build the shim as a pure function of the backend, so tests exercise exactly what
 * the browser runs. `realFetch` handles everything outside the prefix.
 */
export function createSeamFetch(
  apiPrefix: string,
  backend: SeamHttpBackend,
  realFetch: typeof fetch,
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.pathname + input.search : input.url;
    if (!isSeamPath(url, apiPrefix)) return realFetch(input, init);

    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    let body = '';
    if (init?.body !== undefined && init.body !== null) {
      if (typeof init.body !== 'string') {
        throw new TypeError('the seam accepts string bodies only: serialise before crossing');
      }
      body = init.body;
    } else if (input instanceof Request) {
      body = await input.clone().text();
    }

    const answer = await backend.handle({ method, path: url, body });
    return new Response(answer.body, {
      status: answer.status,
      headers: { 'content-type': 'application/json', ...answer.headers },
    });
  };
}

export function installSeamFetch(apiPrefix: string, backend: SeamHttpBackend): void {
  const real = globalThis.fetch.bind(globalThis);
  globalThis.fetch = createSeamFetch(apiPrefix, backend, real);
}
