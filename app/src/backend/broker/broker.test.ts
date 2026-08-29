import { describe, expect, it } from 'vitest';
import type { ConfigBroker } from '../../generated/types.js';
import { Broker, filterCovers, topicMatches } from './broker.js';

const config: ConfigBroker = {
  id: 'broker',
  roles: [
    { role: 'clock', publish: ['ctl/clock', 'ctl/heartbeat'], subscribe: [] },
    { role: 'sensor', publish: ['obs/+/+'], subscribe: ['ctl/clock'] },
    { role: 'shell', publish: [], subscribe: ['#'] },
  ],
  heartbeat: { topic: 'ctl/heartbeat', interval_seconds: 2, liveness_window_seconds: 6 },
};

describe('topic matching', () => {
  it('matches exact topics, + one segment, # the remainder', () => {
    expect(topicMatches('ctl/clock', 'ctl/clock')).toBe(true);
    expect(topicMatches('ctl/clock', 'ctl/heartbeat')).toBe(false);
    expect(topicMatches('obs/+/temp', 'obs/thing1/temp')).toBe(true);
    expect(topicMatches('obs/+/temp', 'obs/thing1/salinity')).toBe(false);
    expect(topicMatches('obs/#', 'obs/thing1/temp')).toBe(true);
    expect(topicMatches('#', 'anything/at/all')).toBe(true);
    expect(topicMatches('obs/+', 'obs/thing1/temp')).toBe(false);
    expect(topicMatches('obs/thing1/temp', 'obs/thing1')).toBe(false);
  });

  it('judges filter coverage conservatively', () => {
    expect(filterCovers('#', 'obs/+/temp')).toBe(true);
    expect(filterCovers('obs/#', 'obs/+/temp')).toBe(true);
    expect(filterCovers('obs/+/+', 'obs/thing1/temp')).toBe(true);
    expect(filterCovers('obs/thing1/#', 'obs/#')).toBe(false);
    expect(filterCovers('ctl/clock', 'ctl/+')).toBe(false);
    expect(filterCovers('ctl/clock', 'ctl/clock')).toBe(true);
  });
});

describe('broker', () => {
  it('delivers to matching subscribers in subscription order', () => {
    const broker = new Broker(config);
    const clock = broker.connect('clock', 'clock');
    const shell = broker.connect('shell', 'shell');
    const sensor = broker.connect('sensor', 'sensor');
    const order: string[] = [];
    shell.subscribe('#', (m) => order.push(`shell:${m.topic}`));
    sensor.subscribe('ctl/clock', (m) => order.push(`sensor:${m.topic}`));
    clock.publish('ctl/clock', { tick: 0 });
    expect(order).toEqual(['shell:ctl/clock', 'sensor:ctl/clock']);
  });

  it('refuses an undeclared role by name', () => {
    const broker = new Broker(config);
    expect(() => broker.connect('x', 'imposter')).toThrow(/role 'imposter' is not declared/);
  });

  it('refuses a publish outside the role, naming role and topic', () => {
    const broker = new Broker(config);
    const sensor = broker.connect('sensor-1', 'sensor');
    expect(() => sensor.publish('ctl/clock', {})).toThrow(
      /role 'sensor' may not publish on 'ctl\/clock'/,
    );
  });

  it('refuses the shell any publish at all (E13 role discipline)', () => {
    const broker = new Broker(config);
    const shell = broker.connect('shell', 'shell');
    expect(() => shell.publish('anything', {})).toThrow(/may not publish/);
  });

  it('refuses a subscription the role does not cover, naming the filter', () => {
    const broker = new Broker(config);
    const sensor = broker.connect('sensor-1', 'sensor');
    expect(() => sensor.subscribe('#', () => undefined)).toThrow(
      /role 'sensor' may not subscribe with '#'/,
    );
  });

  it('keeps wire shape: no subscriber shares state with another', () => {
    const broker = new Broker(config);
    const clock = broker.connect('clock', 'clock');
    const shell = broker.connect('shell', 'shell');
    const seen: unknown[] = [];
    shell.subscribe('ctl/clock', (m) => {
      (m.payload as { tick: number }).tick = 999;
    });
    shell.subscribe('ctl/clock', (m) => seen.push(m.payload));
    const published = { tick: 1 };
    clock.publish('ctl/clock', published);
    expect(seen).toEqual([{ tick: 1 }]);
    expect(published.tick).toBe(1);
  });

  it('queues re-entrant publishes: every subscriber sees publication order', () => {
    const broker = new Broker(config);
    const clock = broker.connect('clock', 'clock');
    const shell = broker.connect('shell', 'shell');
    const order: string[] = [];
    shell.subscribe('ctl/clock', () => {
      clock.publish('ctl/heartbeat', { component: 'clock' });
      order.push('clock-handled');
    });
    shell.subscribe('ctl/heartbeat', () => order.push('heartbeat-handled'));
    clock.publish('ctl/clock', { tick: 0 });
    expect(order).toEqual(['clock-handled', 'heartbeat-handled']);
  });

  it('a handler fault is counted and does not silence later subscribers', () => {
    const broker = new Broker(config);
    const clock = broker.connect('clock', 'clock');
    const shell = broker.connect('shell', 'shell');
    const seen: string[] = [];
    shell.subscribe('ctl/clock', () => {
      throw new Error('planted');
    });
    shell.subscribe('ctl/clock', (m) => seen.push(m.topic));
    clock.publish('ctl/clock', { tick: 0 });
    expect(seen).toEqual(['ctl/clock']);
    expect(broker.deliveryFaults).toBe(1);
  });

  it('unsubscribe and disconnect genuinely stop delivery', () => {
    const broker = new Broker(config);
    const clock = broker.connect('clock', 'clock');
    const shell = broker.connect('shell', 'shell');
    const seen: string[] = [];
    const unsubscribe = shell.subscribe('ctl/clock', (m) => seen.push(m.topic));
    clock.publish('ctl/clock', {});
    unsubscribe();
    clock.publish('ctl/clock', {});
    expect(seen).toEqual(['ctl/clock']);
    shell.disconnect();
    expect(() => shell.subscribe('#', () => undefined)).toThrow(/disconnected/);
  });
});
