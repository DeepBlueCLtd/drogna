/**
 * The four features, estimated and scored (SRD-v2 FR-113, AT-06; Constitution IX).
 *
 * **The bound is derived from what is on disk, never typed here.** For each feature the
 * claim is scored against the ground-truth manifest, with the bound taken from the
 * authoring jitter (`config.env_generator.features.<kind>.jitter`) or from the resolution
 * the grid can support, and printed with the error so a reader can see the margin rather
 * than trust the pass.
 *
 * **What is scored is what an estimator can honestly claim.** The front's anchor is a point
 * on a line and the authored anchor is another point on the same line, so the scored figure
 * is the perpendicular distance to the authored front and never the distance between two
 * anchors — a distance between two points on one line says nothing about whether the line
 * was found. The thermocline is resolved to the grid's own depth spacing and to nothing
 * finer, and the bound says so.
 *
 * The estimator reads the now-cast the store holds because that is the field shape an
 * analysis has: one instant, one stride per variable. It is not reading the truth in the
 * sense feature 116 forbids — no *forecast* is initialised from it here; this is the scoring
 * harness, and the thing being scored is whether an estimator can find a feature in a
 * gridded field at all.
 */
import { describe, expect, it } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun, Manifest } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { buildBackend } from '../runtime/runtime.js';
import { KM_PER_DEGREE_LATITUDE, kmOffsets, frontSignedDistanceKm } from '../env-generator/analytic.js';
import { estimateFeatures, carryFeatures, type FeatureGrid } from './features.js';
import { shallowTwoLayerKernel, shiftAdvectKernel, type KernelParameters } from './kernel.js';

const validator = createSeamValidator();

function lockstepConfig(): ConfigRun {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  return config;
}

/**
 * Every seed the shipped start conditions run under, plus the one this file began with.
 *
 * **Scored at every one of them, and that is the point.** The first draft scored a single
 * seed, printed the front's bearing error without asserting it, and the record quoted the
 * 9.3 degrees that seed happened to give. At the seed the console actually opens on, the
 * same estimator was 39.6 degrees out — for a bearing folded into a half turn, barely
 * distinguishable from a coin flip. An estimator is not a thing you sample once. The list
 * is read from the configuration rather than typed, so a fifth start condition is scored
 * without anybody remembering to add it.
 */
const SEEDS = [
  1234,
  ...(runConfigDocument as ConfigRun).start_conditions.conditions.map((condition) => condition.root_seed),
];

interface Fixture {
  readonly manifest: Manifest;
  readonly temperature: Float32Array;
  readonly grid: FeatureGrid;
}

function fixture(rootSeed = 1234): Fixture {
  const options = { rootSeed, startCondition: 'loitering', revision: 'test', dirty: false };
  const runtime = buildBackend(lockstepConfig(), options, validator);
  const nowcast = runtime.store.currentNowcast();
  if (!nowcast) throw new Error('no now-cast to estimate from');
  const manifest = nowcast.descriptor.manifest;
  const g = manifest.grid;
  const perInstant = g.depth.count * g.latitude.count * g.longitude.count;
  const view = new Float32Array(nowcast.bytes.buffer, nowcast.bytes.byteOffset, nowcast.bytes.byteLength / 4);
  // The first time step alone: an analysis carries one instant, and that is what the
  // estimator is written against.
  const temperature = view.slice(0, perInstant);
  const midLatitude = (g.latitude.minimum + g.latitude.maximum) / 2;
  const grid: FeatureGrid = {
    longitudes: Array.from({ length: g.longitude.count }, (_, i) => g.longitude.minimum + i * g.longitude.spacing),
    latitudes: Array.from({ length: g.latitude.count }, (_, i) => g.latitude.minimum + i * g.latitude.spacing),
    depthsM: Array.from({ length: g.depth.count }, (_, i) => g.depth.minimum + i * g.depth.spacing),
    cellKmEast: g.longitude.spacing * KM_PER_DEGREE_LATITUDE * Math.cos((midLatitude * Math.PI) / 180),
    cellKmNorth: g.latitude.spacing * KM_PER_DEGREE_LATITUDE,
    referenceLatitude: midLatitude,
  };
  runtime.stop();
  return { manifest, temperature, grid };
}

