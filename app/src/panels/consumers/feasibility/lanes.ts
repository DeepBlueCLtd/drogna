/**
 * The Feasibility consumer's source lanes (FR-85, FR-81, ADR-0039).
 *
 * Ten sources, of three provenances, and the difference is stated on every one of them:
 *
 * - **seam** — served over the seam. The vector forecast lane is genuine EDR position
 *   queries at the forecast's own steps.
 * - **seam-derived** — computed here from something that was. Endurance falls at a rate
 *   set by the speed the platform reported; range is measured from the position it
 *   reported.
 * - **synthesised** — drogna does not model it. A tide, a moon, a ferry timetable, a
 *   watch cycle: each is a function of simulation time and the run's seed, so it replays
 *   with everything else and stops when the clock does. That last property is what
 *   distinguishes a synthesised *input* from fixture data: nothing here runs on its own
 *   account, and nothing here is a claim about a drogna component (Constitution VII).
 *
 * Two lane kinds, because a plain bar implies a boolean yes/no and that is simply wrong
 * for a tide. Booleans are bars; continuous lanes are traces, and the threshold that
 * matters is the *task's*, not the lane's — two tasks may disagree about the same sea
 * state and both be right.
 */
import type { ConfigShell } from '../../../generated/types.js';

export type Confidence = 'high' | 'medium' | 'low' | 'off';

export type LaneSpec = ConfigShell['consumers']['feasibility']['lanes'][number];

export interface Lane {
  readonly id: string;
  readonly label: string;
  readonly kind: 'boolean' | 'continuous';
  readonly provenance: 'seam' | 'seam-derived' | 'synthesised';
  readonly unit?: string;
  /** One reading per step, in order. Continuous lanes carry values; booleans 0 or 1. */
  readonly samples: readonly number[];
  readonly minimum: number;
  readonly maximum: number;
  /** Where this lane's numbers came from, in one line, for the lane's own face. */
  readonly says: string;
}

export interface LaneContext {
  readonly steps: number;
  readonly stepMinutes: number;
  /** Seeded: the phase of every synthesised cycle (Constitution II). */
  readonly draw: () => number;
  /** The platform's reported speed, where it has reported one. */
  readonly speedMetresPerSecond?: number;
  /** Metres from the platform's reported position to the rendezvous, at each step. */
  readonly rangeMetres?: readonly number[];
  /** The forecast, sampled from genuine queries across its own validity span. */
  readonly forecastSeries?: readonly number[];
  /**
   * How many of this tab's steps the forecast is actually valid for. The horizon is
   * longer than the forecast on purpose (see the configuration's `horizon_hours`), and
   * the lane stops where the forecast stops rather than being drawn onward: a value
   * extrapolated past a forecast's validity is a value nobody published.
   */
  readonly forecastSteps?: number;
}

export function buildLanes(specs: readonly LaneSpec[], context: LaneContext): Lane[] {
  return specs.map((spec) => {
    const minimum = spec.minimum ?? 0;
    const maximum = spec.maximum ?? 1;
    if (spec.id === 'endurance') return endurance(spec, context, minimum, maximum);
    if (spec.id === 'range-from-port') return range(spec, context, minimum, maximum);
    if (spec.provenance === 'seam') return served(spec, context, minimum, maximum);
    return synthesised(spec, context, minimum, maximum);
  });
}

function synthesised(spec: LaneSpec, context: LaneContext, minimum: number, maximum: number): Lane {
  const period = spec.period_minutes ?? 1440;
  // One draw per lane, taken once, so the phase is a property of the run rather than of
  // how many times the lanes have been rebuilt.
  const phase = context.draw() * period;
  const samples: number[] = [];
  for (let step = 0; step < context.steps; step++) {
    const minutes = step * context.stepMinutes + phase;
    if (spec.kind === 'boolean') {
      const on = spec.on_minutes ?? period / 2;
      samples.push(minutes % period < on ? 1 : 0);
    } else {
      const cycle = 0.5 - 0.5 * Math.cos((2 * Math.PI * minutes) / period);
      samples.push(minimum + (maximum - minimum) * cycle);
    }
  }
  return {
    id: spec.id,
    label: spec.label,
    kind: spec.kind,
    provenance: spec.provenance,
    unit: spec.unit,
    samples,
    minimum,
    maximum,
    says: `synthesised here on a ${Math.round(period)} minute cycle, seeded from the run manifest — drogna does not model it`,
  };
}

