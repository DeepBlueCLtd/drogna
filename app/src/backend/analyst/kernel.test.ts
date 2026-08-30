/**
 * Feature 115: the analysis maths, on its own.
 *
 * Nothing here is mocked and nothing here is asserted from a number somebody chose.
 * The instrument error the observations declare is read from `config/run.json`, the
 * same document the sensors draw their noise from; the closed forms the reported
 * gain and analysis error are checked against are derived here from those inputs; and
 * the convergence claim carries a negative control, because a check that has never
 * been seen to fail is worth nothing (CLAUDE.md, lesson 2).
 */
import { describe, expect, it } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun } from '../../generated/types.js';
import { Rng } from '../lib/rng.js';
import { choleskyFactor, choleskyInverse, choleskySolve } from './linalg.js';
import {
  gaspariCohn,
  optimalInterpolationKernel,
  propagateShares,
  type AnalysisGrid,
  type AnalysisObservation,
  type AnalysisParameters,
  type AnalysisState,
} from './kernel.js';

const config = runConfigDocument as ConfigRun;

/** The temperature instrument's declared error, off the disk the sensors read. */
function declaredTemperatureErrorStd(): number {
  const instrument = config.sensors.instruments.find(
    (candidate) => candidate.observed_property === 'temperature',
  );
  if (!instrument) throw new Error('the sensors document declares no temperature instrument to take an error from');
  return instrument.noise_std;
}

const GRID: AnalysisGrid = {
  longitude: { minimum: -4, spacing: 0.25, count: 9 },
  latitude: { minimum: 50, spacing: 0.2, count: 7 },
  depth: { minimum: 0, spacing: 50, count: 2 },
  cellKmEast: 17.8,
  cellKmNorth: 22.3,
};

const CELLS = GRID.depth.count * GRID.latitude.count * GRID.longitude.count;

/** The four bars the figure stacks. */
const ARCHIVE = 0;
const DEPARTURE = 1;
const MEASUREMENT = 2;
const MODEL = 3;

/**
 * The half-widths the analyst declares. They are a modelling assumption and nothing
 * else: the analyst may not read the world's own feature scales, because that
 * configuration describes the truth and reading it is exactly what this feature's
 * gate forbids. The values sit at the scale of the smallest feature the world is
 * built from, which is a property of a harness where the answer is known and is
 * argued in specs/115 rather than smuggled in here.
 */
const PARAMETERS: AnalysisParameters = {
  horizontalKm: 30,
  verticalM: 160,
  measurementShareIndex: MEASUREMENT,
};

/** ρ between a cell and the observed cell, from the kernel's own taper. */
function rhoBetween(dLon: number, dLat: number, dDepth: number): number {
  const east = dLon * GRID.cellKmEast;
  const north = dLat * GRID.cellKmNorth;
  const down = dDepth * GRID.depth.spacing;
  return gaspariCohn(
    Math.sqrt(
      (east * east + north * north) / (PARAMETERS.horizontalKm * PARAMETERS.horizontalKm) +
        (down * down) / (PARAMETERS.verticalM * PARAMETERS.verticalM),
    ),
  );
}

function cellIndexOf(depthIndex: number, latIndex: number, lonIndex: number): number {
  return (depthIndex * GRID.latitude.count + latIndex) * GRID.longitude.count + lonIndex;
}

function longitudeOf(lonIndex: number): number {
  return GRID.longitude.minimum + lonIndex * GRID.longitude.spacing;
}

function latitudeOf(latIndex: number): number {
  return GRID.latitude.minimum + latIndex * GRID.latitude.spacing;
}

function depthOf(depthIndex: number): number {
  return GRID.depth.minimum + depthIndex * GRID.depth.spacing;
}

/**
 * A smooth field standing in for the ocean. The kernel's contract is about fields,
 * not about this harness's sea: the analytic world enters at the component that will
 * call the kernel, and putting it here would make a unit test depend on a manifest.
 */
