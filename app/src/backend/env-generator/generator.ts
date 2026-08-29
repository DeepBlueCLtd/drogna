/**
 * The environment generator (V2-C02): the 4D synthetic ocean of SRD-v2 FR-05 to
 * FR-08 and FR-20/FR-21, as an in-browser component.
 *
 * Randomness enters only as authored jitter on the feature parameters, drawn once at
 * provisioning from this component's named stream; the jittered values — the ground
 * truth — are recorded in each holding's manifest together with the draw order,
 * which is what keeps the manifest sufficient on its own (Constitution IX).
 *
 * Provisioning goes through the components' own paths (FR-11): the archive and the
 * first now-cast are staged and published through the coverage store's one write
 * seam, digest-checked like everything after them. The now-cast is regenerated on
 * its configured cadence, driven by received clock ticks, and its manifest records
 * the derivation each time.
 */
import type { SeamClient } from '../../seam/transport.js';
import type {
  ConfigEnvGenerator,
  CoverageHolding,
  Manifest,
  ManifestFeature,
  ManifestSpatialAxis,
} from '../../generated/types.js';
import { Rng, SEED_DERIVATION, streamSeed } from '../lib/rng.js';
import { configDigest, sha256Hex } from '../lib/sha256.js';
import { HeartbeatEmitter } from '../lib/heartbeat.js';
import type { CoverageStore } from '../coverage-store/store.js';
import {
  ANALYTIC_FORM_VERSION,
  COMPOSITION_RULE,
  KM_PER_DEGREE_LATITUDE,
  PRESSURE_RELATION,
  SOUND_SPEED,
  TAU_BLENDING_RULE,
  TAU_MEMBERSHIP_RULE,
  insideSoundSpeedValidity,
  salinityAt,
  temperatureAt,
  type WorldParameters,
} from './analytic.js';

export const GENERATOR_VERSION = '2.0.0';

interface GridSpec {
  longitude: ManifestSpatialAxis;
  latitude: ManifestSpatialAxis;
  depth: ManifestSpatialAxis;
  time: { origin_sim_time: string; start_offset_seconds: number; step_seconds: number; count: number; units: string };
}

function axis(minimum: number, maximum: number, count: number, units: string, direction: 'north' | 'east' | 'down'): ManifestSpatialAxis {
  return { minimum, maximum, count, spacing: (maximum - minimum) / (count - 1), units, direction };
}

export function axisValues(a: ManifestSpatialAxis): number[] {
  return Array.from({ length: a.count }, (_, i) => a.minimum + i * a.spacing);
}

export class EnvGenerator {
  readonly world: WorldParameters;
  private readonly drawOrder: string[] = [];
  private readonly heartbeat: HeartbeatEmitter;
  private simTime = { value: '', tick: 0 };
  private lastNowcastTick = 0;
  private nowcastCount = 0;
  private published = 0;

  /** Ticks until the next now-cast is authored, from the cadence it declares. */
  ticksToNextNowcast(): number {
    const elapsed = this.simTime.tick - this.lastNowcastTick;
    return Math.max(0, this.config.nowcast.interval_ticks - elapsed);
  }
  private readonly ownDigest: string;

