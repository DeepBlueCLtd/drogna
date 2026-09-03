/**
 * What the run says will happen: the forecast's own features, drawn across its lead steps.
 *
 * **This is the first consumer `ctl/forecast/features` has ever had.** Feature 123 taught the
 * runner to publish the seeded features *as features* — the eddy's centre and radius, the
 * drifting feature's track, the front's anchor and bearing, the thermocline's depth — each
 * per forecast step with an uncertainty that grows with lead (FR-113, FR-05). Nothing read
 * it. The message was validated against its master by a loop test and then dropped on the
 * floor, so the product of the feature was unverifiable by anything a reader could open, and
 * the Forecast tab could show why a run happened, what it cost and when, but nothing whatever
 * about what the run said.
 *
 * It sits in the "what next" region because that is what a forecast track is. Feature 124's
 * volume will carry the same features with depth, and its ensemble spread along the planned
 * route joins them here; this is the plan view that needs neither, and it is drawn now
 * rather than waiting for a component 124 is itself waiting on.
 *
 * **Nothing here animates** (FR-137). The tracks change when a run is announced and at no
 * other time; a transition would be motion the markup cannot see.
 *
 * **Colour is never the only carrier** (FR-138). Each kind is drawn with its own line style
 * and its own marker, labelled in text at its last step, and the uncertainty is a dashed ring
 * whose radius is also printed. The drawing reads in greyscale, and the figures beneath it
 * read without the drawing at all — which is what makes it legible to a screen reader and to
 * a test rather than only to an eye.
 *
 * **The absence is stated, never drawn as an empty plot.** A console opened after the
 * pre-roll has heard no announcement yet, and an empty set of axes would claim the forecast
 * had no features rather than that none has been published in this session.
 */
import type { ForecastFeatures, ForecastFeaturesFeature } from '../../generated/types.js';

/**
 * Kilometres per degree of latitude, matching `map/map-data.ts` and the environment
 * generator's own constant exactly. Stated here rather than imported because the generator's
 * copy is behind the seam and the map's is not exported; a third value would be a third
 * opinion about the size of the Earth.
 */
const KM_PER_DEGREE_LATITUDE = 111.32;

/** The drawing's own coordinate box. Not pixels: an SVG viewBox, scaled by the stylesheet. */
const BOX = { width: 320, height: 220, pad: 26 };

interface Placed {
  readonly step: number;
  readonly leadSeconds: number;
  readonly eastKm: number;
  readonly northKm: number;
  /** The feature's own extent, where it has one — an eddy's radius. */
  readonly radiusKm: number;
  /** How far the centre could be wrong at this lead. */
  readonly uncertaintyKm: number;
  /** Degrees from north, folded into a half turn; fronts only. */
  readonly bearingDegrees?: number;
}

interface Track {
  readonly kind: 'eddy' | 'moving' | 'front';
  readonly label: string;
  readonly points: readonly Placed[];
}

/** The horizontal position a kind carries, or nothing where the kind has none. */
function positionOf(feature: ForecastFeaturesFeature): { longitude: number; latitude: number } | undefined {
  const parameters = feature.parameters as Record<string, number>;
  if (feature.kind === 'eddy' || feature.kind === 'moving') {
    return { longitude: parameters.centre_longitude, latitude: parameters.centre_latitude };
  }
  if (feature.kind === 'front') {
    return { longitude: parameters.anchor_longitude, latitude: parameters.anchor_latitude };
  }
  // The thermocline is a depth. It has no position in a plan view and is stated in figures
  // beneath the drawing instead of being given a plausible-looking place in it.
  return undefined;
}

const KIND_LABEL: Record<string, string> = {
  eddy: 'eddy',
  moving: 'drifting feature',
  front: 'front',
  thermocline: 'thermocline',
};

/**
 * The tracks, in kilometres about the centre of everything drawn.
 *
 * Kilometres rather than degrees, and one scale for both axes, so that an uncertainty ring is
 * a circle rather than an ellipse whose eccentricity is an artefact of the latitude.
 */