function truthAt(lonIndex: number, latIndex: number, depthIndex: number): number {
  const east = lonIndex - 4;
  const north = latIndex - 3;
  return 12 - 0.02 * depthOf(depthIndex) + 0.35 * east + 0.2 * north + 1.4 * Math.exp(-(east * east + north * north) / 6);
}

/** A background: truth plus a smooth error, with a uniform declared spread. */
function backgroundState(errorStd: number, bias = 0.8): AnalysisState {
  const values = new Float32Array(CELLS);
  const spread = new Float32Array(CELLS);
  const shares = [new Float32Array(CELLS), new Float32Array(CELLS), new Float32Array(CELLS), new Float32Array(CELLS)];
  for (let d = 0; d < GRID.depth.count; d++) {
    for (let la = 0; la < GRID.latitude.count; la++) {
      for (let lo = 0; lo < GRID.longitude.count; lo++) {
        const cell = cellIndexOf(d, la, lo);
        values[cell] = truthAt(lo, la, d) + bias * Math.cos((lo + la) / 3);
        spread[cell] = errorStd;
        // At the quay: everything the field knows, it knows from the archive, carried
        // forward by the run that was valid when the boat left.
        shares[ARCHIVE][cell] = 0.4;
        shares[DEPARTURE][cell] = 0.6;
        shares[MEASUREMENT][cell] = 0;
        shares[MODEL][cell] = 0;
      }
    }
  }
  return { values, errorStd: spread, shares };
}

function observationAt(lonIndex: number, latIndex: number, depthIndex: number, value: number, errorStd: number): AnalysisObservation {
  return {
    longitude: longitudeOf(lonIndex),
    latitude: latitudeOf(latIndex),
    depthM: depthOf(depthIndex),
    value,
    errorStd,
  };
}

function rootMeanSquare(field: Float32Array, over: readonly number[]): number {
  let sum = 0;
  for (const cell of over) {
    const error = field[cell] - truthOfCell(cell);
    sum += error * error;
  }
  return Math.sqrt(sum / over.length);
}

function truthOfCell(cell: number): number {
  const lo = cell % GRID.longitude.count;
  const la = Math.floor(cell / GRID.longitude.count) % GRID.latitude.count;
  const d = Math.floor(cell / (GRID.longitude.count * GRID.latitude.count));
  return truthAt(lo, la, d);
}

const ALL_CELLS = Array.from({ length: CELLS }, (_, cell) => cell);

describe('the dense solve', () => {
  it('factors and solves a system the analysis could actually raise', () => {
    // B for two correlated cells plus each instrument's error: symmetric, positive
    // definite, and the shape every cycle produces.
    const order = 2;
    const matrix = Float64Array.from([0.25 + 0.01, 0.25 * 0.6, 0.25 * 0.6, 0.25 + 0.01]);
    const factor = choleskyFactor(matrix, order);
    const solution = choleskySolve(factor, order, Float64Array.from([0.4, -0.1]));
    for (let row = 0; row < order; row++) {
      let recovered = 0;
      for (let column = 0; column < order; column++) recovered += matrix[row * order + column] * solution[column];
      expect(recovered).toBeCloseTo([0.4, -0.1][row], 12);
    }
  });

  it('gives an inverse that multiplies back to the identity', () => {
    const order = 3;
    const matrix = Float64Array.from([4, 1, 0.5, 1, 3, 0.25, 0.5, 0.25, 2]);
    const inverse = choleskyInverse(choleskyFactor(matrix, order), order);
    for (let row = 0; row < order; row++) {
      for (let column = 0; column < order; column++) {
        let product = 0;
        for (let k = 0; k < order; k++) product += matrix[row * order + k] * inverse[k * order + column];
        expect(product).toBeCloseTo(row === column ? 1 : 0, 12);
      }
    }
  });

  it('refuses a system that cannot arise from a covariance and an error, naming the pivot', () => {
    // Two observations at one cell, both declaring no error: B is rank one and R is
    // empty, so the second pivot has nothing left. The refusal says which.
    const duplicated = Float64Array.from([0.25, 0.25, 0.25, 0.25]);
    expect(() => choleskyFactor(duplicated, 2)).toThrow(/pivot 1/);
  });
});

