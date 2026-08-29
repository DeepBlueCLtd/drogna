import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun, Heartbeat } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { buildBackend } from './runtime.js';

const validator = createSeamValidator();

/** The shipped configuration, in lockstep so tests drive time rather than timers. */
function testConfig(): ConfigRun {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  return config;
}

const options = { rootSeed: 42, revision: 'test', dirty: false };

describe('the backend runtime', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('the shipped configuration document is valid against its masters', () => {
    const verdict = validator.validate('config.run', runConfigDocument);
    expect(verdict.refusals).toEqual([]);
  });

  it('refuses an invalid configuration before any component runs', () => {
    const broken = testConfig();
    (broken.clock as { epoch?: string }).epoch = undefined;
    expect(() => buildBackend(broken, options, validator)).toThrow(/refused by its master/);
  });

  it('provisions a run whose manifest validates against run-manifest', () => {
    const runtime = buildBackend(testConfig(), options, validator);
    const verdict = validator.validate('run-manifest', runtime.manifest);
    expect(verdict.refusals).toEqual([]);
    expect(runtime.manifest.run_id).toBe('loiter-16');
    runtime.stop();
  });

  it('is deterministic: the same seed provisions the same manifest', () => {
    const first = buildBackend(testConfig(), options, validator);
    const second = buildBackend(testConfig(), options, validator);
    expect(second.manifest).toEqual(first.manifest);
    first.stop();
    second.stop();
  });

  it('heartbeats arrive over the broker from every 101 component, and validate', () => {
    const config = testConfig();
    const runtime = buildBackend(config, options, validator);
    const shell = runtime.transport.connect('shell', 'shell');
    const heard = new Map<string, Heartbeat>();
    shell.subscribe(config.shell.topics.heartbeat, (message) => {
      const heartbeat = message.payload as Heartbeat;
      expect(validator.validate('heartbeat', heartbeat).refusals).toEqual([]);
      heard.set(heartbeat.component, heartbeat);
    });
    vi.advanceTimersByTime(2500);
    expect([...heard.keys()].sort()).toEqual([
      'boundary',
      'broker',
      'clock',
      'coverage-store',
      'env-generator',
      'feature-store',
      'ingest',
      'observation-store',
      'query',
      'sensors',
    ]);
    expect(heard.get('broker')?.sim_time).toBe('2026-01-01T00:00:00.000000Z');
    runtime.stop();
  });

  it('a stopped runtime goes silent: heartbeats cease, nothing lies', () => {
    const config = testConfig();
    const runtime = buildBackend(config, options, validator);
    const shell = runtime.transport.connect('shell', 'shell');
    let count = 0;
    shell.subscribe(config.shell.topics.heartbeat, () => void (count += 1));
    runtime.stop();
    const after = count;
    vi.advanceTimersByTime(10_000);
    expect(count).toBe(after);
  });

  describe('the boundary (E8: the allowed path is tested, not only the denials)', () => {
    it('clears the control prefix through to the clock, and the rate applies', async () => {
      const config = testConfig();
      const runtime = buildBackend(config, options, validator);
      const response = await runtime.httpBackend.handle({
        method: 'PUT',
        path: config.clock.http.rate_path,
        body: JSON.stringify({ rate: 0 }),
      });
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ applied: true, rate: 0, tick: 0 });
      runtime.stop();
    });

    it('default-denies everything else, names the rule, and publishes the denial', async () => {
      const config = testConfig();
      const runtime = buildBackend(config, options, validator);
      const shell = runtime.transport.connect('shell', 'shell');
      const denials: unknown[] = [];
      shell.subscribe(config.boundary.topics.denial, (message) => void denials.push(message.payload));
      const response = await runtime.httpBackend.handle({
        method: 'GET',
        path: '/api/collections/secret',
        body: '',
      });
      expect(response.status).toBe(403);
      expect(JSON.parse(response.body).rule).toBe('default deny at the boundary');
      expect(denials).toEqual([
        {
          component: 'boundary',
          path: '/api/collections/secret',
          method: 'GET',
          rule: 'default deny at the boundary',
        },
      ]);
      expect(validator.validate('boundary-denial', denials[0]).refusals).toEqual([]);
      runtime.stop();
    });

    it('tells a wrong method apart from a wrong path inside the cleared prefix', async () => {
      const config = testConfig();
      const runtime = buildBackend(config, options, validator);
      const wrongMethod = await runtime.httpBackend.handle({
        method: 'GET',
        path: config.clock.http.rate_path,
        body: '',
      });
      expect(wrongMethod.status).toBe(405);
      const wrongPath = await runtime.httpBackend.handle({
        method: 'GET',
        path: '/api/ctl/no-such-thing',
        body: '',
      });
      expect(wrongPath.status).toBe(404);
      expect(JSON.parse(wrongPath.body).refused).toMatch(/no route serves/);
      runtime.stop();
    });
  });
});
