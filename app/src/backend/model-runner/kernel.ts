/**
 * The model kernel port (Constitution VI): initialisation state in, gridded member
 * fields out. A genuine port — the analytic kernel below is one implementation, a
 * V3 numerical model is another — and the runner holds only this interface.
 */
import type { Rng } from '../lib/rng.js';

export interface KernelGrid {
  lonCount: number;
  latCount: number;
  depthCount: number;
  /** Kilometres per cell step along each horizontal axis, for advection in cells. */
  cellKmEast: number;
  cellKmNorth: number;
}

export interface KernelInitialState {
  grid: KernelGrid;
  /** One 3D slice [depth][lat][lon], C order — the now-cast's first time step. */
  temperature: Float32Array;
  salinity: Float32Array;
}

export interface KernelParameters {
  steps: number;
  stepSeconds: number;
  advectionEastKmPerDay: number;
  advectionNorthKmPerDay: number;
  noiseStdTemperature: number;
  noiseStdSalinity: number;
}

export interface KernelMemberField {
  /** [step][depth][lat][lon], C order, one array per variable. */
  temperature: Float32Array;
  salinity: Float32Array;
}

export interface ModelKernel {
  readonly name: string;
  memberField(initial: KernelInitialState, parameters: KernelParameters, rng: Rng): KernelMemberField;
}

/**
 * shift-advect-v1: the whole field advects rigidly at the configured velocity
 * (deliberately not the true drift — forecast error is supposed to grow), values
 * sampled from the initial state at the displaced cell with edge clamping, plus
 * per-cell noise whose deviation grows with lead time.
 */
export const shiftAdvectKernel: ModelKernel = {
  name: 'shift-advect-v1',
  memberField(initial, parameters, rng) {
    const { lonCount, latCount, depthCount, cellKmEast, cellKmNorth } = initial.grid;
    const cellsPerStep = depthCount * latCount * lonCount;
    const temperature = new Float32Array(parameters.steps * cellsPerStep);
    const salinity = new Float32Array(parameters.steps * cellsPerStep);
    for (let step = 0; step < parameters.steps; step++) {
      const days = (step * parameters.stepSeconds) / 86400;
      const shiftLon = Math.round((parameters.advectionEastKmPerDay * days) / cellKmEast);
      const shiftLat = Math.round((parameters.advectionNorthKmPerDay * days) / cellKmNorth);
      const leadFactor = Math.sqrt(step + 1);
      for (let d = 0; d < depthCount; d++) {
        for (let la = 0; la < latCount; la++) {
          const fromLat = Math.min(Math.max(la - shiftLat, 0), latCount - 1);
          for (let lo = 0; lo < lonCount; lo++) {
            const fromLon = Math.min(Math.max(lo - shiftLon, 0), lonCount - 1);
            const fromIndex = (d * latCount + fromLat) * lonCount + fromLon;
            const toIndex = step * cellsPerStep + (d * latCount + la) * lonCount + lo;
            temperature[toIndex] =
              initial.temperature[fromIndex] + rng.normal(0, parameters.noiseStdTemperature * leadFactor);
            salinity[toIndex] =
              initial.salinity[fromIndex] + rng.normal(0, parameters.noiseStdSalinity * leadFactor);
          }
        }
      }
    }
    return { temperature, salinity };
  },
};