describe('optimal interpolation', () => {
  it('leaves the field and every share untouched when nothing was measured', () => {
    const background = backgroundState(0.3);
    const analysis = optimalInterpolationKernel.analyse(background, [], GRID, PARAMETERS);
    expect(Array.from(analysis.values)).toEqual(Array.from(background.values));
    expect(Array.from(analysis.errorStd)).toEqual(Array.from(background.errorStd));
    expect(Array.from(analysis.shares[MEASUREMENT])).toEqual(Array.from(background.shares[MEASUREMENT]));
    expect(analysis.observations).toEqual([]);
  });

  it('takes the observation whole where the instrument declares no error', () => {
    const background = backgroundState(0.3);
    const cell = cellIndexOf(0, 3, 4);
    const analysis = optimalInterpolationKernel.analyse(
      background,
      [observationAt(4, 3, 0, 14.5, 0)],
      GRID,
      PARAMETERS,
    );
    // K → 1 at the observed cell, so the analysis is the observation, the analysis
    // error there is nil, and measurement owns the whole of that cell's provenance.
    expect(analysis.values[cell]).toBeCloseTo(14.5, 5);
    expect(analysis.errorStd[cell]).toBeCloseTo(0, 6);
    expect(analysis.observationWeight[cell]).toBeCloseTo(1, 6);
    expect(analysis.shares[MEASUREMENT][cell]).toBeCloseTo(1, 5);
    expect(analysis.shares[ARCHIVE][cell]).toBeCloseTo(0, 5);
    expect(analysis.shares[DEPARTURE][cell]).toBeCloseTo(0, 5);
  });

  it('ignores an observation whose declared error swamps the background', () => {
    const background = backgroundState(0.3);
    const cell = cellIndexOf(0, 3, 4);
    const analysis = optimalInterpolationKernel.analyse(
      background,
      [observationAt(4, 3, 0, 40, 1e6)],
      GRID,
      PARAMETERS,
    );
    expect(analysis.values[cell]).toBeCloseTo(background.values[cell], 6);
    expect(analysis.observationWeight[cell]).toBeCloseTo(0, 6);
    expect(analysis.shares[MEASUREMENT][cell]).toBeCloseTo(0, 6);
  });

  it('reports the gain and the analysis error the closed form gives, not a number chosen here', () => {
    const backgroundStd = 0.3;
    const observationStd = declaredTemperatureErrorStd();
    const background = backgroundState(backgroundStd);
    const cell = cellIndexOf(0, 3, 4);
    const analysis = optimalInterpolationKernel.analyse(
      background,
      [observationAt(4, 3, 0, 14.5, observationStd)],
      GRID,
      PARAMETERS,
    );
    // One observation: K = σb² / (σb² + σo²), and Pᵃ = σb²σo² / (σb² + σo²).
    const expectedGain = (backgroundStd * backgroundStd) / (backgroundStd * backgroundStd + observationStd * observationStd);
    const expectedErrorStd = Math.sqrt(
      (backgroundStd * backgroundStd * observationStd * observationStd) /
        (backgroundStd * backgroundStd + observationStd * observationStd),
    );
    expect(analysis.observationWeight[cell]).toBeCloseTo(expectedGain, 6);
    expect(analysis.errorStd[cell]).toBeCloseTo(expectedErrorStd, 6);
    expect(analysis.values[cell]).toBeCloseTo(
      background.values[cell] + expectedGain * (14.5 - background.values[cell]),
      5,
    );
  });

  it('confines the increment to the measured cell when nothing is correlated with anything', () => {
    const background = backgroundState(0.3);
    const uncorrelated = { ...PARAMETERS, horizontalKm: 0, verticalM: 0 };
    const analysis = optimalInterpolationKernel.analyse(
      background,
      [observationAt(4, 3, 0, 14.5, 0.02)],
      GRID,
      uncorrelated,
    );
    const measured = cellIndexOf(0, 3, 4);
    for (const cell of ALL_CELLS) {
      if (cell === measured) expect(analysis.values[cell]).not.toBeCloseTo(background.values[cell], 4);
      else expect(analysis.values[cell]).toBeCloseTo(background.values[cell], 6);
    }
  });

  it('reaches further as the correlation length grows', () => {
    const background = backgroundState(0.3);
    const near = optimalInterpolationKernel.analyse(
      background,
      [observationAt(4, 3, 0, 14.5, 0.02)],
      GRID,
      { ...PARAMETERS, horizontalKm: 20 },
    );
    const far = optimalInterpolationKernel.analyse(
      background,
      [observationAt(4, 3, 0, 14.5, 0.02)],
      GRID,
      { ...PARAMETERS, horizontalKm: 120 },
    );
    const distant = cellIndexOf(0, 3, 8);
    expect(Math.abs(far.values[distant] - background.values[distant])).toBeGreaterThan(
      Math.abs(near.values[distant] - background.values[distant]),
    );
  });

  it('reduces doubt by \u03c1\u00b2 of what it reduced where it measured, and never raises it', () => {
    const backgroundStd = 0.3;
    const observationStd = declaredTemperatureErrorStd();
    const background = backgroundState(backgroundStd);
    const analysis = optimalInterpolationKernel.analyse(
      background,
      [observationAt(4, 3, 0, 14.5, observationStd)],
      GRID,
      PARAMETERS,
    );
    for (const cell of ALL_CELLS) {
      expect(analysis.errorStd[cell]).toBeLessThanOrEqual(background.errorStd[cell] + 1e-6);
    }
    // For one observation the closed form is exact everywhere:
    //   σ²ₐ = σ²ᵇ − σ⁴ᵇρ² / (σ²ᵇ + σ²ₒ)
    // so the reduction anywhere is exactly ρ² of the reduction at the observed cell.
    // Checked against the taper's own value at that separation rather than against a
    // tolerance, at a cell three cells north, four east and a depth level away.
    const remote = cellIndexOf(1, 0, 0);
    const rho = rhoBetween(4, 3, 1);
    const variance = backgroundStd * backgroundStd;
    const expectedRemote = Math.sqrt(
      variance - (variance * variance * rho * rho) / (variance + observationStd * observationStd),
    );
    expect(analysis.errorStd[remote]).toBeCloseTo(expectedRemote, 6);
    // And at that separation the taper has reached its support, so this is not a
    // decayed reduction but no reduction: doubt is untouched where the measurement
    // cannot reach, exactly, which is what a Gaussian could never say.
    expect(rho).toBe(0);
    expect(analysis.errorStd[remote]).toBe(background.errorStd[remote]);
    expect(analysis.errorStd[cellIndexOf(0, 3, 4)]).toBeLessThan(background.errorStd[cellIndexOf(0, 3, 4)]);
  });

  it('keeps every cell’s shares summing to one, over repeated cycles', () => {
    const rng = new Rng(4242, 'analyst-test:shares');
    const observationStd = declaredTemperatureErrorStd();
    let state = backgroundState(0.3);
    for (let cycle = 0; cycle < 4; cycle++) {
      const lonIndex = 2 + cycle;
      const observations = [0, 1].map((depthIndex) =>
        observationAt(lonIndex, 3, depthIndex, truthAt(lonIndex, 3, depthIndex) + rng.normal(0, observationStd), observationStd),
      );
      const analysis = optimalInterpolationKernel.analyse(state, observations, GRID, PARAMETERS);
      for (const cell of ALL_CELLS) {
        const total =
          analysis.shares[ARCHIVE][cell] +
          analysis.shares[DEPARTURE][cell] +
          analysis.shares[MEASUREMENT][cell] +
          analysis.shares[MODEL][cell];
        expect(total).toBeCloseTo(1, 4);
      }
      // The forecast step would advect the shares; the kernel's contract is that it
      // hands back a state of the same shape it was given, so the next cycle can
      // take it as its background directly.
      state = { values: analysis.values, errorStd: analysis.errorStd, shares: analysis.shares };
    }
    // Measurement's share falls away from the track, which is the property the
    // provenance figure is built on. Each step is inside the taper's support; the
    // step beyond it is the subject of the next test.
    const onTrack = state.shares[MEASUREMENT][cellIndexOf(0, 3, 4)];
    const oneNorth = state.shares[MEASUREMENT][cellIndexOf(0, 2, 4)];
    const twoNorth = state.shares[MEASUREMENT][cellIndexOf(0, 1, 4)];
    expect(rhoBetween(0, 2, 0)).toBeGreaterThan(0);
    expect(onTrack).toBeGreaterThan(oneNorth);
    expect(oneNorth).toBeGreaterThan(twoNorth);
  });

  it('leaves a cell the measurement cannot reach owing it exactly nothing', () => {
    // What the taper bought. Before it, four cycles over one short track left
    // measurement owning at least 0.449 of every cell in the domain — including a
    // corner the platform never approached — because a Gaussian never quite reaches
    // zero and p ← (1−ω)p + ω credited measurement again on every cycle. With compact
    // support the same run leaves most of the domain owing the measurements nothing
    // at all, and that is a fact the provenance tint can state rather than a small
    // number it has to round.
    const rng = new Rng(4242, 'analyst-test:reach');
    const observationStd = declaredTemperatureErrorStd();
    let state = backgroundState(0.3);
    for (let cycle = 0; cycle < 4; cycle++) {
      const lonIndex = 2 + cycle;
      const observations = [0, 1].map((depthIndex) =>
        observationAt(lonIndex, 3, depthIndex, truthAt(lonIndex, 3, depthIndex) + rng.normal(0, observationStd), observationStd),
      );
      const analysis = optimalInterpolationKernel.analyse(state, observations, GRID, PARAMETERS);
      state = { values: analysis.values, errorStd: analysis.errorStd, shares: analysis.shares };
    }
    expect(state.shares[MEASUREMENT][cellIndexOf(0, 3, 4)]).toBeGreaterThan(0.9);
    // Every observation sat on latitude row 3. Rows 0 and 6 are three rows away, and
    // three rows is 66.9 km against a support of 60, so the taper is identically zero
    // there — derived from the geometry, not asserted from a run.
    expect(rhoBetween(0, 3, 0)).toBe(0);
    for (const latIndex of [0, 6]) {
      for (let depthIndex = 0; depthIndex < GRID.depth.count; depthIndex++) {
        for (let lonIndex = 0; lonIndex < GRID.longitude.count; lonIndex++) {
          expect(state.shares[MEASUREMENT][cellIndexOf(depthIndex, latIndex, lonIndex)]).toBe(0);
        }
      }
    }
    const untouched = Array.from(state.shares[MEASUREMENT]).filter((share) => share === 0).length;
    expect(untouched).toBeGreaterThan(CELLS / 4);
  });

  it('lets the weight exceed one where the background is far less certain than the measured cell', () => {
    // Not a defect and not clamped: where a cell's own background error dwarfs the
    // observed cell's, optimal interpolation extrapolates, the weight passes one and
    // the prior shares go negative. Held as a test so the display cannot meet it as
    // a surprise, and so a later decision to clamp for drawing is made knowingly.
    const background = backgroundState(0.3);
    const uncertain = cellIndexOf(0, 3, 5);
    const spread = Float32Array.from(background.errorStd);
    spread[uncertain] = 6;
    const analysis = optimalInterpolationKernel.analyse(
      { ...background, errorStd: spread },
      [observationAt(4, 3, 0, 14.5, 0.001)],
      GRID,
      PARAMETERS,
    );
    expect(analysis.observationWeight[uncertain]).toBeGreaterThan(1);
    expect(analysis.shares[ARCHIVE][uncertain]).toBeLessThan(0);
    const total =
      analysis.shares[ARCHIVE][uncertain] +
      analysis.shares[DEPARTURE][uncertain] +
      analysis.shares[MEASUREMENT][uncertain] +
      analysis.shares[MODEL][uncertain];
    expect(total).toBeCloseTo(1, 4);
  });
});

