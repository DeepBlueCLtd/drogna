/**
 * The in-browser implementation of the seam's transport interface: a thin adapter
 * over the broker component. Constructed at the composition root and handed to both
 * halves; a V3 transport speaks MQTT-over-WebSocket against a broker URL from
 * configuration, and no holder can tell the difference (Constitution XI).
 */
import type { SeamClient, SeamTransport } from '../../seam/transport.js';
import type { Broker } from './broker.js';

export function createInBrowserTransport(broker: Broker): SeamTransport {
  return {
    connect(clientId: string, role: string): SeamClient {
      return broker.connect(clientId, role);
    },
  };
}
