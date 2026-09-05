/**
 * The declared relations, held at their anchors and against the declaration itself.
 *
 * The arithmetic assertions came here with the functions, from `env-generator/analytic.test.ts`,
 * unchanged: the move must not have moved a number. They are not duplicated there any more,
 * because a test that reads the re-export holds the re-export rather than the relation.
 *
 * The last test is new and is the reason this file is worth its length. `SOUND_SPEED.implementation`
 * is a *path handed to a client* — a manifest crosses the wire saying "implemented there" — and
 * nothing had ever checked that "there" existed. It was wrong for the length of this change until
 * the move updated it, and it would go wrong again the next time this file is renamed, silently,
 * because a string is not a reference.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PRESSURE_RELATION,
  SOUND_SPEED,
  insideSoundSpeedValidity,
  pressureDbar,
  soundSpeedMs,
} from './ocean-relations.js';

describe('ocean relations', () => {
  it('pressure and sound speed behave at their anchors', () => {
    expect(pressureDbar(0)).toBe(0);
    expect(pressureDbar(1000)).toBeCloseTo(1007.5, 6);
    // Mackenzie's own anchor: 0°C, 35 psu, surface.
    expect(soundSpeedMs(0, 35, 0)).toBeCloseTo(1448.96, 2);
    const mid = soundSpeedMs(10, 35, 100);
    expect(mid).toBeGreaterThan(1480);
    expect(mid).toBeLessThan(1500);
  });

  it('pressure is the declared linear relation, not an approximation of it', () => {
    // The expression the manifest publishes is evaluated here against the function it names, so a
    // coefficient edited in one and not the other is a failure rather than a client's surprise.
    for (const depthM of [0, 12.5, 200, 1000, 8000]) {
      expect(pressureDbar(depthM)).toBeCloseTo(
        PRESSURE_RELATION.surface_dbar + PRESSURE_RELATION.dbar_per_metre * depthM,
        9,
      );
    }
  });

  it('sound speed rises with temperature, salinity and depth over the validity window', () => {
    const base = soundSpeedMs(10, 35, 100);
    expect(soundSpeedMs(11, 35, 100)).toBeGreaterThan(base);
    expect(soundSpeedMs(10, 36, 100)).toBeGreaterThan(base);
    expect(soundSpeedMs(10, 35, 200)).toBeGreaterThan(base);
  });

  it('the validity window admits its own edges and refuses just outside them', () => {
    const v = SOUND_SPEED.validity;
    expect(insideSoundSpeedValidity(v.min_temperature_c, v.min_salinity_psu, v.min_depth_m)).toBe(true);
    expect(insideSoundSpeedValidity(v.max_temperature_c, v.max_salinity_psu, v.max_depth_m)).toBe(true);
    expect(insideSoundSpeedValidity(v.min_temperature_c - 0.1, 35, 100)).toBe(false);
    expect(insideSoundSpeedValidity(v.max_temperature_c + 0.1, 35, 100)).toBe(false);
    expect(insideSoundSpeedValidity(10, v.min_salinity_psu - 0.1, 100)).toBe(false);
    expect(insideSoundSpeedValidity(10, v.max_salinity_psu + 0.1, 100)).toBe(false);
    expect(insideSoundSpeedValidity(10, 35, v.min_depth_m - 0.1)).toBe(false);
    expect(insideSoundSpeedValidity(10, 35, v.max_depth_m + 0.1)).toBe(false);
  });

  it('the implementation path a manifest publishes names a file that exports that symbol', () => {
    const [path, symbol] = SOUND_SPEED.implementation.split('#');
    expect(symbol).toBe('soundSpeedMs');
    // Repository-relative, as a reader of a served manifest would resolve it. This file is
    // `app/src/seam/`, so the root is three levels up.
    const source = readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
    expect(source).toContain(`export function ${symbol}(`);
  });
});