describe('the taper', () => {
  it('is one at no separation, zero at and beyond its support, and continuous between', () => {
    expect(gaspariCohn(0)).toBeCloseTo(1, 12);
    expect(gaspariCohn(2)).toBeCloseTo(0, 12);
    expect(gaspariCohn(2.5)).toBe(0);
    expect(gaspariCohn(-1.3)).toBeCloseTo(gaspariCohn(1.3), 12);
    // The two polynomial pieces must agree where they meet, or the covariance has a
    // step in it and is no longer the function Gaspari and Cohn proved things about.
    expect(gaspariCohn(1 - 1e-9)).toBeCloseTo(gaspariCohn(1 + 1e-9), 8);
    // Monotone decreasing across the support.
    let previous = gaspariCohn(0);
    for (let z = 0.05; z <= 2; z += 0.05) {
      const value = gaspariCohn(z);
      expect(value).toBeLessThanOrEqual(previous + 1e-12);
      previous = value;
    }
  });

  it('builds a system the factorisation accepts, which a truncated Gaussian need not', () => {
    // The reason for the taper. A covariance tapered by Gaspari–Cohn stays positive
    // definite, so the analysis's system can always be factorised; a Gaussian cut off
    // at a radius is not, and this is the case that shows it. Sixteen observations in
    // a line, spaced so that some pairs fall either side of the cutoff, with an
    // observation error small enough not to rescue a system that is not SPD.
    const order = 16;
    const tiny = 1e-9;
    const separation = (i: number, j: number) => Math.abs(i - j) * 0.35;
    const tapered = new Float64Array(order * order);
    const truncated = new Float64Array(order * order);
    for (let i = 0; i < order; i++) {
      for (let j = 0; j < order; j++) {
        const z = separation(i, j);
        tapered[i * order + j] = gaspariCohn(z);
        truncated[i * order + j] = z >= 2 ? 0 : Math.exp(-0.5 * z * z);
      }
      tapered[i * order + i] += tiny;
      truncated[i * order + i] += tiny;
    }
    expect(() => choleskyFactor(tapered, order)).not.toThrow();
    expect(() => choleskyFactor(truncated, order)).toThrow(/not positive definite/);
  });
});

