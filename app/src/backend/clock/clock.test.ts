import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigClock } from '../../generated/types.js';
import type { SeamMessage } from '../../seam/transport.js';
import { Clock } from './clock.js';

function clockConfig(overrides: Partial<ConfigClock> = {}): ConfigClock {
  return {
    id: 'clock',
    epoch: '2026-01-01T00:00:00.000000Z',
    tick_interval_us: 1_000_000,
    mode: 'lockstep',
    rate: 0,
    min_rate: 0,
    max_rate: 3600,
    topics: { clock: 'ctl/clock' },
    http: { rate_path: '/api/ctl/clock/rate' },
    heartbeat: { topic: 'ctl/heartbeat', interval_seconds: 2, liveness_window_seconds: 6 },
    ...overrides,
  };
}

function recordingClient() {
  const published: SeamMessage[] = [];
  return {
    published,
    client: {
      publish: (topic: string, payload: unknown) =>
        void published.push({ topic, payload: JSON.parse(JSON.stringify(payload)) }),
      subscribe: () => () => undefined,
      disconnect: () => undefined,
    },
  };
}

describe('clock', () => {
  it('publishes tick 0 at start; tick values follow from epoch and interval alone', () => {
    const { client, published } = recordingClient();
    const clock = new Clock(clockConfig(), client, 'run-1');
    clock.start();
    expect(published).toHaveLength(1);
    expect(published[0].payload).toEqual({
      run_id: 'run-1',
      tick: 0,
      sim_time: '2026-01-01T00:00:00.000000Z',
      mode: 'lockstep',
      rate: 0,
    });
  });

  it('lockstep advances only when driven, and sim time follows the tick', () => {
    const { client, published } = recordingClient();
    const clock = new Clock(clockConfig(), client, 'run-1');
    clock.start();
    clock.tickOnce();
    clock.tickOnce();
    const ticks = published.map((m) => (m.payload as { tick: number }).tick);
    expect(ticks).toEqual([0, 1, 2]);
    expect((published[2].payload as { sim_time: string }).sim_time).toBe(
      '2026-01-01T00:00:02.000000Z',
    );
  });

  it('tickOnce outside lockstep is a programming error, named', () => {
    const { client } = recordingClient();
    const clock = new Clock(clockConfig({ mode: 'realtime', rate: 0 }), client, 'run-1');
    clock.start();
    expect(() => clock.tickOnce()).toThrow(/lockstep-only/);
  });

  it('refuses a rate outside the bounds, naming the bound (FR-36 discipline)', () => {
    const { client } = recordingClient();
    const clock = new Clock(clockConfig(), client, 'run-1');
    clock.start();
    expect(clock.setRate(9999).refusal).toBe('rate 9999 is above max_rate 3600');
    expect(clock.setRate(-1).refusal).toBe('rate -1 is below min_rate 0');
    expect(clock.setRate(Number.NaN).refusal).toMatch(/below min_rate/);
  });

  it('acknowledges a rate change by re-publishing the tick in force', () => {
    const { client, published } = recordingClient();
    const clock = new Clock(clockConfig(), client, 'run-1');
    clock.start();
    clock.tickOnce();
    expect(clock.setRate(0).applied).toBe(true);
    const last = published.at(-1)?.payload as { tick: number; rate: number };
    expect(last.tick).toBe(1);
    expect(last.rate).toBe(0);
  });

  describe('real-time driver', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('emits at tick_interval / rate in host time; rate zero pins it', () => {
      const { client, published } = recordingClient();
      const clock = new Clock(clockConfig({ mode: 'realtime', rate: 2 }), client, 'run-1');
      clock.start();
      vi.advanceTimersByTime(1000); // 2 ticks at 500ms host each
      expect(published).toHaveLength(3);
      clock.setRate(0);
      vi.advanceTimersByTime(5000);
      expect(published).toHaveLength(4); // only the acknowledgement arrived
      clock.stop();
    });

    it('a step advances one tick whatever the rate (FR-09)', () => {
      const { client, published } = recordingClient();
      const clock = new Clock(clockConfig({ mode: 'realtime', rate: 0 }), client, 'run-1');
      clock.start();
      clock.step();
      const ticks = published.map((m) => (m.payload as { tick: number }).tick);
      expect(ticks).toEqual([0, 1]);
      clock.stop();
    });
  });

  describe('the HTTP interface', () => {
    it('applies a valid PUT and reports the rate in force', () => {
      const { client } = recordingClient();
      const clock = new Clock(clockConfig(), client, 'run-1');
      clock.start();
      const response = clock.handleRateRequest({
        method: 'PUT',
        path: '/api/ctl/clock/rate',
        body: JSON.stringify({ rate: 60 }),
      });
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ applied: true, rate: 60, tick: 0 });
    });

    it('names each refusal: wrong method, non-JSON, wrong shape, out of bounds', () => {
      const { client } = recordingClient();
      const clock = new Clock(clockConfig(), client, 'run-1');
      clock.start();
      const request = (method: string, body: string) => clock.handleRateRequest({ method, path: '/x', body });
      expect(request('GET', '').status).toBe(405);
      expect(JSON.parse(request('PUT', 'not json').body).refused).toBe('body is not JSON');
      expect(JSON.parse(request('PUT', '{}').body).refused).toBe('body must be {"rate": number}');
      const bounds = request('PUT', JSON.stringify({ rate: 99999 }));
      expect(bounds.status).toBe(422);
      expect(JSON.parse(bounds.body).refused).toMatch(/above max_rate 3600/);
    });
  });
});
