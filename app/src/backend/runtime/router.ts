/**
 * The route table behind the release gate. Components register their seam routes
 * here at construction, from paths in their own configuration documents; the gate
 * consults it only after the path has cleared the allow list.
 */
import type { SeamHttpResponse, SeamRequest } from '../../seam/http.js';

export type RouteHandler = (request: SeamRequest) => SeamHttpResponse | Promise<SeamHttpResponse>;

export class Router {
  private readonly routes = new Map<string, RouteHandler>();
  private readonly prefixes: { method: string; prefix: string; handler: RouteHandler }[] = [];

  register(method: string, path: string, handler: RouteHandler): void {
    const key = `${method.toUpperCase()} ${path}`;
    if (this.routes.has(key)) throw new Error(`route already registered: ${key}`);
    this.routes.set(key, handler);
  }

  /** A component that owns a whole prefix (the query components do) routes within it. */
  registerPrefix(method: string, prefix: string, handler: RouteHandler): void {
    this.prefixes.push({ method: method.toUpperCase(), prefix, handler });
  }

  async handle(request: SeamRequest): Promise<SeamHttpResponse> {
    const pathOnly = request.path.split('?')[0];
    const prefixed = this.prefixes.find(
      (entry) => entry.method === request.method && (pathOnly === entry.prefix || pathOnly.startsWith(`${entry.prefix}/`)),
    );
    if (prefixed) return prefixed.handler(request);
    const handler = this.routes.get(`${request.method} ${pathOnly}`);
    if (!handler) {
      // Path-level (any method) presence decides 405 vs 404, so a wrong method is
      // told apart from a wrong path — a refusal names the thing refused.
      const pathKnown = [...this.routes.keys()].some((key) => key.endsWith(` ${pathOnly}`));
      const refused = pathKnown
        ? `method ${request.method} on ${pathOnly}`
        : `no route serves ${pathOnly}`;
      return { status: pathKnown ? 405 : 404, body: JSON.stringify({ refused }) };
    }
    return handler(request);
  }
}