export function buildTracks(features: ForecastFeatures): {
  tracks: readonly Track[];
  centre: { longitude: number; latitude: number };
} {
  const seen: { kind: Track['kind']; placed: { step: number; leadSeconds: number; longitude: number; latitude: number; radiusKm: number; uncertaintyKm: number; bearingDegrees?: number }[] }[] = [];
  for (const step of features.steps) {
    for (const feature of step.features) {
      if (feature.kind === 'thermocline') continue;
      const position = positionOf(feature);
      if (!position) continue;
      const parameters = feature.parameters as Record<string, number>;
      const uncertainty = feature.uncertainty as Record<string, number>;
      const kind = feature.kind as Track['kind'];
      let entry = seen.find((candidate) => candidate.kind === kind);
      if (!entry) {
        entry = { kind, placed: [] };
        seen.push(entry);
      }
      entry.placed.push({
        step: step.step,
        leadSeconds: step.lead_seconds,
        longitude: position.longitude,
        latitude: position.latitude,
        radiusKm: kind === 'front' ? 0 : (parameters.radius_km ?? 0),
        uncertaintyKm: kind === 'front' ? (uncertainty.anchor_km ?? 0) : (uncertainty.centre_km ?? 0),
        bearingDegrees: kind === 'front' ? parameters.bearing_degrees : undefined,
      });
    }
  }

  const all = seen.flatMap((entry) => entry.placed);
  if (all.length === 0) return { tracks: [], centre: { longitude: 0, latitude: 0 } };
  const centre = {
    longitude: (Math.min(...all.map((p) => p.longitude)) + Math.max(...all.map((p) => p.longitude))) / 2,
    latitude: (Math.min(...all.map((p) => p.latitude)) + Math.max(...all.map((p) => p.latitude))) / 2,
  };
  const eastScale = KM_PER_DEGREE_LATITUDE * Math.cos((centre.latitude * Math.PI) / 180);

  const tracks = seen.map((entry) => ({
    kind: entry.kind,
    label: KIND_LABEL[entry.kind] ?? entry.kind,
    points: entry.placed
      .slice()
      .sort((a, b) => a.step - b.step)
      .map((p) => ({
        step: p.step,
        leadSeconds: p.leadSeconds,
        eastKm: (p.longitude - centre.longitude) * eastScale,
        northKm: (p.latitude - centre.latitude) * KM_PER_DEGREE_LATITUDE,
        radiusKm: p.radiusKm,
        uncertaintyKm: p.uncertaintyKm,
        bearingDegrees: p.bearingDegrees,
      })),
  }));
  return { tracks, centre };
}

/** Kilometres to viewBox units, with one scale on both axes and the extent kept inside. */
function projector(tracks: readonly Track[]) {
  let reach = 1;
  for (const track of tracks) {
    for (const point of track.points) {
      const extent = Math.max(point.radiusKm, 0) + Math.max(point.uncertaintyKm, 0);
      reach = Math.max(reach, Math.abs(point.eastKm) + extent, Math.abs(point.northKm) + extent);
    }
  }
  const usable = Math.min(BOX.width, BOX.height) / 2 - BOX.pad;
  const scale = usable / reach;
  return {
    scale,
    reachKm: reach,
    x: (eastKm: number) => BOX.width / 2 + eastKm * scale,
    // North is up, which is why this subtracts: an SVG's y grows downwards.
    y: (northKm: number) => BOX.height / 2 - northKm * scale,
  };
}

function hours(leadSeconds: number): string {
  const value = leadSeconds / 3600;
  return Number.isInteger(value) ? `${value} h` : `${value.toFixed(1)} h`;
}

export interface FeatureTracksProps {
  readonly features: ForecastFeatures | undefined;
}