describe('the clamp record', () => {
  it('reports the small displacement every observation suffers, and does not call it clamping', () => {
    const background = backgroundState(0.3);
    // Half a cell east of a grid point: attributed to the nearest, moved a little,
    // and inside the domain throughout.
    const inside: AnalysisObservation = {
      longitude: longitudeOf(4) + GRID.longitude.spacing * 0.4,
      latitude: latitudeOf(3),
      depthM: depthOf(0),
      value: 14.5,
      errorStd: declaredTemperatureErrorStd(),
    };
    const analysis = optimalInterpolationKernel.analyse(background, [inside], GRID, PARAMETERS);
    expect(analysis.observations[0].clamped).toBe(false);
    expect(analysis.observations[0].displacementKm).toBeCloseTo(0.4 * GRID.cellKmEast, 6);
    expect(analysis.observations[0].cellIndex).toBe(cellIndexOf(0, 3, 4));
  });

  it('assimilates an observation from outside the domain, and says how far it was moved', () => {
    const background = backgroundState(0.3);
    // Three cells west of the western edge. The domain boundary is where the harness
    // stopped authoring a field, not where the ocean stops, so the reading is kept —
    // and the lineage carries the distance it travelled to be used.
    const outside: AnalysisObservation = {
      longitude: longitudeOf(0) - 3 * GRID.longitude.spacing,
      latitude: latitudeOf(3),
      depthM: depthOf(0),
      value: 14.5,
      errorStd: declaredTemperatureErrorStd(),
    };
    const analysis = optimalInterpolationKernel.analyse(background, [outside], GRID, PARAMETERS);
    expect(analysis.observations[0].clamped).toBe(true);
    expect(analysis.observations[0].cellIndex).toBe(cellIndexOf(0, 3, 0));
    expect(analysis.observations[0].displacementKm).toBeCloseTo(3 * GRID.cellKmEast, 6);
    // Kept, not discarded: the edge cell moved.
    expect(analysis.values[cellIndexOf(0, 3, 0)]).not.toBeCloseTo(background.values[cellIndexOf(0, 3, 0)], 4);
  });
});

