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
  /**
   * The depth of each level, in metres, in level order. A fact about the grid that was
   * always true and that `shift-advect-v1` has no use for: it displaces every level the
   * same way, so which depth a level is at never mattered to it. A kernel that splits the
   * water column has to know, and reading it off the manifest inside the kernel would put
   * the manifest behind the port.
   */
  depthsM: readonly number[];
}

export interface KernelInitialState {
  grid: KernelGrid;
  /** One 3D slice [depth][lat][lon], C order — the now-cast's first time step. */
  temperature: Float32Array;
  salinity: Float32Array;
}

/**
 * The shallow two-layer step's own parameters (SRD-v2 FR-112). **Optional** on
 * `KernelParameters` below, and that is the whole of what the port gave up to admit a
 * second implementation: `shift-advect-v1` is not edited, and a kernel that needs this
 * block refuses by name when it is absent rather than defaulting silently (ADR-0042).
 */
export interface TwoLayerParameters {
  /** Where the water column splits. A modelling assumption, deliberately not the analysed thermocline. */
  interfaceDepthM: number;
  upper: { eastKmPerDay: number; northKmPerDay: number };
  lower: { eastKmPerDay: number; northKmPerDay: number };
  horizontalDiffusivityM2PerS: number;
  interfacialExchangePerDay: number;
  /** The Courant number the sub-stepping stays under. */
  maxCourant: number;
  /** Sub-steps per forecast step beyond which the configuration is refused, never clamped. */
  maxSubSteps: number;
}

export interface KernelParameters {
  steps: number;
  stepSeconds: number;
  advectionEastKmPerDay: number;
  advectionNorthKmPerDay: number;
  noiseStdTemperature: number;
  noiseStdSalinity: number;
  /** Present only where the configured kernel declares it needs one. */
  twoLayer?: TwoLayerParameters;
}

export interface KernelMemberField {
  /** [step][depth][lat][lon], C order, one array per variable. */
  temperature: Float32Array;
  salinity: Float32Array;
}

