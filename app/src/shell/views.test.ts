import { describe, expect, it } from 'vitest';
import { hashForView, viewFromHash } from './views.js';

describe('URL-addressable views (FR-15)', () => {
  it('round-trips a view id through the hash', () => {
    expect(viewFromHash(hashForView('system'))).toBe('system');
  });

  it('reads nothing from hashes that are not view addresses', () => {
    expect(viewFromHash('')).toBeUndefined();
    expect(viewFromHash('#/view/')).toBeUndefined();
    expect(viewFromHash('#/other/system')).toBeUndefined();
    expect(viewFromHash('#/view/Shouty')).toBeUndefined();
  });
});
