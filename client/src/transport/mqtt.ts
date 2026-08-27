/**
 * The subscription to the control namespace. Read-only, and structurally so.
 *
 * The browser reaches the broker through the reverse proxy's WebSocket upgrade location
 * (ADR-0008), so everything stays behind one proxy under one policy and the component
 * count stays at eighteen. The identity is subscribe-only on the control namespace, and
 * this module publishes nothing: there is no call to `publish` anywhere in it, which is
 * the only form of that promise a reader can check.
 *
 * The control namespace is subscribed whole, from the list in `data/topics.ts`:
 * `ctl/heartbeat`, which is the only thing that lights a component; `ctl/clock`, which
 * carries simulation time; and the run, plan and telemetry topics the loop display draws.
 * Observation traffic is not proxied to the browser at all; the client reads observations
 * through the query layer.
 *
 * The topic names are conventions of the harness rather than deployment locations, which
 * is why they are here and not in the configuration document. Where the broker *is*
 * comes from the document.
 */
import type { RuntimeConfig } from "../config/runtime";
import { CONTROL_TOPICS } from "../data/topics";
import type { ConnectionState } from "../liveness/types";

// The topic list moved to `data/topics.ts` when feature 012 extended the subscription
// beyond the first two; the names are re-exported here so that a reader who comes to the
// transport looking for what it listens to still finds it.
export { CLOCK_TOPIC, CONTROL_TOPICS, HEARTBEAT_TOPIC } from "../data/topics";

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
}

export type Connector = (
  url: string,
  options: ConnectionOptions,
) => BrokerClient | Promise<BrokerClient>;

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
 * The broker library is loaded on demand rather than bundled into the first payload, so
 * the shell and the honesty statement paint without waiting for code that only matters
 * once there is something to listen to (FR-019, SC-001).
 *
 * The library's own type is wider than anything used here; narrowing it at the boundary
 * is what lets the rest of the module be written against an interface with no way to
 * publish on it.
 */
const connectOverWebSocket: Connector = async (url, options) => {
  const { default: mqtt } = await import("mqtt");
  return mqtt.connect(url, options) as unknown as BrokerClient;
};

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

  let client: BrokerClient | null = null;
  let abandoned = false;
  let heard = false;

  const wire = (connected: BrokerClient): void => {
    connected.on("connect", () => {
      heard = false;
      connected.subscribe([...CONTROL_TOPICS]);
      sink.connection("connected-silent");
    });
    connected.on("message", (...args: unknown[]) => {
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
    connected.on("close", lost);
    connected.on("offline", lost);
    connected.on("error", lost);
  };

  void Promise.resolve(connect(config.broker.url, options))
    .then((connected) => {
      if (abandoned) {
        connected.end(true);
        return;
      }
      client = connected;
      wire(connected);
    })
    .catch(() => {
      // The library itself failed to load or to construct a connection. There is nothing
      // to hear from, and the page says so rather than appearing to be connected.
      sink.connection("not-connected");
    });

  return {
    close(): void {
      abandoned = true;
      client?.end(true);
    },
  };
}
