/**
 * A component running in the browser lights itself, through the client's own code.
 *
 * This is the spike's load-bearing test and the thing the whole report rests on. It is
 * grafted to `client/tests/busTransport.test.ts` by `spikes/browser-twin/run.sh` and
 * removed afterwards; nothing in the committed tree runs it.
 *
 * What it does *not* do matters as much as what it does. It does not construct a
 * heartbeat and hand it to the reducer — `tests/heartbeats.ts` already does that, and
 * FR-023 says plainly that feeding a value to a pure function is testing a function. It
 * runs a clock component, which computes its own output, and puts that output on a real
 * `BroadcastChannel`; the client then does everything it does against a live deployment:
 * `openControlSubscription` picks its connector from the URL in the configuration
 * document, subscribes to the control namespace, receives what arrives, validates it
 * against the generated contract, folds it through the liveness reducer, and the shell
 * view is asked what is lit.
 *
 * The assertion chain is therefore: nothing was lit; a component ran; the component is
 * lit; nothing else is. If any link were faked, the last assertion would still pass and
 * the third would not.
 */
import { afterEach, describe, expect, it } from "vitest";

import { runtimeConfig } from "./runtimeConfig";
import type { RuntimeConfig } from "../src/config/runtime";
import { decode, interpret } from "../src/liveness/ingest";
import { discard, emptyLiveness, receive } from "../src/liveness/reducer";
import type { LivenessState } from "../src/liveness/types";
import { describeShell } from "../src/liveness/view";
import { emptyClock } from "../src/transport/clock";
import { isBusUrl, BUS_SCHEME } from "../src/transport/bus";
import { openControlSubscription } from "../src/transport/mqtt";
import type { ControlSubscription } from "../src/transport/mqtt";
import { CLOCK_TOPIC_NAME, HEARTBEAT_TOPIC_NAME, step } from "../twin/clockTwin";
import type { ClockScenario, Publisher } from "../twin/clockTwin";

const CHANNEL = "drogna_spike_control";
const BUS_URL = `${BUS_SCHEME}//${CHANNEL}`;

const SCENARIO: ClockScenario = {
  runId: "run-0001",
  epochMs: Date.parse("2026-08-26T00:00:00Z"),
  tickIntervalSeconds: 1,
  rate: 10,
  mode: "accelerated",
  heartbeatIntervalSeconds: 2,
  configDigest: `sha256:${"b".repeat(64)}`,
};

const TOLERANCES = { defaultWindowSeconds: 15, windowMultiplier: 3 };
const HEARING = { connected: true, disconnectedIsIndeterminate: true };

function config(): RuntimeConfig {
  const base = runtimeConfig();
  return { ...base, broker: { ...base.broker, url: BUS_URL } };
}

/** The component's output side: a real channel, posted to from outside the page context. */
function componentChannel(): { publisher: Publisher; close: () => void } {
  const channel = new BroadcastChannel(CHANNEL);
  return {
    publisher: {
      publish: (topic, payload) => channel.postMessage({ topic, payload }),
    },
    close: () => channel.close(),
  };
}

/** The client, wired exactly as `App.tsx` wires it, minus the rendering. */
function client(): {
  subscription: ControlSubscription;
  state: () => LivenessState;
  received: () => number;
} {
  let liveness = emptyLiveness;
  let count = 0;
  const subscription = openControlSubscription(config(), {
    message: (topic, payload) => {
      count += 1;
      if (topic !== HEARTBEAT_TOPIC_NAME) {
        return;
      }
      const decoded = decode(payload);
      if (!("value" in decoded)) {
        liveness = discard(liveness, decoded.reason);
        return;
      }
      // receivedAt is the host instant the arrival is measured against; a fixed value
      // keeps the window arithmetic decidable without waiting for real seconds to pass.
      const interpretation = interpret(decoded.value, 1000, TOLERANCES);
      liveness = interpretation.accepted
        ? receive(liveness, interpretation.evidence)
        : discard(liveness, interpretation.reason);
    },
    connection: () => undefined,
  });
  return { subscription, state: () => liveness, received: () => count };
}

