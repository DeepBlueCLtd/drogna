/**
 * The faces (SRD-v2 FR-58): one instrument per component, chosen for what that
 * component does.
 *
 * A single generic gauge repeated twenty times tells a reader nothing the table did
 * not — which is exactly what the first cut of this panel shipped, and why it was
 * sent back. So a store shows volume and growth, the monitor shows drift against the
 * threshold that will fire, the runner shows its ensemble, the platform shows
 * demanded against current.
 *
 * Every number drawn here was **reported**: it arrived in the component's own
 * heartbeat as a named figure (heartbeat.schema.json `figures`), or in a message on a
 * topic the shell subscribes to. Nothing is parsed out of a detail sentence, and
 * nothing is computed here that a component could have computed itself — parsing
 * prose is how a display starts inventing figures nobody published.
 *
 * A face with no figures yet says so. It never draws a zero, because zero is a
 * measurement and nothing is not.
 */
import type { ReactNode } from 'react';
import type { Heartbeat, PlatformState, TelemetryBreachState } from '../../generated/types.js';
import type { Series } from './series.js';

export type Figure = NonNullable<Heartbeat['figures']>[number];

export interface FaceContext {
  readonly id: string;
  readonly heartbeat: Heartbeat | undefined;
  readonly platformState: PlatformState | undefined;
  readonly breach: TelemetryBreachState | undefined;
  readonly series: (key: string) => Series;
  readonly counted: (key: string) => number;
  readonly holdingSizes: readonly number[];
  /** Ocean datastreams the shell has genuinely heard, in the order they arrived. */
  readonly oceanDatastreams: readonly string[];
  readonly clock: { tick: number | null; rate: number | undefined };
}

function figure(context: FaceContext, key: string): Figure | undefined {
  return context.heartbeat?.figures?.find((entry) => entry.key === key);
}

function value(context: FaceContext, key: string): number | undefined {
  return figure(context, key)?.value;
}

/** A number the component reported, with its own label and unit. */
function Reported({ figure: entry }: { figure: Figure | undefined }) {
  if (!entry) return null;
  return (
    <span className="face-stat">
      <b>{format(entry.value)}</b>
      {entry.unit ? <i>{entry.unit}</i> : null}
      <span>{entry.label ?? entry.key.replace(/_/g, ' ')}</span>
    </span>
  );
}

