/**
 * The release gate (V2-C10): default deny at the boundary (Constitution X, D14).
 *
 * All seam HTTP traffic passes here before any query component sees it. Exposure is
 * opt-in one path prefix at a time from the gate's configuration document; everything
 * else is refused with the rule named, and every refusal is published on the gate's
 * denial topic so the shell can show it (boundary-denial.schema.json). In V3 this
 * policy moves verbatim to a real proxy, which is why it is configuration, not code.
 */
import type { SeamHttpBackend, SeamHttpResponse, SeamRequest } from '../../seam/http.js';
import type { SeamClient } from '../../seam/transport.js';
import type { ConfigBoundary } from '../../generated/types.js';
import type { Router } from '../runtime/router.js';

export class ReleaseGate implements SeamHttpBackend {
  /** Denials refused so far; the System panel reads this via the heartbeat detail. */
  denials = 0;

  constructor(
    private readonly config: ConfigBoundary,
    private readonly client: SeamClient,
    private readonly router: Router,
  ) {}

  async handle(request: SeamRequest): Promise<SeamHttpResponse> {
    const pathOnly = request.path.split('?')[0];
    const cleared = this.config.allow_prefixes.some((prefix) => pathOnly.startsWith(prefix));
    if (!cleared) {
      this.denials += 1;
      this.client.publish(this.config.topics.denial, {
        component: this.config.id,
        path: pathOnly,
        method: request.method,
        rule: 'default deny at the boundary',
      });
      return {
        status: 403,
        body: JSON.stringify({
          refused: pathOnly,
          rule: 'default deny at the boundary',
          allowed_prefixes: this.config.allow_prefixes,
        }),
      };
    }
    return this.router.handle(request);
  }
}
