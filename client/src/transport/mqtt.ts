/**
 * The subscription to the control namespace. Read-only, and structurally so.
 *
 * The browser reaches the broker through the reverse proxy's WebSocket upgrade location
 * (ADR-0008), so everything stays behind one proxy under one policy and the component
 * count stays at eighteen. The identity is subscribe-only on the control namespace, and
 * this module publishes nothing: there is no call to `publish` anywhere in it, which is
 * the only form of that promise a reader can check.
 *
 * Two topics are subscribed: `ctl/heartbeat`, which is the only thing that lights a
 * component, and `ctl/clock`, which carries simulation time. Observation traffic is not
 * proxied to the browser at all; the client reads observations through the query layer.
 *
 * The topic names are conventions of the harness rather than deployment locations, which
 * is why they are here and not in the configuration document. Where the broker *is*
 * comes from the document.
 */
import mqtt from "mqtt";

import type { RuntimeConfig } from "../config/runtime";
import type { ConnectionState } from "../liveness/types";

export const HEARTBEAT_TOPIC = "ctl/heartbeat";
export const CLOCK_TOPIC = "ctl/clock";

/** What this module needs of a broker client, and nothing that could publish. */
export interface BrokerClient {
  on(event: string, handler: (...args: unknown[]) => void): unknown;
  subscribe(topics: string[]): unknown;
  end(force?: boolean): unknown;
}

export interface ConnectionOptions {
  readonly clientId: string;
  readonly clean: boolean;
  readonly keepalive?: number;
  readonly reconnectPeriod?: number;
  readonly protocolVersion?: number;
}

export type Connector = (url: string, options: ConnectionOptions) => BrokerClient;

export interface ControlSink {
  /** A payload arrived on a subscribed topic. Validation happens downstream. */
  message(topic: string, payload: string): void;
  connection(state: ConnectionState): void;
}

export interface ControlSubscription {
  close(): void;
}

/**
 * The default connector.
 *
 * The client library's own type is wider than anything used here; narrowing it at the
 * boundary is what lets the rest of the module be written against an interface with no
 * way to publish on it.
 */
const connectOverWebSocket: Connector = (url, options) =>
  mqtt.connect(url, options) as unknown as BrokerClient;

export function openControlSubscription(
  config: RuntimeConfig,
  sink: ControlSink,
  connect: Connector = connectOverWebSocket,
): ControlSubscription {
  const options: ConnectionOptions = {
    clientId: config.broker.clientId,
    // Nothing is retained for this identity between page loads: the display is built
    // from what arrives while someone is looking at it.
    clean: true,
    ...(config.broker.keepaliveSeconds === undefined
      ? {}
      : { keepalive: config.broker.keepaliveSeconds }),
    ...(config.broker.reconnectPeriodSeconds === undefined
      ? {}
      : { reconnectPeriod: config.broker.reconnectPeriodSeconds * 1000 }),
  };

  const client = connect(config.broker.url, options);
  let heard = false;

  client.on("connect", () => {
    heard = false;
    client.subscribe([HEARTBEAT_TOPIC, CLOCK_TOPIC]);
    sink.connection("connected-silent");
  });
  client.on("message", (...args: unknown[]) => {
    const [topic, payload] = args as [string, { toString(): string }];
    if (!heard) {
      heard = true;
      sink.connection("receiving");
    }
    sink.message(topic, payload.toString());
  });
  const lost = (): void => {
    heard = false;
    sink.connection("not-connected");
  };
  client.on("close", lost);
  client.on("offline", lost);
  client.on("error", lost);

  return {
    close(): void {
      client.end(true);
    },
  };
}
