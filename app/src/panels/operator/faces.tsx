/**
 * The faces (SRD-v2 FR-53): one instrument per component, chosen for what that
 * component does.
 *
 * A single generic gauge repeated twenty times would tell a reader nothing the table
 * did not. So a store shows volume and growth, the monitor shows drift against the
 * threshold that will fire, the runner shows its ensemble, and the platform shows
 * demanded against current.
 *
 * Every figure is one of three kinds and says which (FR-52). `Declared` comes from the
 * configuration document; `Reported` was carried in a message the component published
 * about itself; `Observed` was counted by the shell from traffic it received itself.
 * Mixing them is how a display starts asserting things nothing published — so the kind
 * is a component here, not a convention, and cannot be forgotten.
 */
import type { ReactNode } from 'react';
import type { Heartbeat, PlatformState } from '../../generated/types.js';
import type { Series } from './series.js';

export type FigureKind = 'declared' | 'reported' | 'observed';

export function Figure({ kind, label, value }: { kind: FigureKind; label: string; value: ReactNode }) {
  return (
    <span className={`flow-figure flow-figure-${kind}`} data-kind={kind} title={KIND_TITLE[kind]}>
      <span className="flow-figure-label">{label}</span>
      <span className="flow-figure-value">{value}</span>
    </span>
  );
}

const KIND_TITLE: Record<FigureKind, string> = {
  declared: 'declared: from the configuration document. Nothing published it.',
  reported: 'reported: carried in a message this component published about itself.',
  observed: 'observed: counted by the shell from traffic it received itself.',
};

/** A sparkline, or the honest statement that there is nothing to draw yet (FR-53). */
export function Spark({
  series,
  stride,
  hue,
  label,
}: {
  series: Series;
  stride: number;
  hue: string;
  label: string;
}) {
  const box = { x: 1, y: 1, width: 118, height: 22 };
  const segments = series.segments(box, stride);
  if (segments.length === 0) {
    return (
      <span className="flow-spark-empty">
        {series.empty ? 'no samples heard yet' : 'one sample so far'}
      </span>
    );
  }
  return (
    <svg className="flow-spark" viewBox="0 0 120 24" role="img" aria-label={label}>
      {segments.map((points, index) => (
        <polyline key={index} points={points} fill="none" stroke={hue} strokeWidth="1.3" />
      ))}
    </svg>
  );
}

/** A bar toward a bound, with the bound named. */
export function Bar({ fraction, hue }: { fraction: number; hue: string }) {
  const width = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <span className="flow-bar">
      <span className="flow-bar-fill" style={{ width: `${width}%`, background: hue }} />
    </span>
  );
}

export interface FaceInput {
  readonly id: string;
  readonly heartbeat: Heartbeat | undefined;
  readonly platformState: PlatformState | undefined;
  readonly series: (key: string) => Series;
  readonly counted: (key: string) => number;
  readonly sampleStride: number;
}

/**
 * The platform's face: demanded as a ghost mark, current as the solid one, and the
 * limit that is binding named beneath. Where the two differ the face says why, so a
 * platform that is not obeying is never mistaken for one that is (FR-047).
 */
function PlatformFace({ state, series, stride }: { state: PlatformState | undefined; series: Series; stride: number }) {
  if (!state) {
    return <p className="flow-face-quiet">nothing heard from the platform yet</p>;
  }
  const { current, demanded, limits, binding_limit: binding, shortfall } = state;
  return (
    <div className="flow-face">
      <div className="flow-dials">
        <Dial current={current.course_degrees} demanded={demanded?.course_degrees} />
        <div className="flow-tapes">
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
      <Spark series={series} stride={stride} hue="var(--flow-own)" label="ownship heading, recent samples" />
      <p className={binding === 'none' ? 'flow-face-note' : 'flow-face-binding'} data-testid="platform-binding">
        {demanded === null
          ? 'no demand heard; holding what it was configured with'
          : binding === 'none'
            ? 'at the demanded course, speed and depth'
            : `binding: ${binding.replace(/_/g, ' ')}`}
      </p>
      {shortfall ? (
        <p className="flow-face-shortfall" data-testid="platform-shortfall">
          {shortfall.statement}
        </p>
      ) : null}
    </div>
  );
}

function Dial({ current, demanded }: { current: number; demanded: number | undefined }) {
  const point = (degrees: number, radius: number) => {
    const angle = ((degrees - 90) * Math.PI) / 180;
    return { x: 30 + radius * Math.cos(angle), y: 30 + radius * Math.sin(angle) };
  };
  const now = point(current, 20);
  const want = demanded === undefined ? undefined : point(demanded, 24);
  return (
    <svg className="flow-dial" viewBox="0 0 60 60" role="img" aria-label={`course ${current.toFixed(0)} degrees`}>
      <circle cx="30" cy="30" r="26" fill="none" stroke="var(--flow-line)" />
      {want ? (
        <>
          <line x1="30" y1="30" x2={want.x.toFixed(1)} y2={want.y.toFixed(1)} stroke="var(--flow-own)" strokeWidth="1.2" strokeDasharray="3 2" />
          <circle cx={want.x.toFixed(1)} cy={want.y.toFixed(1)} r="2.4" fill="none" stroke="var(--flow-own)" strokeWidth="1.2" />
        </>
      ) : null}
      <line x1="30" y1="30" x2={now.x.toFixed(1)} y2={now.y.toFixed(1)} stroke="var(--flow-fg)" strokeWidth="2.2" />
      <circle cx="30" cy="30" r="2" fill="var(--flow-fg)" />
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
    <div className="flow-tape">
      <span className="flow-tape-label">{label}</span>
      <span className="flow-tape-track">
        <span className="flow-tape-fill" style={{ width: `${Math.min(100, (current / maximum) * 100)}%` }} />
        {demanded === undefined ? null : (
          <span
            className="flow-tape-demanded"
            style={{ left: `${Math.min(100, (demanded / maximum) * 100)}%` }}
            aria-label={`demanded ${demanded} ${unit}`}
          />
        )}
      </span>
      <span className="flow-tape-value">
        {current.toFixed(1)}
        {demanded === undefined ? '' : ` → ${demanded.toFixed(1)}`} {unit}
      </span>
    </div>
  );
}

/**
 * The monitor's face: the residual, the threshold that will fire drawn across it, and
 * the persistence streak beneath — the drift level that triggers a new forecast, drawn
 * as the thing it is rather than described in a heartbeat line.
 */
function MonitorFace({
  series,
  stride,
  threshold,
  streak,
  streakOf,
}: {
  series: Series;
  stride: number;
  threshold: number;
  streak: number;
  streakOf: number;
}) {
  return (
    <div className="flow-face">
      <Spark series={series} stride={stride} hue="var(--flow-fld)" label="sound-speed residual, recent samples" />
      <div className="flow-streak" data-testid="monitor-streak">
        {Array.from({ length: streakOf }, (_, index) => (
          <span key={index} className={index < streak ? 'flow-slot flow-slot-filled' : 'flow-slot'} />
        ))}
        <span className="flow-streak-label">
          {streak} of {streakOf} → divergence
        </span>
      </div>
      <Figure kind="declared" label="threshold" value={`${threshold.toFixed(2)} m/s`} />
    </div>
  );
}

export { PlatformFace, MonitorFace };