function format(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

/** A bar toward a bound the component declared. Never drawn without one. */
function Toward({ figure: entry, hue, invert }: { figure: Figure | undefined; hue: string; invert?: boolean }) {
  if (!entry || entry.of === undefined || entry.of <= 0) return null;
  const raw = Math.max(0, Math.min(1, entry.value / entry.of));
  const fraction = invert ? 1 - raw : raw;
  return (
    <span className="face-bar" title={`${entry.value} of ${entry.of}${entry.unit ? ` ${entry.unit}` : ''}`}>
      <span className="face-bar-fill" style={{ width: `${fraction * 100}%`, background: hue }} />
    </span>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="face-quiet">{children}</p>;
}

/** A sparkline, or the honest statement that there is nothing to draw yet. */
function Spark({ series, hue, label }: { series: Series; hue: string; label: string }) {
  const box = { x: 1, y: 2, width: 178, height: 26 };
  const segments = series.segments(box, 90);
  if (segments.length === 0) {
    return <span className="face-spark-empty">{series.empty ? 'no samples heard yet' : 'one sample so far'}</span>;
  }
  return (
    <svg className="face-spark" viewBox="0 0 180 30" role="img" aria-label={label} preserveAspectRatio="none">
      {segments.map((points, index) => (
        <polyline key={index} points={points} fill="none" stroke={hue} strokeWidth="1.4" />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------- the faces ---

function ClockFace(c: FaceContext) {
  const tick = c.clock.tick;
  if (tick === null) return <Quiet>no clock sample heard yet</Quiet>;
  return (
    <div className="face">
      <div className="face-big" data-testid="face-clock-tick">
        {tick.toLocaleString()}
        <span>tick</span>
      </div>
      <div className="face-row">
        <span className="face-stat">
          <b>×{c.clock.rate ?? '—'}</b>
          <span>rate, acknowledged</span>
        </span>
      </div>
      <p className="face-note">every other component takes its time from here</p>
    </div>
  );
}

function BrokerFace(c: FaceContext) {
  const heard = c.counted('all');
  if (heard === 0) return <Quiet>no traffic counted here yet</Quiet>;
  const lanes: [string, string][] = [
    ['obs', 'var(--flow-pts)'],
    ['ctl', 'var(--flow-ctl)'],
    ['cov', 'var(--flow-fld)'],
    ['adv', 'var(--flow-cy)'],
  ];
  const peak = Math.max(1, ...lanes.map(([ns]) => c.counted(ns)));
  return (
    <div className="face">
      {lanes.map(([namespace, hue]) => (
        <div className="face-lane" key={namespace}>
          <span>{namespace}/</span>
          <span className="face-bar">
            <span
              className="face-bar-fill"
              style={{ width: `${(c.counted(namespace) / peak) * 100}%`, background: hue }}
            />
          </span>
          <b>{format(c.counted(namespace))}</b>
        </div>
      ))}
      <p className="face-counted">{format(heard)} messages counted here</p>
    </div>
  );
}

function GateFace(c: FaceContext) {
  const denied = figure(c, 'denied');
  const allowed = figure(c, 'allowed');
  if (!denied || !allowed) return <Quiet>the gate has reported no figures yet</Quiet>;
  const total = Math.max(1, denied.value + allowed.value);
  return (
    <div className="face">
      <span className="face-bar" title={`${allowed.value} allowed, ${denied.value} denied`}>
        <span className="face-bar-fill" style={{ width: `${(allowed.value / total) * 100}%`, background: 'var(--flow-fld)' }} />
      </span>
      <div className="face-row">
        <Reported figure={allowed} />
        <Reported figure={denied} />
      </div>
      <p className="face-note">default deny; exposure is opt-in, one prefix at a time</p>
    </div>
  );
}

function GeneratorFace(c: FaceContext) {
  const authored = figure(c, 'holdings_authored');
  const toNext = figure(c, 'ticks_to_nowcast');
  if (!authored) return <Quiet>the generator has reported no figures yet</Quiet>;
  return (
    <div className="face">
      <div className="face-row">
        <Reported figure={authored} />
      </div>
      <span className="face-label">next now-cast</span>
      <Toward figure={toNext} hue="var(--flow-fld)" invert />
      <p className="face-note">
        {toNext ? `${format(toNext.value)} of ${format(toNext.of ?? 0)} ticks to go` : ''}
      </p>
    </div>
  );
}

function PlatformFace(c: FaceContext) {
  const state = c.platformState;
  if (!state) return <Quiet>nothing heard from the platform yet</Quiet>;
  const { current, demanded, limits, binding_limit: binding, shortfall } = state;
  return (
    <div className="face face-platform">
      <div className="face-platform-top">
        <Dial current={current.course_degrees} demanded={demanded?.course_degrees} />
        <div className="face-tapes">
          <Tape
            label="speed"
            current={current.speed_m_per_s}
            demanded={demanded?.speed_m_per_s}
            maximum={limits.maximum_speed_m_per_s}
            unit="m/s"
          />
          <Tape
            label="depth"
            current={current.depth_m}
            demanded={demanded?.depth_m}
            maximum={limits.maximum_depth_m}
            unit="m"
          />
        </div>
      </div>
      <p
        className={binding === 'none' ? 'face-note' : 'face-binding'}
        data-testid="platform-binding"
      >
        {demanded === null
          ? 'no demand heard; holding what it was configured with'
          : binding === 'none'
            ? 'at the demanded course, speed and depth'
            : `binding: ${binding.replace(/_/g, ' ')}`}
      </p>
      {shortfall ? (
        <p className="face-shortfall" data-testid="platform-shortfall">
          {shortfall.statement}
        </p>
      ) : null}
      {/* Reported, and only once it has happened: the platform reported an impossible
          depth because it was asked to, and did not dive to one. */}
      {figure(c, 'faults') === undefined ? null : (
        <p className="face-binding" data-testid="platform-faults">
          {format(value(c, 'faults') ?? 0)} deliberately faulty depth reading(s) published on request
        </p>
      )}
    </div>
  );
}

function Dial({ current, demanded }: { current: number; demanded: number | undefined }) {
  const at = (degrees: number, radius: number) => {
    const angle = ((degrees - 90) * Math.PI) / 180;
    return { x: 27 + radius * Math.cos(angle), y: 27 + radius * Math.sin(angle) };
  };
  const now = at(current, 17);
  const want = demanded === undefined ? undefined : at(demanded, 21);
  return (
    <svg className="face-dial" viewBox="0 0 54 54" role="img" aria-label={`course ${current.toFixed(0)} degrees`}>
      <circle cx="27" cy="27" r="23" fill="none" stroke="var(--flow-line)" />
      {[0, 90, 180, 270].map((degrees) => {
        const outer = at(degrees, 23);
        const inner = at(degrees, 19);
        return (
          <line
            key={degrees}
            x1={outer.x.toFixed(1)}
            y1={outer.y.toFixed(1)}
            x2={inner.x.toFixed(1)}
            y2={inner.y.toFixed(1)}
            stroke="var(--flow-line)"
          />
        );
      })}
      {want ? (
        <>
          <line
            x1="27"
            y1="27"
            x2={want.x.toFixed(1)}
            y2={want.y.toFixed(1)}
            stroke="var(--flow-own)"
            strokeWidth="1.2"
            strokeDasharray="3 2"
          />
          <circle cx={want.x.toFixed(1)} cy={want.y.toFixed(1)} r="2.6" fill="none" stroke="var(--flow-own)" strokeWidth="1.3" />
        </>
      ) : null}
      <line x1="27" y1="27" x2={now.x.toFixed(1)} y2={now.y.toFixed(1)} stroke="var(--flow-fg)" strokeWidth="2.2" />
      <circle cx="27" cy="27" r="2" fill="var(--flow-fg)" />
    </svg>
  );
}

function Tape({
  label,
  current,
  demanded,
  maximum,
  unit,
}: {
  label: string;
  current: number;
  demanded: number | undefined;
  maximum: number;
  unit: string;
}) {
  return (
    <div className="face-tape">
      <span className="face-tape-label">{label}</span>
      <span className="face-tape-track">
        <span className="face-tape-fill" style={{ width: `${Math.min(100, (current / maximum) * 100)}%` }} />
        {demanded === undefined ? null : (
          <span
            className="face-tape-demanded"
            style={{ left: `${Math.min(100, (demanded / maximum) * 100)}%` }}
            aria-label={`demanded ${demanded} ${unit}`}
          />
        )}
      </span>
      <span className="face-tape-value">
        {current.toFixed(1)}
        {demanded === undefined ? '' : ` → ${demanded.toFixed(1)}`}
      </span>
    </div>
  );
}

function SensorsFace(c: FaceContext) {
  const published = value(c, 'published');
  const age = figure(c, 'position_age_ticks');
  // Reported figures, drawn only where the component reported them: the cadence in
  // force, and — once it has happened — how often sampling was starved of a position.
  const cadence = figure(c, 'sample_interval');
  const skipped = figure(c, 'skipped');
  const sensorFaults = figure(c, 'faults');
  // The instruments are whichever ocean datastreams have genuinely been heard — not a
  // list typed in here, which is how the pressure instrument came to be drawn as
  // silent when it had been publishing all along.
  const instruments = c.oceanDatastreams;
  const anySamples = instruments.length > 0;
  return (
    <div className="face">
      {anySamples ? (
        instruments.slice(0, 3).map((id) => {
          const series = c.series(`obs:${id}`);
          const latest = series.latest();
          return (
            <div className="face-instrument" key={id}>
              {/* The datastream's own id, not a prettified stem: two temperature
                  instruments at different depths both read "temperature" once the
                  depth is stripped, which is a face telling a reader two things are
                  one thing. */}
              <span title={id}>{id}</span>
              <Spark series={series} hue="var(--flow-pts)" label={`${id}, recent samples`} />
              <b>{latest ? latest.value.toFixed(2) : '—'}</b>
            </div>
          );
        })
      ) : (
        <Quiet>no observation heard here yet</Quiet>
      )}
      {published === undefined ? null : (
        <p className="face-note">
          {format(published)} published
          {cadence === undefined ? '' : `, every ${format(cadence.value)} ticks`}
          {skipped === undefined ? '' : `; ${format(skipped.value)} skipped for want of a position`}
        </p>
      )}
      {/* A fault a reader asked for, drawn as a fault a reader asked for. Absent
          until one has been, because 'no faults' is not a measurement. */}
      {sensorFaults === undefined ? null : (
        <p className="face-binding" data-testid="sensors-faults">
          {format(sensorFaults.value)} deliberately faulty sample(s) published on request
        </p>
      )}
      {/* The sensors sample where ownship last reported, and a position older than one
          sampling interval is not where the platform is now (FR-55). Which of those
          holds is the single most useful thing this face can say. */}
      {age === undefined ? (
        <p className="face-binding" data-testid="sensors-position">
          no ownship position heard; publishing nothing
        </p>
      ) : age.of !== undefined && age.value > age.of ? (
        <p className="face-binding" data-testid="sensors-position">
          quiet: the position is {format(age.value)} ticks old, beyond the {format(age.of)}-tick interval
        </p>
      ) : (
        <p className="face-note" data-testid="sensors-position">
          sampling where ownship reported, {format(age.value)} ticks ago
        </p>
      )}
    </div>
  );
}

function IngestFace(c: FaceContext) {
  const stored = figure(c, 'stored');
  if (!stored) return <Quiet>the seam has reported no figures yet</Quiet>;
  const lanes: [string, string][] = [
    ['stored', 'var(--flow-fld)'],
    ['refused', 'var(--shell-refused)'],
    ['flagged', 'var(--shell-refused)'],
    ['absorbed', 'var(--flow-dim)'],
  ];
  const peak = Math.max(1, ...lanes.map(([key]) => value(c, key) ?? 0));
  return (
    <div className="face">
      {lanes.map(([key, hue]) => (
        <div className="face-lane" key={key}>
          <span>{key}</span>
          <span className="face-bar">
            <span className="face-bar-fill" style={{ width: `${((value(c, key) ?? 0) / peak) * 100}%`, background: hue }} />
          </span>
          <b>{format(value(c, key) ?? 0)}</b>
        </div>
      ))}
    </div>
  );
}

function ObservationStoreFace(c: FaceContext) {
  const rows = figure(c, 'rows');
  if (!rows) return <Quiet>the store has reported no figures yet</Quiet>;
  const growth = c.series('store:rows');
  return (
    <div className="face">
      <div className="face-big">
        {format(rows.value)}
        <span>rows</span>
      </div>
      <Spark series={growth} hue="var(--flow-pts)" label="rows over simulation time" />
      <p className="face-note">
        <Reported figure={figure(c, 'datastreams')} />
      </p>
    </div>
  );
}

function FeatureStoreFace(c: FaceContext) {
  const features = figure(c, 'features');
  if (!features) return <Quiet>the store has reported no figures yet</Quiet>;
  return (
    <div className="face">
      <span className="face-pill">read-only for the whole run</span>
      <div className="face-row">
        <Reported figure={features} />
      </div>
      <p className="face-note">nothing writes here, so there is no growth to draw</p>
    </div>
  );
}

function QueryFace(c: FaceContext) {
  const collections = figure(c, 'collections');
  const observations = figure(c, 'observations');
  if (!collections && !observations) return <Quiet>the query face has reported no figures yet</Quiet>;
  return (
    <div className="face">
      <div className="face-row">
        <Reported figure={collections} />
        <Reported figure={observations} />
      </div>
      <p className="face-note">EDR and SensorThings, read-only, each stating its subset</p>
    </div>
  );
}

function CoverageStoreFace(c: FaceContext) {
  const holdings = figure(c, 'holdings');
  if (!holdings || holdings.value === 0) return <Quiet>no holding has been published yet</Quiet>;
  const sizes = c.holdingSizes.length > 0 ? c.holdingSizes : [];
  const peak = Math.max(1, ...sizes);
  return (
    <div className="face">
      <div className="face-row">
        <Reported figure={holdings} />
        <Reported figure={figure(c, 'bytes')} />
      </div>
      <div className="face-stack" data-testid="holding-stack">
        {sizes.slice(0, 6).map((bytes, index) => (
          <span
            key={index}
            className={index === 0 ? 'face-stack-bar face-stack-newest' : 'face-stack-bar'}
            style={{ width: `${(bytes / peak) * 100}%` }}
            title={`${bytes} bytes`}
          />
        ))}
      </div>
      <p className="face-note">newest at the top; length is bytes on the wire</p>
    </div>
  );
}

function MonitorFace(c: FaceContext) {
  const breach = c.breach;
  const residuals = c.series('residual');
  if (!breach) return <Quiet>no residual has been reported yet</Quiet>;
  return (
    <div className="face">
      <div className="face-row">
        <span className="face-stat">
          <b>{residuals.latest()?.value.toFixed(2) ?? '—'}</b>
          <i>m/s</i>
          <span>last residual</span>
        </span>
      </div>
      <div className="face-drift">
        <Spark series={residuals} hue="var(--flow-fld)" label="sound-speed residual, recent samples" />
        <span className="face-threshold" aria-hidden="true" />
      </div>
      <div className="face-streak" data-testid="monitor-streak">
        {Array.from({ length: breach.persistence_count }, (_, index) => (
          <span key={index} className={index < breach.streak ? 'face-slot face-slot-filled' : 'face-slot'} />
        ))}
        <span>
          {breach.streak} of {breach.persistence_count} → divergence
        </span>
      </div>
      <p className="face-declared">threshold {breach.threshold_m_per_s.toFixed(2)} m/s</p>
    </div>
  );
}

function SchedulerFace(c: FaceContext) {
  const requested = figure(c, 'requested');
  if (!requested) return <Quiet>the scheduler has reported no figures yet</Quiet>;
  const toMinimum = figure(c, 'ticks_to_minimum');
  return (
    <div className="face">
      <div className="face-row">
        <Reported figure={requested} />
        <Reported figure={figure(c, 'declined')} />
      </div>
      <span className="face-label">minimum interval</span>
      <Toward figure={toMinimum} hue="var(--flow-ctl)" invert />
      <p className="face-note">
        {toMinimum && toMinimum.value > 0
          ? `${format(toMinimum.value)} ticks before another breach can be accepted`
          : 'spent: the next breach can be acted on'}
      </p>
    </div>
  );
}

function RunnerFace(c: FaceContext) {
  const members = figure(c, 'members_done');
  if (!members) return <Quiet>the runner has reported no figures yet</Quiet>;
  const total = members.of ?? 0;
  return (
    <div className="face">
      <div className="face-ensemble" data-testid="ensemble">
        {total === 0 ? (
          <span className="face-quiet">no run has been requested yet</span>
        ) : (
          Array.from({ length: total }, (_, index) => (
            <span key={index} className={index < members.value ? 'face-member face-member-done' : 'face-member'} />
          ))
        )}
      </div>
      <div className="face-row">
        <Reported figure={figure(c, 'runs_completed')} />
        <Reported figure={figure(c, 'horizon_seconds')} />
      </div>
    </div>
  );
}

function PlannerFace(c: FaceContext) {
  const plans = figure(c, 'plans_emitted');
  if (!plans) return <Quiet>the planner has reported no figures yet</Quiet>;
  return (
    <div className="face">
      <div className="face-row">
        <Reported figure={plans} />
        <Reported figure={figure(c, 'route_stops')} />
        <Reported figure={figure(c, 'soundings')} />
        <Reported figure={figure(c, 'usable_threshold')} />
        <Reported figure={figure(c, 'prompted')} />
      </div>
      <p className="face-note">recommendations only — this commands nothing</p>
    </div>
  );
}

function TelemetryFace(c: FaceContext) {
  const skill = c.series('skill');
  const latest = skill.latest();
  if (!latest) return <Quiet>no skill figure yet: the loop has not produced enough scored samples</Quiet>;
  const width = Math.min(50, Math.abs(latest.value) * 100);
  return (
    <div className="face">
      <span className="face-label">skill against persistence</span>
      <span className="face-gauge">
        <span className="face-gauge-zero" />
        <span
          className="face-gauge-fill"
          style={{
            left: latest.value >= 0 ? '50%' : `${50 - width}%`,
            width: `${width}%`,
            background: latest.value >= 0 ? 'var(--flow-fld)' : 'var(--shell-refused)',
          }}
        />
      </span>
      <div className="face-row">
        <span className="face-stat">
          <b>{latest.value >= 0 ? '+' : ''}{latest.value.toFixed(2)}</b>
          <span>{latest.value >= 0 ? 'earning its compute' : 'not earning its compute'}</span>
        </span>
      </div>
    </div>
  );
}

function OperatorFace(c: FaceContext) {
  const dispatched = figure(c, 'dispatched');
  if (!dispatched) return <Quiet>the surface has reported no figures yet</Quiet>;
  return (
    <div className="face">
      <div className="face-row">
        <Reported figure={dispatched} />
        <Reported figure={figure(c, 'refused')} />
        <Reported figure={figure(c, 'demands')} />
        <Reported figure={figure(c, 'tunings')} />
        <Reported figure={figure(c, 'events')} />
      </div>
      <p className="face-note">this is the surface you are looking through</p>
    </div>
  );
}

function AdvisorySourceFace(c: FaceContext) {
  const authored = figure(c, 'authored');
  if (!authored) return <Quiet>the source has reported no figures yet</Quiet>;
  return (
    <div className="face">
      <div className="face-row">
        <Reported figure={authored} />
        <Reported figure={figure(c, 'cadence_ticks')} />
        {/* How many were authored because a reader asked. Found missing by driving
            the built page: the source was counting prompts and its face was not
            drawing them, so pressing the button changed nothing a reader could see
            until the next advisory landed on the map. */}
        <Reported figure={figure(c, 'prompted')} />
      </div>
      <p className="face-note">deterministically authored from the seeded stream</p>
    </div>
  );
}

function AdvisoryStoreFace(c: FaceContext) {
  const advisories = figure(c, 'advisories');
  if (!advisories) return <Quiet>the store has reported no figures yet</Quiet>;
  return (
    <div className="face">
      <span className="face-pill">append-only</span>
      <div className="face-row">
        <Reported figure={advisories} />
        <Reported figure={figure(c, 'refused')} />
      </div>
      <p className="face-note">never edited, never removed; a later one supersedes</p>
    </div>
  );
}

function OffloadFace(c: FaceContext) {
  const bundles = figure(c, 'bundles');
  if (!bundles) return <Quiet>the packager has reported no figures yet</Quiet>;
  const staged = figure(c, 'staged_bytes');
  return (
    <div className="face">
      <div className="face-row">
        <Reported figure={bundles} />
        <Reported figure={figure(c, 'prompted')} />
        <Reported figure={figure(c, 'declined')} />
      </div>
      <span className="face-label">staged against the declared bound</span>
      <Toward figure={staged} hue="var(--flow-fld)" />
      <p className="face-note">announcement only; nothing leaves until Version 3</p>
    </div>
  );
}

/**
 * Which face each component wears. Keyed by component id, so a component with no
 * face of its own falls back to what it says about itself rather than to a blank.
 */
export const FACES: Record<string, (context: FaceContext) => ReactNode> = {
  clock: ClockFace,
  broker: BrokerFace,
  boundary: GateFace,
  'env-generator': GeneratorFace,
  platform: PlatformFace,
  sensors: SensorsFace,
  ingest: IngestFace,
  'observation-store': ObservationStoreFace,
  'feature-store': FeatureStoreFace,
  query: QueryFace,
  'coverage-store': CoverageStoreFace,
  monitor: MonitorFace,
  scheduler: SchedulerFace,
  'model-runner': RunnerFace,
  planner: PlannerFace,
  telemetry: TelemetryFace,
  operator: OperatorFace,
  'advisory-source': AdvisorySourceFace,
  'advisory-store': AdvisoryStoreFace,
  offload: OffloadFace,
};

/** Components with no bespoke face. Empty, and a test holds it empty. */
export function componentsWithoutFaces(ids: readonly string[]): string[] {
  return ids.filter((id) => !(id in FACES));
}
