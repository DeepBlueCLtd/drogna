/**
 * The pub/sub carriageway of the seam (SRD-v2 FR-02, Constitution XI).
 *
 * Everything — backend components and the shell alike — reaches the broker only
 * through these interfaces. The V2 implementation is in-browser (the broker component
 * behind an adapter); a V3 implementation is MQTT-over-WebSocket against a broker URL
 * from configuration. No holder of a SeamClient can tell which it has.
 *
 * Payloads cross in wire shape: the transport serialises to JSON at publish and every
 * subscriber receives its own parse, so nothing object-shaped is ever shared across
 * the seam.
 */

export type Unsubscribe = () => void;

export interface SeamMessage {
  readonly topic: string;
  /** The payload as parsed from the wire. Each delivery is an independent parse. */
  readonly payload: unknown;
}

export interface SeamClient {
  /** Publish under this client's role. Throws SeamRefusal when the role may not. */
  publish(topic: string, payload: unknown): void;
  subscribe(filter: string, handler: (message: SeamMessage) => void): Unsubscribe;
  /** Cease to exist: all subscriptions dropped, further calls refused. */
  disconnect(): void;
}

export interface SeamTransport {
  /** Connect under a declared role. Throws SeamRefusal for an undeclared role. */
  connect(clientId: string, role: string): SeamClient;
}

/** A refusal at the seam always names the thing refused. */
export class SeamRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeamRefusal';
  }
}
