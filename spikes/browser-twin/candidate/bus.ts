/**
 * The control namespace over an in-page message fabric.
 *
 * This is spike code. It is written as it would appear at `client/src/transport/bus.ts`
 * so that the gates which read `client/src` can be pointed at it, and it is grafted there
 * by `spikes/browser-twin/run.sh` for the length of one test run. Nothing imports it in
 * the committed tree.
 *
 * The question it answers: a browser cannot serve itself a WebSocket, so a component
 * reimplemented in JavaScript cannot reach the client through `transport/mqtt.ts`. What
 * it can reach the client through is `BroadcastChannel`, which is the nearest thing the
 * platform has to a broker — same-origin, many-to-many, asynchronous, crossing worker
 * boundaries without shared memory, and delivering to every context except the one that
 * posted. A component in a worker publishes; the page receives; neither holds a reference
 * to the other. That decoupling is the property that matters, because a fabric that
 * delivered synchronously would make the interleaving of components a fiction and
 * "where it misbehaves together" unobservable.
 *
 * What is deliberately not claimed: this is not MQTT. There is no retention, no quality
 * of service, no wildcard matching, and no ordering guarantee between two publishers in
 * different contexts. The control namespace uses none of those — every topic in
 * `data/topics.ts` is a literal and the client subscribes read-only — so the subset is
 * sufficient, and saying which subset is implemented is required of us anyway
 * (Constitution VI).
 *
 * Like `transport/mqtt.ts`, this module publishes nothing. It has no `postMessage` call
 * on the subscribing path, which is the only form of that promise a reader can check.
 */
import type { BrokerClient, ConnectionOptions, Connector } from "./mqtt";

/** The scheme a configuration document uses to ask for the in-page fabric. */
export const BUS_SCHEME = "bus:";

/** One message as it crosses the fabric: the topic, and the bytes a broker would deliver. */
export interface BusEnvelope {
  readonly topic: string;
  readonly payload: string;
}

/** What this module needs of a channel, and nothing that could reach the network. */
export interface Channel {
  onmessage: ((event: { data: unknown }) => void) | null;
  close(): void;
}

export type ChannelFactory = (name: string) => Channel;

/** The channel name a bus URL asks for: everything after the scheme. */
export function channelName(url: string): string {
  const rest = url.slice(BUS_SCHEME.length);
  return rest.replace(/^\/+/, "");
}

/** Whether a configuration document is pointing the client at the in-page fabric. */
export function isBusUrl(url: string): boolean {
  return url.startsWith(BUS_SCHEME);
}

function isEnvelope(data: unknown): data is BusEnvelope {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const candidate = data as Record<string, unknown>;
  return typeof candidate["topic"] === "string" && typeof candidate["payload"] === "string";
}

const openBroadcastChannel: ChannelFactory = (name) =>
  new BroadcastChannel(name) as unknown as Channel;

/**
 * A subscribe-only client over one channel.
 *
 * The lifecycle event is held until somebody is listening for it. `openControlSubscription`
 * attaches its handlers inside a promise continuation, so a client that announced itself
 * on construction would announce to nobody and the page would sit connected and silent
 * forever. Announcing on registration instead makes the ordering irrelevant.
 */
export function busClient(url: string, open: ChannelFactory = openBroadcastChannel): BrokerClient {
  const channel = open(channelName(url));
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  let subscribed: readonly string[] = [];
  let announced = false;
  let closed = false;

  const emit = (event: string, ...args: unknown[]): void => {
    for (const handler of handlers.get(event) ?? []) {
      handler(...args);
    }
  };

  channel.onmessage = (event) => {
    if (closed || !isEnvelope(event.data)) {
      return;
    }
    if (!subscribed.includes(event.data.topic)) {
      return; // a topic nobody asked for is not delivered, as a broker would not deliver it
    }
    emit("message", event.data.topic, event.data.payload);
  };

  return {
    on(event: string, handler: (...args: unknown[]) => void): unknown {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      if (event === "connect" && !announced && !closed) {
        announced = true;
        queueMicrotask(() => {
          if (!closed) {
            emit("connect");
          }
        });
      }
      return undefined;
    },
    subscribe(topics: string[]): unknown {
      subscribed = [...subscribed, ...topics];
      return undefined;
    },
    end(): unknown {
      closed = true;
      channel.close();
      return undefined;
    },
  };
}

/** The connector form, for `openControlSubscription`'s injection point. */
export const connectOverBus: Connector = (url: string, _options: ConnectionOptions) =>
  busClient(url);
