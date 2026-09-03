/**
 * The model kernel port, with two implementations behind it (ADR-0042).
 *
 * Two claims are on trial here, and they pull in opposite directions. The new kernel has
 * to do something the old one could not — propagate a state rather than translate a field
 * — and the port has to be unchanged, which means `shift-advect-v1` has to go on passing
 * against the interface as it was. A test suite that only exercised the newcomer would pass
 * happily against a port bent to fit it, which is the finding ADR-0042 says to watch for.
 *
 * The refusals are watched failing rather than asserted into existence: each is driven with
 * a configuration that genuinely violates the condition, and each is required to name the
 * numbers rather than to throw something.
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../lib/rng.js';
import {
  shallowTwoLayerKernel,
  shiftAdvectKernel,
  twoLayerStability,
  type KernelGrid,
  type KernelInitialState,
  type KernelParameters,
  type TwoLayerParameters,
} from './kernel.js';

const GRID: KernelGrid = {
  lonCount: 8,
  latCount: 6,
  depthCount: 4,
  cellKmEast: 10,
  cellKmNorth: 11,
  depthsM: [0, 100, 300, 600],
};

/** A field with one warm blob in it, so a displacement and a propagation look different. */
function initialState(): KernelInitialState {
  const cells = GRID.depthCount * GRID.latCount * GRID.lonCount;
  const temperature = new Float32Array(cells);
  const salinity = new Float32Array(cells);
  for (let d = 0; d < GRID.depthCount; d++) {
    for (let la = 0; la < GRID.latCount; la++) {
      for (let lo = 0; lo < GRID.lonCount; lo++) {
        const index = (d * GRID.latCount + la) * GRID.lonCount + lo;
        const radius = Math.hypot(lo - 3, la - 2);
        temperature[index] = 12 - d + 3 * Math.exp(-radius * radius * 0.3);
        salinity[index] = 35 + 0.1 * Math.exp(-radius * radius * 0.3);
      }
    }
  }
  return { grid: GRID, temperature, salinity };
}

function twoLayerParameters(): TwoLayerParameters {
  return {
    interfaceDepthM: 250,
    upper: { eastKmPerDay: 7, northKmPerDay: 3 },
    lower: { eastKmPerDay: -2, northKmPerDay: 1 },
    horizontalDiffusivityM2PerS: 45,
    interfacialExchangePerDay: 0.06,
    maxCourant: 0.4,
    maxSubSteps: 64,
  };
}

function parameters(overrides: Partial<KernelParameters> = {}): KernelParameters {
  return {
    steps: 3,
    stepSeconds: 900,
    advectionEastKmPerDay: 4,
    advectionNorthKmPerDay: 2,
    noiseStdTemperature: 0.02,
    noiseStdSalinity: 0.002,
    twoLayer: twoLayerParameters(),
    ...overrides,
  };
}

