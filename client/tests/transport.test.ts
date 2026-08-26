/**
 * The subscription is read-only, and says which connection state it is in.
 *
 * ADR-0008 gives the browser an identity that is subscribe-only on the control
 * namespace, and the broker's ACLs are what enforce that. This is the client's half of
 * the promise: it subscribes to two control topics, it publishes nothing, and it reports
 * "connected and hearing nothing" as a state distinct from "not connected", because they
 * mean different things.
 */
import { describe, expect, it } from "vitest";

import type { RuntimeConfig } from "../src/config/runtime";
import type { ConnectionState } from "../src/liveness/types";
import { CLOCK_TOPIC, HEARTBEAT_TOPIC, openControlSubscription } from "../src/transport/mqtt";
import type { BrokerClient, ConnectionOptions } from "../src/transport/mqtt";

const config: RuntimeConfig = {
  broker: {
    url: "ws://broker.invalid/ctl",
    clientId: "client_test",
    keepaliveSeconds: 30,
    reconnectPeriodSeconds: 5,
  },
  clock: { staleAfterSeconds: 10, snapshotUrl: undefined },
  liveness: { defaultWindowSeconds: 15, windowMultiplier: 3, disconnectedIsIndeterminate: true },
  display: { frameIntervalMs: 100 },
};

class Recorder implements BrokerClient {
  readonly handlers = new Map<string, (...args: unknown[]) => void>();
  readonly subscribed: string[][] = [];
  ended = false;
  options: ConnectionOptions | null = null;

  on(event: string, handler: (...args: unknown[]) => void): unknown {
    this.handlers.set(event, handler);
    return this;
  }

  subscribe(topics: string[]): unknown {
    this.subscribed.push(topics);
    return this;
  }

  end(): unknown {
    this.ended = true;
    return this;
  }

  fire(event: string, ...args: unknown[]): void {
    this.handlers.get(event)?.(...args);
  }
}

async function open() {
  const client = new Recorder();
  const states: ConnectionState[] = [];
  const messages: [string, string][] = [];
  const subscription = openControlSubscription(
    config,
    {
      message: (topic, payload) => messages.push([topic, payload]),
      connection: (state) => states.push(state),
    },
    (url, options) => {
      client.options = options;
      expect(url).toBe(config.broker.url);
      return client;
    },
  );
  // The connector is awaited, so the wiring lands on a microtask rather than inline.
  await Promise.resolve();
  await Promise.resolve();
  return { client, states, messages, subscription };
}

describe("the control subscription", () => {
  it("subscribes to the two control topics and to nothing else", async () => {
    const { client } = await open();
    client.fire("connect");
    expect(client.subscribed).toEqual([[HEARTBEAT_TOPIC, CLOCK_TOPIC]]);
  });

  it("uses the identity from the configuration document, with no session carried over", async () => {
    const { client } = await open();
    expect(client.options?.clientId).toBe("client_test");
    expect(client.options?.clean).toBe(true);
  });

  it("reports connected and hearing nothing before it reports receiving", async () => {
    const { client, states } = await open();
    client.fire("connect");
    expect(states).toEqual(["connected-silent"]);
    client.fire("message", HEARTBEAT_TOPIC, Buffer.from("{}"));
    expect(states).toEqual(["connected-silent", "receiving"]);
  });

  it("reports a lost connection", async () => {
    const { client, states } = await open();
    client.fire("connect");
    client.fire("close");
    expect(states[states.length - 1]).toBe("not-connected");
  });

  it("passes payloads on without interpreting them", async () => {
    const { client, messages } = await open();
    client.fire("connect");
    client.fire("message", CLOCK_TOPIC, Buffer.from('{"tick":1}'));
    expect(messages).toEqual([[CLOCK_TOPIC, '{"tick":1}']]);
  });

  it("closes the connection when the page is done with it", async () => {
    const { client, subscription } = await open();
    subscription.close();
    expect(client.ended).toBe(true);
  });
});
