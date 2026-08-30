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
  optimalInterpolationKernel,
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

/** archive, departure forecast, measurement — the three bars the figure stacks. */
const ARCHIVE = 0;
const DEPARTURE = 1;
const MEASUREMENT = 2;

const PARAMETERS: AnalysisParameters = {
  correlationKmHorizontal: 40,
  correlationMetresVertical: 60,
  measurementShareIndex: MEASUREMENT,
};

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
  const shares = [new Float32Array(CELLS), new Float32Array(CELLS), new Float32Array(CELLS)];
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
    const uncorrelated = { ...PARAMETERS, correlationKmHorizontal: 0, correlationMetresVertical: 0 };
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
      { ...PARAMETERS, correlationKmHorizontal: 20 },
    );
    const far = optimalInterpolationKernel.analyse(
      background,
      [observationAt(4, 3, 0, 14.5, 0.02)],
      GRID,
      { ...PARAMETERS, correlationKmHorizontal: 120 },
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
    //   \u03c3\u00b2\u2090 = \u03c3\u00b2\u1d47 \u2212 \u03c3\u2074\u1d47\u03c1\u00b2 / (\u03c3\u00b2\u1d47 + \u03c3\u00b2\u2092)
    // so the reduction anywhere is \u03c1\u00b2 times the reduction at the observed cell. Checked
    // against the geometry rather than against a tolerance, at a cell three cells
    // north, four east and a depth level away \u2014 where \u03c1 is small but emphatically not
    // zero. A Gaussian correlation reaches the whole domain; the honest claim is how
    // far the reduction has decayed, never that it stopped.
    const remote = cellIndexOf(1, 0, 0);
    const east = 4 * GRID.cellKmEast;
    const north = 3 * GRID.cellKmNorth;
    const down = 1 * GRID.depth.spacing;
    const rho = Math.exp(
      -0.5 *
        ((east * east + north * north) / (PARAMETERS.correlationKmHorizontal * PARAMETERS.correlationKmHorizontal) +
          (down * down) / (PARAMETERS.correlationMetresVertical * PARAMETERS.correlationMetresVertical)),
    );
    const variance = backgroundStd * backgroundStd;
    const expectedRemote = Math.sqrt(
      variance - (variance * variance * rho * rho) / (variance + observationStd * observationStd),
    );
    expect(analysis.errorStd[remote]).toBeCloseTo(expectedRemote, 6);
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
        const total = analysis.shares[ARCHIVE][cell] + analysis.shares[DEPARTURE][cell] + analysis.shares[MEASUREMENT][cell];
        expect(total).toBeCloseTo(1, 4);
      }
      // The forecast step would advect the shares; the kernel's contract is that it
      // hands back a state of the same shape it was given, so the next cycle can
      // take it as its background directly.
      state = { values: analysis.values, errorStd: analysis.errorStd, shares: analysis.shares };
    }
    // Measurement's share falls away from the track, which is the property the
    // provenance figure is built on.
    const onTrack = state.shares[MEASUREMENT][cellIndexOf(0, 3, 4)];
    const offTrack = state.shares[MEASUREMENT][cellIndexOf(0, 0, 4)];
    const farCorner = state.shares[MEASUREMENT][cellIndexOf(1, 0, 8)];
    expect(onTrack).toBeGreaterThan(offTrack);
    expect(offTrack).toBeGreaterThan(farCorner);
  });

  it('saturates the provenance when the same water is re-observed \u2014 the recursion\u2019s open fault', () => {
    // Characterisation, not approval. Four cycles over one short track leave
    // measurement owning at least four tenths of EVERY cell in the domain, including
    // a corner the platform never approached, and more than the whole of one cell
    // beside the track. The values are right \u2014 each cycle genuinely did move each
    // cell \u2014 but the shares are not: p \u2190 (1\u2212\u03c9)p + \u03c9 credits measurement again on every
    // cycle, though re-observing the same water brings almost no new information.
    //
    // The fault is in the recursion across cycles, not in the gain, so it is not the
    // kernel's to fix: the forecast step between cycles adds model error, and that
    // added variance belongs to no observation. Diluting every share by
    // \u03c3\u00b2\u2090/\u03c3\u00b2_f at that step is the candidate answer, and specs/115 holds it open.
    // This test exists so that a change which fixes it fails here and is noticed,
    // rather than quietly improving a number nobody was watching.
    const rng = new Rng(4242, 'analyst-test:saturation');
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
    const measurement = Array.from(state.shares[MEASUREMENT]);
    expect(Math.min(...measurement)).toBeGreaterThan(0.4);
    expect(Math.max(...measurement)).toBeGreaterThan(1);
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
      analysis.shares[ARCHIVE][uncertain] + analysis.shares[DEPARTURE][uncertain] + analysis.shares[MEASUREMENT][uncertain];
    expect(total).toBeCloseTo(1, 4);
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