  constructor(
    private readonly config: ConfigEnvGenerator,
    private readonly client: SeamClient,
    private readonly store: CoverageStore,
    private readonly runId: string,
    private readonly rootSeed: number,
  ) {
    this.ownDigest = configDigest(config);
    const rng = new Rng(rootSeed, config.stream);
    const draw = (name: string, halfWidth: number, nominal: number): number => {
      this.drawOrder.push(name);
      return nominal + rng.uniform(-halfWidth, halfWidth);
    };
    const f = config.features;
    // Draw order is load-bearing (manifest seed.draw_order): reordering these lines
    // changes every world without changing any parameter.
    this.world = {
      background: config.background,
      eddy: {
        ...f.eddy.nominal,
        centre_latitude: draw('eddy.centre_latitude', f.eddy.jitter.centre_degrees, f.eddy.nominal.centre_latitude),
        centre_longitude: draw('eddy.centre_longitude', f.eddy.jitter.centre_degrees, f.eddy.nominal.centre_longitude),
        radius_km: draw('eddy.radius_km', f.eddy.jitter.radius_km, f.eddy.nominal.radius_km),
        strength_c: draw('eddy.strength_c', f.eddy.jitter.strength_c, f.eddy.nominal.strength_c),
      },
      front: {
        ...f.front.nominal,
        anchor_latitude: draw('front.anchor_latitude', f.front.jitter.anchor_degrees, f.front.nominal.anchor_latitude),
        anchor_longitude: draw('front.anchor_longitude', f.front.jitter.anchor_degrees, f.front.nominal.anchor_longitude),
        bearing_degrees: draw('front.bearing_degrees', f.front.jitter.bearing_degrees, f.front.nominal.bearing_degrees),
      },
      thermocline: {
        ...f.thermocline.nominal,
        depth_m: draw('thermocline.depth_m', f.thermocline.jitter.depth_m, f.thermocline.nominal.depth_m),
        temperature_drop_c: draw(
          'thermocline.temperature_drop_c',
          f.thermocline.jitter.temperature_drop_c,
          f.thermocline.nominal.temperature_drop_c,
        ),
      },
      moving: {
        ...f.moving.nominal,
        centre_latitude: draw('moving.centre_latitude', f.moving.jitter.centre_degrees, f.moving.nominal.centre_latitude),
        centre_longitude: draw('moving.centre_longitude', f.moving.jitter.centre_degrees, f.moving.nominal.centre_longitude),
        drift_east_km_per_day: draw('moving.drift_east_km_per_day', f.moving.jitter.drift_km_per_day, f.moving.nominal.drift_east_km_per_day),
        drift_north_km_per_day: draw('moving.drift_north_km_per_day', f.moving.jitter.drift_km_per_day, f.moving.nominal.drift_north_km_per_day),
        reference_latitude: f.moving.nominal.centre_latitude,
      },
    };
    this.heartbeat = new HeartbeatEmitter(
      config.id,
      config.heartbeat,
      client,
      () => ({
        sim_time: this.simTime.value,
        tick: this.simTime.tick,
        status: 'ok',
        detail: `${this.published} holding(s) authored; now-cast every ${config.nowcast.interval_ticks} tick(s)`,
        figures: [
          { key: 'holdings_authored', value: this.published, label: 'authored' },
          {
            key: 'ticks_to_nowcast',
            value: this.ticksToNextNowcast(),
            of: config.nowcast.interval_ticks,
            unit: 'ticks',
            label: 'next now-cast in',
          },
        ],
      }),
      runId,
      this.ownDigest,
    );
  }

  /** Provision through the store's own seam, then follow the clock (FR-11). */
  start(): void {
    this.client.subscribe(this.config.topics.clock, (message) => {
      const sample = message.payload as { sim_time: string; tick: number };
      const firstSample = this.simTime.value === '';
      this.simTime = { value: sample.sim_time, tick: sample.tick };
      if (firstSample) {
        this.provision();
        return;
      }
      if (sample.tick - this.lastNowcastTick >= this.config.nowcast.interval_ticks) {
        this.publishNowcast();
      }
    });
    this.heartbeat.start();
  }

  stop(): void {
    this.heartbeat.stop();
  }

  private provision(): void {
    this.publishArchive();
    this.publishNowcast();
  }

  private publishArchive(): void {
    const { domain, archive } = this.config;
    const grid: GridSpec = {
      longitude: axis(domain.longitude.minimum, domain.longitude.maximum, archive.grid.longitude, 'degrees_east', 'east'),
      latitude: axis(domain.latitude.minimum, domain.latitude.maximum, archive.grid.latitude, 'degrees_north', 'north'),
      depth: axis(domain.depth.minimum, domain.depth.maximum, archive.grid.depth, 'm', 'down'),
      time: {
        origin_sim_time: this.simTime.value,
        // The archive reaches back from the scenario start: months of history,
        // ending one month before the origin.
        start_offset_seconds: -archive.months * archive.month_seconds,
        step_seconds: archive.month_seconds,
        count: archive.months,
        units: 'seconds since the origin sim time',
      },
    };
    this.evaluateAndPublish('archive', grid);
  }

