/**
 * The topic tree's subscription: both namespaces, read-only, and structurally so.
 *
 * The connection goes through the same proxy upgrade location as the shell's (ADR-0008)
 * and authenticates as the identity the configuration document names — `drogna_observer`
 * at both destinations, the role ADR-0027 argues: read on `obs/#` and `ctl/#`, publish
 * on nothing. This module narrows the broker library to the same `BrokerClient`
 * interface the control transport declares, which has no way to publish on it, and no
 * call to `publish` appears anywhere under `topictree/` — the checkable form of the
 * promise (022 SC-005), held by `client/tests/topictree/readonly.test.ts` and enforced
 * at the broker by `tests/integration/test_topic_isolation.py`.
 *
 * The subscription is the two branch filters, deliberately: the panel is the surface
 * that shows *arrival*, wherever it lands, including topics nothing declared — an
 * undeclared topic is a finding, and a topic list here would filter the findings out.
 */
import type { RuntimeConfig } from "../config/runtime";
import type { ConnectionState } from "../liveness/types";
import type { BrokerClient, ConnectionOptions } from "../transport/mqtt";

/** Everything the panel listens to: each namespace, whole. */
export const TREE_FILTERS: readonly string[] = ["obs/#", "ctl/#"];

/** The suffix that keeps this connection's client id distinct from the shell's. */
export const CLIENT_ID_SUFFIX = "-topictree";

export type TreeConnector = (
  url: string,
  options: ConnectionOptions,
) => BrokerClient | Promise<BrokerClient>;

export interface TreeSink {
  /** A payload arrived on a subscribed topic. Folding happens in the state layer. */
  message(topic: string, payload: string): void;
  connection(state: ConnectionState): void;
}

export interface TreeSubscription {
  close(): void;
}

const connectOverWebSocket: TreeConnector = async (url, options) => {
  const { default: mqtt } = await import("mqtt");
  return mqtt.connect(url, options) as unknown as BrokerClient;
};

export function openTreeSubscription(
  config: RuntimeConfig,
  sink: TreeSink,
  connect: TreeConnector = connectOverWebSocket,
): TreeSubscription {
  const options: ConnectionOptions = {
    // Two connections from one page must not share an id; the broker would take the
    // second CONNECT as the first client reconnecting and drop it.
    clientId: config.broker.clientId + CLIENT_ID_SUFFIX,
    // Nothing is retained for this identity between page loads: the tree is one
    // session's hearing, cold on refresh, and says so (022 FR-008).
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
      connected.subscribe([...TREE_FILTERS]);
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
      // The library failed to load or to construct a connection. There is nothing to
      // hear from, and the panel states that rather than appearing connected.
      sink.connection("not-connected");
    });

  return {
    close(): void {
      abandoned = true;
      client?.end(true);
    },
  };
}