function served(spec: LaneSpec, context: LaneContext, minimum: number, maximum: number): Lane {
  const series = context.forecastSeries ?? [];
  const covered = Math.max(0, Math.min(context.steps, context.forecastSteps ?? context.steps));
  const samples: number[] = [];
  for (let step = 0; step < context.steps; step++) {
    // The forecast is served at its own steps, which are coarser than this tab's; a
    // reading between them is the linear interpolation of the two it lies between, and
    // never an extrapolation past the last one. Past the forecast's validity the lane
    // carries nothing at all, which is what a source that has not been served looks
    // like — and a task that depends on it cannot be scheduled there.
    if (series.length === 0 || step >= covered) {
      samples.push(Number.NaN);
      continue;
    }
    const at = (step / Math.max(1, covered - 1)) * (series.length - 1);
    const lower = Math.floor(at);
    const upper = Math.min(series.length - 1, lower + 1);
    const fraction = at - lower;
    samples.push(series[lower] * (1 - fraction) + series[upper] * fraction);
  }
  return {
    id: spec.id,
    label: spec.label,
    kind: spec.kind,
    provenance: spec.provenance,
    unit: spec.unit,
    samples,
    minimum,
    maximum,
    says: `served over the seam: genuine position queries, valid for the first ${covered} step(s) and blank after, because the forecast ends there`,
  };
}

function endurance(spec: LaneSpec, context: LaneContext, minimum: number, maximum: number): Lane {
  // Endurance falls faster the harder the platform is being driven. The rate is
  // synthesised — drogna models no fuel — but the speed it is proportional to is the
  // platform's own reported speed, which is why this lane is derived rather than made up.
  const speed = context.speedMetresPerSecond ?? 0;
  const hours = (context.steps * context.stepMinutes) / 60;
  const burn = hours > 0 ? Math.min(maximum, 20 + speed * 12) / hours : 0;
  const samples: number[] = [];
  for (let step = 0; step < context.steps; step++) {
    samples.push(Math.max(minimum, maximum - (burn * step * context.stepMinutes) / 60));
  }
  return {
    id: spec.id,
    label: spec.label,
    kind: spec.kind,
    provenance: spec.provenance,
    unit: spec.unit,
    samples,
    minimum,
    maximum,
    says: `derived from the platform’s reported speed (${speed.toFixed(1)} m/s); the consumption rate itself is this tab’s assumption`,
  };
}

function range(spec: LaneSpec, context: LaneContext, minimum: number, maximum: number): Lane {
  const metres = context.rangeMetres ?? [];
  const samples: number[] = [];
  for (let step = 0; step < context.steps; step++) {
    const value = metres[Math.min(step, metres.length - 1)];
    samples.push(value === undefined ? Number.NaN : Math.min(maximum, value / 1000));
  }
  return {
    id: spec.id,
    label: spec.label,
    kind: spec.kind,
    provenance: spec.provenance,
    unit: spec.unit,
    samples,
    minimum,
    maximum,
    says: 'derived from the position the platform reported; the rendezvous itself is this tab’s assumption',
  };
}

/** What a confidence setting is worth. `off` is not a weight: it removes the source. */
export function weightOf(
  confidence: Confidence,
  weights: ConfigShell['consumers']['feasibility']['confidence_weights'],
): number {
  if (confidence === 'off') return 0;
  return weights[confidence];
}