describe('the forecast step ages a measurement', () => {
  it('dilutes every share by what it still explains, and credits the rest to the model', () => {
    const cells = 3;
    const shares = [
      Float32Array.from([0.2, 0, 0]),
      Float32Array.from([0.3, 0, 0]),
      Float32Array.from([0.5, 1, 0]),
      Float32Array.from([0, 0, 1]),
    ];
    const analysed = Float32Array.from([0.2, 0.2, 0.2]);
    // Cell 0 doubles its variance, cell 1 keeps it, cell 2 quadruples it.
    const forecast = Float32Array.from([0.2 * Math.SQRT2, 0.2, 0.4]);
    const after = propagateShares(shares, analysed, forecast, MODEL);
    // Cell 0: half the forecast variance is inherited, half is new model error.
    expect(after[ARCHIVE][0]).toBeCloseTo(0.1, 5);
    expect(after[DEPARTURE][0]).toBeCloseTo(0.15, 5);
    expect(after[MEASUREMENT][0]).toBeCloseTo(0.25, 5);
    expect(after[MODEL][0]).toBeCloseTo(0.5, 5);
    // Cell 1: a forecast that added nothing changes nothing.
    expect(after[MEASUREMENT][1]).toBeCloseTo(1, 6);
    expect(after[MODEL][1]).toBeCloseTo(0, 6);
    // Cell 2: a quarter inherited.
    expect(after[MODEL][2]).toBeCloseTo(1, 6);
    for (let cell = 0; cell < cells; cell++) {
      const total = after.reduce((sum, share) => sum + share[cell], 0);
      expect(total).toBeCloseTo(1, 5);
    }
  });

  it('decays a measurement toward the model as its forecast ages, which is the point', () => {
    // One cell, measured once and never again, forecast repeatedly. The share must
    // fall — a value measured a week ago and advected since is not a measurement any
    // more, and a figure that says otherwise is lying about how much is known.
    let shares: Float32Array[] = [Float32Array.from([0]), Float32Array.from([0]), Float32Array.from([1]), Float32Array.from([0])];
    const analysed = Float32Array.from([0.1]);
    const forecast = Float32Array.from([0.1 * Math.sqrt(1.5)]);
    const trail: number[] = [];
    for (let step = 0; step < 6; step++) {
      shares = propagateShares(shares, analysed, forecast, MODEL);
      trail.push(shares[MEASUREMENT][0]);
    }
    for (let step = 1; step < trail.length; step++) expect(trail[step]).toBeLessThan(trail[step - 1]);
    expect(trail[trail.length - 1]).toBeLessThan(0.1);
  });

  it('refuses to amplify a share when handed a forecast more certain than its analysis', () => {
    const shares = [Float32Array.from([0.5]), Float32Array.from([0]), Float32Array.from([0.5]), Float32Array.from([0])];
    const after = propagateShares(shares, Float32Array.from([0.4]), Float32Array.from([0.1]), MODEL);
    expect(after[MEASUREMENT][0]).toBeCloseTo(0.5, 6);
    expect(after[MODEL][0]).toBeCloseTo(0, 6);
  });
});