function shell(liveness: LivenessState) {
  return describeShell({
    liveness,
    clockState: emptyClock,
    connection: "receiving",
    now: 1000,
    hearing: HEARING,
    clockStaleAfterSeconds: 10,
  });
}

/** Let the microtask queue and the channel's delivery task both drain. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const open: ControlSubscription[] = [];
const closers: (() => void)[] = [];

afterEach(() => {
  for (const subscription of open.splice(0)) {
    subscription.close();
  }
  for (const close of closers.splice(0)) {
    close();
  }
});

describe("a component running in the browser", () => {
  it("is reached by a URL the configuration document supplies", () => {
    expect(isBusUrl(config().broker.url)).toBe(true);
    expect(isBusUrl(runtimeConfig().broker.url)).toBe(false);
  });

  it("lights nothing before it has spoken", async () => {
    const page = client();
    open.push(page.subscription);
    await settle();
    expect(shell(page.state()).litCount).toBe(0);
  });

  it("lights itself once it has, through the client's own path", async () => {
    const page = client();
    open.push(page.subscription);
    const component = componentChannel();
    closers.push(component.close);
    await settle();

    expect(shell(page.state()).litCount).toBe(0);

    step(SCENARIO, component.publisher, 0, 1000, null);
    await settle();

    const view = shell(page.state());
    expect(view.litCount).toBe(1);
    const clock = view.nodes.find((node) => node.componentId === "clock");
    expect(clock?.illumination).toBe("lit");
    expect(clock?.reported?.simTime).toBe("2026-08-26T00:00:10.000000Z");
    expect(view.discarded).toBe(0);
    expect(view.unmapped).toHaveLength(0);
  });

  it("delivers the time sample too, and nothing on a topic nobody subscribed to", async () => {
    const page = client();
    open.push(page.subscription);
    const component = componentChannel();
    closers.push(component.close);
    await settle();

    step(SCENARIO, component.publisher, 0, 1000, null);
    component.publisher.publish("ctl/not-subscribed", "{}");
    await settle();

    // One time sample and one heartbeat; the unsubscribed topic is not delivered.
    expect(page.received()).toBe(2);
    expect(shell(page.state()).discarded).toBe(0);
  });

  it("stops delivering once the page closes the subscription", async () => {
    const page = client();
    const component = componentChannel();
    closers.push(component.close);
    await settle();
    page.subscription.close();
    await settle();

    step(SCENARIO, component.publisher, 0, 1000, null);
    await settle();

    expect(page.received()).toBe(0);
    expect(shell(page.state()).litCount).toBe(0);
  });

  it("keeps heartbeating at rate zero, so a pinned capture does not go grey", async () => {
    const page = client();
    open.push(page.subscription);
    const component = componentChannel();
    closers.push(component.close);
    await settle();

    const pinned: ClockScenario = { ...SCENARIO, rate: 0 };
    step(pinned, component.publisher, 0, 1000, null);
    step(pinned, component.publisher, 0, 9000, 0);
    await settle();

    const view = shell(page.state());
    expect(view.litCount).toBe(1);
    // Two heartbeats, one time sample: the tick did not move, and the component did not
    // fall silent while it was pinned (FR-53, ADR-0006).
    expect(page.received()).toBe(3);
  });

  it("publishes what the contract describes, judged by the client's own validator", async () => {
    const page = client();
    open.push(page.subscription);
    const component = componentChannel();
    closers.push(component.close);
    await settle();

    for (let tick = 0; tick < 5; tick += 1) {
      step(SCENARIO, component.publisher, 0, tick * 100 + 100, tick === 0 ? null : tick - 1);
    }
    await settle();

    // Every message was accepted. A shape the generated contract refused would have been
    // counted here rather than passing quietly.
    expect(shell(page.state()).discarded).toBe(0);
    expect(shell(page.state()).lastDiscardReason).toBeNull();
    expect(page.state().components.get("clock")?.heard).toBe(5);
  });

  it("names the topics the twin publishes on from the client's own list", () => {
    expect(HEARTBEAT_TOPIC_NAME).toBe("ctl/heartbeat");
    expect(CLOCK_TOPIC_NAME).toBe("ctl/clock");
  });
});