function truth(manifest: Manifest, kind: string): Record<string, number> {
  const feature = manifest.features.find((entry) => entry.kind === kind);
  if (!feature) throw new Error(`no ${kind} in the manifest`);
  return feature.parameters as unknown as Record<string, number>;
}

/**
 * One set of kernel parameters for the carry tests, with **both** velocity blocks
 * populated — which is exactly what the runner does, and exactly what made the fault
 * below invisible. A fixture that set only the block belonging to the kernel under test
 * would have agreed with the broken code.
 */
const CARRY_PARAMETERS: KernelParameters = {
  steps: 4,
  stepSeconds: 900,
  advectionEastKmPerDay: 4,
  advectionNorthKmPerDay: 2,
  noiseStdTemperature: 0.35,
  noiseStdSalinity: 0.03,
  twoLayer: {
    interfaceDepthM: 250,
    upper: { eastKmPerDay: 7, northKmPerDay: 3 },
    lower: { eastKmPerDay: -2, northKmPerDay: 1 },
    horizontalDiffusivityM2PerS: 45,
    interfacialExchangePerDay: 0.06,
    maxCourant: 0.4,
    maxSubSteps: 64,
  },
};

describe('the four features, estimated from a gridded field and scored against the manifest', () => {
  it.each(SEEDS)('AT-06 descendant: the eddy centre is recovered inside the eddy the field carries (seed %i)', (rootSeed) => {
    const { manifest, temperature, grid } = fixture(rootSeed);
    const { eddy } = estimateFeatures(temperature, grid);
    if (!eddy) throw new Error('no eddy estimated from the field');
    const authored = truth(manifest, 'eddy');
    const { eastKm, northKm } = kmOffsets(
      eddy.centreLongitude,
      eddy.centreLatitude,
      authored.centre_longitude,
      authored.centre_latitude,
      authored.centre_latitude,
    );
    const errorKm = Math.hypot(eastKm, northKm);
    // The bound is the eddy's own authored radius, read from the manifest — the same bound
    // and the same argument the AT-03 descendant settled on: a centre recovered from the
    // field falls inside the eddy the field carries. Two grid cells was a claim about what
    // a grid can resolve being read as a ceiling on an estimator's error.
    const boundKm = authored.radius_km;
    console.log(`AT-06 seed ${rootSeed}: eddy centre recovered with error ${errorKm.toFixed(1)} km (bound ${boundKm.toFixed(1)} km, the eddy's own radius)`);
    expect(errorKm).toBeLessThanOrEqual(boundKm);
  });

  it.each(SEEDS)('the drifting feature is separated from the eddy by the sign of its anomaly, not by a hint (seed %i)', (rootSeed) => {
    const { manifest, temperature, grid } = fixture(rootSeed);
    const estimate = estimateFeatures(temperature, grid);
    const { moving } = estimate;
    const authored = truth(manifest, 'moving');
    // The manifest's moving feature is authored cold (sign −1) and the eddy warm; the
    // estimator knows only the field. If this ever fails because the two were swapped, the
    // estimator has stopped separating them and is finding one blob twice.
    expect(authored.sign).toBe(-1);

    // **Two outcomes are acceptable and a third is not.** Either the feature is found, and
    // then it must fall inside its own authored radius; or it is declined, and then the
    // reason must be on the wire. What is forbidden is the third: a position published with
    // a few kilometres of uncertainty beside it that is a couple of hundred kilometres from
    // the truth, which is what one of these five seeds produced before the estimator held
    // its peak against the field's own scatter.
    if (!moving) {
      const reason = estimate.declined.find((entry) => entry.kind === 'moving' && entry.quantity === undefined);
      console.log(`AT-06 seed ${rootSeed}: drifting feature not estimated — ${reason?.reason ?? 'NO REASON GIVEN'}`);
      expect(reason?.reason ?? '').toMatch(/standard deviations/);
      return;
    }
    const { eastKm, northKm } = kmOffsets(
      moving.centreLongitude,
      moving.centreLatitude,
      authored.centre_longitude,
      authored.centre_latitude,
      authored.centre_latitude,
    );
    const errorKm = Math.hypot(eastKm, northKm);
    const boundKm = authored.radius_km;
    console.log(`AT-06 seed ${rootSeed}: drifting feature recovered with error ${errorKm.toFixed(1)} km (bound ${boundKm.toFixed(1)} km, its own radius)`);
    expect(errorKm).toBeLessThanOrEqual(boundKm);
  });

  it.each(SEEDS)('the front is found as a line: the anchor lies on it, and the bearing is scored (seed %i)', (rootSeed) => {
    const { manifest, temperature, grid } = fixture(rootSeed);
    const { front } = estimateFeatures(temperature, grid);
    if (!front) throw new Error('no front estimated from the field');
    const authored = truth(manifest, 'front') as unknown as Parameters<typeof frontSignedDistanceKm>[0];
    // Perpendicular distance to the authored front, not distance to the authored anchor:
    // a line has no distinguished point, so the second figure would score nothing.
    const acrossKm = Math.abs(frontSignedDistanceKm(authored, front.anchorLongitude, front.anchorLatitude));
    // The bound is the front's own authored sharpness, read from the manifest: the width
    // over which the front actually turns over, and therefore the width within which a
    // gradient maximum is the front rather than something else.
    const boundKm = (authored as unknown as Record<string, number>).sharpness_km;
    const authoredBearing = (authored as unknown as Record<string, number>).bearing_degrees;
    const foldedTruth = ((authoredBearing % 180) + 180) % 180;
    const bearingError = Math.min(
      Math.abs(front.bearingDegrees - foldedTruth),
      180 - Math.abs(front.bearingDegrees - foldedTruth),
    );
    console.log(
      `AT-06 seed ${rootSeed}: front found ${acrossKm.toFixed(1)} km across the authored line (bound ${boundKm.toFixed(1)} km, its own sharpness); ` +
        `bearing ${front.bearingDegrees.toFixed(1)}° against ${foldedTruth.toFixed(1)}°, error ${bearingError.toFixed(1)}° ` +
        `(bound ${runConfigDocument.env_generator.features.front.jitter.bearing_degrees}°, the authoring jitter)`,
    );
    expect(acrossKm).toBeLessThanOrEqual(boundKm);
    // **The bearing is asserted, not merely printed.** It was printed and not asserted in
    // the first draft, and the 9.3° the record quoted turned out to be one kind seed: at the
    // shipped default the same estimator was 39.6° out, which for a folded bearing is barely
    // distinguishable from a coin flip. An estimator returning a constant would have passed.
    // The bound is the authoring jitter on the bearing, read from the configuration that
    // produced the manifest, and never a number typed here.
    const bearingJitter = runConfigDocument.env_generator.features.front.jitter.bearing_degrees;
    expect(bearingError).toBeLessThanOrEqual(bearingJitter);
  });

  it.each(SEEDS)('the thermocline is placed to the grid’s own depth resolution and to nothing finer (seed %i)', (rootSeed) => {
    const { manifest, temperature, grid } = fixture(rootSeed);
    const { thermocline } = estimateFeatures(temperature, grid);
    if (!thermocline) throw new Error('no thermocline estimated from the field');
    const authored = truth(manifest, 'thermocline');
    const errorM = Math.abs(thermocline.depthM - authored.depth_m);
    // The bound is the grid's own depth spacing, read from the manifest. It is NOT the
    // authoring jitter: six levels over a kilometre resolve 200 m, the authored depth is
    // 80 m and the jitter is 15, so a jitter bound would be scoring the grid and calling it
    // the estimator. Stated here rather than discovered later, per T024.
    const boundM = manifest.grid.depth.spacing;
    console.log(
      `AT-06 seed ${rootSeed}: thermocline placed at ${thermocline.depthM.toFixed(0)} m against an authored ${authored.depth_m.toFixed(0)} m, ` +
        `error ${errorM.toFixed(0)} m (bound ${boundM.toFixed(0)} m, the grid's own depth spacing)`,
    );
    expect(errorM).toBeLessThanOrEqual(boundM);
  });

  it('names the magnitudes it cannot recover, rather than publishing them under the manifest’s names', () => {
    // The finding this test exists for. The first draft published the blob strengths, the
    // front amplitude and the thermocline's temperature drop under the manifest's own
    // property names — where a scoring test compares like with like — and they were out by
    // up to sixteen times the uncertainty declared beside them. They are quantities a
    // horizontal estimator over a 200 m depth grid cannot see, so each is named as not
    // recovered, with its reason, and what WAS measured is published under a name of its
    // own. Softening a bound until the first version passed is the failure mode this
    // replaces.
    const { temperature, grid } = fixture();
    const estimate = estimateFeatures(temperature, grid);
    const declined = estimate.declined.map((entry) => `${entry.kind}.${entry.quantity ?? '*'}`);
    expect(declined).toEqual(
      expect.arrayContaining(['eddy.strength_c', 'moving.strength_c', 'front.amplitude_c', 'thermocline.temperature_drop_c']),
    );
    for (const entry of estimate.declined) expect(entry.reason.length).toBeGreaterThan(40);
    // And the quantities that ARE published do not carry the manifest's names for the
    // quantities that are not: a reader comparing `anomaly_peak_c` with `strength_c` has
    // been told, by the name alone, that they are different things.
    expect(Object.keys(estimate.eddy ?? {})).toContain('anomalyPeakC');
    expect(Object.keys(estimate.front ?? {})).toContain('anomalyStepC');
    expect(Object.keys(estimate.thermocline ?? {})).toContain('layerDropC');
  });

  it('carries the features forward with an uncertainty that grows, and declines nothing silently', () => {
    const { temperature, grid } = fixture();
    const estimate = estimateFeatures(temperature, grid);
    const carried = carryFeatures(estimate, grid, CARRY_PARAMETERS, 0.2, shallowTwoLayerKernel);
    expect(carried).toHaveLength(4);
    // A forecast that does not widen with lead is making a stronger claim than it can
    // support; a depth that widens is making one the physics does not make, since this
    // kernel has no vertical velocity.
    expect(carried[3].uncertainty.eddy.positionKm).toBeGreaterThan(carried[0].uncertainty.eddy.positionKm);
    expect(carried[3].uncertainty.thermocline.depthM).toBe(carried[0].uncertainty.thermocline.depthM);
    // Each feature's uncertainty comes from its own signal. The drifting feature is
    // authored weaker and smaller than the eddy, so a block computed from the eddy and
    // handed to both would make the two identical — which is what happened, and what this
    // asserts cannot happen again.
    const atLeadZero = carried[0];
    if (atLeadZero.eddy && atLeadZero.moving) {
      expect(atLeadZero.uncertainty.moving.positionKm).not.toBeCloseTo(atLeadZero.uncertainty.eddy.positionKm, 6);
    }
    // The eddy has moved east: the upper layer's velocity is eastward, and a feature that
    // did not move would mean the carry was a copy.
    const first = carried[0].eddy;
    const last = carried[3].eddy;
    if (!first || !last) throw new Error('the carry dropped the eddy it was handed');
    expect(last.centreLongitude).toBeGreaterThan(first.centreLongitude);
    // Nothing is declined silently: a kind that was not estimated carries a **whole-feature**
    // reason — one with no `quantity`, which is the shape that means "this feature, not one
    // of its numbers".
    //
    // The first version of this loop tested `declined.some(e => e.kind === kind)`, which is
    // a tautology: every kind is pushed to `declined` on both branches, with a whole-feature
    // reason when it is absent and a quantity reason when it is present, so the set always
    // holds all four and no reachable state could fail it. A check that cannot fail is worth
    // nothing (CLAUDE.md, lesson 2) — and this file is where that lesson is quoted.
    const wholeFeature = new Set(
      carried[0].declined.filter((entry) => entry.quantity === undefined).map((entry) => entry.kind),
    );
    const estimated: Record<string, boolean> = {
      eddy: carried[0].eddy !== undefined,
      moving: carried[0].moving !== undefined,
      front: carried[0].front !== undefined,
      thermocline: carried[0].thermocline !== undefined,
    };
    for (const kind of ['eddy', 'moving', 'front', 'thermocline'] as const) {
      expect(estimated[kind] || wholeFeature.has(kind), `${kind} is neither estimated nor declined`).toBe(true);
      // And never both, which would be a feature published and disowned in one message.
      expect(estimated[kind] && wholeFeature.has(kind), `${kind} is both estimated and declined`).toBe(false);
    }
  });

  it('carries a feature at the configured kernel’s own velocity, and not at another kernel’s', () => {
    // **The check the fault got past.** `carryVelocity` selected the two-layer velocity on
    // `parameters.twoLayer !== undefined`, and the runner populates that block whichever
    // kernel is configured — so with `shift-advect-v1` selected, the published features
    // drifted at the two-layer upper velocity while the field they describe was translated
    // at the configured advection. A feature carried at a speed the field is not carried at
    // is two forecasts in one message, which is what the module forbids in its own words.
    //
    // Nothing scored here could see it: every carry test used the two-layer kernel, so the
    // wrong branch and the right branch agreed. What separates them is running the same
    // estimate under both kernels and reading the displacement each produces.
    const { temperature, grid } = fixture();
    const estimate = estimateFeatures(temperature, grid);
    const start = estimate.eddy;
    if (!start) throw new Error('no eddy to carry');

    // Kilometres per day implied by the displacement over the whole carry, which is the
    // quantity the message claims — never the velocity read back out of the parameters.
    const impliedKmPerDay = (kernel: typeof shiftAdvectKernel) => {
      const carried = carryFeatures(estimate, grid, CARRY_PARAMETERS, 0.2, kernel);
      const last = carried[carried.length - 1]?.eddy;
      const first = carried[0]?.eddy;
      if (!first || !last) throw new Error('the carry dropped the eddy it was handed');
      const { eastKm, northKm } = kmOffsets(
        last.centreLongitude,
        last.centreLatitude,
        first.centreLongitude,
        first.centreLatitude,
        first.centreLatitude,
      );
      const days = ((CARRY_PARAMETERS.steps - 1) * CARRY_PARAMETERS.stepSeconds) / 86400;
      return { east: eastKm / days, north: northKm / days };
    };

    const twoLayer = impliedKmPerDay(shallowTwoLayerKernel);
    const shift = impliedKmPerDay(shiftAdvectKernel);
    const upper = CARRY_PARAMETERS.twoLayer;
    if (!upper) throw new Error('the fixture lost its two-layer block');

    // Each kernel carries at what it declares, read off the track rather than the config.
    //
    // Tolerance 1 — 0.05 km/day — and not tighter: the track is measured by converting a
    // velocity into degrees and back through a cosine of latitude, which returns 7.0028 for
    // 7. Written at tolerance 3 this failed on that round-trip while the planted fault went
    // unremarked, which is a check failing for the wrong reason and no better than one that
    // cannot fail at all. The two kernels are 3 km/day apart on the east axis, so 0.05
    // still separates them by sixty times the tolerance.
    expect(twoLayer.east).toBeCloseTo(upper.upper.eastKmPerDay, 1);
    expect(twoLayer.north).toBeCloseTo(upper.upper.northKmPerDay, 1);
    expect(shift.east).toBeCloseTo(CARRY_PARAMETERS.advectionEastKmPerDay, 1);
    expect(shift.north).toBeCloseTo(CARRY_PARAMETERS.advectionNorthKmPerDay, 1);
    // And they disagree, which is what makes the four assertions above a distinction rather
    // than the same number written twice.
    expect(shift.east).not.toBeCloseTo(twoLayer.east, 1);
  });
});