describe('the analysis moves the field toward the truth', () => {
  const observationStd = declaredTemperatureErrorStd();

  /** Observations along a track, drawn from truth with the declared instrument noise. */
  function sampledTrack(reflectAbout?: Float32Array): { observations: AnalysisObservation[]; cells: number[] } {
    const rng = new Rng(4242, 'analyst-test:convergence');
    const observations: AnalysisObservation[] = [];
    const cells: number[] = [];
    for (let lonIndex = 1; lonIndex < GRID.longitude.count - 1; lonIndex++) {
      for (const latIndex of [2, 3, 4]) {
        for (let depthIndex = 0; depthIndex < GRID.depth.count; depthIndex++) {
          const measured = truthAt(lonIndex, latIndex, depthIndex) + rng.normal(0, observationStd);
          const cell = cellIndexOf(depthIndex, latIndex, lonIndex);
          // The control reflects each observation about the background, which is what
          // a sign error in the gain would do to the increment.
          const value = reflectAbout ? 2 * reflectAbout[cell] - measured : measured;
          observations.push(observationAt(lonIndex, latIndex, depthIndex, value, observationStd));
          cells.push(cell);
        }
      }
    }
    return { observations, cells };
  }

  it('reduces the error against truth, and by more where it measured', () => {
    const background = backgroundState(0.3);
    const { observations, cells } = sampledTrack();
    const analysis = optimalInterpolationKernel.analyse(background, observations, GRID, PARAMETERS);

    const backgroundEverywhere = rootMeanSquare(background.values, ALL_CELLS);
    const analysedEverywhere = rootMeanSquare(analysis.values, ALL_CELLS);
    expect(analysedEverywhere).toBeLessThan(backgroundEverywhere);

    const backgroundMeasured = rootMeanSquare(background.values, cells);
    const analysedMeasured = rootMeanSquare(analysis.values, cells);
    expect(analysedMeasured).toBeLessThan(backgroundMeasured);

    // Where it measured, what is left is the instrument's own error and no more: the
    // bound is the closed form for these two declared deviations, not a figure typed
    // in. The 2× admits the sample size — thirty-odd observations, not thirty
    // thousand — and the reported error field is checked exactly above.
    const backgroundStd = 0.3;
    const irreducible = Math.sqrt(
      (backgroundStd * backgroundStd * observationStd * observationStd) /
        (backgroundStd * backgroundStd + observationStd * observationStd),
    );
    expect(analysedMeasured).toBeLessThan(2 * irreducible);
  });

  it('rejects a gain with the wrong sign — the same bound, and it fails', () => {
    // The negative control. Without it the test above says only that this run passed,
    // never that it could have failed.
    const background = backgroundState(0.3);
    const { observations, cells } = sampledTrack(background.values);
    const analysis = optimalInterpolationKernel.analyse(background, observations, GRID, PARAMETERS);

    const backgroundMeasured = rootMeanSquare(background.values, cells);
    const analysedMeasured = rootMeanSquare(analysis.values, cells);
    expect(analysedMeasured).toBeGreaterThan(backgroundMeasured);

    const backgroundStd = 0.3;
    const irreducible = Math.sqrt(
      (backgroundStd * backgroundStd * observationStd * observationStd) /
        (backgroundStd * backgroundStd + observationStd * observationStd),
    );
    expect(analysedMeasured).toBeGreaterThan(2 * irreducible);
  });
});
