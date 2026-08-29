import { describe, expect, it } from 'vitest';
import { addressFromHash, hashForView, hashOnActivation, viewFromHash } from './views.js';

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

describe('addressability below the panel (feature 111 FR-003, ADR-0032)', () => {
  it('round-trips a view id and an opaque remainder', () => {
    expect(addressFromHash(hashForView('background', 'mqtt/3'))).toEqual({
      view: 'background',
      rest: 'mqtt/3',
    });
  });

  it('reads the view id from an address that carries a remainder', () => {
    expect(viewFromHash('#/view/background/mqtt/3')).toBe('background');
  });

  it('carries no remainder when the address names the view alone', () => {
    expect(addressFromHash('#/view/system')).toEqual({ view: 'system' });
    expect(addressFromHash('#/view/system/')).toEqual({ view: 'system' });
  });

  it('hands the remainder on whole, whatever shape it is: the shell does not parse it', () => {
    expect(addressFromHash('#/view/background/one/two/three')?.rest).toBe('one/two/three');
    expect(addressFromHash('#/view/background/NOT-A-STEP')?.rest).toBe('NOT-A-STEP');
  });

  it('leaves the address alone when the activated panel is the one it already names', () => {
    expect(hashOnActivation('#/view/background/mqtt/3', 'background')).toBeUndefined();
    expect(hashOnActivation('#/view/background', 'background')).toBeUndefined();
  });

  it('names the newly active panel when the address named another', () => {
    expect(hashOnActivation('#/view/background/mqtt/3', 'map')).toBe('#/view/map');
    expect(hashOnActivation('', 'map')).toBe('#/view/map');
  });
});
