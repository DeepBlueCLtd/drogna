/**
 * A planted violation, held here permanently: an explainer wired to the running
 * system, which is exactly what feature 111's FR-004 forbids. It exists so
 * check-background-inert has been *watched* catching each of its rules rather than
 * trusted to. Never imported by anything.
 *
 * Its paths and topics arrive as arguments rather than as literals, so this file
 * plants one gate's violation and not another's.
 */
import { createSeamFetch } from '../../seam/http.js';

export async function wiredExplainer(
  params: { client: { subscribe: (topic: string) => void } },
  endpoint: string,
  topic: string,
  live: string,
) {
  const holdings = await fetch(endpoint);
  params.client.subscribe(topic);
  const socket = new WebSocket(live);
  return { holdings, socket, seam: createSeamFetch };
}