  private publishNowcast(): void {
    const { domain, nowcast } = this.config;
    const grid: GridSpec = {
      longitude: axis(domain.longitude.minimum, domain.longitude.maximum, nowcast.grid.longitude, 'degrees_east', 'east'),
      latitude: axis(domain.latitude.minimum, domain.latitude.maximum, nowcast.grid.latitude, 'degrees_north', 'north'),
      depth: axis(domain.depth.minimum, domain.depth.maximum, nowcast.grid.depth, 'm', 'down'),
      time: {
        origin_sim_time: this.simTime.value,
        start_offset_seconds: 0,
        step_seconds: nowcast.step_seconds,
        count: nowcast.time_steps,
        units: 'seconds since the origin sim time',
      },
    };
    this.lastNowcastTick = this.simTime.tick;
    this.nowcastCount += 1;
    this.evaluateAndPublish('nowcast', grid);
  }

  private evaluateAndPublish(era: 'archive' | 'nowcast', grid: GridSpec): void {
    const lons = axisValues(grid.longitude);
    const lats = axisValues(grid.latitude);
    const depths = axisValues(grid.depth);
    const cells = grid.time.count * depths.length * lats.length * lons.length;
    const temperature = new Float32Array(cells);
    const salinity = new Float32Array(cells);
    let outsideValidity = 0;
    let firstOutside: { latitude: number; longitude: number; depth_m: number; time_seconds: number } | null = null;
    let maxAbsT = 0;
    let maxAbsS = 0;
    let index = 0;
    for (let t = 0; t < grid.time.count; t++) {
      const seconds = grid.time.start_offset_seconds + t * grid.time.step_seconds;
      for (const depth of depths) {
        for (const lat of lats) {
          for (const lon of lons) {
            const tv = temperatureAt(this.world, lon, lat, depth, seconds);
            const sv = salinityAt(this.world, lon, lat, depth, seconds);
            temperature[index] = tv;
            salinity[index] = sv;
            if (Math.abs(tv) > maxAbsT) maxAbsT = Math.abs(tv);
            if (Math.abs(sv) > maxAbsS) maxAbsS = Math.abs(sv);
            if (!insideSoundSpeedValidity(tv, sv, depth)) {
              outsideValidity += 1;
              firstOutside ??= { latitude: lat, longitude: lon, depth_m: depth, time_seconds: seconds };
            }
            index += 1;
          }
        }
      }
    }

    const bytes = new Uint8Array(temperature.byteLength + salinity.byteLength);
    bytes.set(new Uint8Array(temperature.buffer), 0);
    bytes.set(new Uint8Array(salinity.buffer), temperature.byteLength);
    const fieldDigest = `sha256:${sha256Hex(bytes)}`;

    // float32 tolerance, derived from the stored width at the largest magnitude —
    // never chosen (manifest `tolerance`).
    const ulpAt = (magnitude: number) => Math.pow(2, Math.max(Math.floor(Math.log2(Math.max(magnitude, 1))) - 23, -149));
    const holdingId = `${era}.${this.runId}.t${this.simTime.tick}`;
    const manifest: Manifest = {
      schema_version: 1,
      generator: { name: 'drogna-env-generator', version: GENERATOR_VERSION, analytic_form_version: ANALYTIC_FORM_VERSION },
      run_id: this.runId,
      config_digest: this.ownDigest,
      seed: {
        root: this.rootSeed,
        stream: this.config.stream,
        derived_entropy: streamSeed(this.rootSeed, this.config.stream).toString(16),
        derivation: { rule: SEED_DERIVATION.rule, version: SEED_DERIVATION.version },
        draw_order: [...this.drawOrder],
      },
      generated_at: { sim_time: this.simTime.value, tick: this.simTime.tick },
      grid,
      variables: [
        {
          name: 'temperature',
          standard_name: 'sea_water_temperature',
          long_name: 'sea water temperature',
          units: 'degC',
          dtype: 'float32',
          tolerance_absolute: 4 * ulpAt(maxAbsT),
        },
        {
          name: 'salinity',
          standard_name: 'sea_water_salinity',
          long_name: 'sea water practical salinity',
          units: '1e-3',
          dtype: 'float32',
          tolerance_absolute: 4 * ulpAt(maxAbsS),
        },
      ],
      background: {
        rule: 'exponential-profiles',
        description: 'temperature and salinity relax exponentially from surface to deep values with depth',
        parameters: this.config.background,
      },
      pressure_relation: { ...PRESSURE_RELATION },
      sound_speed: {
        method: SOUND_SPEED.method,
        implementation: SOUND_SPEED.implementation,
        validity: { ...SOUND_SPEED.validity },
        outside_validity: { count: outsideValidity, first_point: firstOutside },
      },
      composition: {
        rule: COMPOSITION_RULE,
        description: 'each feature’s anomaly is added to the background; no feature masks another',
      },
      features: this.groundTruthFeatures(grid),
      timescale: {
        background_seconds: this.config.timescale.background_seconds,
        background_to_time_step_ratio: this.config.timescale.background_seconds / grid.time.step_seconds,
        floor_ratio: this.config.timescale.floor_ratio,
        blending_rule: { ...TAU_BLENDING_RULE, parameters: {} },
        membership: { ...TAU_MEMBERSHIP_RULE },
      },
      outputs: {
        field: { name: holdingId, format: 'drogna-f32-v1', sha256: fieldDigest },
        manifest: { name: `${holdingId}.manifest`, format: 'application/json' },
      },
      normalised_attributes: [
        {
          name: 'history',
          treatment: 'omitted',
          reason: 'V2 stores raw field bytes plus this document; there is no file container to carry attributes',
        },
      ],
      tolerance: {
        basis: 'stored-width-at-largest-magnitude',
        stored_dtype: 'float32',
        description: 'four units in the last place of float32 at each variable’s largest stored magnitude',
      },
    };

    const descriptor: CoverageHolding = {
      schema_version: 1,
      holding_id: holdingId,
      era,
      run_id: this.runId,
      published_at: { sim_time: this.simTime.value, tick: this.simTime.tick },
      field: { format: 'drogna-f32-v1', sha256: fieldDigest, byte_length: bytes.byteLength },
      manifest,
    };

    const verdict = this.store.publish({ descriptor, bytes });
    if (!verdict.published) {
      // A refusal of the generator's own publication is a fault worth shouting about,
      // not swallowing: the heartbeat carries it until somebody looks.
      throw new Error(`coverage store refused the ${era} holding: ${verdict.refusal}`);
    }
    this.published += 1;
  }