describe('shallow-two-layer-v1', () => {
  // AT-04: byte-identity
  it('replays byte-identically from the same seed, and differs from another (Constitution II, AT-04)', () => {
    const run = (seed: number) =>
      shallowTwoLayerKernel.memberField(initialState(), parameters(), new Rng(seed, 'model-runner:test'));
    const first = run(4242);
    const second = run(4242);
    const other = run(4243);
    expect(new Uint8Array(first.temperature.buffer)).toEqual(new Uint8Array(second.temperature.buffer));
    expect(new Uint8Array(first.salinity.buffer)).toEqual(new Uint8Array(second.salinity.buffer));
    // A seed that changes nothing would make the byte-identity claim above vacuous.
    expect(new Uint8Array(first.temperature.buffer)).not.toEqual(new Uint8Array(other.temperature.buffer));
  });

  it('writes the initialisation state at step 0, on the lead convention the manifest declares', () => {
    // The run's holding declares `start_offset_seconds: 0`, so index k is lead k x
    // stepSeconds and index 0 is the instant the run initialises from. Integrating before
    // the first write put every served instant one step out of register with its own label
    // — and put the field's step 0 one step ahead of the features published for the same
    // run on the same tick. Held against both kernels, because the convention belongs to
    // the port and not to either of them.
    const quiet = parameters({ noiseStdTemperature: 0, noiseStdSalinity: 0 });
    const initial = initialState();
    for (const kernel of [shallowTwoLayerKernel, shiftAdvectKernel]) {
      const out = kernel.memberField(initial, quiet, new Rng(3, 'model-runner:test'));
      let worst = 0;
      for (let cell = 0; cell < initial.temperature.length; cell++) {
        worst = Math.max(worst, Math.abs(out.temperature[cell] - initial.temperature[cell]));
      }
      expect(worst, `${kernel.name} step 0`).toBe(0);
    }
  });

  it('propagates a state rather than translating a field — the two layers shear apart', () => {
    // The distinguishing property, and the reason this kernel exists. `shift-advect-v1`
    // displaces every level by the same whole number of cells, so the difference between
    // two levels of its output is the difference between two levels of its input, moved.
    // Here the layers move at different velocities and exchange across the interface, so
    // the vertical structure itself changes. Driven with no noise, so what is measured is
    // the physics and not the draw.
    const quiet = parameters({ noiseStdTemperature: 0, noiseStdSalinity: 0 });
    const initial = initialState();
    const out = shallowTwoLayerKernel.memberField(initial, quiet, new Rng(7, 'model-runner:test'));
    const perLevel = GRID.latCount * GRID.lonCount;
    const perStep = GRID.depthCount * perLevel;
    const last = quiet.steps - 1;
    // Level 0 is in the upper layer and level 3 in the lower; the two are advected in
    // opposite directions along the east axis, so their profiles cannot stay parallel.
    const separationAt = (field: Float32Array, offset: number): number => {
      let worst = 0;
      for (let cell = 0; cell < perLevel; cell++) {
        const upper = field[offset + cell];
        const lower = field[offset + 3 * perLevel + cell];
        worst = Math.max(worst, Math.abs(upper - lower));
      }
      return worst;
    };
    const before = separationAt(initial.temperature, 0);
    const after = separationAt(out.temperature, last * perStep);
    expect(after).not.toBeCloseTo(before, 3);
  });

  it('refuses when the two-layer block is absent, and names what it wanted', () => {
    expect(() =>
      shallowTwoLayerKernel.memberField(initialState(), parameters({ twoLayer: undefined }), new Rng(1, 's')),
    ).toThrow(/two_layer/);
  });

  it('refuses an unstable configuration with the numbers named, rather than integrating it (SC-003)', () => {
    // Watched failing: a diffusivity four orders of magnitude past anything oceanographic,
    // which the explicit scheme cannot carry at any sub-step count under the ceiling. The
    // refusal has to state the numbers, because "unstable" without them is not a finding.
    const base = twoLayerParameters();
    const violent = parameters({ twoLayer: { ...base, horizontalDiffusivityM2PerS: 5_000_000 } });
    expect(() => twoLayerStability(violent, GRID.cellKmEast, GRID.cellKmNorth)).toThrow(
      /refuses this configuration.*Courant number.*diffusion number.*sub-steps against a ceiling of 64/s,
    );
    expect(() => shallowTwoLayerKernel.memberField(initialState(), violent, new Rng(1, 's'))).toThrow(/refuses/);
  });

  it('refuses an interface that puts every level in one layer', () => {
    const flat = parameters({ twoLayer: { ...twoLayerParameters(), interfaceDepthM: 5000 } });
    expect(() => shallowTwoLayerKernel.memberField(initialState(), flat, new Rng(1, 's'))).toThrow(
      /no interface to exchange across/,
    );
  });

  it('derives its sub-step count from the grid and the configuration, never from a constant', () => {
    // A cell ten times smaller needs more sub-steps for the same velocities and
    // diffusivity. If this ever comes back equal, the count has become a constant.
    const coarse = twoLayerStability(parameters(), 40, 40).subSteps;
    const fine = twoLayerStability(parameters(), 0.4, 0.4).subSteps;
    expect(fine).toBeGreaterThan(coarse);
    expect(shallowTwoLayerKernel.subStepsPerStep?.(parameters(), 11, 11)).toBe(
      twoLayerStability(parameters(), 11, 11).subSteps,
    );
  });
});

describe('shift-advect-v1, against the interface as it was (SC-004)', () => {
  it('still runs, unchanged, and declares no work', () => {
    // The port's second implementation must not have bent the interface: this calls the
    // old kernel exactly as the runner has always called it, with the two-layer block
    // present and ignored, and asks the port for work it does not do.
    const out = shiftAdvectKernel.memberField(initialState(), parameters(), new Rng(11, 'model-runner:test'));
    expect(out.temperature.length).toBe(3 * GRID.depthCount * GRID.latCount * GRID.lonCount);
    expect(shiftAdvectKernel.subStepsPerStep).toBeUndefined();
  });

  it('translates rather than propagates — every level moves the same way', () => {
    // The property that made the old kernel a translation, stated as a test so that the
    // claim in ADR-0042 is checked rather than asserted. With no noise, the output at any
    // step is the initial state sampled at a displaced cell, identically at every level.
    const quiet = parameters({ noiseStdTemperature: 0, noiseStdSalinity: 0, steps: 2 });
    const initial = initialState();
    const out = shiftAdvectKernel.memberField(initial, quiet, new Rng(11, 'model-runner:test'));
    const perLevel = GRID.latCount * GRID.lonCount;
    const perStep = GRID.depthCount * perLevel;
    for (let cell = 0; cell < perLevel; cell++) {
      const upperMoved = out.temperature[perStep + cell] - initial.temperature[cell];
      const lowerMoved = out.temperature[perStep + 3 * perLevel + cell] - initial.temperature[3 * perLevel + cell];
      // Both levels see the same displacement applied to the same horizontal structure,
      // and the vertical offset between levels is a constant, so the two differences agree.
      expect(upperMoved).toBeCloseTo(lowerMoved, 5);
    }
  });
});