export function FeatureTracks({ features }: FeatureTracksProps) {
  if (!features) {
    return (
      <p className="not-landed" data-testid="features-absent">
        no forecast features have been announced yet. The runner publishes them as a run
        publishes, so a console opened after the pre-roll waits for the next run rather than
        drawing a plot with nothing in it — an empty set of axes would say the forecast has no
        features, which is a different claim.
      </p>
    );
  }

  const { tracks, centre } = buildTracks(features);
  const project = projector(tracks);
  const thermocline = features.steps
    .flatMap((step) => step.features.map((feature) => ({ step, feature })))
    .filter((entry) => entry.feature.kind === 'thermocline');

  return (
    <div className="forecast-tracks" data-testid="feature-tracks">
      <p className="forecast-tracks-caption">
        run <code>{features.run_id}</code>, {features.steps.length} step(s) of{' '}
        {features.step_seconds / 3600} h from <code>{features.kernel}</code>. North is up; the
        scale is {project.reachKm.toFixed(0)} km from the centre to the frame.
      </p>
      {tracks.length === 0 ? (
        <p className="not-landed">
          this run estimated no feature with a horizontal position, so there is nothing to draw
          in plan. The reasons are listed beneath.
        </p>
      ) : (
        <svg
          className="forecast-tracks-plot"
          viewBox={`0 0 ${BOX.width} ${BOX.height}`}
          role="img"
          aria-label={`the forecast's features across ${features.steps.length} lead steps, in plan, north up`}
        >
          {/* The frame and the two axes through the centre. Neither carries a number: the
              scale is stated in the caption above, where it can be read without the picture. */}
          <rect x="0.5" y="0.5" width={BOX.width - 1} height={BOX.height - 1} className="tracks-frame" />
          <line x1={BOX.width / 2} y1="6" x2={BOX.width / 2} y2={BOX.height - 6} className="tracks-axis" />
          <line x1="6" y1={BOX.height / 2} x2={BOX.width - 6} y2={BOX.height / 2} className="tracks-axis" />
          <text x={BOX.width / 2 + 3} y="12" className="tracks-compass">
            N
          </text>

          {tracks.map((track) => {
            const last = track.points[track.points.length - 1];
            if (!last) return null;
            return (
              <g key={track.kind} className={`tracks-feature tracks-${track.kind}`}>
                {/* The path taken across the lead steps. */}
                <polyline
                  className="tracks-path"
                  points={track.points.map((p) => `${project.x(p.eastKm)},${project.y(p.northKm)}`).join(' ')}
                />
                {track.points.map((point) => (
                  <g key={point.step}>
                    {/* The uncertainty at this lead, dashed, and growing with it. This is the
                        part of the drawing that carries FR-113's claim: a forecast that does
                        not widen is making a stronger claim than it can support. */}
                    {point.uncertaintyKm > 0 && (
                      <circle
                        className="tracks-uncertainty"
                        cx={project.x(point.eastKm)}
                        cy={project.y(point.northKm)}
                        r={Math.max(point.uncertaintyKm * project.scale, 1)}
                      />
                    )}
                    {/* The feature itself: an eddy and a drifting feature have an extent, a
                        front is a line and is drawn through its anchor at its bearing. */}
                    {track.kind === 'front' && point.bearingDegrees !== undefined ? (
                      (() => {
                        const radians = (point.bearingDegrees * Math.PI) / 180;
                        const reach = BOX.width + BOX.height;
                        const dx = Math.sin(radians) * reach;
                        const dy = -Math.cos(radians) * reach;
                        return (
                          <line
                            className="tracks-front-line"
                            x1={project.x(point.eastKm) - dx}
                            y1={project.y(point.northKm) - dy}
                            x2={project.x(point.eastKm) + dx}
                            y2={project.y(point.northKm) + dy}
                          />
                        );
                      })()
                    ) : (
                      <circle
                        className="tracks-extent"
                        cx={project.x(point.eastKm)}
                        cy={project.y(point.northKm)}
                        r={Math.max(point.radiusKm * project.scale, 1)}
                      />
                    )}
                    <circle
                      className="tracks-centre"
                      cx={project.x(point.eastKm)}
                      cy={project.y(point.northKm)}
                      r="2"
                    />
                  </g>
                ))}
                {/* Named where it ends up, so the kinds are told apart without colour. */}
                <text className="tracks-label" x={project.x(last.eastKm) + 5} y={project.y(last.northKm) - 5}>
                  {track.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      {/* The same claim in figures. The drawing is an illustration of this table and not the
          other way round: a reader who cannot see the plot, or is reading it in greyscale on a
          phone, gets the numbers rather than a description of a picture. */}
      <ul className="forecast-tracks-figures">
        {tracks.map((track) => {
          const first = track.points[0];
          const last = track.points[track.points.length - 1];
          if (!first || !last) return null;
          const movedKm = Math.hypot(last.eastKm - first.eastKm, last.northKm - first.northKm);
          return (
            <li key={track.kind}>
              <span className="tracks-figure-kind">{track.label}</span> moves {movedKm.toFixed(1)} km
              over {hours(last.leadSeconds)}, its position uncertain by{' '}
              {first.uncertaintyKm.toFixed(1)} km at the initialisation instant and{' '}
              {last.uncertaintyKm.toFixed(1)} km at the end
              {track.kind === 'front' && last.bearingDegrees !== undefined
                ? `, bearing ${last.bearingDegrees.toFixed(1)}°`
                : ''}
              .
            </li>
          );
        })}
        {thermocline.length > 0 &&
          (() => {
            const last = thermocline[thermocline.length - 1];
            const parameters = last.feature.parameters as Record<string, number>;
            const uncertainty = last.feature.uncertainty as Record<string, number>;
            return (
              <li key="thermocline">
                <span className="tracks-figure-kind">thermocline</span> at{' '}
                {parameters.depth_m.toFixed(0)} m, uncertain by {uncertainty.depth_m.toFixed(0)} m —
                stated rather than drawn, because a depth has no place in a plan view and giving
                it one would be inventing a position.
              </li>
            );
          })()}
      </ul>

      {/* What the run would not claim, in its own words. A feature absent from the drawing and
          absent from this list would be a silence. */}
      {features.not_estimated !== undefined && features.not_estimated.length > 0 && (
        <details className="forecast-tracks-declined">
          <summary>
            {features.not_estimated.length} quantity or feature not recovered, with the reason
          </summary>
          <ul>
            {features.not_estimated.map((entry) => (
              <li key={`${entry.kind}.${entry.quantity ?? '*'}`}>
                <span className="tracks-figure-kind">
                  {KIND_LABEL[entry.kind] ?? entry.kind}
                  {entry.quantity !== undefined ? ` · ${entry.quantity}` : ''}
                </span>{' '}
                {entry.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="forecast-tracks-basis">
        Centred on {centre.latitude.toFixed(2)}°, {centre.longitude.toFixed(2)}°. Every figure
        here is read from the run's own announcement; none is derived from a configured
        expectation, and the ensemble spread along the planned route is <strong>feature 124</strong>
        , and is not built.
      </p>
    </div>
  );
}