  private groundTruthFeatures(grid: GridSpec): [ManifestFeature, ManifestFeature, ManifestFeature, ManifestFeature] {
    const spacingKm = Math.max(
      grid.latitude.spacing * KM_PER_DEGREE_LATITUDE,
      grid.longitude.spacing * KM_PER_DEGREE_LATITUDE * Math.cos((this.world.eddy.centre_latitude * Math.PI) / 180),
    );
    const tau = this.config.timescale;
    const resolution = (scaleKm: number) => ({
      scale: scaleKm,
      scale_units: 'km',
      grid_spacing: spacingKm,
      ratio: scaleKm / spacingKm,
    });
    const ratioFor = (seconds: number) => seconds / grid.time.step_seconds;
    return [
      {
        id: 'eddy',
        kind: 'eddy',
        parameters: this.world.eddy,
        timescale_seconds: tau.feature_seconds.eddy,
        timescale_to_time_step_ratio: ratioFor(tau.feature_seconds.eddy),
        resolution: resolution(this.world.eddy.radius_km),
      },
      {
        id: 'front',
        kind: 'front',
        parameters: this.world.front,
        timescale_seconds: tau.feature_seconds.front,
        timescale_to_time_step_ratio: ratioFor(tau.feature_seconds.front),
        resolution: resolution(this.world.front.sharpness_km),
      },
      {
        id: 'thermocline',
        kind: 'thermocline',
        parameters: this.world.thermocline,
        timescale_seconds: tau.feature_seconds.thermocline,
        timescale_to_time_step_ratio: ratioFor(tau.feature_seconds.thermocline),
        // The thermocline's scale is vertical; expressed against the same horizontal
        // spacing it is trivially resolved, so the recorded scale is its thickness
        // mapped through the depth spacing instead.
        resolution: {
          scale: this.world.thermocline.thickness_m,
          scale_units: 'm',
          grid_spacing: grid.depth.spacing,
          ratio: this.world.thermocline.thickness_m / grid.depth.spacing,
        },
      },
      {
        id: 'moving',
        kind: 'moving',
        parameters: this.world.moving,
        timescale_seconds: tau.feature_seconds.moving,
        timescale_to_time_step_ratio: ratioFor(tau.feature_seconds.moving),
        resolution: resolution(this.world.moving.radius_km),
      },
    ];
  }
}
