/**
 * The broker (V2-C03): MQTT-semantics pub/sub as an in-browser component (D12).
 *
 * Topic tree with '+' and '#' wildcard subscription; role-based rules from its
 * configuration document — publish and subscribe are both default-deny, and every
 * refusal names the role and the topic (SRD-v2 FR-22's discipline, present from
 * feature 101).
 *
 * Wire shape: payloads are held as JSON text between publish and delivery, and every
 * subscriber receives its own parse — nothing object-shaped crosses the seam, and no
 * two subscribers can share state through a message (Constitution XI).
 *
 * Determinism: delivery is synchronous and breadth-first. A publish made while a
 * delivery is in progress is queued, so the order every subscriber observes is the
 * order of publication, reproducible by construction (ADR-0030).
 */
import { SeamRefusal, type SeamMessage } from '../../seam/transport.js';
import type { ConfigBroker } from '../../generated/types.js';

export function topicMatches(filter: string, topic: string): boolean {
  const filterParts = filter.split('/');
  const topicParts = topic.split('/');
  for (let i = 0; i < filterParts.length; i++) {
    const part = filterParts[i];
    if (part === '#') return true;
    if (i >= topicParts.length) return false;
    if (part !== '+' && part !== topicParts[i]) return false;
  }
  return filterParts.length === topicParts.length;
}

interface Subscription {
  readonly filter: string;
  readonly handler: (message: SeamMessage) => void;
  active: boolean;
}

export class Broker {
  private readonly subscriptions: Subscription[] = [];
  private readonly queue: { topic: string; wire: string }[] = [];
  private draining = false;
  /** Deliveries whose handler threw; a handler fault must not silence later ones. */
  deliveryFaults = 0;

  constructor(private readonly config: ConfigBroker) {}

  private rulesFor(role: string) {
    const rules = this.config.roles.find((entry) => entry.role === role);
    if (!rules) throw new SeamRefusal(`role '${role}' is not declared in the broker's rules`);
    return rules;
  }

  /** Validates the role exists; the returned handle enforces its rules per call. */
  connect(clientId: string, role: string) {
    const rules = this.rulesFor(role);
    const owned: Subscription[] = [];
    let connected = true;
    const assertConnected = () => {
      if (!connected) throw new SeamRefusal(`client '${clientId}' has disconnected`);
    };
    return {
      publish: (topic: string, payload: unknown): void => {
        assertConnected();
        if (!rules.publish.some((allowed) => topicMatches(allowed, topic))) {
          throw new SeamRefusal(`role '${role}' may not publish on '${topic}'`);
        }
        this.enqueue(topic, JSON.stringify(payload));
      },
      subscribe: (filter: string, handler: (message: SeamMessage) => void) => {
        assertConnected();
        if (!rules.subscribe.some((allowed) => filterCovers(allowed, filter))) {
          throw new SeamRefusal(`role '${role}' may not subscribe with '${filter}'`);
        }
        const subscription: Subscription = { filter, handler, active: true };
        this.subscriptions.push(subscription);
        owned.push(subscription);
        return () => {
          subscription.active = false;
        };
      },
      disconnect: (): void => {
        for (const subscription of owned) subscription.active = false;
        connected = false;
      },
    };
  }

  private enqueue(topic: string, wire: string): void {
    this.queue.push({ topic, wire });
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const next = this.queue.shift();
        if (!next) break;
        // Snapshot: a subscription made during delivery hears the *next* message.
        const audience = this.subscriptions.filter(
          (subscription) => subscription.active && topicMatches(subscription.filter, next.topic),
        );
        for (const subscription of audience) {
          if (!subscription.active) continue;
          try {
            subscription.handler({ topic: next.topic, payload: JSON.parse(next.wire) });
          } catch (fault) {
            this.deliveryFaults += 1;
            console.error(`broker: handler fault on '${next.topic}':`, fault);
          }
        }
      }
    } finally {
      this.draining = false;
    }
  }
}

/**
 * Whether an allowed filter covers a requested one: every topic the request could
 * match must be matchable by the allowance. Conservative segment-wise check.
 */
export function filterCovers(allowed: string, requested: string): boolean {
  const allowedParts = allowed.split('/');
  const requestedParts = requested.split('/');
  for (let i = 0; i < allowedParts.length; i++) {
    const part = allowedParts[i];
    if (part === '#') return true;
    if (i >= requestedParts.length) return false;
    const requestedPart = requestedParts[i];
    if (requestedPart === '#') return false;
    if (part === '+') continue;
    if (requestedPart === '+') return false;
    if (part !== requestedPart) return false;
  }
  return allowedParts.length === requestedParts.length;
}
