import { describe, expect, it, vi } from 'vitest';
import { createSeamFetch, type SeamHttpBackend } from './http.js';

const echoBackend: SeamHttpBackend = {
  handle: (request) =>
    Promise.resolve({ status: 200, body: JSON.stringify({ echoed: request }) }),
};

describe('the fetch shim (ADR-0029)', () => {
  it('routes API-prefix requests to the seam backend as wire shape', async () => {
    const real = vi.fn();
    const seamFetch = createSeamFetch('/api', echoBackend, real as unknown as typeof fetch);
    const response = await seamFetch('/api/ctl/clock/rate', {
      method: 'PUT',
      body: JSON.stringify({ rate: 3 }),
    });
    expect(response.status).toBe(200);
    const { echoed } = (await response.json()) as { echoed: unknown };
    expect(echoed).toEqual({ method: 'PUT', path: '/api/ctl/clock/rate', body: '{"rate":3}' });
    expect(real).not.toHaveBeenCalled();
  });

  it('passes everything outside the prefix to the real fetch untouched', async () => {
    const real = vi.fn().mockResolvedValue(new Response('passthrough'));
    const seamFetch = createSeamFetch('/api', echoBackend, real as unknown as typeof fetch);
    await seamFetch('./assets/logo.svg');
    await seamFetch('https://example.invalid/api/not-ours');
    expect(real).toHaveBeenCalledTimes(2);
  });

  it('refuses a non-string body: nothing object-shaped crosses the seam', async () => {
    const seamFetch = createSeamFetch('/api', echoBackend, vi.fn() as unknown as typeof fetch);
    await expect(
      seamFetch('/api/x', { method: 'POST', body: new Blob(['x']) }),
    ).rejects.toThrow(/string bodies only/);
  });

  it('answers with a genuine Response carrying JSON content type', async () => {
    const seamFetch = createSeamFetch('/api', echoBackend, vi.fn() as unknown as typeof fetch);
    const response = await seamFetch('/api/x');
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get('content-type')).toBe('application/json');
  });
});