export interface ModelKernel {
  readonly name: string;
  /**
   * The integration sub-steps this kernel takes for one forecast step on a grid of the
   * given horizontal spacing, or absent where the kernel declares no work.
   *
   * This is how the kernel "reports the work a run covers" (FR-114, ADR-0043) without the
   * port growing a required member: an implementation that declares none costs nothing,
   * the runner says so in its cost statement, and `shift-advect-v1` — which translates a
   * field rather than integrating anything — is left exactly as it was. It throws on a
   * configuration it will not integrate, so a cost statement can never be produced for a
   * run that would then be refused.
   */
  subStepsPerStep?(parameters: KernelParameters, cellKmEast: number, cellKmNorth: number): number;
  /**
   * The velocity this kernel carries a feature at, so that a feature's forecast track and
   * the field's own motion are one claim rather than two.
   *
   * **A kernel answers for its own velocity because inferring it does not work.** The
   * inference was `parameters.twoLayer !== undefined`, on the reasoning that only the
   * two-layer kernel would be handed a two-layer block. The runner populates that block
   * unconditionally and on purpose, so the test was always true: with `shift-advect-v1`
   * configured, the published features drifted at the two-layer upper velocity — measured
   * at 7 and 3 km/day — while the field they describe was translated at the configured 4
   * and 2, which on the shipped grid rounds to no displacement at all. Two forecasts in
   * one message, which is what `carryVelocity`'s own comment forbids.
   *
   * Optional, like `subStepsPerStep`, and for the same reason: a kernel that does not
   * declare one is carried at the configured advection, which is what the field does.
   */
  carryVelocity?(parameters: KernelParameters): { eastKmPerDay: number; northKmPerDay: number };
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
  // The whole field moves at the configured advection, so a feature in it does too.
  carryVelocity: (parameters) => ({
    eastKmPerDay: parameters.advectionEastKmPerDay,
    northKmPerDay: parameters.advectionNorthKmPerDay,
  }),
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

/**
 * The stability numbers a two-layer configuration produces on a given grid, and the
 * sub-step count they require. Exported because the runner needs the same arithmetic to
 * *declare* a cost against a nominal cell size before any analysis has arrived, and two
 * implementations of it would be free to disagree about what a run costs and what it then
 * spends (ADR-0043's one-publisher rule, seen from inside).
 */
export interface StabilityVerdict {
  /** Advective Courant number at one sub-step: the fraction of a cell a parcel crosses. */
  readonly courant: number;
  /** Explicit-diffusion number at one sub-step; the classical bound is a quarter. */
  readonly diffusion: number;
  /** Interfacial exchange per sub-step; more than half a layer per step is not a step. */
  readonly exchange: number;
  /** Sub-steps per forecast step the three above require together. */
  readonly subSteps: number;
}

/** The explicit two-dimensional diffusion bound. A constant of the scheme, not a tuning. */
const DIFFUSION_LIMIT = 0.25;
/** Half a layer per sub-step. Beyond it the exchange overshoots rather than relaxes. */
const EXCHANGE_LIMIT = 0.5;
const SECONDS_PER_DAY = 86400;

/**
 * What one forecast step of `shallow-two-layer-v1` requires on this grid.
 *
 * Each of the three numbers is the ratio at a **single** sub-step; the sub-step count is
 * the largest of the three ratios against its own limit, rounded up. Derived from the
 * configuration and the grid together, never configured: a configured count is a number
 * free to disagree with the grid it runs on.
 */
export function twoLayerStability(
  parameters: KernelParameters,
  cellKmEast: number,
  cellKmNorth: number,
): StabilityVerdict {
  const two = parameters.twoLayer;
  if (!two) {
    throw new Error(
      "shallow-two-layer-v1 was handed no 'two_layer' parameters; the kernel refuses rather than defaulting, because a default here is a physics nobody configured",
    );
  }
  const dt = parameters.stepSeconds;
  const fastEast = Math.max(Math.abs(two.upper.eastKmPerDay), Math.abs(two.lower.eastKmPerDay));
  const fastNorth = Math.max(Math.abs(two.upper.northKmPerDay), Math.abs(two.lower.northKmPerDay));
  const courant =
    ((fastEast / SECONDS_PER_DAY) * dt) / cellKmEast + ((fastNorth / SECONDS_PER_DAY) * dt) / cellKmNorth;
  const metresEast = cellKmEast * 1000;
  const metresNorth = cellKmNorth * 1000;
  const diffusion =
    two.horizontalDiffusivityM2PerS * dt * (1 / (metresEast * metresEast) + 1 / (metresNorth * metresNorth));
  const exchange = (two.interfacialExchangePerDay * dt) / SECONDS_PER_DAY;
  const subSteps = Math.max(
    1,
    Math.ceil(courant / two.maxCourant),
    Math.ceil(diffusion / DIFFUSION_LIMIT),
    Math.ceil(exchange / EXCHANGE_LIMIT),
  );
  if (subSteps > two.maxSubSteps) {
    throw new Error(
      `shallow-two-layer-v1 refuses this configuration: at a ${parameters.stepSeconds} s step on cells of ` +
        `${cellKmEast.toFixed(2)} x ${cellKmNorth.toFixed(2)} km the Courant number is ${courant.toFixed(3)} ` +
        `(limit ${two.maxCourant}), the diffusion number ${diffusion.toFixed(3)} (limit ${DIFFUSION_LIMIT}) and ` +
        `the exchange ${exchange.toFixed(3)} (limit ${EXCHANGE_LIMIT}), which together require ${subSteps} ` +
        `sub-steps against a ceiling of ${two.maxSubSteps}. Integrating it anyway would publish an unstable ` +
        `field as a forecast`,
    );
  }
  return { courant, diffusion, exchange, subSteps };
}

/**
 * shallow-two-layer-v1: real physics, deliberately impoverished physics (SRD-v2 FR-112).
 *
 * Two layers split at a configured interface depth, each advected by its own velocity with
 * first-order upwind differencing and diffused explicitly, with a linear interfacial
 * exchange relaxing the two layers' column means toward each other. Model error enters as
 * a per-sub-step draw from the run's own seeded stream, so the ensemble spreads because the
 * model is uncertain rather than because a lead-time factor said it should.
 *
 * **This propagates a state; it does not translate a field.** `shift-advect-v1` samples the
 * initial state at a displaced cell, so the field at lead six is the field at lead zero,
 * moved and blurred. Here each sub-step reads the state the previous sub-step left. The
 * shear between the two layers is what that buys: a feature in the upper layer separates
 * from one below it, which no rigid displacement can produce.
 *
 * **It is not an implementation of, port of, or wrapper around an operational assimilation
 * system.** NEMO, ROMS, MITgcm, PDAF, DART, OceanVar and OpenDA are named in the explainer
 * as what the real thing is, and nothing here claims kinship with them beyond structure
 * (FR-107). The numerics are fake and the data is synthetic.
 *
 * Boundaries are zero-gradient, which is not quite the same as no-flux and the difference
 * is worth stating. Diffusion across the edge is nil, because the gradient is taken against
 * a clamped neighbour. Advection is not: upwind differencing at a downstream edge computes
 * the difference against the cell behind it, so material does leave the domain there — and
 * nothing enters, because there is no upstream cell to bring anything in. The domain edge
 * is where the harness stopped authoring a field, not where the ocean stops, so a field
 * that slowly drains at the downwind margin is the honest consequence of that and not a
 * fault to be papered over with a wrap-around nobody's ocean has.
 */
export const shallowTwoLayerKernel: ModelKernel = {
  name: 'shallow-two-layer-v1',

  subStepsPerStep(parameters, cellKmEast, cellKmNorth) {
    return twoLayerStability(parameters, cellKmEast, cellKmNorth).subSteps;
  },

  /**
   * The upper layer, for every feature, and that is a stated limitation rather than an
   * oversight: choosing a layer needs the feature's depth, and no estimator recovers one —
   * the blobs are found in a depth-averaged anomaly and the front in its gradient.
   *
   * It refuses a missing block for the same reason `memberField` does. A default velocity
   * here would be a physics nobody configured, published as a feature's track.
   */
  carryVelocity(parameters) {
    const two = parameters.twoLayer;
    if (!two) {
      throw new Error(
        "shallow-two-layer-v1 was asked what velocity it carries a feature at with no 'two_layer' parameters; the kernel refuses rather than defaulting",
      );
    }
    return { eastKmPerDay: two.upper.eastKmPerDay, northKmPerDay: two.upper.northKmPerDay };
  },

  memberField(initial, parameters, rng) {
    const { lonCount, latCount, depthCount, cellKmEast, cellKmNorth, depthsM } = initial.grid;
    const two = parameters.twoLayer;
    if (!two) {
      throw new Error(
        "shallow-two-layer-v1 was handed no 'two_layer' parameters; the kernel refuses rather than defaulting, because a default here is a physics nobody configured",
      );
    }
    if (depthsM.length !== depthCount) {
      throw new Error(
        `the grid declares ${depthCount} levels and names ${depthsM.length} depths; a two-layer kernel cannot say which layer a level is in`,
      );
    }
    // Which layer each level belongs to. A configuration that puts every level on one side
    // is refused: a two-layer kernel with one layer is not the thing that was configured,
    // and it would publish a field indistinguishable from a single-layer run.
    const upperLevels = depthsM.filter((depth) => depth < two.interfaceDepthM).length;
    if (upperLevels === 0 || upperLevels === depthCount) {
      throw new Error(
        `shallow-two-layer-v1 refuses this configuration: the interface at ${two.interfaceDepthM} m puts all ` +
          `${depthCount} levels (${depthsM.join(', ')} m) in one layer, so the step has no interface to exchange across`,
      );
    }
    const { subSteps } = twoLayerStability(parameters, cellKmEast, cellKmNorth);

    const cellsPerLevel = latCount * lonCount;
    const cellsPerStep = depthCount * cellsPerLevel;
    const dt = parameters.stepSeconds / subSteps;
    const eastPerLayer = [two.upper.eastKmPerDay, two.lower.eastKmPerDay].map(
      (kmPerDay) => (kmPerDay / SECONDS_PER_DAY) * dt,
    );
    const northPerLayer = [two.upper.northKmPerDay, two.lower.northKmPerDay].map(
      (kmPerDay) => (kmPerDay / SECONDS_PER_DAY) * dt,
    );
    const diffusionEast = (two.horizontalDiffusivityM2PerS * dt) / (cellKmEast * 1000) ** 2;
    const diffusionNorth = (two.horizontalDiffusivityM2PerS * dt) / (cellKmNorth * 1000) ** 2;
    const exchange = (two.interfacialExchangePerDay * dt) / SECONDS_PER_DAY;
    // Per sub-step model error, so that the deviation accumulated over a whole run is the
    // configured one: independent draws add in quadrature.
    const noise = {
      temperature: parameters.noiseStdTemperature / Math.sqrt(subSteps),
      salinity: parameters.noiseStdSalinity / Math.sqrt(subSteps),
    };
    const layerOf = depthsM.map((depth) => (depth < two.interfaceDepthM ? 0 : 1));

    const state = {
      temperature: Float32Array.from(initial.temperature),
      salinity: Float32Array.from(initial.salinity),
    };
    const scratch = {
      temperature: new Float32Array(cellsPerStep),
      salinity: new Float32Array(cellsPerStep),
    };
    const out = {
      temperature: new Float32Array(parameters.steps * cellsPerStep),
      salinity: new Float32Array(parameters.steps * cellsPerStep),
    };

    const at = (level: number, la: number, lo: number): number => (level * latCount + la) * lonCount + lo;
    const clampLat = (la: number): number => Math.min(Math.max(la, 0), latCount - 1);
    const clampLon = (lo: number): number => Math.min(Math.max(lo, 0), lonCount - 1);

    /*
     * **Step 0 is the state the run initialises from, not one step past it.**
     *
     * The manifest this run's holding carries declares `start_offset_seconds: 0`, so the
     * field at index k is the field at lead k x stepSeconds, and index 0 is the
     * initialisation instant itself — which is what `shift-advect-v1` has always written
     * and what the query layer's sampler assumes when it maps an instant to an index.
     * Integrating before the first write would put every served instant of every forecast
     * one step out of register with the label on it, and would put the field's own step 0
     * one step ahead of the features published for the same run on the same tick. Small at
     * the shipped velocities, wrong at any of them.
     */
    out.temperature.set(state.temperature, 0);
    out.salinity.set(state.salinity, 0);
    for (let step = 1; step < parameters.steps; step++) {
      for (let sub = 0; sub < subSteps; sub++) {
        for (const variable of ['temperature', 'salinity'] as const) {
          const from = state[variable];
          const to = scratch[variable];
          for (let level = 0; level < depthCount; level++) {
            const layer = layerOf[level];
            const uCells = eastPerLayer[layer] / cellKmEast;
            const vCells = northPerLayer[layer] / cellKmNorth;
            for (let la = 0; la < latCount; la++) {
              for (let lo = 0; lo < lonCount; lo++) {
                const here = from[at(level, la, lo)];
                // Upwind advection: the gradient is taken from the side the flow comes
                // from, which is what keeps the scheme from oscillating at a front.
                const westward = from[at(level, la, clampLon(lo - 1))];
                const eastward = from[at(level, la, clampLon(lo + 1))];
                const southward = from[at(level, clampLat(la - 1), lo)];
                const northward = from[at(level, clampLat(la + 1), lo)];
                const advected =
                  uCells >= 0 ? uCells * (here - westward) : uCells * (eastward - here);
                const advectedNorth =
                  vCells >= 0 ? vCells * (here - southward) : vCells * (northward - here);
                const diffused =
                  diffusionEast * (eastward - 2 * here + westward) +
                  diffusionNorth * (northward - 2 * here + southward);
                to[at(level, la, lo)] = here - advected - advectedNorth + diffused;
              }
            }
          }
          state[variable].set(to);
        }

        // Interfacial exchange: the two layers relax toward their common column mean, per
        // water column. It is the only term that couples the layers, and it is what makes
        // the upper layer's history reach the lower one at all.
        if (exchange > 0) {
          for (const variable of ['temperature', 'salinity'] as const) {
            const field = state[variable];
            for (let la = 0; la < latCount; la++) {
              for (let lo = 0; lo < lonCount; lo++) {
                let upperSum = 0;
                let lowerSum = 0;
                let upperCount = 0;
                let lowerCount = 0;
                for (let level = 0; level < depthCount; level++) {
                  const value = field[at(level, la, lo)];
                  if (layerOf[level] === 0) {
                    upperSum += value;
                    upperCount += 1;
                  } else {
                    lowerSum += value;
                    lowerCount += 1;
                  }
                }
                const upperMean = upperSum / upperCount;
                const lowerMean = lowerSum / lowerCount;
                for (let level = 0; level < depthCount; level++) {
                  const index = at(level, la, lo);
                  const other = layerOf[level] === 0 ? lowerMean : upperMean;
                  field[index] += exchange * (other - field[index]);
                }
              }
            }
          }
        }

        // Model error, drawn per cell per sub-step from the run's own stream. Drawn in a
        // fixed order — temperature then salinity, C order within each — so the draw order
        // is a property of the grid and not of how the loops happened to be nested.
        for (let cell = 0; cell < cellsPerStep; cell++) {
          state.temperature[cell] += rng.normal(0, noise.temperature);
        }
        for (let cell = 0; cell < cellsPerStep; cell++) {
          state.salinity[cell] += rng.normal(0, noise.salinity);
        }
      }
      out.temperature.set(state.temperature, step * cellsPerStep);
      out.salinity.set(state.salinity, step * cellsPerStep);
    }
    return out;
  },
};
