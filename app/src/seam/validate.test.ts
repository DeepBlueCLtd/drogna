import { describe, expect, it } from 'vitest';
import { createSeamValidator } from './validate.js';

describe('seam validation against the masters', () => {
  const validator = createSeamValidator();

  it('accepts a well-formed clock sample', () => {
    const verdict = validator.validate('clock', {
      run_id: 'loiter-abc',
      tick: 0,
      sim_time: '2026-01-01T00:00:00.000000Z',
      mode: 'realtime',
      rate: 1,
    });
    expect(verdict).toEqual({ ok: true, refusals: [] });
  });

  it('refuses a malformed message and names the fault', () => {
    const verdict = validator.validate('clock', { tick: -1 });
    expect(verdict.ok).toBe(false);
    expect(verdict.refusals.join('\n')).toMatch(/clock/);
  });

  it('refuses an additional property: the masters are closed shapes', () => {
    const verdict = validator.validate('heartbeat', {
      component: 'clock',
      sim_time: '2026-01-01T00:00:00.000000Z',
      status: 'ok',
      smuggled: true,
    });
    expect(verdict.ok).toBe(false);
  });

  it('names a master that does not exist rather than passing silently', () => {
    const verdict = validator.validate('no-such-shape', {});
    expect(verdict.ok).toBe(false);
    expect(verdict.refusals[0]).toMatch(/no master named 'no-such-shape'/);
  });

  it('holds every master loadable: a $ref to a missing file cannot land', () => {
    for (const key of ['config.run', 'config.clock', 'config.broker', 'config.boundary', 'config.shell', 'boundary-denial', 'run-manifest']) {
      expect(validator.has(key)).toBe(true);
      // Compiling exercises $ref resolution; an unresolvable ref throws here.
      validator.validate(key, {});
    }
  });
});
